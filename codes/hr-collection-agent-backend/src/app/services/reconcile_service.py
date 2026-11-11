"""Start-up reconciliation of the archive directory (ADR-005, Schema 4.2, B-05).

Compares ``resumes`` records with the files in ``FILE_DIR`` and repairs what an interrupted
save left behind. It only depends on ResumeRepository and ArchiveFileStore (never the draft
store or the draft database) and only touches recognised archive names.

Situations, per record / file:

1. record + tmp only          -> roll forward (rename tmp to the final name)
2. tmp, no record             -> delete (save never committed)
3. final file, no record      -> delete (file without a record)
4. record, no final and no tmp -> cannot be repaired: warn, keep the record

5. stale older version (confirmed update): a final file of a record that is *not* the file the
   record points at, while the record's own final file exists -> delete. An update promotes a
   new uniquely named file before the transaction and removes the old one after it, so a crash
   in between leaves the old file behind. If the record's own file is missing the other file
   may be the only copy: it is kept and counted as a conflict.

Anything unclear is left alone and counted as a conflict: a record that has both tmp and final
file, or a file whose id matches a record but whose name does not. Deleting is irreversible, so
only files that clearly have no record are deleted. Safeguards against mass deletion:

- the directory is listed *before* the records are read, so a save that commits while we run
  can only show up as a tmp to roll forward, never as a final file whose record we missed;
- if the record list or the directory listing cannot be read, nothing is deleted at all (every
  file would look orphaned);
- if there are no records at all but final files exist (wrong or replaced database), the final
  files are kept and reported as conflicts: records are never deleted, so this state cannot
  come from a normal run.

``run`` never raises for ordinary errors: a failed reconciliation must not stop the service
from starting, but it is always logged (counts and ids only, never content).
"""

import re
from dataclasses import dataclass

from app.core.clock import Clock
from app.core.logging import log_event
from app.repositories.archive_file_store import (
    ArchiveEntry,
    ArchiveFileStore,
    ArchiveScan,
    final_name,
)
from app.repositories.resume_repository import ResumeRef, ResumeRepository


@dataclass(frozen=True)
class ReconcileReport:
    """Counts of what a run did (no names, no content)."""

    rolled_forward: int = 0
    tmp_removed: int = 0
    final_removed: int = 0
    stale_removed: int = 0  # older versions left behind by a confirmed update
    missing_files: int = 0  # records without any file: needs a human
    conflicts: int = 0  # unclear states left untouched
    failed: int = 0  # entries whose action raised
    # The run stopped early: either records/directory could not be read (nothing was changed),
    # or an unexpected error hit midway (the counts above are what was already done).
    aborted: bool = False


