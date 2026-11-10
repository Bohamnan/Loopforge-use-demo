"""Fixtures that wire a DraftService against temporary SQLite files and directories."""

from dataclasses import dataclass
from pathlib import Path

import pytest

from app.core.db import connect, init_drafts_db
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRepository
from app.services.draft_service import DraftService
from app.services.upload_validation import ValidatedUpload
from tests.fakes import FakeClock, FakeParserClient, SequentialIdGenerator, make_raw_result
from tests.helpers import make_pdf_bytes


@dataclass
class DraftEnv:
    service: DraftService
    repo: DraftRepository
    files: DraftFileStore
    parser: FakeParserClient
    clock: FakeClock
    ids: SequentialIdGenerator
    data_dir: Path

    def draft_rows(self) -> list:
        return connect(self.data_dir / "drafts.db").execute("SELECT * FROM drafts").fetchall()

    def draft_files(self) -> set[str]:
        return {p.name for p in (self.data_dir / "drafts").iterdir()}


@pytest.fixture
def draft_env(data_dir: Path) -> DraftEnv:
    init_drafts_db(data_dir / "drafts.db")
    repo = DraftRepository(data_dir / "drafts.db")
    files = DraftFileStore(data_dir)
    parser = FakeParserClient(result=make_raw_result())
    clock, ids = FakeClock(), SequentialIdGenerator()
    service = DraftService(repo, files, parser, clock, ids, ttl_days=7)
    return DraftEnv(service, repo, files, parser, clock, ids, data_dir)


def make_upload(name: str = "synthetic.pdf") -> ValidatedUpload:
    return ValidatedUpload(make_pdf_bytes(300), "application/pdf", name)


# ---- confirm-save environment (ResumeService) ------------------------------------------------

from app.core.db import init_resumes_db  # noqa: E402
from app.services.resume_service import ResumeService  # noqa: E402
from tests.services.fault_injection import (  # noqa: E402
    FaultInjector,
    FaultyArchiveStore,
    FaultyDraftFileStore,
    FaultyDraftRepository,
    FaultyResumeRepository,
)


@dataclass
class ResumeEnv:
    """DraftService (to create drafts) + ResumeService wired with fault-injectable doubles."""

    service: ResumeService
    drafts: DraftService
    draft_repo: FaultyDraftRepository
    draft_files: FaultyDraftFileStore
    resume_repo: FaultyResumeRepository
    archive: FaultyArchiveStore
    injector: FaultInjector
    parser: FakeParserClient
    clock: FakeClock
    ids: SequentialIdGenerator
    data_dir: Path
    file_dir: Path

    def new_draft(
        self,
        name: str = "ZZ ZHANG SAN",
        phone: str = "13800138000",
        email: str = "ZS@EXAMPLE.COM",
        **overrides: object,
    ) -> str:
        """Create a draft through the real upload path; returns the raw draft token."""

        def node(value: object) -> dict:
            return {"value": value, "status": "recognized"}

        self.parser.result = make_raw_result(
            name=node(name), phone=node(phone), email=node(email), **overrides
        )
        return self.drafts.create(make_upload(), None).token

    def build_service(self) -> ResumeService:
        """A second service over the same stores (used by concurrent requests)."""
        return ResumeService(
            self.draft_repo, self.draft_files, self.resume_repo, self.archive,
            self.clock, self.ids, ttl_days=7,
        )  # fmt: skip

    def query(self, sql: str, db: str = "resumes.db") -> list:
        conn = connect(self.data_dir / db)
        try:
            return [tuple(r) for r in conn.execute(sql).fetchall()]
        finally:
            conn.close()

    def count(self, table: str = "resumes", db: str = "resumes.db") -> int:
        return self.query(f"SELECT count(*) FROM {table}", db)[0][0]  # noqa: S608

    def archive_names(self) -> list[str]:
        return sorted(p.name for p in self.file_dir.iterdir())

    def draft_rows(self) -> list:
        return self.query("SELECT id FROM drafts", "drafts.db")

    def draft_file_names(self) -> list[str]:
        return sorted(p.name for p in (self.data_dir / "drafts").iterdir())


@pytest.fixture
def resume_env(data_dir: Path, file_dir: Path) -> ResumeEnv:
    init_drafts_db(data_dir / "drafts.db")
    init_resumes_db(data_dir / "resumes.db")
    injector = FaultInjector()
    draft_repo = FaultyDraftRepository(data_dir / "drafts.db", injector)
    draft_files = FaultyDraftFileStore(data_dir, injector)
    resume_repo = FaultyResumeRepository(data_dir / "resumes.db", injector)
    archive = FaultyArchiveStore(file_dir, injector)
    parser = FakeParserClient(result=make_raw_result())
    clock, ids = FakeClock(), SequentialIdGenerator()
    drafts = DraftService(draft_repo, draft_files, parser, clock, ids, ttl_days=7)
    service = ResumeService(draft_repo, draft_files, resume_repo, archive, clock, ids, ttl_days=7)
    return ResumeEnv(
        service, drafts, draft_repo, draft_files, resume_repo, archive, injector,
        parser, clock, ids, data_dir, file_dir,
    )  # fmt: skip
