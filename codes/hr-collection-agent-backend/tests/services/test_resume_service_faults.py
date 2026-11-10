"""B-05 fault injection for ResumeService.confirm (design 9.3, HIGH_RISK).

Each case asserts the databases (count(*), key columns) and the file system (``file/`` and
the drafts directory) together. Crash cases use SimulatedCrash (BaseException): no compensation
runs, as in a killed process. ReconcileService belongs to task 2.5, so the crash cases assert
the exact state a reconciliation starts from.
"""

import shutil
import threading

import pytest

from app.core.errors import SaveFailedError
from tests.services.conftest import ResumeEnv
from tests.services.fault_injection import SimulatedCrash

SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def _assert_clean_failure(env: ResumeEnv) -> None:
    """Nothing committed, nothing orphaned, the draft is still there for a retry."""
    assert env.count("resumes") == 0
    assert all(env.count(t) == 0 for t in SUB_TABLES)
    assert env.archive_names() == []
    assert len(env.draft_rows()) == 1
    assert len(env.draft_file_names()) == 1


def _assert_saved_once(env: ResumeEnv, resume_id: str) -> None:
    assert env.count("resumes") == 1
    assert env.query("SELECT id, file_path FROM resumes") == [(resume_id, f"{resume_id}.pdf")]
    assert env.archive_names() == [f"{resume_id}.pdf"]


# ---- stage ------------------------------------------------------------------------------------


@pytest.mark.parametrize("point", ["stage", "stage_mid_copy"])
def test_stage_failure_leaves_nothing_and_retry_succeeds(resume_env: ResumeEnv, point: str) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm(point, OSError("disk full"))

    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(token, True)
    _assert_clean_failure(resume_env)  # no tmp (half-written one removed), no record

    result = resume_env.service.confirm(token, True)  # same token: the draft was kept
    assert result.already_saved is False
    _assert_saved_once(resume_env, result.resume_id)
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


