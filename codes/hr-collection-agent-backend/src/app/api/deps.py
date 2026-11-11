"""Dependency providers: settings, browser identifier and client wiring (no global state)."""

import re
import threading

from fastapi import Cookie, Request

from app.api.cookies import COOKIE_NAME
from app.clients.deepseek_client import DeepSeekClient
from app.clients.resume_parser_client import ResumeParserClient
from app.core.config import Settings

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


def get_parser(request: Request) -> ResumeParserClient:
    """The model client. The real client is created lazily, so the app starts without a key."""
    state = request.app.state
    if state.parser_client is None:
        with _PARSER_LOCK:
            if state.parser_client is None:
                state.parser_client = DeepSeekClient(state.settings)
    return state.parser_client
