"""Identifier and draft-token helpers."""

import hashlib
import secrets
import uuid
from typing import Protocol


class IdGenerator(Protocol):
    """Source of new record identifiers."""

    def new_id(self) -> str:
        """Return a new unique identifier."""
        ...


class UuidGenerator:
    """Generates random UUID v4 strings."""

    def new_id(self) -> str:
        return str(uuid.uuid4())


def generate_token() -> str:
    """Return a URL-safe random draft token (256 bits of entropy)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Return the SHA-256 hex digest stored instead of the token itself."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
