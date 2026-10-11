import re
from typing import Optional

import httpx

from app.services.cache import Cache

API = "https://api.mangadex.org"
UPLOADS = "https://uploads.mangadex.org"
# MangaDex rejects requests without an identifying User-Agent.
HEADERS = {"User-Agent": "OtakuVault/0.1 (personal catalogue)"}
RATINGS = ["safe", "suggestive", "erotica", "pornographic"]
COVER_PATH = re.compile(r"^/covers/[0-9a-f-]{36}/[\w.-]+$")
MAX_IMAGE_BYTES = 15 * 1024 * 1024

_covers_cache = Cache(ttl=6 * 60 * 60, max_size=300)


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _all_titles(attrs: dict) -> list[str]:
    titles = list((attrs.get("title") or {}).values())
    for alt in attrs.get("altTitles") or []:
        titles.extend(alt.values())
    return titles


async def _find_manga(client: httpx.AsyncClient, anilist_id: int, titles: list[str]) -> Optional[dict]:
    """MangaDex entry for an AniList id, matched via its AniList link, or by exact title as a fallback."""
    wanted = {_norm(t) for t in titles if t}
    fallback = None
    for title in titles[:3]:
        res = await client.get(
            f"{API}/manga",
            params={"title": title, "limit": 10, "contentRating[]": RATINGS},
        )
        res.raise_for_status()
        for manga in res.json().get("data", []):
            attrs = manga.get("attributes", {})
            if str((attrs.get("links") or {}).get("al")) == str(anilist_id):
                return manga
            if fallback is None and not (attrs.get("links") or {}).get("al"):
                if wanted & {_norm(t) for t in _all_titles(attrs)}:
                    fallback = manga
    return fallback


async def mangadex_covers(anilist_id: int, titles: list[str]) -> dict:
    key = ("mangadex-covers", anilist_id)
    cached = _covers_cache.get(key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=10.0, headers=HEADERS) as client:
        manga = await _find_manga(client, anilist_id, titles)
        if manga is None:
            result = {"manga_id": None, "content_rating": None, "covers": []}
            _covers_cache.set(key, result)
            return result

        manga_id = manga["id"]
        covers: list[dict] = []
        offset = 0
        while True:
            res = await client.get(
                f"{API}/cover",
                params={"manga[]": manga_id, "limit": 100, "offset": offset, "order[volume]": "asc"},
            )
            res.raise_for_status()
            body = res.json()
            for cover in body.get("data", []):
                attrs = cover.get("attributes", {})
                file_name = attrs.get("fileName")
                if not file_name:
                    continue
                covers.append(
                    {
                        "id": cover["id"],
                        "volume": attrs.get("volume"),
                        "locale": attrs.get("locale"),
                        "full_url": f"{UPLOADS}/covers/{manga_id}/{file_name}",
                        "thumb_url": f"{UPLOADS}/covers/{manga_id}/{file_name}.512.jpg",
                    }
                )
            offset += 100
            if offset >= min(body.get("total", 0), 500):
                break

    result = {
        "manga_id": manga_id,
        "content_rating": manga.get("attributes", {}).get("contentRating"),
        "covers": covers,
    }
    _covers_cache.set(key, result)
    return result


ANILIST_PATH = re.compile(r"^/file/anilistcdn/[\w/.-]+$")


def is_cover_url(url: str) -> bool:
    parsed = httpx.URL(url)
    if parsed.scheme != "https":
        return False
    if parsed.host == "uploads.mangadex.org":
        return bool(COVER_PATH.match(parsed.path))
    return parsed.host == "s4.anilist.co" and bool(ANILIST_PATH.match(parsed.path))


async def fetch_cover(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=20.0, headers=HEADERS, follow_redirects=False) as client:
        async with client.stream("GET", url) as res:
            res.raise_for_status()
            content_type = res.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                raise ValueError("Not an image")
            data = bytearray()
            async for chunk in res.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_IMAGE_BYTES:
                    raise ValueError("Image too large")
            return bytes(data), content_type
