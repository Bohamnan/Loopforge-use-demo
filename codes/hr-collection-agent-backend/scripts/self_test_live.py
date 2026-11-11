# ruff: noqa: E501
"""Developer self-test against a REAL uvicorn process and the REAL model (NOT collected by pytest).

Usage (from the backend directory; the credential is loaded into the environment by the shell,
this script never reads or prints it):

    set -a; . ./.env; set +a
    PYTHONPATH=src:. uv run python scripts/self_test_live.py --out "$(mktemp -d)/live_result.json"

- The resume sample is SYNTHETIC: the script renders a fictitious one-page resume (example.com
  mail, 137 0000 0001 phone, invented names and schools) in memory. No real resume is read.
  The expected values (the "truth") are kept in memory too and never written anywhere.
- The server runs with a temporary DATA_DIR/FILE_DIR on 127.0.0.1:8000 (single worker); both
  directories and the process are removed at the end.
- Personal values are compared in memory only. The result file and the console contain case
  ids, OK/NG flags, counts and sizes, never personal values.
- Contract: OpenAPI 0.2.0. The browser identifier cookie is ``browser_id`` (Max-Age=34560000);
  every session call goes through ``/api/v1/sessions``.
"""

import argparse
import hashlib
import io
import json
import os
import re
import shutil
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFont

BASE = "http://127.0.0.1:8000"
SESSIONS = f"{BASE}/api/v1/sessions"
RESUMES = f"{BASE}/api/v1/resumes"
COOKIE_TAIL = "; HttpOnly; SameSite=Lax; Path=/; Max-Age=34560000"
CHAT_TEXT = "请用一句话概括这份简历的工作年限"  # synthetic instruction, no personal data
BACKEND = Path(__file__).resolve().parents[1]
RESULTS: dict[str, dict] = {}
FONT_CANDIDATES = (
    "/System/Library/Fonts/STHeiti Medium.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/Library/Fonts/Arial Unicode.ttf",
)
# Every value below is invented: example.com mail, 137 0000 0001 number, fictitious school/company.
SYNTHETIC_TRUTH = {
    "name": "测试甲乙",
    "email": "synthetic.hr@example.com",
    "phone": "13700000001",
    "job_title_contains": "后端开发",
    "work_years_digits": "3",
    "education": {"school": "示例大学", "major": "计算机科学与技术", "degree": "本科"},
    "certificates_contains": ["英语六级"],
    "skills_contains": ["Python", "SQL"],
    "project_count": 2,
    "must_not_appear_in_logs": ["测试甲乙", "13700000001", "synthetic.hr@example.com"],
}
SYNTHETIC_LINES = [
    "简历（合成样例，非真实人员）",
    "姓名：测试甲乙    手机：13700000001    邮箱：synthetic.hr@example.com",
    "求职意向：后端开发工程师    期望城市：示例城市",
    "工作经历：2021.07-2024.06  示例科技有限公司  后端开发工程师  工作 3 年",
    "项目经历：",
    "1. 订单对账平台（2022.01-2022.12）负责接口设计",
    "2. 库存同步服务（2023.01-2023.09）负责数据迁移",
    "教育背景：示例大学  计算机科学与技术  本科  2017.09-2021.06",
    "专业技能：Python、SQL",
    "证书荣誉：英语六级",
    "自我评价：认真负责，善于沟通。",
]


def synthetic_resume() -> tuple[bytes, dict]:
    """Render the fictitious resume as PNG in memory. Returns (png_bytes, truth)."""
    font_path = next((p for p in FONT_CANDIDATES if Path(p).exists()), None)
    font = ImageFont.truetype(font_path, 30) if font_path else ImageFont.load_default(size=30)
    image = Image.new("RGB", (1400, 760), "white")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(SYNTHETIC_LINES):
        draw.text((40, 40 + index * 60), line, fill="black", font=font)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue(), SYNTHETIC_TRUTH


