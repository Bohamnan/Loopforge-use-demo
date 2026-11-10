"""ResumeService.confirm: business paths (REQ-BE-04). Every case checks the databases and the
file system, not only the return value (design 9.1)."""

import logging
import re
from pathlib import Path

import pytest

from app.core.clock import format_utc
from app.core.errors import (
    ConfirmationRequiredError,
    DraftNotFoundError,
    SaveFailedError,
    ValidationFailedError,
)
from app.core.ids import hash_token
from app.repositories.resume_repository import ResumeRef
from tests.helpers import make_pdf_bytes
from tests.services.conftest import ResumeEnv

SRC = Path(__file__).resolve().parents[2] / "src" / "app"


def _assert_nothing_written(env: ResumeEnv) -> None:
    assert env.count("resumes") == 0
    for table in ("resume_work_experiences", "resume_project_experiences", "resume_educations"):
        assert env.count(table) == 0
    assert env.archive_names() == []


# ---- preconditions ---------------------------------------------------------------------------


@pytest.mark.parametrize("confirmed", [False, None])
def test_without_confirmation_nothing_is_written(resume_env: ResumeEnv, confirmed: object) -> None:
    token = resume_env.new_draft()
    with pytest.raises(ConfirmationRequiredError):
        resume_env.service.confirm(token, confirmed)  # type: ignore[arg-type]
    _assert_nothing_written(resume_env)
    assert len(resume_env.draft_rows()) == 1
    assert len(resume_env.draft_file_names()) == 1


@pytest.mark.parametrize("token", [None, "", "unknown-token"])
def test_missing_or_unknown_token_is_draft_not_found(resume_env: ResumeEnv, token: object) -> None:
    resume_env.new_draft()
    with pytest.raises(DraftNotFoundError):
        resume_env.service.confirm(token, True)  # type: ignore[arg-type]
    _assert_nothing_written(resume_env)
    assert len(resume_env.draft_rows()) == 1


