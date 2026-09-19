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
    embedding_model: str = "text-embedding-v4"
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


@lru_cache
def get_settings() -> Settings:
    return Settings()
