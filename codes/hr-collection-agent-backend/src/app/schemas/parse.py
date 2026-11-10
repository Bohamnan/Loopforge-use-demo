"""Intermediate parse result returned by the model client."""

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RawParseResult:
    """Untrusted dictionary parsed from the model output; normalised by ParseNormalizer."""

    data: dict[str, Any]
