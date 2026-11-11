"""Shared helpers for the end-to-end and red-line tests (task 3.2). Synthetic data only (B-06).

The model is the real ``DeepSeekClient`` talking to an ``httpx.MockTransport``: request building,
reply parsing and error mapping run for real, and the replies come from a script in call order.
Nothing reaches the network; ``tests/conftest.py`` blocks sockets.
"""

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import httpx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from tests import synthetic as syn

SYNTHETIC_API_KEY = "synthetic-key-ZZ-e2e"  # a fixture value, never a real credential
NAME, PHONE, EMAIL = "ZZ E2ENAME", "13700137099", "zz.e2e@example.test"
FILENAME = "zz-private-cv.pdf"
CV = syn.build_text_pdf([syn.RESUME_LINES])
CV_REVISED = syn.build_text_pdf([[*syn.RESUME_LINES, "REVISED CV"]])
OTHER_BROWSER = "C" * 43

SESSIONS = "/api/v1/sessions"
RESUMES = "/api/v1/resumes"


def _node(value: object, status: str = "recognized") -> dict:
    return {"value": value, "status": status}


def model_response(text: str, status: int = 200) -> httpx.Response:
    body = {
        "choices": [{"message": {"content": text}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 50},
    }
    return httpx.Response(status, json=body)


def parse_reply(**extra: dict) -> httpx.Response:
    """A parse reply for the synthetic person; ``extra`` adds or replaces field nodes."""
    fields = {
        "name": _node(NAME),
        "phone": _node(PHONE),
        "email": _node(EMAIL),
        "job_title": _node("Engineer"),
        "skills": _node(["Python"]),
        **extra,
    }
    return model_response(json.dumps(fields))


def chat_reply(reply: str, suggestions: list[dict]) -> httpx.Response:
    return model_response(json.dumps({"reply": reply, "suggestions": suggestions}))


class ModelScript:
    """Serves queued replies in call order. An empty queue answers 500 (a model failure)."""

    def __init__(self) -> None:
        self.queue: list[httpx.Response] = []
        self.calls = 0

    def expect(self, reply: httpx.Response) -> None:
        self.queue.append(reply)

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.calls += 1
        return self.queue.pop(0) if self.queue else httpx.Response(500)


@dataclass
class World:
    app: FastAPI
    client: TestClient
    settings: Settings
    model: ModelScript

    def upload(
        self, content: bytes = CV, name: str = FILENAME, mime: str = "application/pdf"
    ) -> httpx.Response:
        return self.client.post(SESSIONS, files={"file": (name, content, mime)})

    def rows(self, db: str, sql: str, params: tuple = ()) -> list[tuple]:
        conn = sqlite3.connect(self.settings.data_dir / db)
        try:
            return conn.execute(sql, params).fetchall()
        finally:
            conn.close()

    def archive_names(self) -> list[str]:
        return sorted(p.name for p in self.settings.file_dir.iterdir())

    def draft_names(self) -> list[str]:
        return sorted(p.name for p in (self.settings.data_dir / "drafts").iterdir())

    def snapshot(self) -> dict[str, object]:
        """Every row and file a session request could change."""
        return {
            "sessions": self.rows("drafts.db", "SELECT * FROM sessions ORDER BY 1"),
            "messages": self.rows("drafts.db", "SELECT * FROM chat_messages ORDER BY 1"),
            "suggestions": self.rows("drafts.db", "SELECT * FROM chat_suggestions ORDER BY 1"),
            "resumes": self.rows("resumes.db", "SELECT * FROM resumes ORDER BY 1"),
            "archive": self.archive_names(),
            "drafts": self.draft_names(),
        }


def stored_files(*roots: Path) -> list[Path]:
    return [p for root in roots for p in root.rglob("*") if p.is_file()]
