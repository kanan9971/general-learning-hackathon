"""Clean extracted paper text and flag prompt-injection-like content."""
import re
from collections import Counter

INJECTION_PATTERNS = [
    r"ignore (all |any )?(previous|prior|above) (instructions|prompts)",
    r"disregard (the )?(system|previous) (prompt|instructions)",
    r"you are now\b",
    r"system prompt",
    r"reveal (your|the) (instructions|prompt|secrets?)",
]
_INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.I)
_REFS_RE = re.compile(r"^\s*(references|bibliography)\s*$", re.I)


def has_injection(text: str) -> bool:
    return bool(_INJECTION_RE.search(text))


def _strip_repeated_lines(pages: list[str]) -> list[list[str]]:
    """Drop running headers/footers: short lines repeated on many pages, and bare page numbers."""
    split = [[ln.strip() for ln in p.splitlines()] for p in pages]
    key = lambda ln: re.sub(r"\d+", "#", ln)  # "2144 The Journal of Finance" ~ "2146 ..."
    counts = Counter(key(ln) for lines in split for ln in set(map(key, lines)) if 0 < len(ln) < 80)
    threshold = max(3, int(len(pages) * 0.3))
    repeated = {k for k, c in counts.items() if c >= threshold}
    return [
        [ln for ln in lines if ln and key(ln) not in repeated and not re.fullmatch(r"\d{1,3}", ln)]
        for lines in split
    ]


def _is_prose(line: str) -> bool:
    """Heuristic: drop equation/table debris (mostly digits or symbols)."""
    letters = sum(c.isalpha() for c in line)
    return len(line) < 4 or letters / len(line) >= 0.55


def clean_pages(pages: list[str]) -> str:
    """Return cleaned full text: no headers/footers, no references, dehyphenated, prose lines only."""
    lines = [ln for page in _strip_repeated_lines(pages) for ln in page]
    # Cut the reference list: last standalone "References" heading in the back half.
    for i in range(len(lines) - 1, len(lines) // 2, -1):
        if _REFS_RE.match(lines[i]):
            lines = lines[:i]
            break
    kept = [ln for ln in lines if _is_prose(ln) or re.match(r"^(\d+(\.\d+)*\.?|[IVX]+\.)\s", ln)]
    text = "\n".join(kept)
    text = re.sub(r"-\n(?=[a-z])", "", text)  # de-hyphenate line-broken words
    return text.replace("\x00", "")