def test_real_copy_failure_removes_partial_tmp(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Fails inside the real ArchiveFileStore.stage, after bytes were written."""
    token = resume_env.new_draft()

    def broken_copy(src: object, dst: object, *args: object) -> None:
        dst.write(b"partial")  # type: ignore[attr-defined]
        raise OSError("copy interrupted")

    monkeypatch.setattr(shutil, "copyfileobj", broken_copy)
    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(token, True)
    _assert_clean_failure(resume_env)


# ---- database transaction ---------------------------------------------------------------------


@pytest.mark.parametrize("point", ["db_after_main", "db_after_sub"])
def test_failure_inside_transaction_rolls_back_everything(
    resume_env: ResumeEnv, point: str
) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm(point, RuntimeError("boom"))

    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(token, True)
    _assert_clean_failure(resume_env)  # main and sub tables empty, tmp removed

    result = resume_env.service.confirm(token, True)
    _assert_saved_once(resume_env, result.resume_id)
    assert resume_env.count("resume_educations") == 1


# ---- concurrency ------------------------------------------------------------------------------


def test_two_threads_same_identity_one_created_one_duplicate(resume_env: ResumeEnv) -> None:
    t1, t2 = resume_env.new_draft(), resume_env.new_draft()
    resume_env.resume_repo.gate = threading.Barrier(2)  # both pass the pre-check first
    services = [resume_env.build_service(), resume_env.build_service()]
    results: list = [None, None]
    errors: list = []

    def run(i: int, token: str) -> None:
        try:
            results[i] = services[i].confirm(token, True)
        except BaseException as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(i, t)) for i, t in enumerate((t1, t2))]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=30)

    assert errors == []
    assert sorted(r.already_saved for r in results) == [False, True]
    winner = next(r for r in results if not r.already_saved)
    assert {r.resume_id for r in results} == {winner.resume_id}
    _assert_saved_once(resume_env, winner.resume_id)  # one record, one final file, no tmp
    assert resume_env.count("resume_educations") == 1
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


# ---- crash / rename failure -------------------------------------------------------------------


def _only_tmp(env: ResumeEnv) -> str:
    names = env.archive_names()
    assert len(names) == 1 and names[0].startswith(".") and names[0].endswith(".pdf.tmp")
    return names[0]


@pytest.mark.parametrize("point", ["promote", "db_after_commit"])
def test_crash_after_commit_before_rename_then_confirm_again_is_duplicate(
    resume_env: ResumeEnv, point: str
) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm(point, SimulatedCrash())

    with pytest.raises(SimulatedCrash):
        resume_env.service.confirm(token, True)

    # State a start-up reconciliation works from: record + tmp, no final file, draft kept.
    resume_id = resume_env.query("SELECT id FROM resumes")[0][0]
    assert resume_env.count("resumes") == 1
    assert resume_env.count("resume_educations") == 1
    assert _only_tmp(resume_env) == f".{resume_id}.pdf.tmp"
    assert len(resume_env.draft_rows()) == 1 and len(resume_env.draft_file_names()) == 1

    again = resume_env.service.confirm(token, True)
    assert (again.already_saved, again.resume_id) == (True, resume_id)
    assert resume_env.count("resumes") == 1
    assert _only_tmp(resume_env) == f".{resume_id}.pdf.tmp"  # the record's tmp is not discarded
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


def test_crash_before_commit_leaves_tmp_without_record(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm("db_before", SimulatedCrash())

    with pytest.raises(SimulatedCrash):
        resume_env.service.confirm(token, True)

    # Reconciliation (2.5) deletes a tmp without a record; here we only pin the state.
    assert resume_env.count("resumes") == 0 and all(resume_env.count(t) == 0 for t in SUB_TABLES)
    _only_tmp(resume_env)
    assert len(resume_env.draft_rows()) == 1 and len(resume_env.draft_file_names()) == 1


def test_rename_failing_twice_is_save_failed_and_keeps_record_and_tmp(
    resume_env: ResumeEnv,
) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm("promote", OSError("rename failed"), times=2)

    with pytest.raises(SaveFailedError):
        resume_env.service.confirm(token, True)

    assert resume_env.injector.hits.count("promote") == 2  # retried once
    resume_id = resume_env.query("SELECT id FROM resumes")[0][0]
    assert resume_env.count("resumes") == 1
    assert _only_tmp(resume_env) == f".{resume_id}.pdf.tmp"  # record and tmp coexist
    assert len(resume_env.draft_rows()) == 1  # draft kept

    again = resume_env.service.confirm(token, True)  # user retry converges (design 5.3)
    assert (again.already_saved, again.resume_id) == (True, resume_id)
    assert resume_env.count("resumes") == 1
    assert resume_env.draft_rows() == []


def test_rename_failing_once_is_retried_and_succeeds(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm("promote", OSError("transient"), times=1)

    result = resume_env.service.confirm(token, True)

    assert result.already_saved is False
    assert resume_env.injector.hits.count("promote") == 2
    _assert_saved_once(resume_env, result.resume_id)  # final file only, no tmp
    assert resume_env.draft_rows() == [] and resume_env.draft_file_names() == []


# ---- finishing --------------------------------------------------------------------------------


def test_draft_row_delete_failure_does_not_change_the_result(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm("draft_delete", OSError("locked"))

    result = resume_env.service.confirm(token, True)

    assert result.already_saved is False
    _assert_saved_once(resume_env, result.resume_id)
    assert len(resume_env.draft_rows()) == 1  # left for the 7-day cleanup
    assert len(resume_env.draft_file_names()) == 1  # file kept: the row still points at it


def test_draft_file_delete_failure_does_not_change_the_result(resume_env: ResumeEnv) -> None:
    token = resume_env.new_draft()
    resume_env.injector.arm("draft_file_delete", OSError("busy"))

    result = resume_env.service.confirm(token, True)

    _assert_saved_once(resume_env, result.resume_id)
    assert resume_env.draft_rows() == []
    assert len(resume_env.draft_file_names()) == 1  # orphan file, removed by the cleanup job


def test_finish_failure_in_duplicate_branch_does_not_change_the_result(
    resume_env: ResumeEnv,
) -> None:
    first = resume_env.service.confirm(resume_env.new_draft(), True)
    token2 = resume_env.new_draft()
    resume_env.injector.arm("draft_delete", OSError("locked"))

    second = resume_env.service.confirm(token2, True)

    assert (second.already_saved, second.resume_id) == (True, first.resume_id)
    _assert_saved_once(resume_env, first.resume_id)
    assert len(resume_env.draft_rows()) == 1
