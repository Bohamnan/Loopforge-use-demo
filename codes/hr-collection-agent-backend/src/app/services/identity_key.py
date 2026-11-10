"""Idempotency key normalisation (D-02, O-04); the single implementation point."""

import re
from dataclasses import dataclass

from app.services.field_validation import strip_phone

_WHITESPACE_RE = re.compile(r"\s+")
_MAINLAND_RE = re.compile(r"^1\d{10}$")


def name_key(name: str) -> str:
    """Trim, then collapse internal whitespace runs to a single space."""
    return _WHITESPACE_RE.sub(" ", name.strip())


def phone_key(phone: str) -> str:
    """Strip spaces/hyphens; drop ``+86``/``86`` only when exactly a mainland number follows."""
    text = strip_phone(phone)
    for prefix in ("+86", "86"):
        if text.startswith(prefix) and _MAINLAND_RE.match(text[len(prefix) :]):
            return text[len(prefix) :]
    return text


def email_key(email: str) -> str:
    """Trim and lowercase."""
    return email.strip().lower()


@dataclass(frozen=True)
class Identity:
    """Display values (edge-trimmed) and the normalised idempotency keys."""

    name: str
    phone: str
    email: str
    name_key: str
    phone_key: str
    email_key: str


def build_identity(name: str, phone: str, email: str) -> Identity:
    """Build the identity from already validated name, phone and email."""
    return Identity(
        name=name.strip(),
        phone=phone.strip(),
        email=email.strip(),
        name_key=name_key(name),
        phone_key=phone_key(phone),
        email_key=email_key(email),
    )
