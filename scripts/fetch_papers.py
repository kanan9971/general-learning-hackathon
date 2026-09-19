"""Download research-paper PDFs from the YAML manifest into content/raw/.

Skips files that already exist and start with %PDF. Refuses to write HTML/XML error pages.
Run from repo root:  python scripts/fetch_papers.py
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "content" / "sources" / "research_papers.yaml"
DEFAULT_OUT = ROOT / "content" / "raw"
USER_AGENT = "Mozilla/5.0 (compatible; DeskReady-ingest/1.0; educational)"
PDF_MAGIC = b"%PDF-"


def load_entries(manifest: Path) -> list[dict]:
    data = yaml.safe_load(manifest.read_text(encoding="utf-8"))
    out = []
    for d in data["documents"]:
        merged = {**data.get("defaults", {}), **d}
        if not merged.get("pdf_url") or not merged.get("local_file"):
            raise ValueError(f"{merged.get('id', '?')}: missing pdf_url or local_file")
        out.append(merged)
    return out


def is_pdf(path: Path) -> bool:
    if not path.is_file() or path.stat().st_size < 8:
        return False
    with path.open("rb") as f:
        return f.read(5) == PDF_MAGIC


def fetch(url: str, dest: Path, timeout: int) -> None:
    req = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,*/*"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
    if not body.startswith(PDF_MAGIC):
        kind = "html" if body.lstrip()[:5].lower() in (b"<!doc", b"<html") else "non-pdf"
        raise RuntimeError(f"got {kind} ({len(body)} bytes), not a PDF")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".tmp")
    tmp.write_bytes(body)
    tmp.replace(dest)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--timeout", type=int, default=60)
    args = ap.parse_args()

    entries = load_entries(args.manifest)
    ok = skipped = failed = 0
    failures: list[str] = []
    for d in entries:
        dest = args.out_dir / d["local_file"]
        if is_pdf(dest):
            skipped += 1
            print(f"SKIP {d['id']} ({dest.name} already a PDF)")
            continue
        try:
            fetch(d["pdf_url"], dest, args.timeout)
            ok += 1
            print(f"OK   {d['id']} -> {dest.name} ({dest.stat().st_size} bytes)")
        except Exception as e:  # noqa: BLE001 - report and continue; never write garbage
            failed += 1
            failures.append(f"{d['id']}: {e}")
            print(f"FAIL {d['id']}: {e}")
            if dest.exists() and not is_pdf(dest):
                dest.unlink()

    print(f"\nfetched={ok} skipped={skipped} failed={failed} total={len(entries)}")
    if failures:
        print("failures:")
        for f in failures:
            print(" -", f)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
