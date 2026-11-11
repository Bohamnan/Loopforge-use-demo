"""ResumeService.confirm: business paths (REQ-BE-04). Every case checks the databases and the
file system, not only the return value (design 9.1)."""

import logging
import re
from pathlib import Path

import pytest

from app.core.clock import format_utc
from app.core.errors import (
    ConfirmationRequiredError,
    SaveFailedError,
    SessionNotFoundError,
    SessionReadOnlyError,
    ValidationFailedError,
)
from app.core.ids import hash_token
from app.repositories.resume_repository import ResumeRef
from tests.helpers import make_pdf_bytes
from tests.services.conftest import BROWSER_B, ResumeEnv

SRC = Path(__file__).resolve().parents[2] / "src" / "app"
SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def assert_nothing_written(env: ResumeEnv) -> None:
    assert env.count("resumes") == 0 and all(env.count(t) == 0 for t in SUB_TABLES)
    assert env.archive_names() == []


def node(value: object) -> dict:
    return {"value": value, "status": "recognized"}


@pytest.mark.parametrize("confirmed", [False, None])
def test_without_confirmation_nothing_is_written(resume_env: ResumeEnv, confirmed: object) -> None:
    sid = resume_env.new_session()
    with pytest.raises(ConfirmationRequiredError):
        resume_env.confirm(sid, confirmed)  # type: ignore[arg-type]
    assert_nothing_written(resume_env)
    assert resume_env.session_rows()[0][1] == "reviewing"


def test_foreign_unknown_anonymous_and_saved_sessions_are_rejected(resume_env: ResumeEnv) -> None:
    sid = resume_env.new_session()
    for who, target in ((BROWSER_B, sid), (resume_env.browser, "nope"), (None, sid)):
        with pytest.raises(SessionNotFoundError):
            resume_env.service.confirm(target, who, True)
    resume_env.confirm(sid)
    with pytest.raises(SessionReadOnlyError):  # a saved session never takes the duplicate path
        resume_env.confirm(sid)
    assert resume_env.count("resumes") == 1


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"name": None}, {("name", "required")}),
        ({"phone": "12345"}, {("phone", "invalid_format")}),
        (
            {"name": None, "phone": "x", "email": None},
            {("name", "required"), ("phone", "invalid_format"), ("email", "required")},
        ),
    ],
)
def test_core_fields_missing_or_invalid(
    resume_env: ResumeEnv, overrides: dict, expected: set
) -> None:
    sid = resume_env.new_session(**overrides)
    with pytest.raises(ValidationFailedError) as info:
        resume_env.confirm(sid)
    assert {(i.field, i.reason.value) for i in info.value.details or []} == expected
    assert_nothing_written(resume_env)
    assert resume_env.session_rows()[0][1] == "reviewing"


def test_new_resume_is_saved_with_file_and_the_session_is_kept_as_saved(
    resume_env: ResumeEnv,
) -> None:
    sid = resume_env.new_session()
    result = resume_env.confirm(sid)

    assert (result.already_saved, result.saved_at) == (False, format_utc(resume_env.clock.now()))
    assert resume_env.query("SELECT id, name, file_path, current_city FROM resumes") == [
        (result.resume_id, "ZZ ZHANG SAN", f"{result.resume_id}.pdf", "SHANGHAI")
    ]  # D-03: the uncertain value is saved as is
    assert resume_env.count("resume_educations") == 1
    assert (resume_env.file_dir / f"{result.resume_id}.pdf").read_bytes() == make_pdf_bytes(300)
    assert resume_env.session_rows() == [(sid, "saved", "none", result.resume_id, None)]
    assert resume_env.query("SELECT fields_json FROM sessions", "drafts.db") == [("{}",)]
    assert resume_env.draft_file_names() == []


def test_same_identity_returns_existing_record_and_keeps_the_update_candidate(
    resume_env: ResumeEnv,
) -> None:
    first = resume_env.confirm(resume_env.new_session(job_title=node("FIRST JOB")))
    resume_env.clock.advance(hours=3)
    sid2 = resume_env.new_session(
        phone="+86 138 0013 8000", email="zs@example.com", job_title=node("SECOND JOB")
    )
    second = resume_env.confirm(sid2)

    assert (second.already_saved, second.resume_id, second.saved_at) == (
        True, first.resume_id, first.saved_at,
    )  # fmt: skip
    assert resume_env.query("SELECT job_title FROM resumes") == [("FIRST JOB",)]
    assert resume_env.archive_names() == [f"{first.resume_id}.pdf"]
    row = next(r for r in resume_env.session_rows() if r[0] == sid2)
    assert row[1:4] == ("saved", "pending", first.resume_id) and row[4] is not None
    assert len(resume_env.draft_file_names()) == 1  # the candidate keeps its temp file
    assert "SECOND JOB" in resume_env.query("SELECT fields_json FROM sessions", "drafts.db")[1][0]


