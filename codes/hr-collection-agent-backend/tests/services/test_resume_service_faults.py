"""B-05 fault injection for ResumeService.confirm (design 9.3, HIGH_RISK).

Each case asserts the databases (count(*), key columns) and the file system (``file/`` and the
drafts directory) together. Crash cases use SimulatedCrash (BaseException): no compensation
runs, as in a killed process. They assert the state a reconciliation starts from, then run it.
"""

import shutil
import threading

import pytest

from app.core.errors import SaveFailedError
from tests.services.conftest import ResumeEnv
from tests.services.fault_injection import SimulatedCrash

SUB_TABLES = ("resume_work_experiences", "resume_project_experiences", "resume_educations")


def assert_clean_failure(env: ResumeEnv) -> None:
    """Nothing committed, nothing orphaned, the session is still reviewing for a retry."""
    assert env.count("resumes") == 0 and all(env.count(t) == 0 for t in SUB_TABLES)
    assert env.archive_names() == []
    assert [r[1] for r in env.session_rows()] == ["reviewing"]
    assert len(env.draft_file_names()) == 1


def assert_saved_once(env: ResumeEnv, resume_id: str) -> None:
    assert env.query("SELECT id, file_path FROM resumes") == [(resume_id, f"{resume_id}.pdf")]
    assert env.archive_names() == [f"{resume_id}.pdf"]


def only_tmp(env: ResumeEnv) -> str:
    names = env.archive_names()
    assert len(names) == 1 and names[0].startswith(".") and names[0].endswith(".pdf.tmp")
    return names[0]


def session_file_bytes(env: ResumeEnv) -> bytes:
    (name,) = env.draft_file_names()
    return (env.data_dir / "drafts" / name).read_bytes()


def assert_reconciled(env: ResumeEnv, resume_id: str, original: bytes) -> None:
    """Start-up reconciliation: tmp rolled forward, content intact, record unchanged."""
    before = env.query("SELECT * FROM resumes")
    report = env.reconcile()
    assert report.rolled_forward == 1 and report.failed == 0
    assert env.archive_names() == [f"{resume_id}.pdf"]
    assert (env.file_dir / f"{resume_id}.pdf").read_bytes() == original
    assert env.query("SELECT * FROM resumes") == before
    assert env.reconcile().rolled_forward == 0  # idempotent


@pytest.mark.parametrize("point", ["stage", "stage_mid_copy"])
def test_stage_failure_leaves_nothing_and_retry_succeeds(resume_env: ResumeEnv, point: str) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm(point, OSError("disk full"))
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)
    assert_clean_failure(resume_env)  # the half-written tmp was removed

    result = resume_env.confirm(sid)
    assert result.already_saved is False
    assert_saved_once(resume_env, result.resume_id)


def test_real_copy_failure_removes_partial_tmp(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    sid = resume_env.new_session()

    def broken_copy(src: object, dst: object, *args: object) -> None:
        dst.write(b"partial")  # type: ignore[attr-defined]
        raise OSError("copy interrupted")

    monkeypatch.setattr(shutil, "copyfileobj", broken_copy)
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)
    assert_clean_failure(resume_env)


@pytest.mark.parametrize("point", ["db_after_main", "db_after_sub"])
def test_failure_inside_transaction_rolls_back_everything(
    resume_env: ResumeEnv, point: str
) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm(point, RuntimeError("boom"))
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)
    assert_clean_failure(resume_env)

    result = resume_env.confirm(sid)
    assert_saved_once(resume_env, result.resume_id)
    assert resume_env.count("resume_educations") == 1


def test_two_threads_same_identity_one_created_one_duplicate(resume_env: ResumeEnv) -> None:
    s1, s2 = resume_env.new_session(), resume_env.new_session()
    resume_env.resume_repo.gate = threading.Barrier(2)  # both pass the pre-check first
    services = [resume_env.build_service(), resume_env.build_service()]
    results: list = [None, None]
    errors: list = []

    def run(i: int, sid: str) -> None:
        try:
            results[i] = services[i].confirm(sid, resume_env.browser, True)
        except BaseException as exc:  # noqa: BLE001 - surfaced by the assertion below
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(i, s)) for i, s in enumerate((s1, s2))]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert errors == []
    assert sorted(r.already_saved for r in results) == [False, True]
    winner = next(r for r in results if not r.already_saved)
    assert {r.resume_id for r in results} == {winner.resume_id}
    assert_saved_once(resume_env, winner.resume_id)  # one record, one final file, no tmp
    assert resume_env.count("resume_educations") == 1


def test_same_session_submitted_twice_concurrently_gives_one_201_and_one_200(
    resume_env: ResumeEnv,
) -> None:
    sid = resume_env.new_session()
    resume_env.resume_repo.gate = threading.Barrier(2)
    services = [resume_env.build_service(), resume_env.build_service()]
    results: list = [None, None]
    errors: list = []

    def run(i: int) -> None:
        try:
            results[i] = services[i].confirm(sid, resume_env.browser, True)
        except BaseException as exc:  # noqa: BLE001
            errors.append(exc)

    threads = [threading.Thread(target=run, args=(i,)) for i in (0, 1)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=30)

    assert errors == []
    assert sorted(r.already_saved for r in results) == [False, True]
    winner = next(r for r in results if not r.already_saved)
    assert_saved_once(resume_env, winner.resume_id)
    assert resume_env.session_rows() == [(sid, "saved", "none", winner.resume_id, None)]


