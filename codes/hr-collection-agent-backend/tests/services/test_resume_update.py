"""ResumeService.update_existing: confirmed overwrite of a saved record (task 2.9, B-04/B-05).

Every case asserts database rows and the file/ listing, not only the return value.
"""

import threading

import pytest

from app.core.errors import (
    ConfirmationRequiredError,
    SessionNotFoundError,
    UpdateNotAvailableError,
)
from app.services.upload_validation import ValidatedUpload
from tests.helpers import make_png_bytes
from tests.services.conftest import BROWSER_B, ResumeEnv

SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def update(env: ResumeEnv, sid: str, confirm_update: object = True):  # noqa: ANN201
    return env.service.update_existing(sid, env.browser, confirm_update)  # type: ignore[arg-type]


def record(env: ResumeEnv) -> tuple:
    return env.query(
        "SELECT job_title, file_path, content_type, file_size, created_at, updated_at, "
        "original_filename FROM resumes"
    )[0]


def test_missing_or_false_confirmation_writes_nothing(resume_env: ResumeEnv) -> None:
    sid, saved = resume_env.pending_candidate()
    before = (record(resume_env), resume_env.archive_names(), resume_env.session_rows())
    for value in (False, None):
        with pytest.raises(ConfirmationRequiredError):
            update(resume_env, sid, value)
    assert (record(resume_env), resume_env.archive_names(), resume_env.session_rows()) == before
    assert saved.resume_id in before[1][0]


def test_only_a_pending_session_of_the_caller_can_update(resume_env: ResumeEnv) -> None:
    sid, _ = resume_env.pending_candidate()
    reviewing = resume_env.new_session(name="ZZ OTHER", phone="13700137000", email="o@e.cc")
    first_saved = resume_env.confirm(reviewing)
    assert first_saved.already_saved is False
    plain = resume_env.new_session(name="ZZ THIRD", phone="13600136000", email="t@e.cc")
    for target in (reviewing, plain):  # saved without candidate / still reviewing
        with pytest.raises(UpdateNotAvailableError):
            update(resume_env, target)
    with pytest.raises(SessionNotFoundError):
        resume_env.service.update_existing(sid, BROWSER_B, True)
    with pytest.raises(SessionNotFoundError):
        resume_env.service.update_existing(sid, None, True)
    assert record(resume_env)[0] == "OLD JOB"
    assert resume_env.count("resumes") == 2


def test_update_overwrites_the_record_with_a_new_unique_file_and_applies_the_session(
    resume_env: ResumeEnv,
) -> None:
    sid, saved = resume_env.pending_candidate()
    old_name = f"{saved.resume_id}.pdf"
    assert resume_env.count("resume_educations") == 1
    resume_env.clock.advance(hours=2)

    result = update(resume_env, sid)

    job_title, file_path, ctype, size, created, updated, original = record(resume_env)
    assert (job_title, result.resume_id) == ("NEW JOB", saved.resume_id)
    assert file_path != old_name and file_path.startswith(f"{saved.resume_id}-")
    assert file_path.endswith(".pdf") and ctype == "application/pdf"
    assert (created, updated) == (saved.saved_at, result.updated_at) and created != updated
    assert resume_env.archive_names() == [file_path]  # old file removed, no tmp
    assert resume_env.count("resumes") == 1 and resume_env.count("resume_educations") == 1
    assert resume_env.query("SELECT updated_at FROM resume_educations") == [(updated,)]
    row = next(r for r in resume_env.session_rows() if r[0] == sid)
    assert row[1:] == ("saved", "applied", saved.resume_id, None)
    assert resume_env.query(
        f"SELECT fields_json FROM sessions WHERE id = '{sid}'", "drafts.db"
    ) == [("{}",)]
    assert resume_env.draft_file_names() == []


def test_new_extension_changes_file_path_and_content_type_together(resume_env: ResumeEnv) -> None:
    png = ValidatedUpload(make_png_bytes(300), "image/png", "scan.png")
    sid, saved = resume_env.pending_candidate(upload=png)

    update(resume_env, sid)

    _, file_path, ctype, size, *_, original = record(resume_env)
    assert file_path.endswith(".png") and ctype == "image/png"
    assert (size, original) == (300, "scan.png")
    assert resume_env.archive_names() == [file_path]


def test_repeating_the_request_is_idempotent(resume_env: ResumeEnv) -> None:
    sid, _ = resume_env.pending_candidate()
    first = update(resume_env, sid)
    snapshot = (record(resume_env), resume_env.archive_names(), resume_env.session_rows())
    resume_env.clock.advance(hours=1)

    again = update(resume_env, sid)

    assert again == first
    assert (record(resume_env), resume_env.archive_names(), resume_env.session_rows()) == snapshot


def test_two_sessions_updating_the_same_record_leave_one_final_file(resume_env: ResumeEnv) -> None:
    sid1, saved = resume_env.pending_candidate()
    sid2 = resume_env.new_session(job_title={"value": "THIRD JOB", "status": "recognized"})
    assert resume_env.confirm(sid2).already_saved is True
    services = [resume_env.build_service(), resume_env.build_service()]
    barrier = threading.Barrier(2)
    errors: list[BaseException] = []

    def run(i: int, sid: str) -> None:
        try:
            barrier.wait(timeout=5)
            services[i].update_existing(sid, resume_env.browser, True)
        except BaseException as exc:  # noqa: BLE001 - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(i, s)) for i, s in enumerate((sid1, sid2))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(30)

    assert errors == []
    names = resume_env.archive_names()
    assert len(names) == 1 and names[0] == record(resume_env)[1]
    assert resume_env.count("resumes") == 1
    assert {r[2] for r in resume_env.session_rows() if r[0] in (sid1, sid2)} == {"applied"}
