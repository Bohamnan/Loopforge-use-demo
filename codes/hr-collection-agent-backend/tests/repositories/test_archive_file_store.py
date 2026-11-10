import os
import re
import shutil
from pathlib import Path

import pytest

from app.repositories.archive_file_store import ArchiveFileStore
from tests.helpers import make_pdf_bytes, make_png_bytes

RID = "00000000-0000-4000-8000-000000000001"
RID2 = "00000000-0000-4000-8000-000000000002"


@pytest.fixture
def store(file_dir: Path) -> ArchiveFileStore:
    return ArchiveFileStore(file_dir)


@pytest.fixture
def source(tmp_path: Path) -> Path:
    path = tmp_path / "draft.pdf"
    path.write_bytes(make_pdf_bytes(200))
    return path


def names(directory: Path) -> set[str]:
    return {p.name for p in directory.iterdir()}


def test_creates_the_directory(tmp_path: Path) -> None:
    ArchiveFileStore(tmp_path / "new" / "file")
    assert (tmp_path / "new" / "file").is_dir()


def test_stage_copies_to_a_hidden_tmp_in_the_same_directory(
    store: ArchiveFileStore, file_dir: Path, source: Path
) -> None:
    tmp_name = store.stage(source, RID, ".pdf")
    assert tmp_name == f".{RID}.pdf.tmp"
    assert names(file_dir) == {tmp_name}  # same directory as the future final file
    assert (file_dir / tmp_name).read_bytes() == source.read_bytes()
    assert source.exists()  # the draft file is untouched
    assert os.stat(file_dir / tmp_name).st_dev == os.stat(file_dir).st_dev
    assert store.exists_tmp(RID, ".pdf") and not store.exists_final(RID, ".pdf")


def test_promote_is_an_atomic_rename_to_the_final_name(
    store: ArchiveFileStore, file_dir: Path, source: Path
) -> None:
    store.stage(source, RID, ".pdf")
    inode = os.stat(file_dir / f".{RID}.pdf.tmp").st_ino
    final = store.promote(RID, ".pdf")
    assert final == f"{RID}.pdf"
    assert names(file_dir) == {final}
    assert os.stat(file_dir / final).st_ino == inode  # rename, not copy
    assert (file_dir / final).read_bytes() == source.read_bytes()
    assert store.exists_final(RID, ".pdf") and not store.exists_tmp(RID, ".pdf")


def test_promote_without_tmp_raises(store: ArchiveFileStore) -> None:
    with pytest.raises(FileNotFoundError):
        store.promote(RID, ".pdf")


def test_stage_with_missing_source_leaves_nothing(
    store: ArchiveFileStore, file_dir: Path, tmp_path: Path
) -> None:
    with pytest.raises(FileNotFoundError):
        store.stage(tmp_path / "missing.pdf", RID, ".pdf")
    assert names(file_dir) == set()


def test_failed_copy_removes_the_partial_tmp(
    store: ArchiveFileStore, file_dir: Path, source: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(src: object, dst: object, *args: object) -> None:
        dst.write(b"partial")  # type: ignore[attr-defined]
        raise OSError("disk full")

    monkeypatch.setattr(shutil, "copyfileobj", broken)
    with pytest.raises(OSError, match="disk full"):
        store.stage(source, RID, ".pdf")
    assert names(file_dir) == set()


def test_discard_tmp_is_idempotent(store: ArchiveFileStore, file_dir: Path, source: Path) -> None:
    store.stage(source, RID, ".pdf")
    assert store.discard_tmp(RID, ".pdf") is True
    assert store.discard_tmp(RID, ".pdf") is False
    assert names(file_dir) == set()


def test_discard_tmp_never_removes_the_final_file(
    store: ArchiveFileStore, file_dir: Path, source: Path
) -> None:
    store.stage(source, RID, ".pdf")
    store.promote(RID, ".pdf")
    assert store.discard_tmp(RID, ".pdf") is False
    assert store.exists_final(RID, ".pdf")


@pytest.mark.parametrize("bad_id", ["../evil", "a/b", "", "x" * 65, "..", "id with space", "/abs"])
def test_unsafe_ids_are_rejected(store: ArchiveFileStore, source: Path, bad_id: str) -> None:
    with pytest.raises(ValueError, match="resume id"):
        store.stage(source, bad_id, ".pdf")
    with pytest.raises(ValueError, match="resume id"):
        store.promote(bad_id, ".pdf")
    with pytest.raises(ValueError, match="resume id"):
        store.discard_tmp(bad_id, ".pdf")


@pytest.mark.parametrize("ext", [".exe", "pdf", "", ".pdf/../x", ".PDF", ".tmp"])
def test_unsupported_extensions_are_rejected(
    store: ArchiveFileStore, source: Path, ext: str
) -> None:
    with pytest.raises(ValueError, match="extension"):
        store.stage(source, RID, ext)


def test_scan_classifies_files(store: ArchiveFileStore, file_dir: Path, source: Path) -> None:
    store.stage(source, RID, ".pdf")  # tmp only
    store.stage(source, RID2, ".pdf")
    store.promote(RID2, ".pdf")  # final only
    (file_dir / "README.txt").write_text("not ours")
    (file_dir / ".hidden").write_text("not ours")
    (file_dir / "subdir").mkdir()
    scan = store.scan()
    assert [(e.name, e.resume_id, e.ext) for e in scan.tmp] == [(f".{RID}.pdf.tmp", RID, ".pdf")]
    assert [(e.name, e.resume_id, e.ext) for e in scan.final] == [(f"{RID2}.pdf", RID2, ".pdf")]
    assert sorted(scan.unknown) == [".hidden", "README.txt"]


def test_scan_recognises_all_extensions(store: ArchiveFileStore, file_dir: Path) -> None:
    for i, ext in enumerate((".pdf", ".jpg", ".png"), start=1):
        rid = f"00000000-0000-4000-8000-{i:012d}"
        (file_dir / f"{rid}{ext}").write_bytes(make_png_bytes())
    assert sorted(e.ext for e in store.scan().final) == [".jpg", ".pdf", ".png"]


def test_remove_deletes_recognised_files_only(
    store: ArchiveFileStore, file_dir: Path, source: Path
) -> None:
    tmp_name = store.stage(source, RID, ".pdf")
    assert store.remove(tmp_name) is True
    assert store.remove(tmp_name) is False
    (file_dir / "README.txt").write_text("keep")
    for bad in ("README.txt", "../x.pdf", "sub/x.pdf", "", ".."):
        with pytest.raises(ValueError, match="file name"):
            store.remove(bad)
    assert (file_dir / "README.txt").exists()


def test_names_are_server_generated_patterns(store: ArchiveFileStore, source: Path) -> None:
    tmp_name = store.stage(source, RID, ".pdf")
    assert re.fullmatch(r"\.[A-Za-z0-9-]+\.pdf\.tmp", tmp_name)
    assert re.fullmatch(r"[A-Za-z0-9-]+\.pdf", store.promote(RID, ".pdf"))


def test_symlinked_final_file_is_not_followed(
    store: ArchiveFileStore, file_dir: Path, tmp_path: Path
) -> None:
    outside = tmp_path / "outside.pdf"
    outside.write_bytes(b"secret")
    (file_dir / f"{RID}.pdf").symlink_to(outside)
    with pytest.raises(ValueError, match="file name"):
        store.remove(f"{RID}.pdf")
    assert outside.exists()
