import base64
import json
import logging
from collections.abc import Callable

import httpx
import pytest
from pydantic import SecretStr

from app.clients.deepseek_client import DeepSeekClient
from app.clients.prompts import SYSTEM_PROMPT
from app.core.config import Settings
from app.core.errors import (
    ParseFailedError,
    ParseTimeoutError,
    ParseUnavailableError,
)
from app.schemas.parse import RawParseResult
from tests import synthetic as syn
from tests.helpers import make_jpeg_bytes

KEY = "synthetic-key-ZZ9"
SENTINEL = "ZZSENTINELRESUMETEXT"  # stands for resume content; must never be logged
GOOD_FIELDS = {"name": {"value": "ZHANG SAN", "status": "recognized"}}


def chat_response(
    content: object = None, usage: dict | None = None, status: int = 200
) -> httpx.Response:
    body = {
        "choices": [
            {"message": {"content": json.dumps(content or GOOD_FIELDS)}, "finish_reason": "stop"}
        ],
        "usage": usage if usage is not None else {"prompt_tokens": 1200, "completion_tokens": 300},
    }
    return httpx.Response(status, json=body)


class Recorder:
    def __init__(self, responder: Callable[[httpx.Request], httpx.Response]) -> None:
        self.responder = responder
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.responder(request)

    @property
    def body(self) -> dict:
        return json.loads(self.requests[-1].content)


def make_client(
    responder: Callable[[httpx.Request], httpx.Response] | None = None,
    key: str | None = KEY,
    **settings_kw: object,
) -> tuple[DeepSeekClient, Recorder]:
    rec = Recorder(responder or (lambda r: chat_response()))
    settings = Settings(
        _env_file=None,
        deepseek_api_key=SecretStr(key) if key else None,
        deepseek_base_url="https://model.example.test",
        **settings_kw,
    )
    return DeepSeekClient(settings, transport=httpx.MockTransport(rec)), rec


def user_blocks(rec: Recorder) -> list[dict]:
    return rec.body["messages"][1]["content"]


# ---- request shape -----------------------------------------------------------------


def test_png_request_shape_and_result() -> None:
    client, rec = make_client()
    png = syn.build_png(syn.RESUME_LINES)
    result = client.parse(png, "image/png")
    assert isinstance(result, RawParseResult)
    assert result.data == GOOD_FIELDS
    assert (result.prompt_tokens, result.completion_tokens) == (1200, 300)

    req = rec.requests[0]
    assert req.method == "POST" and str(req.url) == "https://model.example.test/chat/completions"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    body = rec.body
    assert body["model"] == "deepseek-flash" and body["stream"] is False
    assert body["response_format"] == {"type": "json_object"}
    assert body["messages"][0] == {"role": "system", "content": SYSTEM_PROMPT}
    blocks = user_blocks(rec)
    image = next(b for b in blocks if b["type"] == "image_url")
    assert image["image_url"]["url"] == "data:image/png;base64," + base64.b64encode(png).decode()
    assert blocks[-1]["type"] == "text"


def test_jpeg_uses_jpeg_data_uri() -> None:
    client, rec = make_client()
    client.parse(make_jpeg_bytes(), "image/jpeg")
    (image,) = [b for b in user_blocks(rec) if b["type"] == "image_url"]
    assert image["image_url"]["url"].startswith("data:image/jpeg;base64,")


def test_text_layer_pdf_is_sent_as_text_blocks_only() -> None:
    client, rec = make_client()
    client.parse(syn.build_text_pdf([syn.RESUME_LINES]), "application/pdf")
    blocks = user_blocks(rec)
    assert {b["type"] for b in blocks} == {"text"}
    joined = "\n".join(b["text"] for b in blocks)
    assert "ZHANG SAN" in joined and "Page 1" in joined


def test_scanned_pdf_is_sent_as_rendered_png() -> None:
    client, rec = make_client()
    client.parse(syn.build_scan_pdf(syn.RESUME_LINES), "application/pdf")
    (image,) = [b for b in user_blocks(rec) if b["type"] == "image_url"]
    url = image["image_url"]["url"]
    assert url.startswith("data:image/png;base64,")
    assert base64.b64decode(url.split(",", 1)[1])[:8] == b"\x89PNG\r\n\x1a\n"


def test_pdf_pages_are_limited_to_five() -> None:
    client, rec = make_client()
    client.parse(syn.build_text_pdf([syn.RESUME_LINES] * 8), "application/pdf")
    labels = [b["text"] for b in user_blocks(rec) if b["text"].startswith("[Page")]
    assert len(labels) == 5


def test_unreadable_pdf_fails_without_calling_the_model() -> None:
    client, rec = make_client()
    with pytest.raises(ParseFailedError):
        client.parse(b"%PDF-1.4\ngarbage", "application/pdf")
    assert rec.requests == []


def test_unsupported_content_type_is_a_programming_error() -> None:
    client, rec = make_client()
    with pytest.raises(ValueError, match="content type"):
        client.parse(b"x", "text/plain")
    assert rec.requests == []


def test_all_requests_go_to_the_configured_host_only() -> None:
    client, rec = make_client()
    client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert {r.url.host for r in rec.requests} == {"model.example.test"}


# ---- timeouts / retries ---------------------------------------------------------------


