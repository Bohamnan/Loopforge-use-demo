"""Request-id middleware (pure ASGI so it also wraps streaming and error paths)."""

import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.logging import request_id_var

REQUEST_ID_HEADER = b"x-request-id"


def new_request_id() -> str:
    """Generate a request id. Client-supplied ids are never trusted."""
    return f"req_{uuid.uuid4().hex[:16]}"


class RequestIdMiddleware:
    """Assigns a request id, exposes it to logs and handlers, and echoes it in a header."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = new_request_id()
        scope.setdefault("state", {})["request_id"] = request_id
        token = request_id_var.set(request_id)

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = [h for h in message.get("headers", []) if h[0] != REQUEST_ID_HEADER]
                headers.append((REQUEST_ID_HEADER, request_id.encode("ascii")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            request_id_var.reset(token)
