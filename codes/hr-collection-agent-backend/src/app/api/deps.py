"""Dependency providers: settings, cookie token and service wiring (no global state)."""

import threading

from fastapi import Cookie, Depends, Request

from app.api.cookies import COOKIE_NAME
from app.clients.deepseek_client import DeepSeekClient
from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock
from app.core.config import Settings
from app.core.ids import IdGenerator
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.draft_repository import DraftRepository
from app.repositories.resume_repository import ResumeRepository
from app.services.draft_service import DraftService
from app.services.resume_service import ResumeService

_PARSER_LOCK = threading.Lock()


def get_settings(request: Request) -> Settings:
    """Settings stored on the application at creation time."""
    return request.app.state.settings


def get_draft_token(
    draft_token: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> str | None:
    """Raw draft token from the cookie; ``None`` when absent or empty.

    Services raise ``DraftNotFoundError`` for a missing token (single exit point).
    """
    return draft_token or None


def get_parser(request: Request) -> ResumeParserClient:
    """The model client. The real client is created lazily, so the app starts without a key."""
    state = request.app.state
    if state.parser_client is None:
        with _PARSER_LOCK:
            if state.parser_client is None:
                state.parser_client = DeepSeekClient(state.settings)
    return state.parser_client


def get_draft_service(
    request: Request,
    settings: Settings = Depends(get_settings),
    parser: ResumeParserClient = Depends(get_parser),
) -> DraftService:
    """Per-request service; the stores are cheap, state lives in files and SQLite."""
    clock: Clock = request.app.state.clock
    ids: IdGenerator = request.app.state.ids
    return DraftService(
        repo=DraftRepository(settings.data_dir / "drafts.db"),
        files=DraftFileStore(settings.data_dir),
        parser=parser,
        clock=clock,
        ids=ids,
        ttl_days=settings.draft_ttl_days,
    )


def get_resume_service(
    request: Request, settings: Settings = Depends(get_settings)
) -> ResumeService:
    """Per-request service for confirm-save; the only wiring of the formal database."""
    return ResumeService(
        drafts=DraftRepository(settings.data_dir / "drafts.db"),
        draft_files=DraftFileStore(settings.data_dir),
        resumes=ResumeRepository(settings.data_dir / "resumes.db"),
        archive=ArchiveFileStore(settings.file_dir),
        clock=request.app.state.clock,
        ids=request.app.state.ids,
        ttl_days=settings.draft_ttl_days,
    )
