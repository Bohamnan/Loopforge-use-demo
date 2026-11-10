"""DeepSeek client: the single outbound path for resume content (B-02, B-06).

Failure mapping follows design 7.2. Request/response bodies, file names and the API key are
never logged (B-03); only status code, duration and token counts are.
"""

import base64
import json
import re
import time
from typing import Any

import httpx

from app.clients.pdf_renderer import ImagePart, render_pdf
from app.clients.prompts import (
    DOC_BEGIN,
    DOC_END,
    SYSTEM_PROMPT,
    USER_INSTRUCTION,
    neutralize_markers,
)
from app.core.config import APPROVED_MODEL, Settings, is_approved_base_url
from app.core.errors import (
    AppError,
    ParseFailedError,
    ParseTimeoutError,
    ParseUnavailableError,
)
from app.core.logging import log_event
from app.schemas.parse import RawParseResult

IMAGE_TYPES = {"image/png", "image/jpeg"}
# 402 = insufficient balance: the service cannot be used, so it is not a problem of the file.
UNAVAILABLE_STATUSES = {401, 402, 403, 404, 429}
_FENCE_RE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
MAX_OUTPUT_TOKENS = 8192


def _data_uri(content: bytes, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(content).decode('ascii')}"


def _image_block(content: bytes, mime: str) -> dict[str, Any]:
    return {"type": "image_url", "image_url": {"url": _data_uri(content, mime)}}


def build_user_blocks(content: bytes, content_type: str) -> list[dict[str, Any]]:
    """Content blocks for the user message. PDFs are converted locally first."""
    blocks: list[dict[str, Any]] = [{"type": "text", "text": DOC_BEGIN}]
    if content_type in IMAGE_TYPES:
        blocks.append(_image_block(content, content_type))
    elif content_type == "application/pdf":
        for part in render_pdf(content).parts:
            if isinstance(part, ImagePart):
                blocks.append({"type": "text", "text": f"[Page {part.page} is an image]"})
                blocks.append(_image_block(part.png, "image/png"))
            else:
                blocks.append(
                    {
                        "type": "text",
                        "text": f"[Page {part.page} text layer]\n{neutralize_markers(part.text)}",
                    }
                )
    else:
        raise ValueError(f"unsupported content type: {content_type}")
    blocks.append({"type": "text", "text": DOC_END})
    blocks.append({"type": "text", "text": USER_INSTRUCTION})
    return blocks


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _parse_content(response: httpx.Response) -> RawParseResult:
    """Extract the JSON object from a 2xx chat completion; anything else is parse_failed."""
    try:
        body = response.json()
        text = body["choices"][0]["message"]["content"]
        fenced = _FENCE_RE.match(text.strip())
        data = json.loads(fenced.group(1) if fenced else text)
    except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
        raise ParseFailedError() from exc
    if not isinstance(data, dict):
        raise ParseFailedError()
    usage = body.get("usage") if isinstance(body, dict) else None
    usage = usage if isinstance(usage, dict) else {}
    return RawParseResult(
        data=data,
        prompt_tokens=_int_or_none(usage.get("prompt_tokens")),
        completion_tokens=_int_or_none(usage.get("completion_tokens")),
    )


class DeepSeekClient:
    """Synchronous client for the approved ``deepseek-flash`` model; never retries."""

    def __init__(self, settings: Settings, transport: httpx.BaseTransport | None = None) -> None:
        # Settings validate these, but model_copy()/model_construct() bypass validation, so the
        # only code path that sends resume data re-checks them (B-02, ADR-001).
        if settings.deepseek_model != APPROVED_MODEL or not is_approved_base_url(
            settings.deepseek_base_url
        ):
            raise ValueError("model or address is not the approved one")
        self._settings = settings
        self.timeout = httpx.Timeout(
            connect=5, write=30, read=settings.model_timeout_seconds, pool=5
        )
        self._http = httpx.Client(
            base_url=settings.deepseek_base_url.rstrip("/"),
            timeout=self.timeout,
            transport=transport,
            trust_env=False,  # never let proxy env vars redirect resume data (B-02)
        )

    def close(self) -> None:
        """Release the underlying connection pool."""
        self._http.close()

    def parse(self, content: bytes, content_type: str) -> RawParseResult:
        key = self._settings.deepseek_api_key
        if key is None:
            log_event("model_call", level="error", code=ParseUnavailableError.code.value)
            raise ParseUnavailableError()
        payload = {
            "model": APPROVED_MODEL,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": build_user_blocks(content, content_type)},
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": MAX_OUTPUT_TOKENS,
            "stream": False,
        }
        started = time.monotonic()
        try:
            response = self._http.post(
                "/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {key.get_secret_value()}"},
            )
        except httpx.TimeoutException as exc:
            self._log(started, error=ParseTimeoutError, exc=exc)
            raise ParseTimeoutError() from exc
        except httpx.TransportError as exc:
            self._log(started, error=ParseUnavailableError, exc=exc)
            raise ParseUnavailableError() from exc

        try:
            result = self._map_response(response)
        except AppError as exc:
            self._log(started, status=response.status_code, error=type(exc))
            raise
        self._log(started, status=response.status_code, result=result)
        return result

    @staticmethod
    def _map_response(response: httpx.Response) -> RawParseResult:
        status = response.status_code
        if status in UNAVAILABLE_STATUSES or status >= 500:
            raise ParseUnavailableError()
        if status >= 300:
            raise ParseFailedError()
        return _parse_content(response)

    @staticmethod
    def _log(
        started: float,
        status: int | None = None,
        error: type[AppError] | None = None,
        exc: BaseException | None = None,
        result: RawParseResult | None = None,
    ) -> None:
        log_event(
            "model_call",
            level="info" if error is None else "warning",
            exc=exc,
            status_code=status,
            duration_ms=int((time.monotonic() - started) * 1000),
            code=error.code.value if error else None,
            prompt_tokens=result.prompt_tokens if result else None,
            completion_tokens=result.completion_tokens if result else None,
        )