def record(case: str, ok: bool, note: str = "") -> None:
    RESULTS[case] = {"result": "pass" if ok else "fail", "note": note}
    print(f"{'PASS' if ok else 'FAIL'}  {case}  {note}", flush=True)


def norm(text: object) -> str:
    return "".join(str(text or "").split()).lower()


def digits(text: object) -> str:
    return "".join(c for c in str(text or "") if c.isdigit())


class Server:
    def __init__(self, work: Path) -> None:
        self.work, self.proc, self.log_path = work, None, work / "server.log"
        self.log_all = work / "server_all.log"

    def start(self) -> None:
        env = dict(os.environ, DATA_DIR=str(self.work / "data"), FILE_DIR=str(self.work / "file"))
        cmd = [sys.executable, "-m", "uvicorn", "--app-dir", "src", "app.main:create_app",
               "--factory", "--workers", "1", "--host", "127.0.0.1", "--port", "8000"]  # fmt: skip
        self.log_path.write_bytes(b"")
        self.log = open(self.log_path, "ab")  # noqa: SIM115
        self.proc = subprocess.Popen(cmd, cwd=BACKEND, env=env, stdout=self.log, stderr=self.log)
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            if self.proc.poll() is not None:
                raise RuntimeError("server exited during start-up")
            if b"Application startup complete" in self.log_path.read_bytes():
                return
            time.sleep(0.2)
        raise RuntimeError("server did not start in time")

    def stop(self) -> int | None:
        if self.proc is None:
            return None
        if self.proc.poll() is None:
            self.proc.send_signal(signal.SIGINT)
            try:
                self.proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait()
        self.log.close()
        with open(self.log_all, "ab") as sink:
            sink.write(self.log_path.read_bytes())
        code, self.proc = self.proc.returncode, None
        return code

    def text(self) -> str:
        return self.log_path.read_text(errors="replace")


def sql(work: Path, db: str, query: str, params: tuple = ()) -> list:
    conn = sqlite3.connect(work / "data" / db)
    try:
        return conn.execute(query, params).fetchall()
    finally:
        conn.close()


def port_free() -> bool:
    try:
        httpx.get(SESSIONS, timeout=2, trust_env=False)
    except httpx.TransportError:
        return True
    return False


def compare_truth(fields: dict, truth: dict) -> dict[str, bool]:
    """Field-by-field comparison; returns {field: matched}. Values are never exposed."""

    def val(key: str) -> object:
        return (fields.get(key) or {}).get("value")

    def first(key: str) -> dict:
        items = val(key) or []
        return items[0] if items and isinstance(items[0], dict) else {}

    flat = norm(json.dumps(fields, ensure_ascii=False))
    edu = [e for e in (val("educations") or []) if isinstance(e, dict)]
    edu_text = norm(json.dumps(edu, ensure_ascii=False))
    return {
        "name": norm(val("name")) == norm(truth["name"]),
        "email": norm(val("email")) == norm(truth["email"]),
        "phone": digits(val("phone")).endswith(digits(truth["phone"])),
        "job_title": norm(truth["job_title_contains"]) in norm(val("job_title") or first("work_experiences")),
        "work_years": truth["work_years_digits"] in digits(val("work_years")) or truth["work_years_digits"] in flat,
        "education_school": norm(truth["education"]["school"]) in edu_text,
        "education_major": norm(truth["education"]["major"]) in edu_text,
        "education_degree": norm(truth["education"]["degree"]) in edu_text or norm(truth["education"]["degree"]) in norm(val("highest_education")),
        "certificates": all(norm(c) in norm(json.dumps(val("certificates_honors"), ensure_ascii=False)) for c in truth["certificates_contains"]),
        "skills": all(norm(s) in norm(json.dumps(val("skills"), ensure_ascii=False)) for s in truth["skills_contains"]),
        "projects_count": len(val("project_experiences") or []) == truth["project_count"],
    }  # fmt: skip


