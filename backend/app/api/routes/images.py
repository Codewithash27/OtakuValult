import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from app.services.mangadex import fetch_cover, is_cover_url, mangadex_covers

router = APIRouter()


@router.get("/images/mangadex")
async def mangadex_cover_list(
    anilist_id: int = Query(..., gt=0),
    title: list[str] = Query(default=[]),
) -> dict:
    """Volume covers MangaDex has for an AniList title."""
    titles = [t.strip()[:150] for t in title if t.strip()][:3]
    if not titles:
        raise HTTPException(status_code=422, detail="At least one title is required")
    try:
        return await mangadex_covers(anilist_id, titles)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="MangaDex is not responding")


@router.get("/images/proxy")
async def proxy_cover(url: str = Query(..., max_length=300)) -> Response:
    """MangaDex / AniList image bytes for when the browser can't download them directly (no CORS)."""
    if not is_cover_url(url):
        raise HTTPException(status_code=400, detail="Only MangaDex and AniList images are allowed")
    try:
        data, content_type = await fetch_cover(url)
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code if e.response.status_code == 404 else 502)
    except (httpx.HTTPError, ValueError):
        raise HTTPException(status_code=502, detail="Could not fetch image")
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=604800, immutable"},
    )
