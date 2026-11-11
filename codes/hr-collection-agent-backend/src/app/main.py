"""Application factory. Wires middleware, routers and error handlers; no business logic."""

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.middleware import RequestIdMiddleware
from app.api.routes import chat, session_resume, sessions
from app.clients.resume_chat_client import ResumeChatClient
from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock, SystemClock
from app.core.config import Settings
from app.core.ids import IdGenerator, UuidGenerator
from app.core.lifecycle import Lifecycle, lifespan
from app.core.logging import configure_logging


def create_app(
    settings: Settings | None = None,
    *,
    parser_client: ResumeParserClient | None = None,
    chat_client: ResumeChatClient | None = None,
    clock: Clock | None = None,
    ids: IdGenerator | None = None,
    lifecycle: Lifecycle | None = None,
) -> FastAPI:
    """Create the application.

    ``parser_client``, ``chat_client``, ``clock`` and ``ids`` exist so tests can inject fakes;
    by default the real DeepSeek client is created lazily on first use. ``lifecycle`` lets
    tests record the start-up sequence; by default it works on the same settings and clock as
    the requests.
    """
    configure_logging()
    app = FastAPI(
        title="hr-collection-agent",
        version="0.2.0",
        docs_url=None,
        redoc_url=None,
        lifespan=lifespan,
    )
    app.state.settings = settings or Settings()
    app.state.parser_client = parser_client
    app.state.chat_client = chat_client
    app.state.deepseek = None  # real client, created on first use
    app.state.clock = clock or SystemClock()
    app.state.ids = ids or UuidGenerator()
    app.state.lifecycle = lifecycle or Lifecycle(app.state.settings, app.state.clock)
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    app.include_router(sessions.router)
    app.include_router(session_resume.router)
    app.include_router(chat.router)
    return app
