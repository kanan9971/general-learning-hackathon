"""Ingest CLI: source -> (extract -> clean) -> chunk -> (embed -> store).

Sources: a YAML manifest of PDFs (research papers) or a directory of Markdown lessons.
  python -m app.rag.ingest ../content/sources/research_papers.yaml            # dry run (default)
  python -m app.rag.ingest ../content/lessons --store                         # embed + write to Supabase
"""
import argparse
import hashlib
import json
from pathlib import Path

import yaml

import frontmatter

from .chunk import chunk_document, chunk_markdown
from .clean import clean_pages, has_injection
from .extract import extract_pages

REQUIRED = {"id", "title", "authors", "publisher", "published_at", "source_url", "local_file", "concept_ids"}


def load_manifest(path: Path) -> list[dict]:
    data = yaml.safe_load(path.read_text())
    docs = []
    for d in data["documents"]:
        merged = {**data.get("defaults", {}), **d}
        missing = REQUIRED - merged.keys()
        if missing:
            raise ValueError(f"{merged.get('id', '?')}: missing manifest fields {sorted(missing)}")
        if not str(merged["source_url"]).startswith("http"):
            raise ValueError(f"{merged['id']}: source_url must be http(s)")
        docs.append(merged)
    return docs


LESSON_REQUIRED = {"id", "title", "source", "concept_ids", "difficulty", "trust_level"}
LESSON_DEFAULTS = {
    "layer": "foundation", "content_type": "lesson", "time_sensitivity": "evergreen",
    "region": "US", "publisher": "DeskReady", "authors": "DeskReady team",
    "published_at": None, "source_url": None,
}


def load_lessons(directory: Path) -> list[tuple[dict, str]]:
    out = []
    for path in sorted(directory.glob("*.md")):
        post = frontmatter.load(path)
        meta = {**LESSON_DEFAULTS, **post.metadata}
        missing = LESSON_REQUIRED - meta.keys()
        if missing:
            raise ValueError(f"{path.name}: missing frontmatter {sorted(missing)}")
        out.append((meta, post.content))
    return out


def build_lesson(meta: dict, body: str) -> tuple[dict, list[dict]]:
    return _assemble(meta, body, chunk_markdown(body, meta["title"]))


def build_document(meta: dict, raw_dir: Path) -> tuple[dict, list[dict]]:
    pages = extract_pages(raw_dir / meta["local_file"])
    text = clean_pages(pages)
    return _assemble(meta, text, chunk_document(text, meta["title"]))


def _assemble(meta: dict, text: str, chunks) -> tuple[dict, list[dict]]:
    checksum = hashlib.sha256(text.encode()).hexdigest()
    doc = {
        "id": meta["id"], "title": meta["title"], "source": meta["publisher"],
        "source_url": meta["source_url"], "publisher": meta["publisher"], "author": meta["authors"],
        "published_at": meta["published_at"], "content_type": meta["content_type"],
        "layer": meta["layer"], "asset_class": meta.get("asset_class"), "topics": meta.get("topics", []),
        "concept_ids": meta["concept_ids"], "difficulty": meta["difficulty"], "region": meta.get("region"),
        "market": meta.get("market"), "trust_level": meta["trust_level"],
        "time_sensitivity": meta["time_sensitivity"], "checksum": checksum,
    }
    rows = [
        {
            "document_id": meta["id"], "chunk_index": c.index, "section_path": c.section_path,
            "content": c.content, "token_count": c.token_count, "layer": meta["layer"],
            "concept_ids": meta["concept_ids"], "difficulty": meta["difficulty"],
            "trust_level": meta["trust_level"], "published_at": meta["published_at"],
            "injection_flag": has_injection(c.content),
        }
        for c in chunks
    ]
    for r in rows:
        r["content"] = (r.get("content") or "").replace("\x00", "")
    return doc, rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path, help="YAML manifest of PDFs, or a directory of Markdown lessons")
    ap.add_argument("--raw-dir", type=Path, default=Path("../content/raw"))
    ap.add_argument("--out-dir", type=Path, default=Path("../content/processed"))
    ap.add_argument("--store", action="store_true", help="embed and write to Supabase")
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    if args.source.is_dir():
        built = [build_lesson(m, body) for m, body in load_lessons(args.source)]
    else:
        built = [build_document(m, args.raw_dir) for m in load_manifest(args.source)]
    for doc, rows in built:
        if not rows:
            print(f"{doc['id']}: 0 chunks, skip")
            continue
        flagged = sum(r["injection_flag"] for r in rows)
        toks = [r["token_count"] for r in rows]
        print(f"{doc['id']}: {len(rows)} chunks, tokens min/avg/max = "
              f"{min(toks)}/{sum(toks)//len(toks)}/{max(toks)}, injection-flagged={flagged}")
        (args.out_dir / f"{doc['id']}.jsonl").write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n"
        )
        if args.store:
            from ..db.client import service_client
            from ..db.knowledge import (
                document_checksum, document_chunk_count, supports_chunk_versioning, upsert_document,
            )
            from ..llm.embed import embed_texts

            db = service_client()
            stored = document_checksum(db, doc["id"])
            n_chunks = document_chunk_count(db, doc["id"]) if stored is not None else 0
            if stored == doc["checksum"] and n_chunks:
                print(f"  skipped {doc['id']} (checksum unchanged)")
                continue
            if stored is not None and n_chunks and not supports_chunk_versioning(db):
                print(f"  skipped {doc['id']} (already in KB; apply 0007 to version)")
                continue
            embs = embed_texts([f"{r['section_path']}\n{r['content']}" for r in rows])
            for r, e in zip(rows, embs):
                r["embedding"] = e
            action = upsert_document(db, doc, rows)
            print(f"  {action} {doc['id']}")


if __name__ == "__main__":
    main()