def test_plain_exception_after_commit_keeps_record_and_tmp(resume_env: ResumeEnv) -> None:
    """COMMIT succeeded, then an ordinary exception: the tmp must survive for reconciliation."""
    sid = resume_env.new_session()
    original = session_file_bytes(resume_env)
    resume_env.injector.arm("db_after_commit", RuntimeError("commit outcome unknown"))
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)

    resume_id = resume_env.query("SELECT id FROM resumes")[0][0]
    assert resume_env.count("resume_educations") == 1
    assert only_tmp(resume_env) == f".{resume_id}.pdf.tmp"
    assert [r[1] for r in resume_env.session_rows()] == ["reviewing"]

    again = resume_env.confirm(sid)  # retry converges on the committed record
    assert (again.already_saved, again.resume_id) == (True, resume_id)
    assert_reconciled(resume_env, resume_id, original)


@pytest.mark.parametrize("point", ["promote", "db_after_commit"])
def test_crash_after_commit_before_rename_then_confirm_again_is_duplicate(
    resume_env: ResumeEnv, point: str
) -> None:
    sid = resume_env.new_session()
    original = session_file_bytes(resume_env)
    resume_env.injector.arm(point, SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        resume_env.confirm(sid)

    resume_id = resume_env.query("SELECT id FROM resumes")[0][0]  # record + tmp, no final file
    assert only_tmp(resume_env) == f".{resume_id}.pdf.tmp"
    assert [r[1] for r in resume_env.session_rows()] == ["reviewing"]

    again = resume_env.confirm(sid)
    assert (again.already_saved, again.resume_id) == (True, resume_id)
    assert only_tmp(resume_env) == f".{resume_id}.pdf.tmp"  # the record's tmp is not discarded
    assert_reconciled(resume_env, resume_id, original)


def test_crash_before_commit_leaves_tmp_without_record(resume_env: ResumeEnv) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm("db_before", SimulatedCrash())
    with pytest.raises(SimulatedCrash):
        resume_env.confirm(sid)
    assert resume_env.count("resumes") == 0
    only_tmp(resume_env)

    assert resume_env.reconcile().tmp_removed == 1
    assert_clean_failure(resume_env)
    assert resume_env.confirm(sid).already_saved is False  # the session can still be saved


def test_rename_failing_twice_is_save_failed_and_keeps_record_and_tmp(
    resume_env: ResumeEnv,
) -> None:
    sid = resume_env.new_session()
    original = session_file_bytes(resume_env)
    resume_env.injector.arm("promote", OSError("rename failed"), times=2)
    with pytest.raises(SaveFailedError):
        resume_env.confirm(sid)

    assert resume_env.injector.hits.count("promote") == 2  # retried once
    resume_id = resume_env.query("SELECT id FROM resumes")[0][0]
    assert only_tmp(resume_env) == f".{resume_id}.pdf.tmp"  # record and tmp coexist
    again = resume_env.confirm(sid)
    assert (again.already_saved, again.resume_id) == (True, resume_id)
    assert_reconciled(resume_env, resume_id, original)


def test_rename_failing_once_is_retried_and_succeeds(resume_env: ResumeEnv) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm("promote", OSError("transient"), times=1)
    result = resume_env.confirm(sid)
    assert resume_env.injector.hits.count("promote") == 2
    assert_saved_once(resume_env, result.resume_id)


def test_mark_saved_failure_keeps_the_result_and_the_temp_file(resume_env: ResumeEnv) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm("session_mark_saved", OSError("locked"))
    result = resume_env.confirm(sid)
    assert result.already_saved is False
    assert_saved_once(resume_env, result.resume_id)
    assert [r[1] for r in resume_env.session_rows()] == ["reviewing"]
    assert len(resume_env.draft_file_names()) == 1  # the row still points at it
    assert resume_env.confirm(sid).already_saved is True  # re-confirm converges


def test_temp_file_delete_failure_does_not_change_the_result(resume_env: ResumeEnv) -> None:
    sid = resume_env.new_session()
    resume_env.injector.arm("draft_file_delete", OSError("busy"))
    result = resume_env.confirm(sid)
    assert_saved_once(resume_env, result.resume_id)
    assert resume_env.session_rows() == [(sid, "saved", "none", result.resume_id, None)]
    assert len(resume_env.draft_file_names()) == 1  # orphan, removed by the start-up sweep


def test_candidate_marking_failure_in_duplicate_branch_does_not_change_the_result(
    resume_env: ResumeEnv,
) -> None:
    first = resume_env.confirm(resume_env.new_session())
    sid2 = resume_env.new_session()
    resume_env.injector.arm("session_mark_candidate", OSError("locked"))
    second = resume_env.confirm(sid2)
    assert (second.already_saved, second.resume_id) == (True, first.resume_id)
    assert_saved_once(resume_env, first.resume_id)
