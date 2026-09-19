"""xAI Grok client (OpenAI-compatible). The only place that talks to the LLM provider."""
from functools import lru_cache

from openai import OpenAI

from ..config import get_settings


class LLMError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


@lru_cache
def llm_client() -> OpenAI:
    s = get_settings()
    if not s.xai_api_key:
        raise LLMError("XAI_API_KEY not configured", retryable=False)
    return OpenAI(api_key=s.xai_api_key, base_url=s.xai_base_url, timeout=25, max_retries=1)