def cookie_value(set_cookie: str) -> str:
    """The browser identifier from a Set-Cookie header. Kept in memory, never printed."""
    return set_cookie.split(";", 1)[0].partition("=")[2]


def run(args: argparse.Namespace) -> None:
    sample, truth = synthetic_resume()
    work = Path(tempfile.mkdtemp(prefix="hr_selftest_live_"))
    server = Server(work)
    http = httpx.Client(timeout=90, trust_env=False)  # never route resume data through a proxy
    browser_ids: list[str] = []
    try:
        # ---- 008-HP-01: real process start-up ------------------------------------------------
        server.start()
        log = server.text()
        order = [
            log.find(k)
            for k in (
                "reconcile_done",
                "orphan_sweep_done",
                "Application startup complete",
            )
        ]
        listening = httpx.get(SESSIONS, timeout=5, trust_env=False).status_code == 200
        record("TC-RES-008-HP-01", all(i >= 0 for i in order) and order == sorted(order) and listening
               and (work / "data" / "drafts.db").exists() and (work / "data" / "resumes.db").exists()
               and (work / "data" / "drafts").is_dir() and (work / "file").is_dir(),
               "start-up log order reconcile -> orphan sweep -> startup complete; listening; dirs and dbs exist")  # fmt: skip

        # ---- 008-EH-01: error codes on the real process --------------------------------------
        empty_list = http.get(SESSIONS)
        checks = {
            "no_file": http.post(SESSIONS, files={"x": ("a.txt", b"1")}).status_code == 400,
            "exe": http.post(SESSIONS, files={"file": ("a.exe", b"MZ00", "application/octet-stream")}).status_code == 415,
            "empty": http.post(SESSIONS, files={"file": ("a.pdf", b"", "application/pdf")}).status_code == 400,
            "mismatch": http.post(SESSIONS, files={"file": ("a.pdf", sample, "application/pdf")}).status_code == 400,
            "too_large": http.post(SESSIONS, files={"file": ("a.pdf", b"%PDF-" + b"0" * 10485760, "application/pdf")}).status_code == 413,
            "list_without_cookie": empty_list.status_code == 200 and empty_list.json()["items"] == [] and "set-cookie" not in empty_list.headers,
            "get_without_cookie": http.get(f"{SESSIONS}/{uuid.uuid4()}").status_code == 404,
            "confirm_without_cookie": http.post(f"{SESSIONS}/{uuid.uuid4()}/resume", json={"confirmed": True}).status_code == 404,
        }  # fmt: skip
        record("TC-RES-008-EH-01", all(checks.values()) and not http.cookies and sql(work, "drafts.db", "SELECT count(*) FROM sessions") == [(0,)],
               "failed checks: " + (",".join(k for k, v in checks.items() if not v) or "none"))  # fmt: skip

        # ---- 008-BL-01: 1 MB request budget with the real sample -----------------------------
        from app.clients.deepseek_client import _body_size, build_user_blocks
        from app.clients.image_prep import MAX_REQUEST_BYTES

        size = _body_size(build_user_blocks(sample, "image/png"))
        record("TC-RES-008-BL-01", size <= MAX_REQUEST_BYTES == 995_904,
               f"source {len(sample)} B -> request body {size} B (limit {MAX_REQUEST_BYTES})")  # fmt: skip

        # ---- 008-HP-02: upload the real sample -----------------------------------------------
        started = time.monotonic()
        resp = http.post(SESSIONS, files={"file": ("sample.png", sample, "image/png")})
        first_attempts = [resp.status_code]
        if resp.status_code >= 500:  # upstream model hiccup: one explicit test-level retry
            resp = http.post(SESSIONS, files={"file": ("sample.png", sample, "image/png")})
            first_attempts.append(resp.status_code)
        elapsed = time.monotonic() - started
        body = resp.json() if resp.status_code == 201 else {}
        cookie = resp.headers.get("set-cookie", "")
        if cookie:
            browser_ids.append(cookie_value(cookie))
        keys = {"name", "job_title", "expected_city", "expected_salary", "available_time", "phone", "email", "homepage", "gender", "birth_month", "political_status", "current_city", "work_years", "highest_education", "strengths", "work_experiences", "project_experiences", "educations", "skills", "certificates_honors", "languages", "self_evaluation"}  # fmt: skip
        fields = body.get("fields", {})
        sid = body.get("session_id", "")
        statuses = {n["status"] for n in fields.values()}
        record("TC-RES-008-HP-02", resp.status_code == 201 and set(fields) == keys and statuses <= {"recognized", "uncertain", "missing"}
               and cookie.startswith("browser_id=") and cookie.endswith(COOKIE_TAIL)
               and elapsed < 75,
               f"HTTP attempts={first_attempts}, {elapsed:.1f}s total, statuses={sorted(statuses)}")  # fmt: skip
        if resp.status_code != 201:
            return

        # ---- 008-HP-03: field-by-field comparison with the truth -----------------------------
        matched = compare_truth(fields, truth)
        summary = ",".join(f"{k}={'OK' if v else 'NG'}" for k, v in matched.items())
        core_ok = all(matched[k] for k in ("name", "email", "phone"))
        record(
            "TC-RES-008-HP-03",
            core_ok and all(matched.values()),
            f"{sum(matched.values())}/{len(matched)} matched: {summary}",
        )

        # ---- 008-HP-04: GET equals the upload response ---------------------------------------
        got = http.get(f"{SESSIONS}/{sid}")
        record("TC-RES-008-HP-04", got.status_code == 200 and got.json()["fields"] == fields and got.json()["session_id"] == sid,
               f"HTTP {got.status_code}")  # fmt: skip

        # ---- 008-HP-05: PATCH (confirm the core three with the true values) ------------------
        patch = http.patch(
            f"{SESSIONS}/{sid}/fields",
            json={
                "fields": {
                    "name": truth["name"],
                    "phone": truth["phone"],
                    "email": truth["email"],
                    "homepage": None,
                }
            },
        )
        pf = patch.json().get("fields", {}) if patch.status_code == 200 else {}
        untouched = [k for k in fields if k not in {"name", "phone", "email", "homepage"}]
        record("TC-RES-008-HP-05", patch.status_code == 200 and all(pf[k]["status"] == "confirmed" for k in ("name", "phone", "email", "homepage"))
               and all(pf[k] == fields[k] for k in untouched) and pf["homepage"]["value"] is None,
               f"HTTP {patch.status_code}; 4 fields confirmed, {len(untouched)} untouched fields unchanged")  # fmt: skip

        # ---- 008-CH-01: one real conversation turn (no suggestion is applied) ----------------
        chat = http.post(f"{SESSIONS}/{sid}/messages", json={"content": CHAT_TEXT})
        if chat.status_code >= 500:  # one explicit test-level retry; the service never retries
            chat = http.post(f"{SESSIONS}/{sid}/messages", json={"content": CHAT_TEXT})
        reply = chat.json().get("assistant_message", {}) if chat.status_code == 201 else {}
        suggestions = reply.get("suggestions", [])
        record("TC-RES-008-CH-01", chat.status_code == 201 and bool(reply.get("content", "").strip()),
               f"HTTP {chat.status_code}; reply chars={len(reply.get('content', ''))}; suggestions={len(suggestions)}, applicable={sum(1 for s in suggestions if s['applicable'])}")  # fmt: skip

        # ---- 008-HP-06: confirm and verify DB/file consistency -------------------------------
        conf = http.post(f"{SESSIONS}/{sid}/resume", json={"confirmed": True})
        cb = conf.json() if conf.status_code == 201 else {}
        rid = cb.get("resume_id", "")
        rows = sql(work, "resumes.db", "SELECT file_path, content_type, file_size FROM resumes")
        stored = sorted(p.name for p in (work / "file").iterdir())
        file_ok = (
            bool(rid)
            and stored == [f"{rid}.png"]
            and hashlib.sha256((work / "file" / f"{rid}.png").read_bytes()).digest()
            == hashlib.sha256(sample).digest()
        )
        counts = {
            "resumes": sql(work, "resumes.db", "SELECT count(*) FROM resumes")[0][0],
            "work": sql(work, "resumes.db", "SELECT count(*) FROM resume_work_experiences")[0][0],
            "projects": sql(work, "resumes.db", "SELECT count(*) FROM resume_project_experiences")[0][0],
            "educations": sql(work, "resumes.db", "SELECT count(*) FROM resume_educations")[0][0],
            "saved_sessions": sql(work, "drafts.db", "SELECT count(*) FROM sessions WHERE status = 'saved'")[0][0],
            "draft_files": len(list((work / "data" / "drafts").iterdir())),
        }  # fmt: skip
        identity = sql(work, "resumes.db", "SELECT name, phone, email FROM resumes")
        id_ok = bool(identity) and identity[0] == (truth["name"], truth["phone"], truth["email"])
        kept_cookie = cookie_value(conf.headers.get("set-cookie", "")) == browser_ids[
            0
        ] and conf.headers.get("set-cookie", "").endswith(COOKIE_TAIL)
        record("TC-RES-008-HP-06", conf.status_code == 201 and cb.get("already_saved") is False and file_ok and id_ok
               and rows == [(f"{rid}.png", "image/png", len(sample))] and counts["resumes"] == 1 and counts["saved_sessions"] == 1 and counts["draft_files"] == 0
               and kept_cookie,
               f"HTTP {conf.status_code}; counts={counts}; file==sample(sha256)={file_ok}; identity columns==truth={id_ok}; cookie kept={kept_cookie}")  # fmt: skip

        # ---- 008-EH-02: restart with planted orphans -> real reconciliation ------------------
        first_exit = server.stop()
        before = sorted(p.name for p in (work / "file").iterdir())
        orphan_tmp = work / "file" / f".{uuid.uuid4()}.png.tmp"
        orphan_final = work / "file" / f"{uuid.uuid4()}.png"
        orphan_tmp.write_bytes(b"x")
        orphan_final.write_bytes(b"x")
        server.start()
        log2 = server.text()
        after = sorted(p.name for p in (work / "file").iterdir())
        record("TC-RES-008-EH-02", first_exit == 0 and after == before and "reconcile_done" in log2
               and sql(work, "resumes.db", "SELECT count(*) FROM resumes") == [(1,)],
               f"exit code of first stop={first_exit}; planted orphans removed={after == before}; record file kept={len(after) == 1}")  # fmt: skip

        # ---- 008-HP-07: second upload of the same person -> already_saved --------------------
        again = http.post(SESSIONS, files={"file": ("sample.png", sample, "image/png")})
        upload_attempts = [again.status_code]
        model_calls = [
            ln for ln in server.text().splitlines() if '"model_call"' in ln
        ]  # codes only
        if again.status_code != 201:  # one explicit test-level retry; the service never retries
            again = http.post(SESSIONS, files={"file": ("sample.png", sample, "image/png")})
            upload_attempts.append(again.status_code)
        sid2 = again.json().get("session_id", "")
        dup = http.post(f"{SESSIONS}/{sid2}/resume", json={"confirmed": True})
        # A duplicate keeps its temp file as the frozen update candidate (design 5.3), so the
        # draft directory must hold exactly that file and nothing else.
        cand_rows = sql(
            work, "drafts.db", "SELECT update_state, file_path FROM sessions WHERE id = ?", (sid2,)
        )
        cand_names = sorted(p.name for p in (work / "data" / "drafts").iterdir())
        record("TC-RES-008-HP-07", again.status_code == 201 and dup.status_code == 200 and dup.json().get("already_saved") is True
               and dup.json().get("resume_id") == rid and sql(work, "resumes.db", "SELECT count(*) FROM resumes") == [(1,)]
               and sorted(p.name for p in (work / "file").iterdir()) == [f"{rid}.png"]
               and len(cand_rows) == 1 and cand_rows[0][0] == "pending" and cand_names == [Path(cand_rows[0][1]).name],
               f"upload attempts={upload_attempts}, confirm HTTP {dup.status_code}; one record, one file; update_state=pending; draft dir holds only the candidate file={cand_names == [Path(cand_rows[0][1]).name] if cand_rows else False}; first model_call log: {model_calls[-1] if model_calls else None}")  # fmt: skip

        # ---- 008-HP-08: confirmed update overwrites the record with the candidate ------------
        update = http.put(f"{SESSIONS}/{sid2}/resume", json={"confirm_update": True})
        archived = sorted(p.name for p in (work / "file").iterdir())
        names_ok = (
            len(archived) == 1
            and re.fullmatch(rf"{re.escape(rid)}-[0-9a-f]{{8}}\.png", archived[0]) is not None
        )
        content_ok = names_ok and (work / "file" / archived[0]).read_bytes() == sample
        applied = sql(work, "drafts.db", "SELECT update_state FROM sessions WHERE id = ?", (sid2,))
        record("TC-RES-008-HP-08", update.status_code == 200 and update.json().get("resume_id") == rid
               and sql(work, "resumes.db", "SELECT count(*) FROM resumes") == [(1,)]
               and names_ok and content_ok and applied == [("applied",)]
               and sql(work, "resumes.db", "SELECT file_path FROM resumes") == [(archived[0],)],
               f"HTTP {update.status_code}; one record; one versioned file={names_ok}; content==sample={content_ok}; update_state=applied={applied == [('applied',)]}")  # fmt: skip

        # ---- 008-SE-01: logs hold no personal data, no token, no key -------------------------
        second_exit = server.stop()
        logs = server.log_all.read_text(errors="replace") + server.text()
        secrets = list(truth["must_not_appear_in_logs"]) + [
            "sample.png",
            "browser_id=",
            "Bearer",
            CHAT_TEXT,
        ]
        secrets += [value for value in browser_ids if value]  # in memory only, never printed
        key_name = "DEEPSEEK_API_KEY"
        if os.environ.get(key_name):
            secrets.append(os.environ[key_name])
        leaked = [i for i, s in enumerate(secrets) if s and s in logs]
        events = sorted(
            {
                line.split('"event": "')[1].split('"')[0]
                for line in logs.splitlines()
                if '"event": "' in line
            }
        )
        record(
            "TC-RES-008-SE-01",
            not leaked,
            f"{len(logs.splitlines())} log lines, leaked secret indexes={leaked}, events={events}",
        )

        # ---- 008-SE-02: graceful shutdown and no residue -------------------------------------
        tail = server.log_all.read_text(errors="replace")
        record("TC-RES-008-SE-02", second_exit == 0 and first_exit == 0 and "Application shutdown complete" in tail and port_free(),
               f"exit codes={first_exit},{second_exit}; shutdown complete logged; port 8000 released")  # fmt: skip
    finally:
        server.stop()
        usage = {"calls": 0, "prompt_tokens": 0, "completion_tokens": 0}
        if server.log_all.exists():
            for line in server.log_all.read_text(errors="replace").splitlines():
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if (
                    entry.get("event") in ("model_call", "chat_call")
                    and entry.get("prompt_tokens") is not None
                ):
                    usage["calls"] += 1
                    usage["prompt_tokens"] += int(entry["prompt_tokens"])
                    usage["completion_tokens"] += int(entry.get("completion_tokens") or 0)
        shutil.rmtree(work, ignore_errors=True)
        out = Path(args.out)
        RESULTS["_usage"] = usage  # token counts only
        out.write_text(json.dumps(RESULTS, ensure_ascii=False, indent=2))
        print(f"usage {usage}; cleaned {work.name}; results -> {out}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    run(parser.parse_args())
