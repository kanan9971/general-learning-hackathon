"""Environment-backed settings. The only module that reads env vars."""
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    xai_api_key: str = ""
    xai_base_url: str = "https://api.x.ai/v1"
    xai_model_fast: str = ""
    xai_model_reasoning: str = ""
    # Embeddings: Alibaba Model Studio (DashScope), OpenAI-compatible. OpenAI is blocked in Hong Kong.
    embedding_api_key: str = ""
    embedding_base_url: str = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "qwen3.7-text-embedding"
    embedding_dims: int = 1536  # must match vector(1536) in migration 0002

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""

    fred_api_key: str = ""
    wsj_rss_feeds: str = ""
    yahoo_user_agent: str = "Mozilla/5.0"

    cron_secret: str = ""
    data_mode: Literal["live", "cache", "demo"] = "demo"
    demo_date: str = ""
    allowed_origins: str = "*"
    app_version: str = "0.0.1"
    dev_fixtures: bool = False  # serve /v1/dev/fixtures/* (local only)
    # Local-only: requests without a token act as a fixed dev user (mobile app has no login yet).
    # Ignored when running on Vercel (VERCEL env var is set there).
    auth_dev_bypass: bool = False
    vercel: str = ""
    # HMAC key for MCQ answer seals (never returned to clients). Falls back to a
    # deterministic local value so demos work; set QUIZ_HMAC_SECRET in production.
    quiz_hmac_secret: str = "deskready-dev-quiz-hmac"
    # Force in-memory quiz store (tests / offline). Auto-on when no JWT under bypass.
    quiz_use_memory: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
