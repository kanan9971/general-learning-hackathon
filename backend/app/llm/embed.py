"""Embeddings client: Alibaba Qwen text-embedding-v4 via DashScope's OpenAI-compatible API.
No DB, no retrieval logic. Provider is swappable via EMBEDDING_* env vars."""
from openai import OpenAI

from ..config import get_settings

BATCH = 10  # DashScope text-embedding-v3/v4 accept at most 10 inputs per request


def embed_texts(texts: list[str]) -> list[list[float]]:
    s = get_settings()
    client = OpenAI(api_key=s.embedding_api_key, base_url=s.embedding_base_url)
    out: list[list[float]] = []
    for i in range(0, len(texts), BATCH):
        resp = client.embeddings.create(
            model=s.embedding_model,
            input=texts[i : i + BATCH],
            dimensions=s.embedding_dims,
            encoding_format="float",
        )
        vecs = [d.embedding for d in sorted(resp.data, key=lambda d: d.index)]
        if any(len(v) != s.embedding_dims for v in vecs):
            raise ValueError(f"Embedding size != {s.embedding_dims}; check EMBEDDING_* settings")
        out.extend(vecs)
    return out
