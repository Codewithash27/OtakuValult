import httpx

from app.services.cache import Cache
from app.services.image_proxy import HEADERS

API = "https://kitsu.io/api/edge"

_cache = Cache(ttl=6 * 60 * 60, max_size=300)


async def kitsu_images(anilist_id: int, kind: str) -> dict:
    """Poster and wide cover Kitsu has for an AniList title (18+ titles are hidden by Kitsu for guests)."""
    key = ("kitsu", kind, anilist_id)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    async with httpx.AsyncClient(timeout=10.0, headers={**HEADERS, "Accept": "application/vnd.api+json"}) as client:
        res = await client.get(
            f"{API}/mappings",
            params={"filter[externalSite]": f"anilist/{kind}", "filter[externalId]": anilist_id, "include": "item"},
        )
        res.raise_for_status()
        included = res.json().get("included") or []

    result: dict = {"kitsu_id": None, "age_rating": None, "images": []}
    if included:
        item = included[0]
        attrs = item.get("attributes") or {}
        result["kitsu_id"] = item.get("id")
        result["age_rating"] = attrs.get("ageRating")
        for kind_name, field in (("poster", "posterImage"), ("cover", "coverImage")):
            image = attrs.get(field) or {}
            full = image.get("original") or image.get("large")
            if full:
                result["images"].append(
                    {"kind": kind_name, "full_url": full, "thumb_url": image.get("large") or image.get("small") or full}
                )

    _cache.set(key, result)
    return result
