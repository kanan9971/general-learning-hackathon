"""PDF -> raw page texts. Extraction only; cleaning lives in clean.py."""
import logging
from pathlib import Path

from pypdf import PdfReader

logging.getLogger("pypdf").setLevel(logging.CRITICAL)


class ScannedPdfError(ValueError):
    """PDF has no text layer (needs OCR); we refuse rather than embed garbage."""


def extract_pages(path: Path) -> list[str]:
    pages = [(p.extract_text() or "") for p in PdfReader(str(path)).pages]
    if sum(len(p.strip()) for p in pages) < 200 * max(1, len(pages)) * 0.1:
        raise ScannedPdfError(f"{path.name}: no usable text layer (scanned image?)")
    return pages
