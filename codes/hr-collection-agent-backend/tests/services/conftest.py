"""Fixtures that wire a SessionService against temporary SQLite files and directories."""

from dataclasses import dataclass
from pathlib import Path

import pytest

from app.core.db import connect, init_drafts_db, init_resumes_db
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.chat_repository import ChatRepository
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.resume_repository import ResumeRepository
from app.repositories.session_repository import SessionRepository
from app.services.session_service import SessionService
from app.services.upload_validation import ValidatedUpload
from tests.fakes import FakeClock, FakeParserClient, SequentialIdGenerator, make_raw_result
from tests.helpers import make_pdf_bytes

BROWSER_A = "A" * 43
BROWSER_B = "B" * 43


@dataclass
class SessionEnv:
    service: SessionService
    sessions: SessionRepository
    chats: ChatRepository
    resumes: ResumeRepository
    files: DraftFileStore
    archive: ArchiveFileStore
    parser: FakeParserClient
    clock: FakeClock
    ids: SequentialIdGenerator
    data_dir: Path
    file_dir: Path

    def query(self, sql: str, db: str = "drafts.db") -> list:
        conn = connect(self.data_dir / db)
        try:
            return [tuple(r) for r in conn.execute(sql).fetchall()]
        finally:
            conn.close()

    def session_files(self) -> set[str]:
        return {p.name for p in (self.data_dir / "drafts").iterdir()}


@pytest.fixture
def session_env(data_dir: Path, file_dir: Path) -> SessionEnv:
    init_drafts_db(data_dir / "drafts.db")
    init_resumes_db(data_dir / "resumes.db")
    sessions = SessionRepository(data_dir / "drafts.db")
    chats = ChatRepository(data_dir / "drafts.db")
    resumes = ResumeRepository(data_dir / "resumes.db")
    files = DraftFileStore(data_dir)
    archive = ArchiveFileStore(file_dir)
    parser = FakeParserClient(result=make_raw_result())
    clock, ids = FakeClock(), SequentialIdGenerator()
    service = SessionService(
        sessions, chats, files, parser, resumes, archive.is_available, clock, ids
    )
    return SessionEnv(
        service, sessions, chats, resumes, files, archive, parser, clock, ids, data_dir, file_dir
    )


def make_upload(name: str = "synthetic.pdf") -> ValidatedUpload:
    return ValidatedUpload(make_pdf_bytes(300), "application/pdf", name)
