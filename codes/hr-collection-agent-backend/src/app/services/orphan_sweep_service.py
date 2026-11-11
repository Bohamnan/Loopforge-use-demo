"""Orphan sweep of the session temp-file folder (design 5.5, ADR-008): runs once at start-up.

Sessions never expire, so the only clean-up is for files that no session references any more
(an upload, save or delete that died midway, or v1 leftovers). A file is deleted only if no
``sessions.file_path`` points at it and it is older than one day; the one-day margin protects
an upload in progress (the file is written before its row).

This service only depends on the session repository and the draft file store: it can never
touch ``file/`` (the confirmed archive). If the list of referenced files cannot be read, nothing
is deleted (every file would look unreferenced). ``run_once`` never raises for ordinary errors;
failures are logged (counts only).
"""

from dataclasses import dataclass
from datetime import timedelta

from app.core.clock import Clock
from app.core.logging import log_event
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.session_repository import SessionRepository

ORPHAN_GRACE = timedelta(days=1)


@dataclass(frozen=True)
class SweepReport:
    """Counts of what one run did (no names, no content)."""

    orphans_removed: int = 0  # unreferenced old files deleted
    failed: int = 0  # file deletions or phases that raised


class OrphanSweepService:
    """Removes orphaned session files; idempotent."""

    def __init__(self, sessions: SessionRepository, files: DraftFileStore, clock: Clock) -> None:
        self._sessions = sessions
        self._files = files
        self._clock = clock

    def run_once(self) -> SweepReport:
        """Sweep once. Ordinary errors are logged, never raised."""
        removed, failed = self._remove_orphans()
        report = SweepReport(removed, failed)
        log_event("orphan_sweep_done", level="warning" if failed else "info", count=removed)
        if failed:
            log_event("orphan_sweep_failed_entries", level="warning", count=failed)
        return report

    def _remove_orphans(self) -> tuple[int, int]:
        try:
            files = self._files.list_files()
            referenced = self._sessions.list_file_paths()
        except Exception as exc:  # noqa: BLE001 - without both lists nothing may be deleted
            log_event("orphan_sweep_scan_failed", level="error", exc=exc)
            return 0, 1
        limit = (self._clock.now() - ORPHAN_GRACE).timestamp()
        removed = failed = 0
        for stored in files:
            if stored.name in referenced or stored.modified_at >= limit:
                continue
            try:
                self._files.delete(stored.name)
            except ValueError:
                continue  # not a draft file name: not ours to delete
            except Exception as exc:  # noqa: BLE001 - one file must not stop the others
                log_event("orphan_sweep_file_failed", level="warning", exc=exc)
                failed += 1
            else:
                removed += 1
        return removed, failed
