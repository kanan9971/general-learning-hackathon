"""Ingest CLI: manifest -> extract -> clean -> chunk -> (embed -> store).

  python -m app.rag.ingest ../content/sources/research_papers.yaml            # dry run (default)
  python -m app.rag.ingest ../content/sources/research_papers.yaml --store    # embed + write to Supabase
"""
import argparse
import hashlib
import json
from pathlib import Path

import yaml

from .chunk import chunk_document
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


def build_document(meta: dict, raw_dir: Path) -> tuple[dict, list[dict]]:
    pages = extract_pages(raw_dir / meta["local_file"])
    text = clean_pages(pages)
    chunks = chunk_document(text, meta["title"])
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
    return doc, rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", type=Path)
    ap.add_argument("--raw-dir", type=Path, default=Path("../content/raw"))
    ap.add_argument("--out-dir", type=Path, default=Path("../content/processed"))
    ap.add_argument("--store", action="store_true", help="embed and write to Supabase")
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    for meta in load_manifest(args.manifest):
        doc, rows = build_document(meta, args.raw_dir)
        flagged = sum(r["injection_flag"] for r in rows)
        toks = [r["token_count"] for r in rows]
        print(f"{doc['id']}: {len(rows)} chunks, tokens min/avg/max = "
              f"{min(toks)}/{sum(toks)//len(toks)}/{max(toks)}, injection-flagged={flagged}")
        (args.out_dir / f"{doc['id']}.jsonl").write_text(
            "\n".join(json.dumps(r) for r in rows) + "\n"
        )
        if args.store:
            from ..db.client import service_client
            from ..db.knowledge import upsert_document
            from ..llm.embed import embed_texts

            embs = embed_texts([f"{r['section_path']}\n{r['content']}" for r in rows])
            for r, e in zip(rows, embs):
                r["embedding"] = e
            upsert_document(service_client(), doc, rows)
            print(f"  stored {doc['id']}")


if __name__ == "__main__":
    main()
