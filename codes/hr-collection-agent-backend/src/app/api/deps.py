"""Dependency providers. Later slices add repository and service wiring here."""

from fastapi import Cookie, Request

from app.api.cookies import COOKIE_NAME
from app.core.config import Settings


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
