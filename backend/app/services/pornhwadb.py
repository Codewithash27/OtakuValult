"""Search local PornhwaDB JSON export (metadata + cover URLs). No live API."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.core.config import settings


def _data_path() -> Path:
    raw = Path(settings.pornhwadb_data_path)
    if raw.is_absolute():
        return raw
    # backend/ when uvicorn runs with cwd=backend
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / raw


def is_configured() -> bool:
    return _data_path().is_file()


@lru_cache(maxsize=1)
def _catalogue() -> dict[str, Any] | None:
    path = _data_path()
    if not path.is_file():
        return None
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def clear_cache() -> None:
    _catalogue.cache_clear()
    _catalog_mean_rating.cache_clear()
    _canonical_top_rated_slugs.cache_clear()


def _top_rated_slugs_path() -> Path:
    return _data_path().parent / "top-rated-slugs.json"


@lru_cache(maxsize=1)
def _canonical_top_rated_slugs() -> tuple[str, ...]:
    path = _top_rated_slugs_path()
    if not path.is_file():
        return tuple()
    with path.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if not isinstance(data, list):
        return tuple()
    return tuple(str(s).strip() for s in data if str(s).strip())


_BL_YURI_FRAGMENTS = (
    "yuri",
    "boys love",
    "boy's love",
    "girls love",
    "shounen ai",
    "shoujo ai",
)


def _is_bl_or_yuri_tag(name: str) -> bool:
    low = name.lower().strip()
    if low in ("bl", "gl", "yuri", "girls love"):
        return True
    return any(frag in low for frag in _BL_YURI_FRAGMENTS)


def series_has_export_tag(series: dict[str, Any], tag: str | None) -> bool:
    if not tag or not tag.strip():
        return True
    want = tag.strip().lower()
    return any(t.lower().strip() == want for t in _tag_names(series))


def _is_bl_or_yuri(series: dict[str, Any]) -> bool:
    for name in _tag_names(series):
        low = name.lower()
        if low in ("bl", "gl", "yuri"):
            return True
        if any(frag in low for frag in _BL_YURI_FRAGMENTS):
            return True
    return False


@lru_cache(maxsize=1)
def _catalog_mean_rating() -> float:
    cat = _catalogue()
    if not cat:
        return 4.0
    vals: list[float] = []
    for series in cat.get("pornhwa") or []:
        rating = series.get("ratingAggregate") or {}
        avg = rating.get("averageRating")
        if avg is not None:
            vals.append(float(avg))
    return sum(vals) / len(vals) if vals else 4.0


def _weighted_rating(series: dict[str, Any], *, prior_votes: int = 10) -> float:
    rating = series.get("ratingAggregate") or {}
    avg = rating.get("averageRating")
    count = int(rating.get("totalRatings") or 0)
    if avg is None or count <= 0:
        return 0.0
    mean = _catalog_mean_rating()
    return (count * float(avg) + prior_votes * mean) / (count + prior_votes)


def _chart_candidates(sort: str) -> list[dict[str, Any]]:
    cat = _catalogue()
    if not cat:
        return []

    if sort == "top-rated":
        slugs = _canonical_top_rated_slugs()
        if slugs:
            by_slug = {str(s.get("slug") or ""): s for s in cat.get("pornhwa") or []}
            return [by_slug[slug] for slug in slugs if slug in by_slug]

    rows: list[dict[str, Any]] = []
    for series in cat.get("pornhwa") or []:
        if _is_bl_or_yuri(series):
            continue
        rating = series.get("ratingAggregate") or {}
        total_ratings = int(rating.get("totalRatings") or 0)
        if sort == "top-rated":
            if total_ratings < 5 or rating.get("averageRating") is None:
                continue
        rows.append(series)

    if sort == "top-rated":
        rows.sort(
            key=lambda s: (
                -_weighted_rating(s),
                -int((s.get("ratingAggregate") or {}).get("totalRatings") or 0),
            )
        )
    elif sort == "trending":
        rows.sort(key=lambda s: (-int(s.get("viewCount") or 0), s.get("title") or ""))
    else:  # recent
        rows.sort(key=lambda s: (str(s.get("updatedAt") or ""), s.get("title") or ""), reverse=True)
    return rows


def chart_tag_counts(*, sort: str = "top-rated", limit: int = 48) -> list[dict[str, Any]]:
    """Tag frequencies for titles in the current chart (for filter chips)."""
    key = sort if sort in ("top-rated", "trending", "recent") else "top-rated"
    ranked = _chart_candidates(key)
    counts: dict[str, int] = {}
    for series in ranked:
        for name in _tag_names(series):
            if _is_bl_or_yuri_tag(name):
                continue
            counts[name] = counts.get(name, 0) + 1
    rows = [{"name": name, "count": count} for name, count in counts.items()]
    rows.sort(key=lambda r: (-r["count"], r["name"].lower()))
    return rows[: max(1, min(limit, 80))]


def chart_page(
    *,
    sort: str = "top-rated",
    page: int = 1,
    limit: int = 24,
    tag: str | None = None,
) -> dict[str, Any]:
    """Ranked manhwa from export (matches PornhwaDB-style top lists; no Yuri/BL)."""
    key = sort if sort in ("top-rated", "trending", "recent") else "top-rated"
    ranked = _chart_candidates(key)
    if tag:
        ranked = [s for s in ranked if series_has_export_tag(s, tag)]
    page = max(1, page)
    limit = min(50, max(1, limit))
    start = (page - 1) * limit
    end = start + limit
    slice_rows = ranked[start:end]
    items: list[dict[str, Any]] = []
    for offset, raw in enumerate(slice_rows):
        row = _public_series(raw)
        row["rank"] = start + offset + 1
        items.append(row)
    return {
        "sort": key,
        "tag": tag,
        "page": page,
        "perPage": limit,
        "total": len(ranked),
        "hasNextPage": end < len(ranked),
        "items": items,
    }


def catalogue_status() -> dict[str, Any]:
    cat = _catalogue()
    if not cat:
        return {"configured": False, "path": str(_data_path())}
    return {
        "configured": True,
        "path": str(_data_path()),
        "generatedAt": cat.get("generatedAt"),
        "seriesCount": len(cat.get("pornhwa") or []),
    }


def _searchable_text(series: dict[str, Any]) -> str:
    creators = series.get("creators") or []
    creator_names = " ".join(c.get("canonicalName", "") for c in creators if isinstance(c, dict))
    alt = " ".join(str(t) for t in (series.get("alternativeTitles") or []))
    return " ".join(
        [
            str(series.get("title") or ""),
            str(series.get("description") or ""),
            creator_names,
            alt,
            " ".join(str(a) for a in (series.get("artists") or [])),
            " ".join(str(a) for a in (series.get("authors") or [])),
        ]
    ).lower()


def _tag_names(series: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for tag in series.get("genreTags") or []:
        if isinstance(tag, dict):
            name = tag.get("name")
            if name:
                out.append(str(name))
        elif tag:
            out.append(str(tag))
    return out


def _public_series(series: dict[str, Any]) -> dict[str, Any]:
    rating = series.get("ratingAggregate") or {}
    return {
        "slug": series.get("slug"),
        "title": series.get("title") or "Untitled",
        "alternativeTitles": series.get("alternativeTitles") or [],
        "description": series.get("description"),
        "status": series.get("status"),
        "releaseYear": series.get("releaseYear"),
        "totalChapters": series.get("totalChapters"),
        "coverImage": series.get("coverImage"),
        "averageRating": rating.get("averageRating"),
        "totalRatings": rating.get("totalRatings"),
        "tags": _tag_names(series),
        "externalLinks": series.get("externalLinks") or [],
    }


def search_series(query: str, *, limit: int = 25) -> list[dict[str, Any]]:
    cat = _catalogue()
    if not cat:
        return []
    q = query.strip().lower()
    if len(q) < 2:
        return []
    matches: list[dict[str, Any]] = []
    for series in cat.get("pornhwa") or []:
        if q in _searchable_text(series):
            matches.append(_public_series(series))
            if len(matches) >= limit:
                break
    return matches


def _find_series_raw(slug: str) -> dict[str, Any] | None:
    cat = _catalogue()
    if not cat or not slug.strip():
        return None
    key = slug.strip().lower()
    for series in cat.get("pornhwa") or []:
        if str(series.get("slug") or "").lower() == key:
            return series
    return None


def get_series(slug: str) -> dict[str, Any] | None:
    raw = _find_series_raw(slug)
    if not raw:
        return None
    out = _public_series(raw)
    out["exportImageCount"] = _export_image_count(raw)
    return out


def _export_image_count(raw: dict[str, Any]) -> int:
    seen: set[str] = set()
    cover = raw.get("coverImage")
    if isinstance(cover, str) and cover.startswith("https://"):
        seen.add(cover)
    for ch in raw.get("chapters") or []:
        if not isinstance(ch, dict):
            continue
        for char in ch.get("characters") or []:
            if isinstance(char, dict):
                img = char.get("image")
                if isinstance(img, str) and img.startswith("https://"):
                    seen.add(img)
    return len(seen)


def series_images(slug: str) -> dict[str, Any]:
    """Cover + character art from export (not community gallery panels on pornhwadb.com)."""
    raw = _find_series_raw(slug)
    if not raw:
        return {"slug": slug, "total": 0, "items": []}

    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add(*, url: str | None, label: str, kind: str, caption: str | None) -> None:
        if not url or not str(url).startswith("https://"):
            return
        u = str(url).strip()
        if u in seen:
            return
        seen.add(u)
        items.append(
            {
                "id": f"ph-{len(items)}",
                "url": u,
                "label": label[:120],
                "kind": kind,
                "caption": caption,
            }
        )

    title = str(raw.get("title") or "Untitled")
    add(url=raw.get("coverImage"), label=f"{title} · cover", kind="cover", caption="Catalogue cover")

    for ch in raw.get("chapters") or []:
        if not isinstance(ch, dict):
            continue
        start = ch.get("chapterStart")
        end = ch.get("chapterEnd")
        if start is not None and end is not None and end != start:
            ch_cap = f"Chapters {start}–{end}"
        elif start is not None:
            ch_cap = f"Chapter {start}"
        else:
            ch_cap = None
        for char in ch.get("characters") or []:
            if not isinstance(char, dict):
                continue
            name = str(char.get("name") or "Character")
            role = char.get("role")
            cap = f"{name}" + (f" · {role}" if role else "") + (f" · {ch_cap}" if ch_cap else "")
            add(url=char.get("image"), label=name, kind="character", caption=cap)

    return {
        "slug": raw.get("slug"),
        "title": title,
        "total": len(items),
        "items": items,
        "note": "From local export: cover and character art. Community panel uploads on pornhwadb.com are not in this file.",
    }
