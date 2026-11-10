"""Structured JSON logging with a field whitelist (B-03)."""

import json
import logging
import sys
import traceback
from contextvars import ContextVar
from pathlib import Path

request_id_var: ContextVar[str | None] = ContextVar("request_id", default=None)

# Only these fields may be logged. User content, filenames and tokens are never allowed.
ALLOWED_FIELDS = frozenset(
    {
        "draft_id",
        "resume_id",
        "status_code",
        "duration_ms",
        "code",
        "exception_class",
        "count",
        "prompt_tokens",
        "completion_tokens",
    }
)
_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}
_logger = logging.getLogger("app")

MAX_STACK_FRAMES = 12
MAX_STACK_CHARS = 2000
_PROJECT_ROOT = Path(__file__).resolve().parents[3]  # codes/hr-collection-agent-backend


def configure_logging(level: int = logging.INFO) -> None:
    """Attach a plain stdout handler once; messages are already JSON."""
    _logger.setLevel(level)
    # Third-party HTTP loggers can print request details at low levels; keep them quiet.
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.WARNING)
    if not any(getattr(h, "_app_handler", False) for h in _logger.handlers):
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        handler._app_handler = True  # type: ignore[attr-defined]
        _logger.addHandler(handler)


def _display_path(filename: str) -> str:
    """Project-relative path (``src/app/...``); files outside the project show only the name."""
    try:
        return Path(filename).resolve().relative_to(_PROJECT_ROOT).as_posix()
    except ValueError:
        return Path(filename).name


def _safe_stack(exc: BaseException) -> str:
    """Return innermost frames only (relative file, line, function); never the message.

    Bounded to ``MAX_STACK_FRAMES`` frames and ``MAX_STACK_CHARS`` characters.
    """
    frames = list(reversed(traceback.extract_tb(exc.__traceback__)))[:MAX_STACK_FRAMES]
    text = " <- ".join(f"{_display_path(f.filename)}:{f.lineno} in {f.name}" for f in frames)
    return text[:MAX_STACK_CHARS]


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