class ReconcileService:
    """Repairs the archive directory against the resumes table; idempotent."""

    def __init__(self, resumes: ResumeRepository, archive: ArchiveFileStore, clock: Clock) -> None:
        self._resumes = resumes
        self._archive = archive
        self._clock = clock

    def run(self) -> ReconcileReport:
        """Reconcile once. Ordinary errors are logged, never raised."""
        started = self._clock.now()
        counts = _Counts()
        try:
            self._reconcile(counts)
            report = counts.report()
        except Exception as exc:  # noqa: BLE001 - must not block start-up; logged below
            log_event("reconcile_aborted", level="error", exc=exc)
            report = counts.report(aborted=True)
        counts.log()
        elapsed = self._clock.now() - started
        log_event(
            "reconcile_done",
            level="warning" if _needs_attention(report) else "info",
            count=report.rolled_forward
            + report.tmp_removed
            + report.final_removed
            + report.stale_removed,
            duration_ms=int(elapsed.total_seconds() * 1000),
        )
        return report

    def _reconcile(self, counts: "_Counts") -> None:
        scan = self._archive.scan()  # first: see _remove_orphans / module docstring
        refs = sorted(self._resumes.list_refs(), key=lambda r: r.id)
        self._check_records(refs, scan, counts)
        self._remove_orphans(refs, scan, counts)

    # ---- records: situations 1 and 4 -----------------------------------------------------

    def _check_records(self, refs: list[ResumeRef], scan: ArchiveScan, counts: "_Counts") -> None:
        finals = {e.name for e in scan.final}
        tmps = {final_name(e.resume_id, e.ext): e for e in scan.tmp}
        for ref in refs:
            tmp = tmps.get(ref.file_path)
            if ref.file_path in finals:
                if tmp is not None:
                    counts.conflicts += 1  # never overwrite an existing final file
                continue
            if tmp is not None:
                self._roll_forward(tmp, counts)
            elif not _has_entry_with_id(ref.id, scan):
                counts.missing_files += 1
                log_event("reconcile_record_file_missing", level="warning", resume_id=ref.id)

    def _roll_forward(self, tmp: ArchiveEntry, counts: "_Counts") -> None:
        try:
            self._archive.promote(tmp.resume_id, tmp.ext)
        except Exception as exc:  # noqa: BLE001 - one entry must not stop the others
            counts.failed += 1
            log_event("reconcile_entry_failed", level="warning", exc=exc, resume_id=tmp.resume_id)
        else:
            counts.rolled_forward += 1

    # ---- files without a record: situations 2 and 3 --------------------------------------

    def _remove_orphans(self, refs: list[ResumeRef], scan: ArchiveScan, counts: "_Counts") -> None:
        paths = {r.file_path for r in refs}
        by_id = {r.id: r for r in refs}
        finals = {e.name for e in scan.final}
        keep_finals = not refs and bool(scan.final)  # no records at all: do not wipe the archive
        for entry, is_tmp in [(e, True) for e in scan.tmp] + [(e, False) for e in scan.final]:
            if keep_finals and not is_tmp:
                counts.conflicts += 1
                continue
            if final_name(entry.resume_id, entry.ext) in paths:
                continue  # owned by a record (handled above)
            owner = by_id.get(entry.resume_id) if is_tmp else _final_owner(entry.resume_id, by_id)
            if owner is not None:
                if is_tmp or owner.file_path not in finals:
                    counts.conflicts += 1  # do not guess: the other file may be the only copy
                elif self._remove(entry):
                    counts.stale_removed += 1
                else:
                    counts.failed += 1
                continue
            if self._remove(entry):
                if is_tmp:
                    counts.tmp_removed += 1
                else:
                    counts.final_removed += 1
            else:
                counts.failed += 1

    def _remove(self, entry: ArchiveEntry) -> bool:
        try:
            self._archive.remove(entry.name)
        except Exception as exc:  # noqa: BLE001 - one entry must not stop the others
            log_event("reconcile_entry_failed", level="warning", exc=exc, resume_id=entry.resume_id)
            return False
        return True


_VERSION_SUFFIX_RE = re.compile(r"(?P<base>.+)-[0-9a-f]{8}")


def _final_owner(file_id: str, by_id: dict[str, ResumeRef]) -> ResumeRef | None:
    """The record a final file's id belongs to: ``<id>`` or the update form ``<id>-<suffix8>``."""
    if file_id in by_id:
        return by_id[file_id]
    match = _VERSION_SUFFIX_RE.fullmatch(file_id)
    return by_id.get(match["base"]) if match else None


def _has_entry_with_id(resume_id: str, scan: ArchiveScan) -> bool:
    """True if some tmp/final file carries this id (or its update form): a conflict, not a loss."""
    for e in (*scan.tmp, *scan.final):
        match = _VERSION_SUFFIX_RE.fullmatch(e.resume_id)
        if e.resume_id == resume_id or (match and match["base"] == resume_id):
            return True
    return False


def _needs_attention(report: ReconcileReport) -> bool:
    return bool(report.missing_files or report.conflicts or report.failed or report.aborted)


class _Counts:
    """Mutable tally for one run."""

    def __init__(self) -> None:
        self.rolled_forward = 0
        self.tmp_removed = 0
        self.final_removed = 0
        self.stale_removed = 0
        self.missing_files = 0
        self.conflicts = 0
        self.failed = 0

    def report(self, aborted: bool = False) -> ReconcileReport:
        return ReconcileReport(**vars(self), aborted=aborted)

    def log(self) -> None:
        for event, count, level in (
            ("reconcile_rolled_forward", self.rolled_forward, "info"),
            ("reconcile_tmp_removed", self.tmp_removed, "info"),
            ("reconcile_final_removed", self.final_removed, "info"),
            ("reconcile_stale_removed", self.stale_removed, "info"),
            ("reconcile_records_missing_files", self.missing_files, "warning"),
            ("reconcile_conflicts", self.conflicts, "warning"),
            ("reconcile_entries_failed", self.failed, "warning"),
        ):
            if count:
                log_event(event, level=level, count=count)
