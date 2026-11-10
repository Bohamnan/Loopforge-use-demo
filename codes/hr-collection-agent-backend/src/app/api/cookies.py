"""The only place that builds the ``draft_token`` cookie, so attributes never drift."""

from fastapi import Response

from app.core.config import Settings

COOKIE_NAME = "draft_token"


def _header(value: str, max_age: int, settings: Settings) -> str:
    parts = [f"{COOKIE_NAME}={value}", "HttpOnly", "SameSite=Lax", "Path=/", f"Max-Age={max_age}"]
    if settings.cookie_secure:
        parts.append("Secure")
    return "; ".join(parts)


def set_token(response: Response, token: str, settings: Settings) -> None:
    """Issue the draft token (sliding window equals the draft TTL)."""
    max_age = settings.draft_ttl_days * 86400
    response.headers.append("set-cookie", _header(token, max_age, settings))


def renew(response: Response, token: str, settings: Settings) -> None:
    """Renew the same token; identical attributes are required so browsers overwrite it."""
    set_token(response, token, settings)


def clear(response: Response, settings: Settings) -> None:
    """Expire the token immediately."""
    response.headers.append("set-cookie", _header("", 0, settings))
