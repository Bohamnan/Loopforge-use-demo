"""The only place that builds the ``browser_id`` cookie, so attributes never drift."""

from fastapi import Response

from app.core.config import Settings

COOKIE_NAME = "browser_id"
COOKIE_MAX_AGE_SECONDS = 400 * 86400  # 34560000, the longest lifetime browsers allow


def issue(response: Response, browser_id: str, settings: Settings) -> None:
    """Issue or renew the browser identifier; same attributes so browsers overwrite the old one.

    Only call this on 2xx responses. There is deliberately no ``clear``: saving a resume must
    not make the other sessions of this browser unreachable.
    """
    parts = [
        f"{COOKIE_NAME}={browser_id}", "HttpOnly", "SameSite=Lax", "Path=/",
        f"Max-Age={COOKIE_MAX_AGE_SECONDS}",
    ]  # fmt: skip
    if settings.cookie_secure:
        parts.append("Secure")
    response.headers.append("set-cookie", "; ".join(parts))


renew = issue
