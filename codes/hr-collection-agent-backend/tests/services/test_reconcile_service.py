"""Start-up reconciliation of the archive directory (task 2.5, HIGH_RISK B-05).

Four situations (Schema 4.2) are built by hand, so every starting state is explicit. Each case
asserts the database (``count(*)``, ids) and the ``file/`` listing before and after. Unsafe or
unclear states must lose nothing: the destructive branches are only taken for files that clearly
have no record.
"""

import logging
import re
from pathlib import Path

import pytest

import app.services.reconcile_service as reconcile_module
from app.services.reconcile_service import ReconcileReport, ReconcileService
from tests.fakes import FakeClock
from tests.repositories.test_resume_repository import make_resume
from tests.services.conftest import ResumeEnv
from tests.services.fault_injection import SimulatedCrash

PDF_A, PDF_B, PDF_C = b"%PDF-1.4 A", b"%PDF-1.4 B", b"%PDF-1.4 C"


def rid(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


def add_record(env: ResumeEnv, n: int, ext: str = ".pdf") -> str:
    env.resume_repo.create_aggregate(make_resume(n, file_path=f"{rid(n)}{ext}"))
    return rid(n)


def put(env: ResumeEnv, name: str, data: bytes = PDF_A) -> Path:
    path = env.file_dir / name
    path.write_bytes(data)
    return path


def tmp(n: int, ext: str = ".pdf") -> str:
    return f".{rid(n)}{ext}.tmp"


def final(n: int, ext: str = ".pdf") -> str:
    return f"{rid(n)}{ext}"


def reconcile(env: ResumeEnv) -> ReconcileReport:
    return ReconcileService(env.resume_repo, env.archive, env.clock).run()


def ids(env: ResumeEnv) -> list[str]:
    return sorted(r[0] for r in env.query("SELECT id FROM resumes"))


# ---- the four situations ----------------------------------------------------------------------


def test_case1_record_with_only_tmp_is_rolled_forward(resume_env: ResumeEnv) -> None:
    add_record(resume_env, 1)
    put(resume_env, tmp(1), PDF_A)
    before = (resume_env.count("resumes"), ids(resume_env))

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [final(1)]  # tmp gone, final present
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_A  # content intact
    assert (resume_env.count("resumes"), ids(resume_env)) == before  # record untouched
    assert report.rolled_forward == 1 and report.failed == 0


def test_case2_tmp_without_record_is_deleted(resume_env: ResumeEnv) -> None:
    put(resume_env, tmp(9), PDF_B)

    report = reconcile(resume_env)

    assert resume_env.archive_names() == []
    assert resume_env.count("resumes") == 0
    assert report.tmp_removed == 1


def test_case3_final_without_record_is_deleted(resume_env: ResumeEnv) -> None:
    add_record(resume_env, 1)  # other records exist (without any, the finals are kept: below)
    put(resume_env, final(1), PDF_C)
    put(resume_env, final(9), PDF_B)

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [final(1)]
    assert resume_env.count("resumes") == 1
    assert report.final_removed == 1


def test_case4_record_without_any_file_is_kept_and_warned(
    resume_env: ResumeEnv, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    add_record(resume_env, 1)

    report = reconcile(resume_env)  # must not raise

    assert resume_env.count("resumes") == 1 and ids(resume_env) == [rid(1)]  # record kept
    assert resume_env.archive_names() == []
    assert report.missing_files == 1
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert any(rid(1) in r.getMessage() for r in warnings)  # id only, so it can be found


def test_healthy_record_and_file_are_untouched(resume_env: ResumeEnv) -> None:
    add_record(resume_env, 1)
    put(resume_env, final(1), PDF_C)

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [final(1)]
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_C
    assert report == ReconcileReport()


def test_empty_directory_and_empty_database_is_a_no_op(resume_env: ResumeEnv) -> None:
    assert reconcile(resume_env) == ReconcileReport()


@pytest.mark.parametrize("ext", [".pdf", ".jpg", ".png"])
def test_roll_forward_keeps_the_extension(resume_env: ResumeEnv, ext: str) -> None:
    add_record(resume_env, 1, ext)
    put(resume_env, tmp(1, ext))

    reconcile(resume_env)

    assert resume_env.archive_names() == [final(1, ext)]


# ---- all four at once, idempotence ------------------------------------------------------------


def _mixed_state(env: ResumeEnv) -> None:
    add_record(env, 1)  # case 1
    put(env, tmp(1), PDF_A)
    put(env, tmp(2))  # case 2
    put(env, final(3))  # case 3
    add_record(env, 4)  # case 4
    add_record(env, 5)  # healthy
    put(env, final(5), PDF_C)


def test_all_cases_together_and_data_view(resume_env: ResumeEnv) -> None:
    _mixed_state(resume_env)
    assert resume_env.count("resumes") == 3 and len(resume_env.archive_names()) == 4

    report = reconcile(resume_env)

    assert resume_env.count("resumes") == 3  # records never deleted
    assert resume_env.archive_names() == sorted([final(1), final(5)])
    assert report == ReconcileReport(
        rolled_forward=1, tmp_removed=1, final_removed=1, missing_files=1
    )


def test_reconcile_is_idempotent(resume_env: ResumeEnv) -> None:
    _mixed_state(resume_env)
    reconcile(resume_env)
    state = (resume_env.archive_names(), ids(resume_env), resume_env.count("resumes"))
    contents = {n: (resume_env.file_dir / n).read_bytes() for n in resume_env.archive_names()}

    second = reconcile(resume_env)
    third = reconcile(resume_env)

    assert (resume_env.archive_names(), ids(resume_env), resume_env.count("resumes")) == state
    assert contents == {n: (resume_env.file_dir / n).read_bytes() for n in state[0]}
    assert second == third == ReconcileReport(missing_files=1)  # only the unfixable one remains


# ---- conservative handling of unclear states --------------------------------------------------


def test_record_with_both_tmp_and_final_loses_nothing(resume_env: ResumeEnv) -> None:
    add_record(resume_env, 1)
    put(resume_env, final(1), PDF_A)
    put(resume_env, tmp(1), PDF_B)  # never overwrite the final file, never guess which is right

    report = reconcile(resume_env)

    assert resume_env.archive_names() == sorted([final(1), tmp(1)])
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_A
    assert (resume_env.file_dir / tmp(1)).read_bytes() == PDF_B
    assert report.conflicts == 1


def test_same_id_but_different_extension_is_not_deleted(resume_env: ResumeEnv) -> None:
    add_record(resume_env, 1, ".pdf")
    put(resume_env, tmp(1, ".png"))  # same id, other extension: not "no record"
    put(resume_env, final(1, ".jpg"))

    report = reconcile(resume_env)

    assert resume_env.archive_names() == sorted([tmp(1, ".png"), final(1, ".jpg")])
    assert report.conflicts == 2 and report.missing_files == 0  # reported as conflicts


def test_unknown_files_directories_and_symlinks_are_never_touched(
    resume_env: ResumeEnv, tmp_path: Path
) -> None:
    put(resume_env, "notes.txt")
    put(resume_env, ".hidden")
    (resume_env.file_dir / "subdir").mkdir()
    (resume_env.file_dir / "subdir" / final(7)).write_bytes(PDF_A)
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(PDF_A)
    (resume_env.file_dir / final(8)).symlink_to(outside)
    (resume_env.file_dir / tmp(8)).symlink_to(outside)
    before = resume_env.archive_names()

    report = reconcile(resume_env)

    assert resume_env.archive_names() == before
    assert (resume_env.file_dir / "subdir" / final(7)).read_bytes() == PDF_A
    assert outside.read_bytes() == PDF_A
    assert report == ReconcileReport()


def test_draft_directory_is_not_touched(resume_env: ResumeEnv) -> None:
    resume_env.new_session()
    drafts_before = resume_env.draft_file_names()
    rows_before = resume_env.session_rows()
    put(resume_env, tmp(9))

    reconcile(resume_env)

    assert resume_env.draft_file_names() == drafts_before and len(drafts_before) == 1
    assert resume_env.session_rows() == rows_before


def test_service_depends_only_on_resume_repository_and_archive_store() -> None:
    source = Path(reconcile_module.__file__).read_text(encoding="utf-8")
    imports = set(re.findall(r"^(?:from|import) (app\.[\w.]+)", source, re.MULTILINE))
    assert imports <= {
        "app.core.clock",
        "app.core.logging",
        "app.repositories.archive_file_store",
        "app.repositories.resume_repository",
    }, imports


# ---- failures: one entry never blocks the rest, the run never raises --------------------------


def test_one_failing_roll_forward_does_not_block_the_rest(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    for n in (1, 2, 3):
        add_record(resume_env, n)
        put(resume_env, tmp(n), PDF_A)
    put(resume_env, tmp(8))
    put(resume_env, final(9))
    real = resume_env.archive.promote

    def flaky(resume_id: str, ext: str) -> str:
        if resume_id == rid(2):
            raise OSError("rename failed")
        return real(resume_id, ext)

    monkeypatch.setattr(resume_env.archive, "promote", flaky)

    report = reconcile(resume_env)

    assert resume_env.archive_names() == sorted([final(1), tmp(2), final(3)])  # 2 kept as tmp
    assert report.rolled_forward == 2 and report.failed == 1
    assert report.tmp_removed == 1 and report.final_removed == 1  # later steps still ran
    assert resume_env.count("resumes") == 3

    monkeypatch.setattr(
        resume_env.archive, "promote", real
    )  # fixed meanwhile: next run completes it
    assert reconcile(resume_env).rolled_forward == 1
    assert resume_env.archive_names() == sorted([final(n) for n in (1, 2, 3)])


def test_one_failing_delete_does_not_block_the_rest(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    for n in (7, 8, 9):
        put(resume_env, tmp(n))
    real = resume_env.archive.remove

    def flaky(name: str) -> bool:
        if name == tmp(8):
            raise PermissionError("denied")
        return real(name)

    monkeypatch.setattr(resume_env.archive, "remove", flaky)

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [tmp(8)]
    assert report.tmp_removed == 2 and report.failed == 1


def test_database_failure_aborts_without_deleting_anything(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Without the record list every file would look orphaned: nothing may be deleted."""
    caplog.set_level(logging.DEBUG, logger="app")
    add_record(resume_env, 1)
    put(resume_env, tmp(1), PDF_A)
    put(resume_env, final(2))
    before = resume_env.archive_names()

    def broken() -> list:
        raise RuntimeError("database is locked")

    monkeypatch.setattr(resume_env.resume_repo, "list_refs", broken)

    report = reconcile(resume_env)  # does not raise

    assert resume_env.archive_names() == before
    assert resume_env.count("resumes") == 1
    assert report.aborted is True
    levels = {r.levelno for r in caplog.records}
    assert logging.WARNING in levels or logging.ERROR in levels
    assert any("RuntimeError" in r.getMessage() for r in caplog.records)
    assert "database is locked" not in "\n".join(r.getMessage() for r in caplog.records)


def test_directory_scan_failure_is_reported_not_raised(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    add_record(resume_env, 1)

    def broken() -> object:
        raise PermissionError("denied")

    monkeypatch.setattr(resume_env.archive, "scan", broken)

    report = reconcile(resume_env)

    assert report.aborted is True and resume_env.count("resumes") == 1


def test_unexpected_error_in_the_middle_of_the_run_is_contained(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    add_record(resume_env, 1)
    put(resume_env, final(1))
    put(resume_env, tmp(8))
    put(resume_env, final(9))

    def broken(name: str) -> bool:
        raise RuntimeError("unexpected")

    monkeypatch.setattr(resume_env.archive, "remove", broken)

    report = reconcile(resume_env)  # per-entry failures are counted, nothing escapes

    assert report.failed == 2 and report.aborted is False
    assert resume_env.archive_names() == sorted([final(1), tmp(8), final(9)])


def test_a_simulated_process_crash_is_not_swallowed(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    put(resume_env, tmp(8))

    def crash(name: str) -> bool:
        raise SimulatedCrash()

    monkeypatch.setattr(resume_env.archive, "remove", crash)

    with pytest.raises(SimulatedCrash):
        reconcile(resume_env)


# ---- logs -------------------------------------------------------------------------------------


def test_logs_contain_only_counts_and_ids_no_content(
    resume_env: ResumeEnv, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG, logger="app")
    resume_env.resume_repo.create_aggregate(
        make_resume(
            1,
            name="ZZ SECRETNAME",
            phone="13700137001",
            email="secret@example.com",
            original_filename="private-cv.pdf",
            file_path=final(1),
        )
    )
    put(resume_env, tmp(1))
    put(resume_env, tmp(2))
    put(resume_env, final(3))
    add_record(resume_env, 4)

    reconcile(resume_env)

    text = "\n".join(r.getMessage() for r in caplog.records)
    assert text  # a log-free run would make the checks below pass for the wrong reason
    for secret in ("ZZ SECRETNAME", "13700137001", "secret@example.com", "private-cv.pdf"):
        assert secret not in text
    assert str(resume_env.file_dir) not in text  # no absolute path
    assert ".tmp" not in text  # no file names
    assert rid(4) in text  # the unfixable record is identified by id only


def test_run_duration_comes_from_the_injected_clock(
    resume_env: ResumeEnv, caplog: pytest.LogCaptureFixture
) -> None:
    class SteppingClock(FakeClock):
        def now(self):  # noqa: ANN201
            current = super().now()
            self.advance(milliseconds=250)
            return current

    caplog.set_level(logging.DEBUG, logger="app")

    ReconcileService(resume_env.resume_repo, resume_env.archive, SteppingClock()).run()

    assert any('"duration_ms": 250' in r.getMessage() for r in caplog.records)


# ---- end-to-end with ResumeService faults (task 2.4 states) -----------------------------------


# ---- 2.7 follow-ups (review batch 8: SUGGEST-1/2/3) -------------------------------------------


def test_directory_is_listed_before_records_are_read(resume_env: ResumeEnv) -> None:
    """SUGGEST-1: a file that appears after the listing is never judged against old records."""
    calls: list[str] = []
    real_scan, real_refs = resume_env.archive.scan, resume_env.resume_repo.list_refs
    resume_env.archive.scan = lambda: (calls.append("scan"), real_scan())[1]  # type: ignore[method-assign]
    resume_env.resume_repo.list_refs = lambda: (calls.append("refs"), real_refs())[1]  # type: ignore[method-assign]

    reconcile(resume_env)

    assert calls == ["scan", "refs"]


def test_save_committing_during_the_run_is_not_mistaken_for_an_orphan(
    resume_env: ResumeEnv,
) -> None:
    """A record and final file that appear after the directory listing must both survive."""
    add_record(resume_env, 1)  # at least one record, so the "no records" safeguard stays out
    put(resume_env, final(1))
    real_refs = resume_env.resume_repo.list_refs

    def refs_then_concurrent_save() -> list:
        snapshot = real_refs()
        add_record(resume_env, 5)  # a request commits and renames while we are running
        put(resume_env, final(5), PDF_A)
        return snapshot

    resume_env.resume_repo.list_refs = refs_then_concurrent_save  # type: ignore[method-assign]

    reconcile(resume_env)

    assert resume_env.archive_names() == sorted([final(1), final(5)])
    assert resume_env.count("resumes") == 2


def test_final_files_are_kept_when_there_are_no_records_at_all(resume_env: ResumeEnv) -> None:
    """SUGGEST-2: an empty or replaced database must not wipe the archive."""
    put(resume_env, final(1), PDF_A)
    put(resume_env, final(2), PDF_B)
    put(resume_env, tmp(3), PDF_C)  # a tmp without record is still just an unfinished save

    report = reconcile(resume_env)

    assert resume_env.archive_names() == sorted([final(1), final(2)])
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_A
    assert report.final_removed == 0 and report.conflicts == 2 and report.tmp_removed == 1


def test_final_without_record_is_still_deleted_when_other_records_exist(
    resume_env: ResumeEnv,
) -> None:
    add_record(resume_env, 1)
    put(resume_env, final(1))
    put(resume_env, final(9))

    assert reconcile(resume_env).final_removed == 1
    assert resume_env.archive_names() == [final(1)]


def test_unexpected_error_mid_run_keeps_the_counts_done_so_far(
    resume_env: ResumeEnv, monkeypatch: pytest.MonkeyPatch
) -> None:
    """SUGGEST-3: a run stopped midway reports what it already did and says it was aborted."""
    add_record(resume_env, 1)
    put(resume_env, tmp(1))
    put(resume_env, tmp(9))

    def broken(self: object, *args: object) -> None:
        raise RuntimeError("unexpected")

    monkeypatch.setattr(ReconcileService, "_remove_orphans", broken)

    report = reconcile(resume_env)

    assert report.aborted is True and report.rolled_forward == 1
    assert resume_env.archive_names() == sorted([final(1), tmp(9)])


# ---- stale older version after a confirmed update (task 2.5, B-05) -------------------------


def versioned(n: int, suffix: str, ext: str = ".pdf") -> str:
    return f"{rid(n)}-{suffix}{ext}"


def add_updated_record(env: ResumeEnv, n: int, current: str) -> None:
    env.resume_repo.create_aggregate(make_resume(n, file_path=current))


def test_stale_old_version_is_deleted_when_the_records_own_file_exists(
    resume_env: ResumeEnv,
) -> None:
    """Crash after the update commit, before the old file was removed."""
    new = versioned(1, "ab12cd34")
    add_updated_record(resume_env, 1, new)
    put(resume_env, new, PDF_B)
    put(resume_env, final(1), PDF_A)  # first-save name
    put(resume_env, versioned(1, "00000000"), PDF_C)  # an older update

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [new]
    assert (resume_env.file_dir / new).read_bytes() == PDF_B
    assert (report.stale_removed, report.conflicts, report.failed) == (2, 0, 0)
    assert ids(resume_env) == [rid(1)]
    assert reconcile(resume_env) == ReconcileReport()  # idempotent


def test_other_extension_of_the_same_record_is_stale_only_if_the_own_file_exists(
    resume_env: ResumeEnv,
) -> None:
    new = versioned(1, "ab12cd34", ".png")
    add_updated_record(resume_env, 1, new)
    put(resume_env, final(1, ".pdf"), PDF_A)

    kept = reconcile(
        resume_env
    )  # the record's own file is missing: the old one may be the only copy
    assert resume_env.archive_names() == [final(1, ".pdf")]
    assert (kept.stale_removed, kept.conflicts) == (0, 1)

    put(resume_env, new, PDF_B)
    removed = reconcile(resume_env)
    assert resume_env.archive_names() == [new]
    assert (removed.stale_removed, removed.conflicts) == (1, 0)


def test_old_version_is_kept_and_counted_when_the_records_own_file_is_missing(
    resume_env: ResumeEnv,
) -> None:
    new = versioned(1, "ab12cd34")
    add_updated_record(resume_env, 1, new)
    put(resume_env, final(1), PDF_A)  # the only data left

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [final(1)]
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_A
    assert (report.stale_removed, report.conflicts, report.missing_files) == (0, 1, 0)


def test_new_version_without_a_record_pointing_to_it_is_still_removed(
    resume_env: ResumeEnv,
) -> None:
    """Crash after promote, before the update transaction: the record still has the old file."""
    add_record(resume_env, 1)
    put(resume_env, final(1), PDF_A)
    put(resume_env, versioned(1, "ab12cd34"), PDF_B)  # not the record's file, record's own exists

    report = reconcile(resume_env)

    assert resume_env.archive_names() == [final(1)]
    assert (resume_env.file_dir / final(1)).read_bytes() == PDF_A
    assert report.stale_removed == 1
    # a versioned file whose base id has no record at all is an ordinary orphan
    put(resume_env, versioned(9, "ab12cd34"), PDF_C)
    assert reconcile(resume_env).final_removed == 1
