"""Section-aware chunking: split at headings, then pack sentences up to a token budget."""
import re
from dataclasses import dataclass

import tiktoken

_ENC = tiktoken.get_encoding("cl100k_base")
TARGET_TOKENS = 350
MAX_TOKENS = 500
_HEADING_RE = re.compile(
    r"^(?:(?:\d+\.\d+(?:\.\d+)*\.?|\d+\.|[IVX]+\.|[A-D]\.)\s+[A-Z][^.!?]{2,80}|"
    r"(?:Abstract|Introduction|Conclusion|Conclusions|Data|Results|Discussion)|"
    r"[A-Z][A-Z0-9 ,:;'\-&]{3,70})$"
)


@dataclass
class Chunk:
    index: int
    section_path: str
    content: str
    token_count: int


def count_tokens(text: str) -> int:
    return len(_ENC.encode(text))


def _heading_len_ok(s: str) -> bool:
    # single-level "2. Foo bar" headings are short; longer ones are usually footnotes.
    words = len(s.split())
    return words <= (8 if re.match(r"^(\d+|[IVX]+|[A-D])\.\s", s) else 12)


def _is_debris(text: str) -> bool:
    """Numeric tables / garbled equations: too few letters."""
    return sum(c.isalpha() for c in text) / max(1, len(text)) < 0.6


def _hard_split(sentence: str) -> list[str]:
    words, out, cur = sentence.split(), [], []
    for w in words:
        cur.append(w)
        if len(cur) >= 180:
            out.append(" ".join(cur)); cur = []
    return out + ([" ".join(cur)] if cur else [])


def split_sections(text: str, title: str) -> list[tuple[str, str]]:
    """Return [(section_heading, body)] using heading lines; falls back to one section."""
    sections: list[tuple[str, list[str]]] = [("Abstract" if "abstract" in text[:1500].lower() else title, [])]
    for line in text.splitlines():
        s = line.strip()
        if _HEADING_RE.match(s) and _heading_len_ok(s):
            sections.append((s.rstrip("."), []))
        else:
            sections[-1][1].append(s)
    out = [(h, " ".join(b).strip()) for h, b in sections]
    return [(h, b) for h, b in out if len(b) > 80]


def _sentences(body: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+(?=[A-Z(“\"])", body) if s.strip()]


def chunk_document(text: str, title: str) -> list[Chunk]:
    chunks: list[Chunk] = []
    for heading, body in split_sections(text, title):
        path = f"{title} > {heading}"
        buf: list[str] = []
        tokens = 0
        sents = [x for s_ in _sentences(body) for x in (_hard_split(s_) if count_tokens(s_) > MAX_TOKENS else [s_])]
        for sent in sents:
            t = count_tokens(sent)
            if buf and tokens + t > TARGET_TOKENS:
                chunks.append(Chunk(len(chunks), path, " ".join(buf), tokens))
                buf, tokens = buf[-1:], count_tokens(buf[-1])  # 1-sentence overlap
            buf.append(sent)
            tokens += t
            if tokens > MAX_TOKENS:  # a single huge "sentence" (garbled equation blob): flush it
                chunks.append(Chunk(len(chunks), path, " ".join(buf), tokens))
                buf, tokens = [], 0
        if buf and tokens > 40:
            chunks.append(Chunk(len(chunks), path, " ".join(buf), tokens))
    kept = [c for c in chunks if not _is_debris(c.content)]
    for i, c in enumerate(kept):
        c.index = i
    return kept
