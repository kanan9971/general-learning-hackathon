"""Structured LLM calls: JSON-schema output -> Pydantic validation -> one repair retry.
Callers own the deterministic fallback (CLAUDE.md rule 2)."""
import json
import time
from dataclasses import dataclass
from typing import Generic, TypeVar

from openai import OpenAIError
from pydantic import BaseModel, ValidationError

from .client import LLMError, llm_client

T = TypeVar("T", bound=BaseModel)


@dataclass
class LLMResult(Generic[T]):
    value: T
    model: str
    prompt_version: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    attempts: int


def generate(
    output_model: type[T], *, system: str, user: str, model: str, prompt_version: str,
    temperature: float = 0.2, max_tokens: int = 1800,
) -> LLMResult[T]:
    if not model:
        raise LLMError("LLM model id not configured", retryable=False)
    messages: list[dict] = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    fmt = {"type": "json_schema", "json_schema": {"name": output_model.__name__, "schema": output_model.model_json_schema()}}
    start, tin, tout = time.monotonic(), 0, 0
    last_err = ""
    for attempt in (1, 2):
        try:
            resp = llm_client().chat.completions.create(
                model=model, messages=messages, response_format=fmt,
                temperature=temperature, max_tokens=max_tokens,
            )
        except OpenAIError as e:
            raise LLMError(f"provider error: {type(e).__name__}") from e
        if resp.usage:
            tin += resp.usage.prompt_tokens or 0
            tout += resp.usage.completion_tokens or 0
        content = resp.choices[0].message.content or ""
        try:
            value = output_model.model_validate(json.loads(content))
            return LLMResult(value, model, prompt_version, int((time.monotonic() - start) * 1000), tin, tout, attempt)
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = str(e)[:800]
            messages += [
                {"role": "assistant", "content": content[:4000]},
                {"role": "user", "content": f"Your JSON failed validation:\n{last_err}\nReturn only corrected JSON matching the schema."},
            ]
    raise LLMError(f"invalid structured output after repair: {last_err[:200]}")