def test_timeout_configuration() -> None:
    client, _ = make_client()
    assert client.timeout == httpx.Timeout(connect=5, write=30, read=60, pool=5)
    client, _ = make_client(model_timeout_seconds=42)
    assert client.timeout.read == 42


# ---- failure mapping (design 7.2) -----------------------------------------------------


@pytest.mark.parametrize("status", [401, 402, 403, 404, 429, 500, 502, 503, 504])
def test_unavailable_statuses(status: int) -> None:
    client, rec = make_client(
        lambda r: httpx.Response(status, json={"error": {"message": SENTINEL}})
    )
    with pytest.raises(ParseUnavailableError) as ei:
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert SENTINEL not in ei.value.message
    assert len(rec.requests) == 1  # never retried


@pytest.mark.parametrize("status", [400, 413, 422, 409])
def test_other_4xx_is_parse_failed(status: int) -> None:
    client, rec = make_client(lambda r: httpx.Response(status, json={"error": {"message": "x"}}))
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert len(rec.requests) == 1


@pytest.mark.parametrize(
    "exc",
    [
        httpx.ReadTimeout("t"),
        httpx.ConnectTimeout("t"),
        httpx.WriteTimeout("t"),
        httpx.PoolTimeout("t"),
    ],
)
def test_timeouts_map_to_parse_timeout(exc: Exception) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise exc

    client, rec = make_client(boom)
    with pytest.raises(ParseTimeoutError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert len(rec.requests) == 1  # no retry


@pytest.mark.parametrize(
    "exc", [httpx.ConnectError("c"), httpx.ReadError("r"), httpx.RemoteProtocolError("p")]
)
def test_transport_errors_map_to_unavailable(exc: Exception) -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise exc

    client, _ = make_client(boom)
    with pytest.raises(ParseUnavailableError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")


def test_missing_api_key_is_unavailable_and_sends_nothing() -> None:
    client, rec = make_client(key=None)
    with pytest.raises(ParseUnavailableError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert rec.requests == []


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, content=b""),
        httpx.Response(200, content=b"not json"),
        httpx.Response(200, json=[]),
        httpx.Response(200, json={}),
        httpx.Response(200, json={"choices": []}),
        httpx.Response(200, json={"choices": [{"message": {}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": ""}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": "no json here"}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": "[1, 2]"}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": "123"}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": '{"a": '}}]}),
    ],
)
def test_unparsable_success_bodies_are_parse_failed(response: httpx.Response) -> None:
    client, _ = make_client(lambda r: response)
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")


def test_markdown_fenced_json_is_accepted() -> None:
    fenced = "```json\n" + json.dumps(GOOD_FIELDS) + "\n```"
    resp = httpx.Response(200, json={"choices": [{"message": {"content": fenced}}]})
    client, _ = make_client(lambda r: resp)
    result = client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert result.data == GOOD_FIELDS
    assert result.prompt_tokens is None  # no usage reported


def test_invalid_usage_values_are_ignored() -> None:
    client, _ = make_client(
        lambda r: chat_response(usage={"prompt_tokens": "x", "completion_tokens": None})
    )
    result = client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert result.prompt_tokens is None and result.completion_tokens is None


def test_errors_keep_the_cause_for_debugging() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("t")

    client, _ = make_client(boom)
    with pytest.raises(ParseTimeoutError) as ei:
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert isinstance(ei.value.__cause__, httpx.ReadTimeout)


# ---- B-03: nothing sensitive in logs ------------------------------------------------------


def _logs(caplog: pytest.LogCaptureFixture) -> str:
    return "\n".join(r.getMessage() for r in caplog.records)


def test_success_is_logged_with_numbers_only(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    content = {"name": {"value": SENTINEL, "status": "recognized"}}
    client, _ = make_client(lambda r: chat_response(content))
    client.parse(syn.build_text_pdf([[SENTINEL * 8]]), "application/pdf")
    text = _logs(caplog)
    event = json.loads(
        next(r.getMessage() for r in caplog.records if "model_call" in r.getMessage())
    )
    assert event["status_code"] == 200 and isinstance(event["duration_ms"], int)
    assert event["prompt_tokens"] == 1200 and event["completion_tokens"] == 300
    for secret in (SENTINEL, KEY, "base64", "Bearer", "image_url"):
        assert secret not in text


@pytest.mark.parametrize("status", [401, 400, 500])
def test_failures_never_log_bodies_or_keys(caplog: pytest.LogCaptureFixture, status: int) -> None:
    caplog.set_level(logging.DEBUG)
    client, _ = make_client(
        lambda r: httpx.Response(status, json={"error": {"message": SENTINEL + KEY}})
    )
    with pytest.raises((ParseFailedError, ParseUnavailableError)):
        client.parse(syn.build_text_pdf([[SENTINEL * 8]]), "application/pdf")
    text = _logs(caplog)
    assert SENTINEL not in text and KEY not in text
    assert f'"status_code": {status}' in text


def test_timeout_is_logged_without_details(caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)

    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout(SENTINEL)

    client, _ = make_client(boom)
    with pytest.raises(ParseTimeoutError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    text = _logs(caplog)
    assert "parse_timeout" in text and SENTINEL not in text


def test_close_releases_the_http_client() -> None:
    client, _ = make_client()
    client.close()
    with pytest.raises(RuntimeError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