def lookup_misses_once(env: ResumeEnv) -> None:
    """Make the first duplicate pre-check miss, as if a concurrent request committed after it."""
    real = env.resume_repo.find_by_identity_key
    calls = {"n": 0}

    def find(name_key: str, phone_key: str, email_key: str) -> ResumeRef | None:
        calls["n"] += 1
        return None if calls["n"] == 1 else real(name_key, phone_key, email_key)

    env.resume_repo.find_by_identity_key = find  # type: ignore[method-assign]


def test_unique_conflict_discards_own_tmp_and_reports_duplicate(resume_env: ResumeEnv) -> None:
    first = resume_env.confirm(resume_env.new_session())
    sid2 = resume_env.new_session()
    lookup_misses_once(resume_env)

    second = resume_env.confirm(sid2)

    assert (second.already_saved, second.resume_id) == (True, first.resume_id)
    assert resume_env.count("resumes") == 1
    assert resume_env.archive_names() == [f"{first.resume_id}.pdf"]  # no tmp left


def test_source_file_missing_is_save_failed_while_the_session_stays_reviewing(
    resume_env: ResumeEnv,
) -> None:
    sid = resume_env.new_session()
    for path in (resume_env.data_dir / "drafts").iterdir():
        path.unlink()
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)
    assert_nothing_written(resume_env)
    assert resume_env.session_rows()[0][1] == "reviewing"


def test_source_file_missing_after_another_request_finished_is_duplicate_of_the_same_record(
    resume_env: ResumeEnv,
) -> None:
    """Concurrent duplicate submission of one session: the loser reports the same record."""
    sid = resume_env.new_session()
    snapshot = resume_env.session_repo.get(sid, hash_token(resume_env.browser))  # loser's view
    winner = resume_env.confirm(sid)
    lookup_misses_once(resume_env)
    real_get = resume_env.session_repo.get
    views = iter([snapshot])
    resume_env.session_repo.get = lambda *a: next(views, None) or real_get(*a)  # type: ignore[method-assign]

    again = resume_env.confirm(sid)

    assert (again.already_saved, again.resume_id) == (True, winner.resume_id)
    assert resume_env.count("resumes") == 1
    assert resume_env.session_rows() == [(sid, "saved", "none", winner.resume_id, None)]


def test_only_the_save_path_touches_the_resume_repository() -> None:
    """B-04: the formal database is reachable from ResumeService (and wiring) only.

    Read-only users: ReconcileService (``list_refs``), the session/archive services through the
    ``ResumeReader`` protocol; lifecycle.py only constructs the reconciliation.
    """
    allowed = {
        "resume_service.py", "deps.py", "reconcile_service.py", "resume_repository.py",
        "lifecycle.py",
    }  # fmt: skip
    importers = {
        p.name
        for p in SRC.rglob("*.py")
        if re.search(r"resume_repository|ResumeRepository", p.read_text())
        and p.name not in {"__init__.py"}
    }
    # Read-only users go through the ResumeReader protocol and never call a write method.
    assert importers - allowed <= {
        "session_service.py",
        "archive_query_service.py",
        "archive_view.py",
    }
    assert not re.search(
        r"create_aggregate|replace_aggregate", (SRC / "services/session_service.py").read_text()
    )


def test_logs_contain_no_personal_data_filename_or_browser_identifier(
    resume_env: ResumeEnv, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    keep = {"name": "ZZ LOGNAME", "phone": "13900139000", "email": "log@example.com"}
    s1, s2, s3 = (resume_env.new_session(**keep), resume_env.new_session(**keep),
                  resume_env.new_session(phone="bad"))  # fmt: skip
    resume_env.confirm(s1)
    resume_env.confirm(s2)  # duplicate branch
    with pytest.raises(ValidationFailedError):
        resume_env.confirm(s3)
    resume_env.injector.arm("promote", times=2)
    s4 = resume_env.new_session(name="ZZ OTHER", phone="13700137000", email="o@example.com")
    with pytest.raises(SaveFailedError):
        resume_env.confirm(s4)

    text = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (
        "ZZ LOGNAME", "13900139000", "log@example.com", "ZZ OTHER", "13700137000",
        "o@example.com", "synthetic.pdf", resume_env.browser, hash_token(resume_env.browser),
    ):  # fmt: skip
        assert secret not in text
    assert "resume_saved" in text and "promote_failed" in text
