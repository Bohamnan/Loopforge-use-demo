"""Manual accuracy/cost spike for DeepSeekClient (NOT collected by pytest).

Usage:  PYTHONPATH=src:. uv run python scripts/spike_deepseek.py

- Credentials come from the environment / local .env via Settings and are never printed.
- Only synthetic documents (fictional person, see tests/synthetic.py) are generated in memory
  and sent, and only to the approved deepseek-flash model (B-02, B-06).
- Output: request shape, elapsed time, token usage and per-field accuracy against the known
  answer. Response text and extracted values are never printed.
"""

import re
import sys
import time

from tests import synthetic as syn

from app.clients.deepseek_client import DeepSeekClient, build_user_blocks
from app.core.config import Settings
from app.core.errors import AppError


def _value(data: dict, key: str):
    node = data.get(key)
    return node.get("value") if isinstance(node, dict) else None


def _first(data: dict, key: str) -> dict:
    value = _value(data, key)
    return value[0] if isinstance(value, list) and value and isinstance(value[0], dict) else {}


def _up(value: object) -> str:
    return str(value or "").upper().strip()


def _has(value: object, *needles: str) -> bool:
    return all(n in _up(value) for n in needles)


def _checks(data: dict) -> dict[str, bool]:
    edu, work = _first(data, "educations"), _first(data, "work_experiences")
    skills = {_up(s) for s in (_value(data, "skills") or []) if isinstance(s, str)}
    return {
        "name": _up(_value(data, "name")) == "ZHANG SAN",
        "job_title": _has(_value(data, "job_title"), "BACKEND ENGINEER"),
        "phone": re.sub(r"\D", "", str(_value(data, "phone") or "")) == "13800138000",
        "email": _up(_value(data, "email")) == "ZS@EXAMPLE.COM",
        "current_city": _has(_value(data, "current_city"), "SHANGHAI"),
        "skills": skills == {"PYTHON", "SQL"},
        "edu.school": _has(edu.get("school"), "EXAMPLE UNIVERSITY"),
        "edu.major": _has(edu.get("major"), "COMPUTER SCIENCE"),
        "edu.start": _has(edu.get("start_date"), "2015"),
        "edu.end": _has(edu.get("end_date"), "2019"),
        "work.company": _has(work.get("company"), "EXAMPLE CORP"),
        "work.position": _has(work.get("position"), "BACKEND ENGINEER"),
        "work.start": _has(work.get("start_date"), "2019"),
        "work.end": _has(work.get("end_date"), "2024"),
    }


# Keys whose value is not in the document; a non-empty value there is a fabrication.
ABSENT = [
    "expected_city", "expected_salary", "available_time", "homepage", "gender", "birth_month",
    "political_status", "work_years", "strengths", "project_experiences",
    "certificates_honors", "languages", "self_evaluation",
]  # fmt: skip


def run(client: DeepSeekClient, label: str, content: bytes, mime: str) -> None:
    blocks = build_user_blocks(content, mime)
    shape = {t: sum(b["type"] == t for b in blocks) for t in ("text", "image_url")}
    start = time.monotonic()
    try:
        result = client.parse(content, mime)
    except AppError as exc:
        print(
            f"[{label}] {mime} blocks={shape} -> {exc.code.value} "
            f"after {time.monotonic() - start:.1f}s"
        )
        return
    elapsed = time.monotonic() - start
    checks = _checks(result.data)
    fabricated = [k for k in ABSENT if _value(result.data, k) not in (None, "", [])]
    statuses = [n.get("status") for n in result.data.values() if isinstance(n, dict)]
    print(
        f"[{label}] {mime} blocks={shape} elapsed={elapsed:.1f}s "
        f"prompt_tokens={result.prompt_tokens} completion_tokens={result.completion_tokens}"
    )
    print(
        f"    accuracy={sum(checks.values())}/{len(checks)} "
        f"wrong={[k for k, ok in checks.items() if not ok]}"
    )
    print(
        f"    fabricated_nonempty={fabricated} keys={len(result.data)} "
        f"confirmed_returned={'confirmed' in statuses}"
    )


def main() -> None:
    settings = Settings()
    if settings.deepseek_api_key is None:
        sys.exit("DEEPSEEK_API_KEY is not configured")
    if settings.deepseek_model != "deepseek-flash":  # explicit: survives python -O
        sys.exit("only the approved model deepseek-flash may be used")
    client = DeepSeekClient(settings)
    try:
        run(client, "png", syn.build_png(syn.RESUME_LINES), "image/png")
        run(client, "pdf-text-layer", syn.build_text_pdf([syn.RESUME_LINES]), "application/pdf")
        run(client, "pdf-scan", syn.build_scan_pdf(syn.RESUME_LINES), "application/pdf")
    finally:
        client.close()


if __name__ == "__main__":
    main()
