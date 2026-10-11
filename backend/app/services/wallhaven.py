import httpx

from app.services.cache import Cache
from app.services.image_proxy import HEADERS

API = "https://wallhaven.cc/api/v1/search"
ANIME_CATEGORY = "010"
# 100 = SFW only, 110 = SFW + sketchy. NSFW (xx1) needs a personal API key and is never requested.
PURITY = {True: "100", False: "110"}

_cache = Cache(ttl=60 * 60, max_size=300)


async def search_wallpapers(titles: list[str], sfw_only: bool, page: int) -> dict:
    """Anime wallpapers for a title, trying each known title until one has results."""
    key = ("wallhaven", tuple(t.lower() for t in titles), sfw_only, page)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    result = {"query": None, "page": page, "last_page": 0, "total": 0, "wallpapers": []}
    async with httpx.AsyncClient(timeout=10.0, headers=HEADERS) as client:
        for title in titles:
            res = await client.get(
                API,
                params={
                    "q": f'"{title}"',
                    "categories": ANIME_CATEGORY,
                    "purity": PURITY[sfw_only],
                    "sorting": "relevance",
                    "page": page,
                },
            )
            res.raise_for_status()
            body = res.json()
            data = body.get("data") or []
            if not data:
                continue
            meta = body.get("meta") or {}
            result = {
                "query": title,
                "page": meta.get("current_page", page),
                "last_page": meta.get("last_page", 1),
                "total": meta.get("total", len(data)),
                "wallpapers": [
                    {
                        "id": w["id"],
                        "purity": w.get("purity"),
                        "resolution": w.get("resolution"),
                        "full_url": w["path"],
                        "thumb_url": (w.get("thumbs") or {}).get("large") or w["path"],
                        "page_url": w.get("url"),
                        "source": w.get("source") or None,
                    }
                    for w in data
                    if w.get("path") and w.get("purity") != "nsfw"
                ],
            }
            break

    _cache.set(key, result)
    return result
