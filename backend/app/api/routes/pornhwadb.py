import re

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

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


def _title_key(title: str) -> str:
    """Lower-case alphanumerics only, so "Mom's Friend" matches "Moms Friend"."""
    return re.sub(r"[^a-z0-9]", "", title.lower())


class TagLookup(BaseModel):
    slugs: list[str] = Field(default_factory=list, max_length=2000)
    titles: list[str] = Field(default_factory=list, max_length=2000)


@router.post("/pornhwadb/tags")
async def pornhwadb_tags(body: TagLookup) -> dict:
    """Catalogue tags for shelf items, matched by slug or (alternative) title."""
    if not phdb.is_configured():
        return {"bySlug": {}, "byTitle": {}}
    want_slugs = {s.strip().lower() for s in body.slugs if s.strip()}
    want_titles = {k for k in map(_title_key, body.titles) if k}
    by_slug: dict[str, list[str]] = {}
    by_title: dict[str, list[str]] = {}
    for row in phdb.search_all_public():
        tags = row.get("tags") or []
        slug = str(row.get("slug") or "").lower()
        if slug in want_slugs:
            by_slug[slug] = tags
        for name in [row.get("title"), *(row.get("alternativeTitles") or [])]:
            key = _title_key(str(name or ""))
            if key in want_titles and key not in by_title:
                by_title[key] = tags
    return {"bySlug": by_slug, "byTitle": by_title}


@router.get("/pornhwadb/series/{slug}")
async def pornhwadb_series(slug: str) -> dict:
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    row = phdb.get_series(slug)
    if not row:
        raise HTTPException(status_code=404, detail="Series not found in export")
    return row


@router.get("/pornhwadb/series/{slug}/similar")
async def pornhwadb_series_similar(slug: str, limit: int = Query(10, ge=1, le=20)) -> dict:
    """Similar storyline (RAG embeddings) and shared-tag titles for a catalogue series."""
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    target = phdb.get_series(slug)
    if not target:
        raise HTTPException(status_code=404, detail="Series not found in export")

    def card(row: dict) -> dict:
        return {
            "slug": row.get("slug"),
            "title": row.get("title"),
            "coverImage": row.get("coverImage"),
            "averageRating": row.get("averageRating"),
            "tags": (row.get("tags") or [])[:3],
        }

    storyline: list[dict] = []
    from app.services.rag_service import rag_service

    if rag_service._ensure_index_loaded() and rag_service._embeddings is not None and rag_service._metadata:
        meta = rag_service._metadata
        idx = next((i for i, m in enumerate(meta) if str(m.get("slug") or "").lower() == slug.lower()), None)
        if idx is not None:
            scores = rag_service._embeddings @ rag_service._embeddings[idx]
            for j in scores.argsort()[::-1]:
                if int(j) == idx:
                    continue
                row = phdb.get_series(str(meta[int(j)].get("slug") or ""))
                if row:
                    storyline.append(card(row))
                if len(storyline) >= limit:
                    break

    seen = {slug.lower(), *(s["slug"].lower() for s in storyline if s.get("slug"))}
    target_tags = {t.lower() for t in target.get("tags") or []}
    tagged: list[tuple[float, dict]] = []
    if target_tags:
        for row in phdb.search_all_public():
            s = str(row.get("slug") or "").lower()
            if s in seen:
                continue
            tags = {t.lower() for t in row.get("tags") or []}
            overlap = len(tags & target_tags)
            if overlap:
                jaccard = overlap / len(tags | target_tags)
                tagged.append((jaccard + (row.get("averageRating") or 0) * 0.02, row))
    tagged.sort(key=lambda x: x[0], reverse=True)
    shared = [card(r) for _, r in tagged[:limit]]

    register_search_image_urls([c["coverImage"] for c in storyline + shared if c.get("coverImage")])
    return {"storyline": storyline, "sharedTags": shared}


@router.get("/pornhwadb/series/{slug}/images")
async def pornhwadb_series_images(slug: str) -> dict:
    if not phdb.is_configured():
        raise HTTPException(status_code=503, detail="PornhwaDB export not configured")
    if not phdb.get_series(slug):
        raise HTTPException(status_code=404, detail="Series not found in export")
    out = phdb.series_images(slug)
    register_search_image_urls([i["url"] for i in out.get("items") or [] if i.get("url")])
    return out
