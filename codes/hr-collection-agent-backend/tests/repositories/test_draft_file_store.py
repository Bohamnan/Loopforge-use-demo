import os
import time
from pathlib import Path

import pytest

from app.repositories.draft_file_store import DraftFileStore
from tests.helpers import make_jpeg_bytes, make_pdf_bytes, make_png_bytes

ID = "00000000-0000-4000-8000-000000000001"


@pytest.fixture
def store(data_dir: Path) -> DraftFileStore:
    return DraftFileStore(data_dir)


def test_creates_drafts_directory(data_dir: Path) -> None:
    DraftFileStore(data_dir)
    assert (data_dir / "drafts").is_dir()


@pytest.mark.parametrize(
    ("content_type", "ext", "maker"),
    [
        ("application/pdf", ".pdf", make_pdf_bytes),
        ("image/jpeg", ".jpg", make_jpeg_bytes),
        ("image/png", ".png", make_png_bytes),
    ],
)
def test_save_uses_server_generated_name_from_content_type(
    store: DraftFileStore, data_dir: Path, content_type: str, ext: str, maker
) -> None:
    content = maker()
    name = store.save(ID, content_type, content)
    assert name == f"{ID}{ext}"
    assert (data_dir / "drafts" / name).read_bytes() == content
    assert store.read(name) == content


def test_unsupported_content_type_is_rejected(store: DraftFileStore) -> None:
    with pytest.raises(ValueError, match="content type"):
        store.save(ID, "text/plain", b"x")


@pytest.mark.parametrize(
    "bad_id", ["../evil", "a/b", "", "x" * 65, "..", "ID WITH SPACE", "id\x00", "/etc/passwd"]
)
def test_unsafe_draft_ids_are_rejected(store: DraftFileStore, bad_id: str) -> None:
    with pytest.raises(ValueError, match="draft id"):
        store.save(bad_id, "application/pdf", b"x")


def test_save_never_overwrites_an_existing_file(store: DraftFileStore) -> None:
    store.save(ID, "application/pdf", b"first")
    with pytest.raises(FileExistsError):
        store.save(ID, "application/pdf", b"second")
    assert store.read(f"{ID}.pdf") == b"first"


@pytest.mark.parametrize(
    "name", ["../x.pdf", "/etc/passwd", "a/../../b.pdf", "sub/x.pdf", "x.exe", "", "..", ".pdf"]
)
def test_read_and_delete_reject_paths_outside_the_directory(
    store: DraftFileStore, name: str
) -> None:
    with pytest.raises(ValueError, match="file name"):
        store.read(name)
    with pytest.raises(ValueError, match="file name"):
        store.delete(name)


def test_symlink_escape_is_rejected(store: DraftFileStore, data_dir: Path, tmp_path: Path) -> None:
    outside = tmp_path / "secret.pdf"
    outside.write_bytes(b"secret")
    link = data_dir / "drafts" / f"{ID}.pdf"
    link.symlink_to(outside)
    with pytest.raises(ValueError, match="file name"):
        store.read(link.name)
    with pytest.raises(ValueError, match="file name"):
        store.delete(link.name)
    assert outside.exists()


def test_delete_is_idempotent(store: DraftFileStore, data_dir: Path) -> None:
    name = store.save(ID, "application/pdf", b"x")
    assert store.delete(name) is True
    assert store.delete(name) is False
    assert not (data_dir / "drafts" / name).exists()


def test_read_missing_file_raises(store: DraftFileStore) -> None:
    with pytest.raises(FileNotFoundError):
        store.read(f"{ID}.pdf")


def test_resolve_returns_a_path_inside_the_directory(store: DraftFileStore, data_dir: Path) -> None:
    name = store.save(ID, "image/png", b"x")
    assert store.resolve(name) == (data_dir / "drafts" / name).resolve()


def test_list_files_reports_modification_times(store: DraftFileStore, data_dir: Path) -> None:
    n1 = store.save(ID, "application/pdf", b"x")
    n2 = store.save("00000000-0000-4000-8000-000000000002", "image/png", b"y")
    old = time.time() - 3 * 86400
    os.utime(data_dir / "drafts" / n1, (old, old))
    files = {f.name: f.modified_at for f in store.list_files()}
    assert set(files) == {n1, n2}
    assert abs(files[n1] - old) < 2 and files[n2] > old + 86400


def test_list_files_ignores_subdirectories(store: DraftFileStore, data_dir: Path) -> None:
    (data_dir / "drafts" / "subdir").mkdir()
    assert store.list_files() == []


def test_store_never_touches_files_outside_its_directory(
    store: DraftFileStore, data_dir: Path, file_dir: Path
) -> None:
    keep = file_dir / f"{ID}.pdf"
    keep.write_bytes(b"archive")
    name = store.save(ID, "application/pdf", b"x")
    store.delete(name)
    assert keep.read_bytes() == b"archive"


# ---- review SUGGEST-1: symlinks inside the directory are rejected too ------------------------


@pytest.fixture
def linked(store: DraftFileStore, data_dir: Path) -> tuple[str, str]:
    """a.pdf is a symlink to b.pdf, both inside the drafts directory."""
    b = store.save("00000000-0000-4000-8000-0000000000bb", "application/pdf", b"B-content")
    a = "00000000-0000-4000-8000-0000000000aa.pdf"
    (data_dir / "drafts" / a).symlink_to(data_dir / "drafts" / b)
    return a, b


def test_read_refuses_a_symlink_to_another_file_in_the_directory(
    store: DraftFileStore, linked: tuple[str, str]
) -> None:
    a, b = linked
    with pytest.raises(ValueError, match="file name"):
        store.read(a)
    assert store.read(b) == b"B-content"


def test_delete_refuses_a_symlink_and_keeps_the_target(
    store: DraftFileStore, data_dir: Path, linked: tuple[str, str]
) -> None:
    a, b = linked
    with pytest.raises(ValueError, match="file name"):
        store.delete(a)
    assert (data_dir / "drafts" / b).read_bytes() == b"B-content"  # target not deleted
    assert (data_dir / "drafts" / a).is_symlink()  # link untouched


def test_resolve_refuses_a_symlink(store: DraftFileStore, linked: tuple[str, str]) -> None:
    with pytest.raises(ValueError, match="file name"):
        store.resolve(linked[0])


def test_list_files_skips_symlinks_and_dangling_links(
    store: DraftFileStore, data_dir: Path, linked: tuple[str, str]
) -> None:
    (data_dir / "drafts" / "00000000-0000-4000-8000-0000000000cc.png").symlink_to(
        data_dir / "drafts" / "missing.png"
    )
    assert [f.name for f in store.list_files()] == [linked[1]]


def test_read_opens_with_nofollow_even_if_the_check_is_bypassed(
    store: DraftFileStore, data_dir: Path, linked: tuple[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Defence in depth: a link swapped in after the lstat check is still not followed."""
    a, _ = linked
    monkeypatch.setattr(DraftFileStore, "_reject_symlink", lambda self, path: None)
    with pytest.raises(ValueError, match="file name"):
        store.read(a)


def test_regular_files_still_work_after_hardening(store: DraftFileStore) -> None:
    name = store.save(ID, "image/png", b"png-bytes")
    assert store.read(name) == b"png-bytes"
    assert store.delete(name) is True
