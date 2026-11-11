"""B-05 fault injection for ResumeService.update_existing (design 5.3a, HIGH_RISK).

Each case asserts the resume record (rows, file_path) and the file/ listing together; crash
cases use SimulatedCrash (no compensation runs) and then run the start-up reconciliation.
Invariant checked everywhere: the record always points at a file that exists.
"""

import pytest

from app.core.errors import SaveFailedError
from tests.services.conftest import ResumeEnv
from tests.services.fault_injection import SimulatedCrash

SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def update(env: ResumeEnv, sid: str):  # noqa: ANN201
    return env.service.update_existing(sid, env.browser, True)


def row(env: ResumeEnv) -> tuple:
    return env.query("SELECT job_title, file_path, updated_at FROM resumes")[0]


def assert_points_at_existing_file(env: ResumeEnv) -> str:
    path = row(env)[1]
    assert path in env.archive_names()
    assert (env.file_dir / path).is_file()
    return path


def assert_unchanged(env: ResumeEnv, old_name: str, before: tuple) -> None:
    """Record, sub rows and archive exactly as before; the session is still pending."""
    assert row(env) == before and row(env)[1] == old_name
    assert env.archive_names() == [old_name]
    assert env.count("resume_educations") == 1
    assert [r[2] for r in env.session_rows() if r[2] != "none"] == ["pending"]


@pytest.fixture
def pending(resume_env: ResumeEnv) -> tuple[ResumeEnv, str, str, tuple]:
    sid, saved = resume_env.pending_candidate()
    old_name = f"{saved.resume_id}.pdf"
    return resume_env, sid, old_name, row(resume_env)


@pytest.mark.parametrize("point", ["stage", "stage_mid_copy", "promote"])
def test_stage_or_promote_failure_leaves_record_and_old_file_and_retry_succeeds(
    pending: tuple, point: str
) -> None:
    env, sid, old_name, before = pending
    env.injector.arm(point, OSError("disk full"))
    with pytest.raises(SaveFailedError):
        update(env, sid)
    assert_unchanged(env, old_name, before)  # no new file, no tmp

    update(env, sid)
    assert row(env)[0] == "NEW JOB" and env.archive_names() == [row(env)[1]]


@pytest.mark.parametrize("point", ["replace_after_main", "db_after_sub"])
def test_transaction_rollback_removes_the_new_file_and_keeps_everything_else(
    pending: tuple, point: str
) -> None:
    env, sid, old_name, before = pending
    env.injector.arm(point, RuntimeError("boom"))
    with pytest.raises(SaveFailedError):
        update(env, sid)
    assert_unchanged(env, old_name, before)  # main row and sub rows rolled back together

    update(env, sid)
    assert row(env)[0] == "NEW JOB"


def test_commit_with_unknown_outcome_is_decided_by_the_record(pending: tuple) -> None:
    """Commit succeeded but the connection reported an error: success, nothing lost."""
    env, sid, old_name, _ = pending
    env.injector.arm("replace_after_commit", RuntimeError("connection lost"))

    result = update(env, sid)

    new_name = assert_points_at_existing_file(env)
    assert new_name != old_name and result.resume_id
    assert sorted(env.archive_names()) == sorted([old_name, new_name])  # old left for reconcile
    report = env.reconcile()
    assert (report.stale_removed, report.conflicts) == (1, 0)
    assert env.archive_names() == [new_name]


def test_crash_between_promote_and_transaction_leaves_a_removable_new_file(
    pending: tuple,
) -> None:
    env, sid, old_name, before = pending
    env.injector.arm("replace_before", SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        update(env, sid)

    assert row(env) == before  # record untouched, still points at the old, existing file
    assert len(env.archive_names()) == 2 and old_name in env.archive_names()

    report = env.reconcile()  # the new file has no record pointing at it
    assert (report.stale_removed, report.conflicts) == (1, 0)
    assert_unchanged(env, old_name, before)
    update(env, sid)  # the session can still be applied
    assert_points_at_existing_file(env)


def test_crash_after_commit_before_old_file_removal_is_cleaned_by_reconcile(
    pending: tuple,
) -> None:
    env, sid, old_name, _ = pending
    env.injector.arm("archive_remove", SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        update(env, sid)

    new_name = assert_points_at_existing_file(env)  # committed: record points at the new file
    assert row(env)[0] == "NEW JOB" and sorted(env.archive_names()) == sorted([old_name, new_name])

    report = env.reconcile()
    assert (report.stale_removed, report.conflicts) == (1, 0)
    assert env.archive_names() == [new_name]
    assert env.reconcile().stale_removed == 0  # idempotent
    assert update(env, sid).resume_id  # the pending session is applied on retry
    assert row(env)[1] != new_name and env.archive_names() == [row(env)[1]]


def test_old_file_removal_failure_does_not_change_the_result(pending: tuple) -> None:
    env, sid, old_name, _ = pending
    env.injector.arm("archive_remove", OSError("busy"))
    update(env, sid)
    assert len(env.archive_names()) == 2  # leftover old file, removed by the next start-up
    assert env.reconcile().stale_removed == 1


def test_mark_applied_failure_keeps_the_result_and_a_retry_overwrites_with_same_content(
    pending: tuple,
) -> None:
    env, sid, old_name, _ = pending
    env.injector.arm("session_mark_applied", OSError("locked"))
    update(env, sid)
    assert row(env)[0] == "NEW JOB"
    assert next(r for r in env.session_rows() if r[0] == sid)[2] == "pending"
    assert len(env.draft_file_names()) == 1  # candidate file kept: the row still points at it

    update(env, sid)  # pressing again
    assert next(r for r in env.session_rows() if r[0] == sid)[2] == "applied"
    assert env.archive_names() == [row(env)[1]] and row(env)[0] == "NEW JOB"
