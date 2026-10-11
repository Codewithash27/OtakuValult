import asyncio
import re
from typing import Any

import httpx
from ddgs import DDGS
from ddgs.exceptions import DDGSException

from app.services.image_proxy import register_search_image_urls

# Public SearXNG instances (no API key). Used if DDGS returns nothing.
SEARX_INSTANCES = (
    "https://searx.be",
    "https://search.ononoki.org",
    "https://opensearch.voyageur.dev",
)
UA = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}


async def web_image_search_providers() -> dict[str, bool]:
    return {
        "free": True,
        "ddgs": True,
        "searxng": True,
        "active": "free",
    }


async def web_image_search_configured() -> bool:
    return True


def _strip_quotes(query: str) -> str:
    return re.sub(r'["\']', "", query).strip()


def _ddgs_images_sync(
    query: str,
    *,
    safe: bool,
    page: int,
    max_results: int = 10,
) -> list[dict[str, Any]]:
    """DDGS metasearch — no API keys (DuckDuckGo / Bing HTML backends)."""
    q = _strip_quotes(query)[:200]
    safesearch = "moderate" if safe else "off"
    with DDGS(timeout=25) as ddgs:
        return list(
            ddgs.images(
                q,
                region="us-en",
                safesearch=safesearch,
                max_results=max_results,
                page=page,
                backend="auto",
            )
        )


def _query_variants(query: str, *, safe: bool) -> list[str]:
    q = _strip_quotes(query).strip()
    if not q:
        return []
    variants = [q]
    lower = q.lower()
    if not safe:
        if "adult" not in lower and "manhwa" in lower:
            variants.append(f"{q} adult")
        if "read" not in lower and "panel" not in lower:
            variants.append(f"{q} read chapter")
    return list(dict.fromkeys(variants))[:3]


def _map_hits(
    hits: list[dict[str, Any]],
    *,
    start: int,
    query: str,
    page: int,
    provider: str,
    id_prefix: str,
) -> dict[str, Any]:
    items: list[dict[str, Any]] = []
    register: list[str] = []
    for i, hit in enumerate(hits):
        link = (hit.get("image") or hit.get("img_src") or hit.get("url") or "").strip()
        thumb = (hit.get("thumbnail") or hit.get("thumbnail_src") or link).strip()
        if link.startswith("http://"):
            link = "https://" + link[7:]
        if thumb.startswith("http://"):
            thumb = "https://" + thumb[7:]
        if not link.startswith("https://"):
            continue
        register.extend([link, thumb])
        items.append(
            {
                "id": f"{id_prefix}-{start}-{i}",
                "title": hit.get("title") or "Image",
                "page_url": hit.get("url"),
                "file_url": link,
                "thumb_url": thumb,
                "width": hit.get("width"),
                "height": hit.get("height"),
            }
        )
    register_search_image_urls(register)
    total = len(items) + (page - 1) * 10 + (10 if len(items) >= 10 else 0)
    return {
        "configured": True,
        "provider": provider,
        "query": query,
        "page": page,
        "total": total,
        "items": items,
    }


async def _search_ddgs(query: str, *, safe: bool, start: int) -> dict[str, Any] | None:
    page = max(1, (start - 1) // 10 + 1)
    per_query = 15 if page == 1 and start == 1 else 10
    try:
        if page == 1 and start == 1:
            merged: list[dict[str, Any]] = []
            seen: set[str] = set()
            for variant in _query_variants(query, safe=safe):
                batch = await asyncio.to_thread(
                    _ddgs_images_sync,
                    variant,
                    safe=safe,
                    page=1,
                    max_results=per_query,
                )
                for hit in batch:
                    link = (hit.get("image") or hit.get("url") or "").strip()
                    if link.startswith("http://"):
                        link = "https://" + link[7:]
                    if not link.startswith("https://") or link in seen:
                        continue
                    seen.add(link)
                    merged.append(hit)
            raw = merged[:30]
        else:
            raw = await asyncio.to_thread(
                _ddgs_images_sync,
                query,
                safe=safe,
                page=page,
                max_results=per_query,
            )
    except DDGSException:
        return None
    if not raw:
        return None
    return _map_hits(raw, start=start, query=query, page=page, provider="free", id_prefix="f")


async def _search_searxng(query: str, *, safe: bool, start: int) -> dict[str, Any] | None:
    page = max(1, (start - 1) // 10 + 1)
    q = query.strip()[:200]
    params = {
        "q": q,
        "categories": "images",
        "format": "json",
        "pageno": page,
        "safesearch": "1" if safe else "0",
    }
    async with httpx.AsyncClient(timeout=18.0, headers=UA, follow_redirects=True) as client:
        for base in SEARX_INSTANCES:
            try:
                res = await client.get(f"{base.rstrip('/')}/search", params=params)
                if res.status_code >= 400:
                    continue
                data = res.json()
                hits = [h for h in (data.get("results") or []) if h.get("img_src") or h.get("thumbnail_src")]
                if hits:
                    return _map_hits(hits[:20], start=start, query=query, page=page, provider="searxng", id_prefix="s")
            except (httpx.HTTPError, ValueError, KeyError):
                continue
    return None


async def search_web_images(query: str, *, safe: bool, start: int = 1) -> dict[str, Any]:
    """Gallery web image search — free DDGS (no keys), then public SearXNG."""
    q = query.strip()
    if len(q) < 2:
        return {"configured": True, "provider": None, "query": q, "page": 1, "total": 0, "items": []}

    primary = await _search_ddgs(q, safe=safe, start=start)
    if primary and primary.get("items"):
        return primary

    fallback = await _search_searxng(q, safe=safe, start=start)
    if fallback and fallback.get("items"):
        return fallback

    if primary:
        return primary

    return {
        "configured": True,
        "provider": "free",
        "query": q,
        "page": max(1, (start - 1) // 10 + 1),
        "total": 0,
        "items": [],
    }
