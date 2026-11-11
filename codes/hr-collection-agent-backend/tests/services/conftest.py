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


# ---- confirm-save environment (ResumeService) ------------------------------------------------

from app.services.reconcile_service import ReconcileReport, ReconcileService  # noqa: E402
from app.services.resume_service import ResumeService  # noqa: E402
from tests.services.fault_injection import (  # noqa: E402
    FaultInjector,
    FaultyArchiveStoreRemove,
    FaultyDraftFileStore,
    FaultyResumeRepository,
    FaultySessionRepository,
)


@dataclass
class ResumeEnv:
    """SessionService (to create sessions) + ResumeService wired with fault-injectable doubles."""

    service: ResumeService
    sessions_service: SessionService
    session_repo: FaultySessionRepository
    draft_files: FaultyDraftFileStore
    resume_repo: FaultyResumeRepository
    archive: FaultyArchiveStoreRemove
    injector: FaultInjector
    parser: FakeParserClient
    clock: FakeClock
    ids: SequentialIdGenerator
    data_dir: Path
    file_dir: Path
    browser: str = BROWSER_A

    def new_session(
        self,
        name: str = "ZZ ZHANG SAN",
        phone: str = "13800138000",
        email: str = "ZS@EXAMPLE.COM",
        browser: str | None = None,
        upload: ValidatedUpload | None = None,
        **overrides: object,
    ) -> str:
        """Create a session through the real upload path; returns its id."""

        def node(value: object) -> dict:
            return {"value": value, "status": "recognized"}

        self.parser.result = make_raw_result(
            name=node(name), phone=node(phone), email=node(email), **overrides
        )
        created = self.sessions_service.create(upload or make_upload(), browser or self.browser)
        return created.detail.session_id

    def pending_candidate(self, upload: ValidatedUpload | None = None, **overrides: object):  # noqa: ANN201
        """Save a person first, then upload the same person again: returns (session id, saved)."""
        saved = self.confirm(
            self.new_session(job_title={"value": "OLD JOB", "status": "recognized"})
        )
        sid = self.new_session(
            upload=upload, job_title={"value": "NEW JOB", "status": "recognized"}, **overrides
        )
        assert self.confirm(sid).already_saved is True
        return sid, saved

    def confirm(self, session_id: str, confirmed: bool | None = True, browser: str | None = None):  # noqa: ANN201
        return self.service.confirm(session_id, browser or self.browser, confirmed)

    def build_service(self) -> ResumeService:
        """A second service over the same stores (used by concurrent requests)."""
        return ResumeService(
            self.session_repo, self.draft_files, self.resume_repo, self.archive,
            self.clock, self.ids,
        )  # fmt: skip

    def query(self, sql: str, db: str = "resumes.db") -> list:
        conn = connect(self.data_dir / db)
        try:
            return [tuple(r) for r in conn.execute(sql).fetchall()]
        finally:
            conn.close()

    def count(self, table: str = "resumes", db: str = "resumes.db") -> int:
        return self.query(f"SELECT count(*) FROM {table}", db)[0][0]  # noqa: S608

    def reconcile(self) -> ReconcileReport:
        """Run the start-up reconciliation over the same stores."""
        return ReconcileService(self.resume_repo, self.archive, self.clock).run()

    def archive_names(self) -> list[str]:
        return sorted(p.name for p in self.file_dir.iterdir())

    def session_rows(self) -> list:
        return self.query(
            "SELECT id, status, update_state, resume_id, file_path FROM sessions", "drafts.db"
        )

    def draft_file_names(self) -> list[str]:
        return sorted(p.name for p in (self.data_dir / "drafts").iterdir())


@pytest.fixture
def resume_env(data_dir: Path, file_dir: Path) -> ResumeEnv:
    init_drafts_db(data_dir / "drafts.db")
    init_resumes_db(data_dir / "resumes.db")
    injector = FaultInjector()
    session_repo = FaultySessionRepository(data_dir / "drafts.db", injector)
    draft_files = FaultyDraftFileStore(data_dir, injector)
    resume_repo = FaultyResumeRepository(data_dir / "resumes.db", injector)
    archive = FaultyArchiveStoreRemove(file_dir, injector)
    parser = FakeParserClient(result=make_raw_result())
    clock, ids = FakeClock(), SequentialIdGenerator()
    sessions_service = SessionService(
        session_repo, ChatRepository(data_dir / "drafts.db"), draft_files, parser,
        resume_repo, archive.is_available, clock, ids,
    )  # fmt: skip
    service = ResumeService(session_repo, draft_files, resume_repo, archive, clock, ids)
    return ResumeEnv(
        service, sessions_service, session_repo, draft_files, resume_repo, archive, injector,
        parser, clock, ids, data_dir, file_dir,
    )  # fmt: skip
