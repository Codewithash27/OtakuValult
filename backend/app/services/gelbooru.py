import hashlib
import re
from typing import Optional

import httpx

from app.services.cache import Cache
from app.services.image_proxy import HEADERS

API = "https://gelbooru.com/index.php"
PAGE_SIZE = 40
COPYRIGHT_TYPE = 3
RATINGS = ("general", "sensitive", "questionable", "explicit")
IMAGE_EXT = re.compile(r"\.(jpe?g|png|gif|webp)$", re.IGNORECASE)

# Posts carrying any of these tags are never returned, whatever the user's settings.
BLOCKED_TAGS = frozenset(
    {
        "loli",
        "lolicon",
        "shota",
        "shotacon",
        "child",
        "children",
        "toddler",
        "baby",
        "infant",
        "kindergarten",
        "elementary_school",
        "elementary_school_student",
        "aged_down",
        "underage",
        "young",
        "young_girl",
        "young_boy",
        "child_on_child",
        "oppai_loli",
    }
)
QUERY_EXCLUSIONS = "-loli -shota -child -toddler -aged_down"

_tag_cache = Cache(ttl=24 * 60 * 60, max_size=500)
_post_cache = Cache(ttl=30 * 60, max_size=300)


class GelbooruAuthError(Exception):
    pass


async def _get(client: httpx.AsyncClient, params: dict) -> dict:
    res = await client.get(API, params={"page": "dapi", "q": "index", "json": "1", **params})
    if res.status_code in (401, 403):
        raise GelbooruAuthError()
    res.raise_for_status()
    try:
        return res.json() or {}
    except ValueError:
        return {}


def _to_tag(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", title.lower()).strip("_")


async def _find_copyright_tag(client: httpx.AsyncClient, titles: list[str], auth: dict) -> Optional[str]:
    """The Gelbooru series tag for a title: an exact tag first, then the most used series tag containing it."""
    for title in titles:
        name = _to_tag(title)
        if len(name) < 3:
            continue
        key = ("gelbooru-tag", name)
        cached = _tag_cache.get(key)
        if cached is not None:
            if cached:
                return cached
            continue
        body = await _get(client, {"s": "tag", "name_pattern": f"%{name}%", "orderby": "count", "limit": 10, **auth})
        tags = [t for t in body.get("tag") or [] if t.get("type") == COPYRIGHT_TYPE and t.get("count", 0) > 0]
        exact = next((t["name"] for t in tags if t["name"] == name), None)
        found = exact or (tags[0]["name"] if tags else "")
        _tag_cache.set(key, found)
        if found:
            return found
    return None


async def search_posts_by_tag_query(
    tag_query: str, rating: Optional[str], page: int, user_id: str, api_key: str
) -> dict:
    """Gelbooru search with a raw tag string (e.g. change_wife manhwa rating:explicit)."""
    auth = {"user_id": user_id, "api_key": api_key}
    owner = hashlib.sha256(f"{user_id}:{api_key}".encode()).hexdigest()[:16]
    key = ("gelbooru-tag-query", owner, tag_query, rating, page)
    cached = _post_cache.get(key)
    if cached is not None:
        return cached

    query = f"{tag_query.strip()} {QUERY_EXCLUSIONS}" + (f" rating:{rating}" if rating else "")
    async with httpx.AsyncClient(timeout=12.0, headers=HEADERS) as client:
        body = await _get(client, {"s": "post", "tags": query, "limit": PAGE_SIZE, "pid": page - 1, **auth})

    posts = []
    for p in body.get("post") or []:
        file_url = p.get("file_url") or ""
        if not IMAGE_EXT.search(file_url) or BLOCKED_TAGS.intersection((p.get("tags") or "").split()):
            continue
        posts.append(
            {
                "id": p["id"],
                "rating": p.get("rating"),
                "width": p.get("width"),
                "height": p.get("height"),
                "file_url": file_url,
                "sample_url": p.get("sample_url") or None,
                "thumb_url": p.get("preview_url") or p.get("sample_url") or file_url,
                "source": p.get("source") or None,
            }
        )
    result = {
        "tag": tag_query.strip(),
        "total": int((body.get("@attributes") or {}).get("count", 0)),
        "page": page,
        "posts": posts,
    }
    _post_cache.set(key, result)
    return result


def tag_query_from_titles(titles: list[str], media_hint: str | None = None) -> str:
    """Build a Gelbooru tag query from a manhwa/manga title."""
    parts: list[str] = []
    for title in titles[:2]:
        tag = _to_tag(title)
        if len(tag) >= 3:
            parts.append(tag)
    if media_hint == "manhwa" and "manhwa" not in parts:
        parts.append("manhwa")
    return " ".join(parts) if parts else ""


async def search_posts(titles: list[str], rating: Optional[str], page: int, user_id: str, api_key: str) -> dict:
    auth = {"user_id": user_id, "api_key": api_key}
    async with httpx.AsyncClient(timeout=12.0, headers=HEADERS) as client:
        tag = await _find_copyright_tag(client, titles, auth)
        if not tag:
            return {"tag": None, "total": 0, "page": page, "posts": []}

        # Keyed by credentials so a cached page is never served to a caller with an unchecked key.
        owner = hashlib.sha256(f"{user_id}:{api_key}".encode()).hexdigest()[:16]
        key = ("gelbooru-posts", owner, tag, rating, page)
        cached = _post_cache.get(key)
        if cached is not None:
            return cached

        query = f"{tag} {QUERY_EXCLUSIONS}" + (f" rating:{rating}" if rating else "")
        body = await _get(client, {"s": "post", "tags": query, "limit": PAGE_SIZE, "pid": page - 1, **auth})

    posts = []
    for p in body.get("post") or []:
        file_url = p.get("file_url") or ""
        if not IMAGE_EXT.search(file_url) or BLOCKED_TAGS.intersection((p.get("tags") or "").split()):
            continue
        posts.append(
            {
                "id": p["id"],
                "rating": p.get("rating"),
                "width": p.get("width"),
                "height": p.get("height"),
                "file_url": file_url,
                "sample_url": p.get("sample_url") or None,
                "thumb_url": p.get("preview_url") or p.get("sample_url") or file_url,
                "source": p.get("source") or None,
            }
        )
    result = {
        "tag": tag,
        "total": int((body.get("@attributes") or {}).get("count", 0)),
        "page": page,
        "posts": posts,
    }
    _post_cache.set(key, result)
    return result
