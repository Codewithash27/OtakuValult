from fastapi import APIRouter, HTTPException, Query

from app.services import pornhwadb as phdb
from app.services.image_proxy import register_search_image_urls

router = APIRouter()


@router.get("/pornhwadb/status")
async def pornhwadb_status() -> dict:
    return phdb.catalogue_status()


@router.get("/pornhwadb/charts")
async def pornhwadb_charts(
    sort: str = Query("top-rated", pattern="^(top-rated|trending|recent)$"),
    page: int = Query(1, ge=1, le=500),
    limit: int = Query(24, ge=1, le=50),
    tag: str | None = Query(None, max_length=80),
) -> dict:
    if not phdb.is_configured():
        raise HTTPException(
            status_code=503,
            detail="PornhwaDB export not found. Place pornhwa-export.json on the server (see backend/data/README.md).",
        )
    out = phdb.chart_page(sort=sort, page=page, limit=limit, tag=tag)
    register_search_image_urls([i["coverImage"] for i in out.get("items") or [] if i.get("coverImage")])
    return out


@router.get("/pornhwadb/charts/tags")
async def pornhwadb_chart_tags(
    sort: str = Query("top-rated", pattern="^(top-rated|trending|recent)$"),
    limit: int = Query(48, ge=1, le=80),
) -> dict:
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    return {"sort": sort, "tags": phdb.chart_tag_counts(sort=sort, limit=limit)}


@router.get("/pornhwadb/search")
async def pornhwadb_search(
    q: str = Query(..., min_length=2, max_length=120),
    limit: int = Query(25, ge=1, le=50),
) -> dict:
    if not phdb.is_configured():
        raise HTTPException(
            status_code=503,
            detail="PornhwaDB export not found. Place pornhwa-export.json on the server (see backend/data/README.md).",
        )
    items = phdb.search_series(q, limit=limit)
    return {"query": q, "items": items}


@router.get("/pornhwadb/series/{slug}")
async def pornhwadb_series(slug: str) -> dict:
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    row = phdb.get_series(slug)
    if not row:
        raise HTTPException(status_code=404, detail="Series not found in export")
    return row


@router.get("/pornhwadb/series/{slug}/images")
async def pornhwadb_series_images(slug: str) -> dict:
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    if not phdb.get_series(slug):
        raise HTTPException(status_code=404, detail="Series not found in export")
    out = phdb.series_images(slug)
    register_search_image_urls([i["url"] for i in out.get("items") or [] if i.get("url")])
    return out