def test_expired_draft_is_draft_not_found(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    resume_env.clock.advance(days=7, seconds=1)
    with pytest.raises(DraftNotFoundError):
        resume_env.service.confirm(token, True)
    _assert_nothing_written(resume_env)


@pytest.mark.parametrize(
    ("overrides", "expected"),
    [
        ({"name": None}, {("name", "required")}),
        ({"phone": None}, {("phone", "required")}),
        ({"email": None}, {("email", "required")}),
        ({"phone": "12345"}, {("phone", "invalid_format")}),
        ({"email": "not-an-email"}, {("email", "invalid_format")}),
        (
            {"name": None, "phone": "x", "email": None},
            {("name", "required"), ("phone", "invalid_format"), ("email", "required")},
        ),
    ],
)
def test_core_fields_missing_or_invalid(
    resume_env: ResumeEnv, overrides: dict, expected: set
) -> None:
    token = resume_env.new_draft(**overrides)
    with pytest.raises(ValidationFailedError) as info:
        resume_env.service.confirm(token, True)
    assert {(i.field, i.reason.value) for i in info.value.details or []} == expected
    _assert_nothing_written(resume_env)
    assert len(resume_env.draft_rows()) == 1 and len(resume_env.draft_file_names()) == 1


# ---- success ---------------------------------------------------------------------------------


def test_new_resume_is_saved_with_file_and_draft_removed(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    result = resume_env.service.confirm(token, True)

    assert result.already_saved is False
    assert result.saved_at == format_utc(resume_env.clock.now())
    rows = resume_env.query(
        "SELECT id, name, phone, email, name_key, phone_key, email_key, file_path, "
        "original_filename, content_type, file_size, current_city FROM resumes"
    )
    assert rows == [
        (
            result.resume_id, "ZZ ZHANG SAN", "13800138000", "ZS@EXAMPLE.COM",
            "ZZ ZHANG SAN", "13800138000", "zs@example.com",
            f"{result.resume_id}.pdf", "synthetic.pdf", "application/pdf",
            len(make_pdf_bytes(300)), "SHANGHAI",  # D-03: uncertain value is saved as is
        )
    ]  # fmt: skip
    assert resume_env.count("resume_work_experiences") == 1
    assert resume_env.count("resume_educations") == 1
    assert resume_env.query("SELECT skills_json FROM resumes") == [('["PYTHON", "SQL"]',)]
    assert resume_env.archive_names() == [f"{result.resume_id}.pdf"]
    assert (resume_env.file_dir / f"{result.resume_id}.pdf").read_bytes() == make_pdf_bytes(300)
    assert resume_env.draft_rows() == []
    assert resume_env.draft_file_names() == []


def test_stored_display_value_and_keys_use_their_own_normalisation(resume_env: ResumeEnv) -> None:
    """Validation de-noises, storage keeps the display value, the key is normalised."""
    token = resume_env.new_draft(
        name="  ZZ  LI   SI ", phone=" +86 138-0013-8000 ", email=" ZS@Example.COM "
    )
    resume_env.service.confirm(token, True)
    row = resume_env.query(
        "SELECT name, phone, email, name_key, phone_key, email_key FROM resumes"
    )[0]
    assert row[1] == "+86 138-0013-8000"  # display value, edge-trimmed only
    assert row[3:] == ("ZZ LI SI", "13800138000", "zs@example.com")
    assert row[0] == row[0].strip() and row[2] == row[2].strip()
    assert row[2].lower() == "zs@example.com"


# ---- duplicate -------------------------------------------------------------------------------


def test_same_identity_returns_existing_record_and_discards_new_content(
    resume_env: ResumeEnv,
) -> None:
    first = resume_env.service.confirm(resume_env.new_draft(job_title=_node("FIRST JOB")), True)
    resume_env.clock.advance(hours=3)
    token2 = resume_env.new_draft(
        phone="+86 138 0013 8000", email="zs@example.com", job_title=_node("SECOND JOB")
    )
    second = resume_env.service.confirm(token2, True)

    assert second.already_saved is True
    assert second.resume_id == first.resume_id
    assert second.saved_at == first.saved_at  # first save time, not now
    assert resume_env.count("resumes") == 1
    assert resume_env.query("SELECT job_title FROM resumes") == [("FIRST JOB",)]
    assert resume_env.count("resume_educations") == 1
    assert resume_env.archive_names() == [f"{first.resume_id}.pdf"]  # no tmp, no second file
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


def _node(value: object) -> dict:
    return {"value": value, "status": "recognized"}


def _first_lookup_misses(env: ResumeEnv) -> None:
    """Make the first duplicate pre-check miss, as if a concurrent request committed after it."""
    real = env.resume_repo.find_by_identity_key
    calls = {"n": 0}

    def find(name_key: str, phone_key: str, email_key: str) -> ResumeRef | None:
        calls["n"] += 1
        return None if calls["n"] == 1 else real(name_key, phone_key, email_key)

    env.resume_repo.find_by_identity_key = find  # type: ignore[method-assign]


def test_unique_conflict_discards_own_tmp_and_reports_duplicate(resume_env: ResumeEnv) -> None:
    first = resume_env.service.confirm(resume_env.new_draft(), True)
    token2 = resume_env.new_draft()
    _first_lookup_misses(resume_env)

    second = resume_env.service.confirm(token2, True)

    assert (second.already_saved, second.resume_id) == (True, first.resume_id)
    assert resume_env.count("resumes") == 1
    assert resume_env.archive_names() == [f"{first.resume_id}.pdf"]
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


def test_source_missing_then_key_found_is_duplicate(resume_env: ResumeEnv) -> None:
    first = resume_env.service.confirm(resume_env.new_draft(), True)
    token2 = resume_env.new_draft()
    for path in (resume_env.data_dir / "drafts").iterdir():
        path.unlink()  # the draft file vanished (another request finished it)
    _first_lookup_misses(resume_env)

    second = resume_env.service.confirm(token2, True)

    assert (second.already_saved, second.resume_id) == (True, first.resume_id)
    assert resume_env.count("resumes") == 1
    assert resume_env.archive_names() == [f"{first.resume_id}.pdf"]
    assert resume_env.draft_rows() == []


def test_source_missing_and_draft_gone_is_draft_not_found(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    real = resume_env.resume_repo.find_by_identity_key

    def find(*keys: str) -> ResumeRef | None:
        # Simulate the winner finishing the same draft right after our pre-check.
        resume_env.draft_repo.delete_by_token_hash(hash_token(token))
        for path in (resume_env.data_dir / "drafts").iterdir():
            path.unlink()
        resume_env.resume_repo.find_by_identity_key = real  # type: ignore[method-assign]
        return real(*keys)

    resume_env.resume_repo.find_by_identity_key = find  # type: ignore[method-assign]
    with pytest.raises(DraftNotFoundError):
        resume_env.service.confirm(token, True)
    _assert_nothing_written(resume_env)


def test_source_missing_with_draft_present_is_save_failed(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    for path in (resume_env.data_dir / "drafts").iterdir():
        path.unlink()
    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(token, True)
    _assert_nothing_written(resume_env)
    assert len(resume_env.draft_rows()) == 1  # kept, user can re-upload


# ---- guards ----------------------------------------------------------------------------------


def test_only_the_save_path_touches_the_resume_repository() -> None:
    """B-04: the formal database is reachable from ResumeService (and wiring) only.

    ReconcileService (task 2.5) reads through the same repository (read-only: ``list_refs``) and
    lifecycle.py (task 2.7) only constructs it for the start-up reconciliation.
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
    assert importers <= allowed, importers - allowed


def test_logs_contain_no_personal_data_filename_or_token(
    resume_env: ResumeEnv, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    t1 = resume_env.new_draft(name="ZZ LOGNAME", phone="13900139000", email="log@example.com")
    t2 = resume_env.new_draft(name="ZZ LOGNAME", phone="13900139000", email="log@example.com")
    t3 = resume_env.new_draft(phone="bad")
    resume_env.service.confirm(t1, True)
    resume_env.service.confirm(t2, True)  # duplicate branch
    with pytest.raises(ValidationFailedError):
        resume_env.service.confirm(t3, True)
    resume_env.injector.arm("promote", times=2)
    t4 = resume_env.new_draft(name="ZZ OTHER", phone="13700137000", email="o@example.com")
    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(t4, True)

    text = "\n".join(r.getMessage() for r in caplog.records)
    for secret in (
        "ZZ LOGNAME", "13900139000", "log@example.com", "ZZ OTHER", "13700137000",
        "o@example.com", "synthetic.pdf", t1, t2, t3, t4,
        hash_token(t1), hash_token(t4),
    ):  # fmt: skip
        assert secret not in text
    assert "resume_saved" in text and "promote_failed" in text
