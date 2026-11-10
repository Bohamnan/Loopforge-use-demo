"""Self-test cases for start-up reconciliation, draft cleanup and the model call. Synthetic only."""

import json
import logging
import os
import re
import socket
import time
from pathlib import Path

import httpx
import pytest
from pydantic import SecretStr, ValidationError

from app.clients import image_prep
from app.clients.deepseek_client import DeepSeekClient
from app.core.config import Settings
from app.core.db import init_resumes_db
from app.core.errors import ParseFailedError, ParseTimeoutError, ParseUnavailableError
from app.core.lifecycle import Lifecycle
from app.main import create_app
from app.repositories.resume_repository import ResumeRepository
from tests import synthetic as syn
from tests.fakes import FakeClock, FakeParserClient, make_raw_result
from tests.helpers import make_noise_image_bytes, make_pdf_bytes
from tests.repositories.test_resume_repository import make_resume
from tests.selftest.conftest import CURRENT, PDF, Env, build_env

SRC = Path(__file__).resolve().parents[2] / "src" / "app"
RID_A = "00000000-0000-4000-8000-00000000000a"
RID_B = "00000000-0000-4000-8000-00000000000b"
RID_ORPHAN = "00000000-0000-4000-8000-0000000000f0"


def seed(root: Path, records: list[str], files: list[str]) -> None:
    """Prepare resumes.db with records (file_path = <id>.pdf) and files in file/ before start."""
    (root / "data").mkdir(parents=True, exist_ok=True)
    (root / "file").mkdir(parents=True, exist_ok=True)
    init_resumes_db(root / "data" / "resumes.db")
    repo = ResumeRepository(root / "data" / "resumes.db")
    for n, rid in enumerate(records, start=1):
        repo.create_aggregate(make_resume(n, id=rid, file_path=f"{rid}.pdf"))
    for name in files:
        (root / "file" / name).write_bytes(b"%PDF-1.4 synthetic")


def start(root: Path) -> Env:
    gen = build_env(root)
    environment = next(gen)
    environment._gen = gen  # type: ignore[attr-defined]
    return environment


def stop(environment: Env) -> None:
    environment._gen.close()  # type: ignore[attr-defined]


def names(root: Path) -> list[str]:
    return sorted(p.name for p in (root / "file").iterdir())


# =============================== 005 start-up and reconciliation ==============================


def test_tc_res_005_hp_01(tmp_path: Path) -> None:
    environment = start(tmp_path)
    try:
        assert (tmp_path / "data" / "drafts").is_dir() and (tmp_path / "file").is_dir()
        assert environment.drafts("PRAGMA user_version") == [(1,)]
        assert environment.resumes("PRAGMA user_version") == [(1,)]
        tables = {
            r[0] for r in environment.resumes("SELECT name FROM sqlite_master WHERE type='table'")
        }
        assert {
            "resumes",
            "resume_work_experiences",
            "resume_project_experiences",
            "resume_educations",
        } <= tables
        assert environment.drafts("SELECT name FROM sqlite_master WHERE name='drafts'") == [
            ("drafts",)
        ]
        assert environment.client.get(CURRENT).status_code == 404  # accepts requests after start
    finally:
        stop(environment)


def test_tc_res_005_hp_02(tmp_path: Path) -> None:
    order: list[str] = []
    settings = Settings(_env_file=None, data_dir=tmp_path / "data", file_dir=tmp_path / "file")
    lifecycle = Lifecycle(settings, FakeClock(), interval_seconds=3600)
    for step in (
        "prepare_directories",
        "init_databases",
        "reconcile",
        "cleanup",
        "start_scheduler",
    ):
        original = getattr(lifecycle, step)
        setattr(lifecycle, step, lambda s=step, o=original: (order.append(s), o())[1])
    app = create_app(
        settings, parser_client=FakeParserClient(make_raw_result()), lifecycle=lifecycle
    )
    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        assert order == [
            "prepare_directories",
            "init_databases",
            "reconcile",
            "cleanup",
            "start_scheduler",
        ]
        assert client.get(CURRENT).status_code == 404


def test_tc_res_005_bl_01(tmp_path: Path) -> None:
    seed(tmp_path, [RID_A], [f".{RID_A}.pdf.tmp"])
    environment = start(tmp_path)
    try:
        assert names(tmp_path) == [f"{RID_A}.pdf"]
        assert environment.resumes("SELECT file_path FROM resumes") == [(f"{RID_A}.pdf",)]
    finally:
        stop(environment)


