from typing import Optional

import httpx
from fastapi import APIRouter, Header, HTTPException, Query
from fastapi.responses import Response

from app.services.gelbooru import GelbooruAuthError, search_posts
from app.services.image_proxy import fetch_image, is_allowed_image_url
from app.services.kitsu import kitsu_images
from app.services.mangadex import mangadex_covers
from app.services.wallhaven import search_wallpapers

router = APIRouter()


def _clean_titles(title: list[str]) -> list[str]:
    titles = [t.strip()[:150] for t in title if t.strip()][:3]
    if not titles:
        raise HTTPException(status_code=422, detail="At least one title is required")
    return titles


@router.get("/images/mangadex")
async def mangadex_cover_list(
    anilist_id: int = Query(..., gt=0),
    title: list[str] = Query(default=[]),
) -> dict:
    """Volume covers MangaDex has for an AniList title."""
    titles = _clean_titles(title)
    try:
        return await mangadex_covers(anilist_id, titles)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="MangaDex is not responding")


@router.get("/images/wallhaven")
async def wallhaven_list(
    title: list[str] = Query(default=[]),
    sfw_only: bool = Query(True),
    page: int = Query(1, ge=1, le=50),
) -> dict:
    """Anime wallpapers from Wallhaven (SFW, plus "sketchy" when sfw_only is false)."""
    titles = _clean_titles(title)
    try:
        return await search_wallpapers(titles, sfw_only, page)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Wallhaven is not responding")


@router.get("/images/kitsu")
async def kitsu_list(
    anilist_id: int = Query(..., gt=0),
    kind: str = Query(..., pattern="^(anime|manga)$"),
) -> dict:
    """Poster and cover art Kitsu has for an AniList title."""
    try:
        return await kitsu_images(anilist_id, kind)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Kitsu is not responding")


@router.get("/images/gelbooru")
async def gelbooru_list(
    title: list[str] = Query(default=[]),
    rating: Optional[str] = Query(None, pattern="^(general|sensitive|questionable|explicit)$"),
    page: int = Query(1, ge=1, le=100),
    x_gelbooru_user: str = Header(..., max_length=20, pattern=r"^\d+$"),
    x_gelbooru_key: str = Header(..., max_length=200, pattern=r"^[0-9a-fA-F]+$"),
) -> dict:
    """Gelbooru posts for a title's series tag, using the caller's own Gelbooru API key."""
    titles = _clean_titles(title)
    try:
        return await search_posts(titles, rating, page, x_gelbooru_user, x_gelbooru_key)
    except GelbooruAuthError:
        raise HTTPException(status_code=401, detail="Gelbooru rejected the user ID or API key")
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Gelbooru is not responding")


@router.get("/images/proxy")
async def proxy_image(url: str = Query(..., max_length=300)) -> Response:
    """Image bytes from an allowed source, for images browsers can't download directly (no CORS)."""
    if not is_allowed_image_url(url):
        raise HTTPException(status_code=400, detail="Only images from the finder's sources are allowed")
    try:
        data, content_type = await fetch_image(url)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code if e.response.status_code == 404 else 502)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Could not fetch image")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )
