"""ArchiveQueryService: read-only list, detail and file opening (task 2.13)."""

from pathlib import Path

import pytest

from app.core.errors import FileNotAvailableError, ResumeNotFoundError
from app.services.archive_query_service import ArchiveQueryService
from tests.repositories.test_resume_repository import make_resume
from tests.services.conftest import SessionEnv


@pytest.fixture
def service(session_env: SessionEnv) -> ArchiveQueryService:
    return ArchiveQueryService(session_env.resumes, session_env.archive)


def rid(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


def test_list_is_most_recent_first_and_detail_reports_file_availability(
    session_env: SessionEnv, service: ArchiveQueryService
) -> None:
    session_env.resumes.create_aggregate(make_resume(1, created_at="2026-11-10T08:00:00Z"))
    session_env.resumes.create_aggregate(make_resume(2, created_at="2026-11-11T08:00:00Z"))
    (session_env.file_dir / f"{rid(1)}.pdf").write_bytes(b"%PDF-1")

    assert [i.resume_id for i in service.list().items] == [rid(2), rid(1)]
    assert service.get(rid(1)).file_available is True
    detail = service.get(rid(2))
    assert detail.file_available is False  # information is still readable
    assert detail.fields.name == "ZZ合成姓名" and detail.saved_at == detail.updated_at
    with pytest.raises(ResumeNotFoundError):
        service.get("nope")


def test_open_file_streams_the_final_file(
    session_env: SessionEnv, service: ArchiveQueryService
) -> None:
    session_env.resumes.create_aggregate(make_resume(1))
    (session_env.file_dir / f"{rid(1)}.pdf").write_bytes(b"%PDF-content")
    opened = service.open_file(rid(1))
    with opened.stream:
        assert opened.stream.read() == b"%PDF-content"
    assert (opened.content_type, opened.filename) == ("application/pdf", "synthetic.pdf")
    with pytest.raises(ResumeNotFoundError):
        service.open_file("nope")


def test_missing_tmp_only_symlink_and_tampered_paths_are_not_available(
    session_env: SessionEnv, service: ArchiveQueryService, tmp_path: Path
) -> None:
    for n, path in ((1, None), (2, None), (3, None), (4, "../outside.pdf")):
        session_env.resumes.create_aggregate(
            make_resume(n, **({"file_path": path} if path else {}))  # type: ignore[arg-type]
        )
    (session_env.file_dir / f".{rid(2)}.pdf.tmp").write_bytes(b"x")  # only a tmp: never read
    outside = tmp_path / "secret.pdf"
    outside.write_bytes(b"secret")
    (session_env.file_dir / f"{rid(3)}.pdf").symlink_to(outside)
    (tmp_path / "outside.pdf").write_bytes(b"outside")

    for n in (1, 2, 3, 4):
        with pytest.raises(FileNotAvailableError):
            service.open_file(rid(n))
        assert service.get(rid(n)).file_available is False
