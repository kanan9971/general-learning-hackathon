from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .errors import install_error_handlers
from .routers import dev_fixtures, health


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="DeskReady API", version=settings.app_version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins.split(","),
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)
    app.include_router(health.router)
    if settings.dev_fixtures:
        app.include_router(dev_fixtures.router)
    return app


app = create_app()
