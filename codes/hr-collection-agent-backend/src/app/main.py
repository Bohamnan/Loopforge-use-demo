"""Application factory. Wires middleware, routers and error handlers; no business logic."""

from fastapi import FastAPI

from app.api.error_handlers import register_error_handlers
from app.api.middleware import RequestIdMiddleware
from app.api.routes import resume_drafts, resumes
from app.clients.resume_parser_client import ResumeParserClient
from app.core.clock import Clock, SystemClock
from app.core.config import Settings
from app.core.ids import IdGenerator, UuidGenerator
from app.core.logging import configure_logging


def create_app(
    settings: Settings | None = None,
    *,
    parser_client: ResumeParserClient | None = None,
    clock: Clock | None = None,
    ids: IdGenerator | None = None,
) -> FastAPI:
    """Create the application.

    ``parser_client``, ``clock`` and ``ids`` exist so tests can inject fakes; by default the
    real DeepSeek client is created lazily on first use. Lifespan arrives with task 2.7.
    """
    configure_logging()
    app = FastAPI(title="hr-collection-agent", version="0.1.1", docs_url=None, redoc_url=None)
    app.state.settings = settings or Settings()
    app.state.parser_client = parser_client
    app.state.clock = clock or SystemClock()
    app.state.ids = ids or UuidGenerator()
    app.add_middleware(RequestIdMiddleware)
    register_error_handlers(app)
    app.include_router(resume_drafts.router)
    app.include_router(resumes.router)
    return app
