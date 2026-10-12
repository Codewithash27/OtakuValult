"""Index catalogue documents and synopses with NVIDIA Embedding API.

Generates 2048-dimensional embeddings for catalogue titles and synopses,
saving them to a high-speed local vector index (backend/data/catalogue_embeddings.npz)
and optionally syncing to Supabase pgvector if credentials are configured.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from pathlib import Path
from typing import Any

import httpx
import numpy as np
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BACKEND_DIR / "data"
load_dotenv(BACKEND_DIR / ".env")

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "").strip()
EMBED_MODEL = "nvidia/nemotron-3-embed-1b"
EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings"
OUTPUT_NPZ = DATA_DIR / "catalogue_embeddings.npz"
OUTPUT_META = DATA_DIR / "catalogue_embeddings_meta.json"


def prepare_passage(item: dict[str, Any]) -> str:
    """Format title, tags, creators, and synopsis into an enriched searchable text passage."""
    title = str(item.get("title") or "").strip()
    alt_titles = ", ".join(str(t) for t in (item.get("alternativeTitles") or []) if t)
    
    tags = []
    for t in item.get("genreTags") or []:
        if isinstance(t, dict) and t.get("name"):
            tags.append(t["name"])
        elif isinstance(t, str):
            tags.append(t)
    tag_str = ", ".join(tags)

    creators = []
    for c in item.get("creators") or []:
        if isinstance(c, dict) and c.get("canonicalName"):
            creators.append(c["canonicalName"])
    for a in (item.get("authors") or []) + (item.get("artists") or []):
        if a and isinstance(a, str):
            creators.append(a)
    creator_str = ", ".join(list(dict.fromkeys(creators)))

    desc = str(item.get("description") or "").strip()
    year = item.get("releaseYear")
    status = item.get("status")
    rating_data = item.get("ratingAggregate") or {}
    avg_rating = rating_data.get("averageRating")

    parts = [f"Title: {title}"]
    if alt_titles:
        parts.append(f"Alternative Titles: {alt_titles}")
    if tag_str:
        parts.append(f"Genres & Tags: {tag_str}")
    if creator_str:
        parts.append(f"Creators: {creator_str}")
    if year:
        parts.append(f"Release Year: {year}")
    if status:
        parts.append(f"Status: {status}")
    if avg_rating is not None:
        parts.append(f"Rating: {avg_rating}/5")
    if desc:
        # Cap description to ~2500 chars to fit context window comfortably
        clean_desc = desc[:2500]
        parts.append(f"Synopsis: {clean_desc}")

    return "\n".join(parts)


def get_embeddings_batch(client: httpx.Client, texts: list[str], max_retries: int = 3) -> list[list[float]]:
    """Fetch embeddings for a batch of passages from NVIDIA NIM."""
    payload = {
        "model": EMBED_MODEL,
        "input": texts,
        "input_type": "passage",
    }
    headers = {
        "Authorization": f"Bearer {NVIDIA_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    for attempt in range(max_retries):
        try:
            res = client.post(EMBED_URL, headers=headers, json=payload, timeout=60.0)
            if res.status_code == 200:
                data = res.json()
                items = data.get("data", [])
                items.sort(key=lambda x: x.get("index", 0))
                return [x["embedding"] for x in items]
            elif res.status_code == 429:
                wait_time = 2.0 * (attempt + 1)
                logger.warning("Rate limited (429). Backing off for %.1f s...", wait_time)
                time.sleep(wait_time)
            else:
                logger.error("Embedding API error (%d): %s", res.status_code, res.text)
                time.sleep(1.0)
        except Exception as e:
            logger.error("Request exception on attempt %d: %s", attempt + 1, e)
            time.sleep(1.5)

    raise RuntimeError(f"Failed to get embeddings after {max_retries} attempts.")


def run_indexing(limit: int | None = None, batch_size: int = 25) -> None:
    if not NVIDIA_API_KEY:
        logger.error("NVIDIA_API_KEY is not set in backend/.env!")
        sys.exit(1)

    export_path = DATA_DIR / "pornhwa-export.json"
    if not export_path.is_file():
        logger.error("Export file not found at %s", export_path)
        sys.exit(1)

    logger.info("Loading catalogue export from %s...", export_path)
    with export_path.open("r", encoding="utf-8") as f:
        catalogue = json.load(f)

    all_items = catalogue.get("pornhwa") or []
    if limit:
        all_items = all_items[:limit]

    total = len(all_items)
    logger.info("Indexing %d items with model '%s' in batches of %d...", total, EMBED_MODEL, batch_size)

    # Check for existing partial index to support resume
    vectors: list[list[float]] = []
    metadata: list[dict[str, Any]] = []

    if OUTPUT_NPZ.is_file() and OUTPUT_META.is_file():
        try:
            existing_data = np.load(OUTPUT_NPZ)
            existing_vecs = existing_data["embeddings"]
            with OUTPUT_META.open("r", encoding="utf-8") as mf:
                existing_meta = json.load(mf)
            if len(existing_vecs) == len(existing_meta) and len(existing_meta) <= total:
                logger.info("Found existing index with %d items. Resuming...", len(existing_meta))
                vectors = existing_vecs.tolist()
                metadata = existing_meta
        except Exception as e:
            logger.warning("Could not load partial index: %s. Starting fresh.", e)

    start_idx = len(metadata)
    client = httpx.Client()

    try:
        for i in range(start_idx, total, batch_size):
            chunk = all_items[i : i + batch_size]
            passages = [prepare_passage(item) for item in chunk]
            
            logger.info("Embedding items %d to %d of %d (%.1f%%)...", i + 1, min(i + batch_size, total), total, (i / total) * 100)
            batch_vectors = get_embeddings_batch(client, passages)

            for item, passage, vec in zip(chunk, passages, batch_vectors):
                tags = []
                for t in item.get("genreTags") or []:
                    if isinstance(t, dict) and t.get("name"):
                        tags.append(t["name"])
                    elif isinstance(t, str):
                        tags.append(t)
                
                rating_data = item.get("ratingAggregate") or {}
                meta = {
                    "slug": str(item.get("slug") or ""),
                    "title": str(item.get("title") or "Untitled"),
                    "coverImage": item.get("coverImage"),
                    "description": item.get("description"),
                    "tags": tags,
                    "releaseYear": item.get("releaseYear"),
                    "status": item.get("status"),
                    "totalChapters": item.get("totalChapters"),
                    "averageRating": rating_data.get("averageRating"),
                    "passage": passage,
                    "isAdult": True,
                }
                vectors.append(vec)
                metadata.append(meta)

            # Checkpoint save every 100 items or at the end
            if (len(metadata) % 100 == 0) or (len(metadata) == total):
                arr = np.array(vectors, dtype=np.float32)
                np.savez_compressed(OUTPUT_NPZ, embeddings=arr)
                with OUTPUT_META.open("w", encoding="utf-8") as mf:
                    json.dump(metadata, mf, ensure_ascii=False)
                logger.info("Saved checkpoint with %d indexed items.", len(metadata))

            # Small courtesy sleep between batches
            time.sleep(0.3)

    finally:
        client.close()

    arr = np.array(vectors, dtype=np.float32)
    np.savez_compressed(OUTPUT_NPZ, embeddings=arr)
    with OUTPUT_META.open("w", encoding="utf-8") as mf:
        json.dump(metadata, mf, ensure_ascii=False)

    logger.info("Done! Successfully indexed %d titles into %s (matrix shape: %s)", len(metadata), OUTPUT_NPZ, arr.shape)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Index catalogue synopses with NVIDIA Embedding API")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of items (for testing)")
    parser.add_argument("--batch-size", type=int, default=20, help="Batch size for embedding requests")
    args = parser.parse_args()

    run_indexing(limit=args.limit, batch_size=args.batch_size)
