"""Dependency providers: settings, browser identifier and client wiring (no global state)."""

import re
import threading

from fastapi import Cookie, Request

from app.api.cookies import COOKIE_NAME
from app.clients.deepseek_client import DeepSeekClient
from app.clients.resume_chat_client import ResumeChatClient
from app.clients.resume_parser_client import ResumeParserClient
from app.core.config import Settings
from app.repositories.archive_file_store import ArchiveFileStore
from app.repositories.chat_repository import ChatRepository
from app.repositories.draft_file_store import DraftFileStore
from app.repositories.resume_repository import ResumeRepository
from app.repositories.session_repository import SessionRepository
from app.services.archive_query_service import ArchiveQueryService
from app.services.chat_service import ChatService
from app.services.resume_service import ResumeService
from app.services.session_service import SessionService

_PARSER_LOCK = threading.Lock()


def get_settings(request: Request) -> Settings:
    """Settings stored on the application at creation time."""
    return request.app.state.settings


_BROWSER_ID_RE = re.compile(r"[A-Za-z0-9_-]{43}")  # shape of secrets.token_urlsafe(32)


def get_browser_id(
    browser_id: str | None = Cookie(default=None, alias=COOKIE_NAME),
) -> str | None:
    """Raw browser identifier from the cookie; ``None`` when absent or malformed.

    A malformed value is treated as "no identifier" so a client cannot pick a weak one. Hashing
    happens once at the service entry; lower layers only see the hash.
    """
    if browser_id is not None and _BROWSER_ID_RE.fullmatch(browser_id):
        return browser_id
    return None


def get_session_service(request: Request) -> SessionService:
    """Per-request wiring over the application's settings, clock and id source."""
    state = request.app.state
    data_dir = state.settings.data_dir
    archive = ArchiveFileStore(state.settings.file_dir)
    return SessionService(
        SessionRepository(data_dir / "drafts.db"),
        ChatRepository(data_dir / "drafts.db"),
        DraftFileStore(data_dir),
        get_parser(request),
        ResumeRepository(data_dir / "resumes.db"),
        archive.is_available,
        state.clock,
        state.ids,
    )


def get_resume_service(request: Request) -> ResumeService:
    """The only service that writes the formal database (B-04)."""
    state = request.app.state
    data_dir = state.settings.data_dir
    return ResumeService(
        SessionRepository(data_dir / "drafts.db"),
        DraftFileStore(data_dir),
        ResumeRepository(data_dir / "resumes.db"),
        ArchiveFileStore(state.settings.file_dir),
        state.clock,
        state.ids,
    )


def get_archive_query_service(request: Request) -> ArchiveQueryService:
    """Read-only archive access: the reader view of the resumes store and the file store."""
    state = request.app.state
    return ArchiveQueryService(
        ResumeRepository(state.settings.data_dir / "resumes.db"),
        ArchiveFileStore(state.settings.file_dir),
    )


def _deepseek(request: Request) -> DeepSeekClient:
    """The one real model client (parse and chat share it); created lazily so the app starts
    without a key."""
    state = request.app.state
    if state.deepseek is None:
        with _PARSER_LOCK:
            if state.deepseek is None:
                state.deepseek = DeepSeekClient(state.settings)
    return state.deepseek


def get_parser(request: Request) -> ResumeParserClient:
    """The parse client: an injected fake in tests, otherwise the shared DeepSeek client."""
    return request.app.state.parser_client or _deepseek(request)


def get_chat_client(request: Request) -> ResumeChatClient:
    """The chat client: an injected fake in tests, otherwise the shared DeepSeek client."""
    return request.app.state.chat_client or _deepseek(request)


def get_chat_service(request: Request) -> ChatService:
    """Chat wiring: no resume writer, archive store or ResumeService (B-04)."""
    state = request.app.state
    db = state.settings.data_dir / "drafts.db"
    return ChatService(
        SessionRepository(db), ChatRepository(db), get_chat_client(request), state.clock, state.ids
    )
