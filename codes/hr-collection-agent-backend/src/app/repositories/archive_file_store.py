"""Archive of confirmed original files: {FILE_DIR}/<resume_id><ext> (ADR-005, B-05).

Saving is two steps so that a crash never leaves a final file without a record:
``stage`` copies to a hidden tmp name in the *same directory* (so the later rename is atomic),
and ``promote`` renames it to the final name after the database transaction committed.
This module only provides these primitives; the order and the compensation are decided by
ResumeService and ReconcileService.
"""

import errno
import os
import re
import shutil
import stat
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

EXTENSIONS = (".pdf", ".jpg", ".png")
_ID_RE = re.compile(r"[A-Za-z0-9-]{1,64}")
_TMP_RE = re.compile(r"\.(?P<id>[A-Za-z0-9-]{1,64})(?P<ext>\.pdf|\.jpg|\.png)\.tmp")
_FINAL_RE = re.compile(r"(?P<id>[A-Za-z0-9-]{1,64})(?P<ext>\.pdf|\.jpg|\.png)")


@dataclass(frozen=True)
class ArchiveEntry:
    """A recognised file in the archive directory."""

    name: str
    resume_id: str
    ext: str


@dataclass(frozen=True)
class ArchiveScan:
    """Directory listing split by kind; unknown files are reported, never touched."""

    tmp: list[ArchiveEntry]
    final: list[ArchiveEntry]
    unknown: list[str]


def _check(resume_id: str, ext: str) -> None:
    if not _ID_RE.fullmatch(resume_id):
        raise ValueError("invalid resume id")
    if ext not in EXTENSIONS:
        raise ValueError("unsupported extension")


def tmp_name(resume_id: str, ext: str) -> str:
    """Hidden temporary name used before the database commit."""
    _check(resume_id, ext)
    return f".{resume_id}{ext}.tmp"


def final_name(resume_id: str, ext: str) -> str:
    """Final archive name (also stored in ``resumes.file_path``)."""
    _check(resume_id, ext)
    return f"{resume_id}{ext}"


class ArchiveFileStore:
    """File primitives for the archive directory; creates it on construction."""

    def __init__(self, file_dir: Path) -> None:
        self._root = file_dir.resolve()
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, name: str) -> Path:
        if not (_TMP_RE.fullmatch(name) or _FINAL_RE.fullmatch(name)):
            raise ValueError("invalid file name")
        path = self._root / name
        if path.is_symlink() or path.parent.resolve() != self._root:
            raise ValueError("invalid file name")
        return path

    def stage(self, source: Path, resume_id: str, ext: str) -> str:
        """Copy ``source`` to the tmp name and fsync it. A failed copy leaves no tmp file."""
        name = tmp_name(resume_id, ext)
        target = self._root / name
        try:
            with open(source, "rb") as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
                dst.flush()
                os.fsync(dst.fileno())
        except BaseException:
            target.unlink(missing_ok=True)
            raise
        return name

    def promote(self, resume_id: str, ext: str) -> str:
        """Atomically rename tmp to the final name (call only after the DB commit).

        Never overwrites: an existing final file raises FileExistsError and tmp is kept.
        """
        src = self._root / tmp_name(resume_id, ext)
        name = final_name(resume_id, ext)
        target = self._root / name
        if os.path.lexists(target):  # also true for symlinks and dangling links
            raise FileExistsError("final archive file already exists; refusing to overwrite")
        os.replace(src, target)
        self._fsync_directory()
        return name

    def discard_tmp(self, resume_id: str, ext: str) -> bool:
        """Delete the tmp file; idempotent. Never touches the final file."""
        path = self._root / tmp_name(resume_id, ext)
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        return True

    def exists_tmp(self, resume_id: str, ext: str) -> bool:
        return (self._root / tmp_name(resume_id, ext)).is_file()

    def exists_final(self, resume_id: str, ext: str) -> bool:
        return (self._root / final_name(resume_id, ext)).is_file()

    def remove(self, name: str) -> bool:
        """Delete a recognised tmp/final file by name (used by reconciliation); idempotent."""
        path = self._path(name)
        try:
            path.unlink()
        except FileNotFoundError:
            return False
        return True

    def _final_path(self, name: str) -> Path:
        """Path of a final (non-tmp) archive file; the only shape readers may ask for."""
        if not _FINAL_RE.fullmatch(name):
            raise ValueError("invalid file name")
        return self._root / name

    def open_final(self, name: str) -> BinaryIO:
        """Open a final file read-only. Rejects tmp names, symlinks and anything not a file.

        Raises FileNotFoundError if it is missing and ValueError if the name or file kind is
        not acceptable; callers map both to "file not available".
        """
        path = self._final_path(name)
        try:
            if stat.S_ISLNK(os.lstat(path).st_mode):
                raise ValueError("invalid file name")
            fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)  # a late-swapped link still fails
        except OSError as exc:
            if exc.errno == errno.ELOOP:
                raise ValueError("invalid file name") from exc
            raise
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                raise ValueError("invalid file name")
        except BaseException:
            os.close(fd)
            raise
        return os.fdopen(fd, "rb")

    def is_available(self, name: str) -> bool:
        """Whether ``open_final`` would succeed (cheap check for list and detail views)."""
        try:
            self.open_final(name).close()
        except (OSError, ValueError):
            return False
        return True

    def scan(self) -> ArchiveScan:
        """List regular files, classified as tmp, final or unknown."""
        tmp: list[ArchiveEntry] = []
        final: list[ArchiveEntry] = []
        unknown: list[str] = []
        for entry in sorted(self._root.iterdir(), key=lambda p: p.name):
            if entry.is_dir() and not entry.is_symlink():
                continue
            for regex, bucket in ((_TMP_RE, tmp), (_FINAL_RE, final)):
                match = None if entry.is_symlink() else regex.fullmatch(entry.name)
                if match:
                    bucket.append(ArchiveEntry(entry.name, match["id"], match["ext"]))
                    break
            else:
                unknown.append(entry.name)
        return ArchiveScan(tmp=tmp, final=final, unknown=unknown)

    def _fsync_directory(self) -> None:
        """Best effort: persist the rename itself."""
        try:
            fd = os.open(self._root, os.O_RDONLY)
        except OSError:
            return
        try:
            os.fsync(fd)
        except OSError:
            pass
        finally:
            os.close(fd)
