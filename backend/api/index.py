"""Vercel serverless entrypoint. Only re-exports the FastAPI app."""
from app.main import app  # noqa: F401
