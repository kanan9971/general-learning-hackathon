"""Embeddings client (OpenAI text-embedding-3-small). No DB, no retrieval logic."""
from openai import OpenAI

from ..config import get_settings

BATCH = 64


def embed_texts(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    client = OpenAI(api_key=s.openai_api_key)
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        resp = client.embeddings.create(model=s.embedding_model, input=texts[i : i + BATCH])
        out.extend(d.embedding for d in resp.data)
    return out
