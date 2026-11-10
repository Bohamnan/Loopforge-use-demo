"""Draft cleanup (design 5.5, ADR-003): expired drafts, then orphan files in the drafts folder.

1. Rows idle for more than the retention period are deleted first, their files afterwards: a
   crash can only leave an orphan file, never a row pointing at a missing file.
2. Files in the drafts directory that no row references and that are older than one day are
   deleted. The one-day margin protects uploads in progress (the file is written before the row).
3. This service only depends on the draft repository and the draft file store: it can never
   touch ``file/`` (the confirmed archive).

If the list of referenced files cannot be read, no orphan is deleted (every file would look
unreferenced). ``run_once`` never raises for ordinary errors; failures are logged (counts only)
and the next run retries.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from app.core.clock import Clock, format_utc
from app.core.logging import log_event
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRepository

ORPHAN_GRACE = timedelta(days=1)


@dataclass(frozen=True)
class CleanupReport:
    """Counts of what one run did (no names, no content)."""

    expired_removed: int = 0  # draft rows deleted
    orphans_removed: int = 0  # unreferenced old files deleted
    failed: int = 0  # file deletions or phases that raised


class CleanupService:
    """Removes expired drafts and orphaned draft files; idempotent."""

    def __init__(
        self, drafts: DraftRepository, files: DraftFileStore, clock: Clock, ttl_days: int
    ) -> None:
        self._drafts = drafts
        self._files = files
        self._clock = clock
        self._ttl_days = ttl_days

    def run_once(self) -> CleanupReport:
        """Run both steps once. Ordinary errors are logged, never raised."""
        now = self._clock.now()
        expired, failed_expired = self._remove_expired(now)
        orphans, failed_orphans = self._remove_orphans(now)
        report = CleanupReport(expired, orphans, failed_expired + failed_orphans)
        level = "warning" if report.failed else "info"
        log_event("cleanup_done", level=level, count=expired + orphans)
        if report.failed:
            log_event("cleanup_failed_entries", level="warning", count=report.failed)
        return report

    def _remove_expired(self, now: datetime) -> tuple[int, int]:
        cutoff = format_utc(now - timedelta(days=self._ttl_days))
        try:
            paths = self._drafts.delete_expired(cutoff)  # rows first
        except Exception as exc:  # noqa: BLE001 - the scheduler must keep running
            log_event("cleanup_expired_failed", level="error", exc=exc)
            return 0, 1
        failed = sum(0 if self._delete_file(p) else 1 for p in paths)
        return len(paths), failed

    def _remove_orphans(self, now: datetime) -> tuple[int, int]:
        try:
            files = self._files.list_files()
            referenced = self._drafts.list_file_paths()
        except Exception as exc:  # noqa: BLE001 - without both lists nothing may be deleted
            log_event("cleanup_scan_failed", level="error", exc=exc)
            return 0, 1
        limit = (now - ORPHAN_GRACE).timestamp()
        removed = failed = 0
        for stored in files:
            if stored.name in referenced or stored.modified_at >= limit:
                continue
            try:
                self._files.delete(stored.name)
            except ValueError:
                continue  # not a draft file name: not ours to delete
            except Exception as exc:  # noqa: BLE001 - one file must not stop the others
                log_event("cleanup_file_failed", level="warning", exc=exc)
                failed += 1
            else:
                removed += 1
        return removed, failed

    def _delete_file(self, name: str) -> bool:
        try:
            self._files.delete(name)
        except Exception as exc:  # noqa: BLE001 - the row is already gone; orphan sweep retries
            log_event("cleanup_file_failed", level="warning", exc=exc)
            return False
        return True