def test_tc_res_005_bl_02(tmp_path: Path) -> None:
    seed(tmp_path, [RID_A], [f"{RID_A}.pdf", f".{RID_ORPHAN}.pdf.tmp"])
    environment = start(tmp_path)
    try:
        assert names(tmp_path) == [f"{RID_A}.pdf"]
        assert environment.resumes() == [(1,)]
    finally:
        stop(environment)


def test_tc_res_005_bl_03(tmp_path: Path) -> None:
    seed(tmp_path, [RID_A], [f"{RID_A}.pdf", f"{RID_ORPHAN}.pdf"])
    environment = start(tmp_path)
    try:
        assert names(tmp_path) == [f"{RID_A}.pdf"]
    finally:
        stop(environment)


def test_tc_res_005_bl_04(tmp_path: Path) -> None:
    seed(tmp_path, [], [f"{RID_ORPHAN}.pdf"])  # database empty: fuse keeps the file
    environment = start(tmp_path)
    try:
        assert names(tmp_path) == [f"{RID_ORPHAN}.pdf"]
        assert environment.resumes() == [(0,)]
    finally:
        stop(environment)


def test_tc_res_005_bl_05(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    seed(tmp_path, [RID_A, RID_B], [f"{RID_B}.pdf"])  # record A has neither final file nor tmp
    environment = start(tmp_path)
    try:
        assert environment.resumes() == [(2,)] and names(tmp_path) == [f"{RID_B}.pdf"]
        assert "reconcile_record_file_missing" in caplog.text and RID_A in caplog.text
        assert environment.client.get(CURRENT).status_code == 404  # service is up
    finally:
        stop(environment)


def test_tc_res_005_bl_06() -> None:
    users = [
        p.relative_to(SRC).as_posix()
        for p in SRC.rglob("*.py")
        if "ReconcileService(" in p.read_text() or "reconcile_service import" in p.read_text()
    ]
    assert users == ["core/lifecycle.py"]


def test_tc_res_005_eh_01(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.DEBUG)

    def boom(self) -> None:  # noqa: ANN001
        raise RuntimeError("reconcile exploded")

    monkeypatch.setattr("app.services.reconcile_service.ReconcileService.run", boom)
    environment = start(tmp_path)
    try:
        assert environment.client.get(CURRENT).status_code == 404
        assert "reconcile_failed" in caplog.text
    finally:
        stop(environment)


def test_tc_res_005_db_01(tmp_path: Path) -> None:
    environment = start(tmp_path)
    try:
        assert environment.resumes() == [(0,)] and environment.drafts() == [(0,)]
        assert names(tmp_path) == [] and environment.draft_dir() == []
    finally:
        stop(environment)


def test_tc_res_005_eh_02(tmp_path: Path) -> None:
    """Both tmp and final exist for one record: left untouched (conflict), never deleted."""
    seed(tmp_path, [RID_A], [f"{RID_A}.pdf", f".{RID_A}.pdf.tmp"])
    environment = start(tmp_path)
    try:
        assert names(tmp_path) == sorted([f"{RID_A}.pdf", f".{RID_A}.pdf.tmp"])
    finally:
        stop(environment)


# =============================== 006 draft cleanup ============================================


def test_tc_res_006_bl_01(env: Env) -> None:
    env.upload()
    env.clock.advance(days=7)
    env.app.state.lifecycle.cleanup()
    assert env.drafts() == [(1,)]  # exactly 7 days idle: kept
    env.clock.advance(seconds=1)
    env.app.state.lifecycle.cleanup()
    assert env.drafts() == [(0,)] and env.draft_dir() == []


def test_tc_res_006_bl_02(env: Env) -> None:
    drafts_dir = env.settings.data_dir / "drafts"
    old, fresh = drafts_dir / "old-orphan.pdf", drafts_dir / "fresh-orphan.pdf"
    old.write_bytes(b"x")
    fresh.write_bytes(b"x")
    now = env.clock.now().timestamp()
    os.utime(old, (now - 2 * 86400, now - 2 * 86400))
    os.utime(fresh, (now - 3600, now - 3600))
    env.app.state.lifecycle.cleanup()
    assert env.draft_dir() == ["fresh-orphan.pdf"]


def test_tc_res_006_bl_03(env: Env) -> None:
    env.upload()
    env.confirm()
    (env.settings.file_dir / f"{RID_ORPHAN}.pdf").write_bytes(b"%PDF-1.4 x")  # even an orphan
    before = env.archive()
    os.utime(env.settings.file_dir / f"{RID_ORPHAN}.pdf", (0, 0))  # ancient mtime
    env.clock.advance(days=400)
    env.app.state.lifecycle.cleanup()
    assert env.archive() == before and env.resumes() == [(1,)]


def test_tc_res_006_bl_04(tmp_path: Path) -> None:
    environment = start(tmp_path)
    environment.upload()
    stop(environment)
    clock_later = FakeClock()
    clock_later.advance(days=9)
    settings = Settings(_env_file=None, data_dir=tmp_path / "data", file_dir=tmp_path / "file")
    from fastapi.testclient import TestClient

    app = create_app(settings, parser_client=FakeParserClient(make_raw_result()), clock=clock_later)
    with TestClient(app):  # start-up runs cleanup once, before the first request
        pass
    after = start(tmp_path)  # fresh instance only to query
    try:
        assert after.drafts() == [(0,)] and after.draft_dir() == []
    finally:
        stop(after)


def test_tc_res_006_bl_05(tmp_path: Path) -> None:
    from fastapi.testclient import TestClient

    settings = Settings(_env_file=None, data_dir=tmp_path / "data", file_dir=tmp_path / "file")
    clock = FakeClock()
    app = create_app(
        settings,
        parser_client=FakeParserClient(make_raw_result()),
        clock=clock,
        lifecycle=Lifecycle(settings, clock, interval_seconds=0.05),
    )
    with TestClient(app) as client:
        client.post("/api/v1/resume-drafts", files={"file": ("a.pdf", PDF, "application/pdf")})
        clock.advance(days=8)
        deadline = time.monotonic() + 5
        env = Env(settings, app, client, FakeParserClient(), clock)
        while time.monotonic() < deadline and env.drafts() != [(0,)]:
            time.sleep(0.05)
        assert env.drafts() == [(0,)]  # the scheduler thread removed it without any request


def test_tc_res_006_eh_01(
    tmp_path: Path, caplog: pytest.LogCaptureFixture, monkeypatch: pytest.MonkeyPatch
) -> None:
    caplog.set_level(logging.DEBUG)
    from fastapi.testclient import TestClient

    settings = Settings(_env_file=None, data_dir=tmp_path / "data", file_dir=tmp_path / "file")
    clock = FakeClock()
    calls = {"n": 0}
    real = "app.services.cleanup_service.CleanupService.run_once"
    from app.services.cleanup_service import CleanupService

    original = CleanupService.run_once

    def flaky(self):  # noqa: ANN001, ANN202
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("cleanup exploded")
        return original(self)

    monkeypatch.setattr(real, flaky)
    app = create_app(
        settings,
        parser_client=FakeParserClient(make_raw_result()),
        clock=clock,
        lifecycle=Lifecycle(settings, clock, interval_seconds=0.05),
    )
    with TestClient(app):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline and calls["n"] < 4:
            time.sleep(0.05)
    assert calls["n"] >= 4 and "cleanup_failed" in caplog.text  # thread survived the failure


# =============================== 007 model call (clients layer) ===============================


KEY = "synthetic-key-ZZ"
OK_BODY = {
    "choices": [
        {"message": {"content": json.dumps({"name": {"value": "ZZ", "status": "recognized"}})}}
    ],
    "usage": {"prompt_tokens": 11, "completion_tokens": 7},
}


def make_client(handler, **settings: object) -> tuple[DeepSeekClient, list[httpx.Request]]:  # noqa: ANN001
    seen: list[httpx.Request] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return handler(request)

    cfg = Settings(_env_file=None, deepseek_api_key=SecretStr(KEY), **settings)
    return DeepSeekClient(cfg, transport=httpx.MockTransport(wrapped)), seen


def ok(_: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json=OK_BODY)


def test_tc_res_007_hp_01() -> None:
    client, seen = make_client(ok)
    result = client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    request = seen[0]
    body = json.loads(request.content)
    assert request.url.host == "api.deepseek.com" and request.url.path.endswith("/chat/completions")
    assert body["model"] == "deepseek-flash" and not body.get("stream", False)
    assert (
        request.headers["authorization"] == f"Bearer {KEY}" and KEY not in request.content.decode()
    )
    kinds = [b["type"] for b in body["messages"][-1]["content"]]
    assert "image_url" in kinds
    uri = next(b for b in body["messages"][-1]["content"] if b["type"] == "image_url")["image_url"][
        "url"
    ]
    assert uri.startswith("data:image/jpeg;base64,")
    assert len(request.content) <= image_prep.MAX_REQUEST_BYTES
    assert result.prompt_tokens == 11 and result.completion_tokens == 7


def test_tc_res_007_hp_02() -> None:
    client, seen = make_client(ok)
    client.parse(syn.build_text_pdf([syn.RESUME_LINES]), "application/pdf")
    content = json.loads(seen[0].content)["messages"][-1]["content"]
    assert not [b for b in content if b["type"] == "image_url"]  # text layer is used, no image
    assert any("text layer" in b.get("text", "") for b in content)


def test_tc_res_007_hp_03() -> None:
    client, seen = make_client(ok)
    client.parse(syn.build_scan_pdf(syn.RESUME_LINES), "application/pdf")  # no text layer -> image
    content = json.loads(seen[0].content)["messages"][-1]["content"]
    assert [b for b in content if b["type"] == "image_url"]


@pytest.mark.parametrize(("seed", "w", "h"), [(1, 3000, 2000), (2, 1200, 1600)])
def test_tc_res_007_bl_01(seed: int, w: int, h: int) -> None:
    client, seen = make_client(ok)
    big = make_noise_image_bytes(w, h, "PNG", seed)
    client.parse(big, "image/png")
    assert len(seen[0].content) <= image_prep.MAX_REQUEST_BYTES == 995_904
    assert len(seen[0].content) < len(big)


def test_tc_res_007_bl_02(monkeypatch: pytest.MonkeyPatch) -> None:
    client, seen = make_client(ok)
    monkeypatch.setattr(image_prep, "MAX_REQUEST_BYTES", 3000)  # cannot fit even at the floor
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert seen == []  # nothing was sent


def test_tc_res_007_bl_03() -> None:
    client, seen = make_client(ok)
    pixel_bomb = image_prep.MAX_SOURCE_PIXELS + 1
    import io

    from PIL import Image

    side = int(pixel_bomb**0.5) + 1
    buf = io.BytesIO()
    Image.new("1", (side, side)).save(buf, "PNG")  # tiny file, huge pixel count
    with pytest.raises(ParseFailedError):
        client.parse(buf.getvalue(), "image/png")
    assert seen == []


def test_tc_res_007_bl_04(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ValidationError) as other_model:
        Settings(_env_file=None, deepseek_model="other-model")
    with pytest.raises(ValidationError) as other_host:
        Settings(_env_file=None, deepseek_base_url="https://evil.example.com")
    with pytest.raises(ValidationError):
        Settings(_env_file=None, deepseek_base_url="http://api.deepseek.com")
    assert "other-model" not in str(other_model.value) and "evil.example.com" not in str(
        other_host.value
    )
    bypass = Settings(_env_file=None).model_copy(
        update={"deepseek_base_url": "https://evil.example.com"}
    )
    with pytest.raises(ValueError):
        DeepSeekClient(bypass)


def test_tc_res_007_bl_05() -> None:
    """B-02 / AC 06.2: only the clients layer imports the HTTP stack or names the model host."""
    offenders = []
    for path in SRC.rglob("*.py"):
        rel = path.relative_to(SRC).as_posix()
        text = path.read_text()
        if rel.startswith("clients/") or rel == "core/config.py":
            continue
        if re.search(
            r"^\s*(import (httpx|requests|urllib|socket)|from (httpx|urllib))",
            text,
            re.M,
        ):
            offenders.append(rel)
        if "api.deepseek.com" in text:
            offenders.append(rel)
    assert offenders == []


def test_tc_res_007_bl_06() -> None:
    client = DeepSeekClient(
        Settings(_env_file=None, deepseek_api_key=None), transport=httpx.MockTransport(ok)
    )
    with pytest.raises(ParseUnavailableError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    source = "".join(p.read_text() for p in SRC.rglob("*.py"))
    assert not re.search(r"sk-[A-Za-z0-9]{10,}", source)  # B-01: no literal key in code


def test_tc_res_007_bl_07() -> None:
    with pytest.raises(RuntimeError, match="network access is forbidden"):
        socket.create_connection(("example.com", 80))  # B-06: tests cannot reach out
    s = socket.socket()
    with pytest.raises(RuntimeError):
        s.connect(("127.0.0.1", 9))
    s.close()


@pytest.mark.parametrize("exc", [httpx.ReadTimeout("t"), httpx.ConnectTimeout("t")])
def test_tc_res_007_eh_01(exc: Exception) -> None:
    def raiser(_: httpx.Request) -> httpx.Response:
        raise exc

    client, seen = make_client(raiser)
    with pytest.raises(ParseTimeoutError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert len(seen) == 1  # never retried


@pytest.mark.parametrize("status", [401, 402, 403, 404, 429, 500, 503])
def test_tc_res_007_eh_02(status: int) -> None:
    client, seen = make_client(lambda _: httpx.Response(status, text="ZZ-provider-body"))
    with pytest.raises(ParseUnavailableError) as err:
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    assert "ZZ-provider-body" not in str(err.value) and len(seen) == 1


@pytest.mark.parametrize("status", [400, 413, 422])
def test_tc_res_007_eh_03(status: int) -> None:
    client, _ = make_client(lambda _: httpx.Response(status, text="rejected"))
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, text=""),
        httpx.Response(200, text="not json"),
        httpx.Response(200, json={"choices": [{"message": {"content": "[1,2]"}}]}),
        httpx.Response(200, json={"choices": [{"message": {"content": "plain words"}}]}),
        httpx.Response(200, json={"choices": []}),
    ],
)
def test_tc_res_007_eh_04(response: httpx.Response) -> None:
    client, _ = make_client(lambda _: response)
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")


