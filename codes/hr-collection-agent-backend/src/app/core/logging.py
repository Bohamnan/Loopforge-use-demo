"""Structured JSON logging with a field whitelist (B-03)."""

import json
import logging
import sys
import traceback
from contextvars import ContextVar

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Only these fields may be logged. User content, filenames and tokens are never allowed.
ALLOWED_FIELDS = frozenset(
    {"draft_id", "resume_id", "status_code", "duration_ms", "code", "exception_class", "count"}
)
_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}
_logger = logging.getLogger("app")


def configure_logging(level: int = logging.INFO) -> None:
    """Attach a plain stdout handler once; messages are already JSON."""
    _logger.setLevel(level)
    if not any(getattr(h, "_app_handler", False) for h in _logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        handler._app_handler = True  # type: ignore[attr-defined]
        _logger.addHandler(handler)


def _safe_stack(exc: BaseException) -> str:
    """Return frames only (file, line, function); never the exception message."""
    frames = traceback.extract_tb(exc.__traceback__)
    return " <- ".join(f"{f.filename}:{f.lineno} in {f.name}" for f in reversed(frames))


def log_event(
    event: str,
    *,
    level: str = "info",
    exc: BaseException | None = None,
    **fields: str | int | float | None,
) -> None:
    """Log one JSON line. Only whitelisted scalar fields are accepted."""
    payload: dict[str, object] = {"event": event, "request_id": request_id_var.get()}
    for key, value in fields.items():
        if key not in ALLOWED_FIELDS:
            raise ValueError(f"log field not allowed: {key}")
        if value is not None and not isinstance(value, str | int | float):
            raise ValueError(f"log field must be a scalar: {key}")
        payload[key] = value
    if exc is not None:
        payload["exception_class"] = type(exc).__name__
        payload["stack"] = _safe_stack(exc)
    _logger.log(_LEVELS[level], json.dumps(payload, ensure_ascii=False))
