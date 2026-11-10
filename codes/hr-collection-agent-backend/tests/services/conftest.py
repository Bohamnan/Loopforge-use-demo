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