def test_tc_res_007_eh_05() -> None:
    def raiser(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("refused")

    client, _ = make_client(raiser)
    with pytest.raises(ParseUnavailableError):
        client.parse(syn.build_png(syn.RESUME_LINES), "image/png")


def test_tc_res_007_eh_06() -> None:
    client, _ = make_client(ok)
    t = client.timeout
    assert (t.connect, t.write, t.read, t.pool) == (5, 30, 60, 5)
    custom = Settings(_env_file=None, model_timeout_seconds=7)
    assert DeepSeekClient(custom).timeout.read == 7


def test_tc_res_007_eh_07() -> None:
    client, _ = make_client(ok)
    with pytest.raises(ParseFailedError):
        client.parse(make_pdf_bytes(300), "application/pdf")  # magic only: PDFium cannot open it


def test_tc_res_007_db_01(
    caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    caplog.set_level(logging.DEBUG)
    reply = {
        "choices": [
            {
                "message": {
                    "content": json.dumps({"name": {"value": "ZZBODYMARK", "status": "recognized"}})
                }
            }
        ],
        "usage": {"prompt_tokens": 123, "completion_tokens": 45},
    }
    client, _ = make_client(lambda _: httpx.Response(200, json=reply))
    client.parse(syn.build_png(syn.RESUME_LINES), "image/png")
    out = capsys.readouterr()
    blob = "\n".join([r.getMessage() for r in caplog.records] + [out.out, out.err])
    assert '"prompt_tokens": 123' in blob and '"completion_tokens": 45' in blob


def test_tc_res_007_se_01(
    caplog: pytest.LogCaptureFixture, capsys: pytest.CaptureFixture[str]
) -> None:
    caplog.set_level(logging.DEBUG)
    reply = {"choices": [{"message": {"content": "ZZRESPONSEMARK"}}]}
    client, _ = make_client(lambda _: httpx.Response(200, json=reply))
    with pytest.raises(ParseFailedError):
        client.parse(syn.build_text_pdf([["ZZREQUESTMARK line"]]), "application/pdf")
    out = capsys.readouterr()
    blob = "\n".join([r.getMessage() for r in caplog.records] + [out.out, out.err])
    for secret in ("ZZREQUESTMARK", "ZZRESPONSEMARK", KEY, "Bearer"):
        assert secret not in blob
