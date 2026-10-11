import asyncio
from fastapi import APIRouter, Query, HTTPException
from app.core.config import settings
from app.schemas.search import SearchResponse, SearchResult
from app.services.anilist import search_anilist
from app.services.tmdb import search_tmdb
from app.services.cache import get_cache

router = APIRouter()


@router.get("/search", response_model=SearchResponse)
async def search(
    q: str = Query(..., min_length=2, max_length=100),
    type: str = Query("all", regex="^(all|anime|manga|movie|tv)$"),
) -> SearchResponse:
    """Search for media across providers.
    
    Args:
        q: Search query (2-100 chars)
        type: Media type filter (all, anime, manga, movie, tv)
    
    Returns:
        SearchResponse with results and errors from each provider
    """
    q = q.strip()
    if not q or len(q) < 2 or len(q) > 100:
        raise HTTPException(status_code=422, detail="Query must be 2-100 characters")

    cache = get_cache()
    results: list[SearchResult] = []
    errors: dict[str, str] = {}

    # Determine which providers to query
    tasks = []
    providers = []

    if type in ("all", "anime"):
        cache_key = ("anilist", "anime", q.lower())
        cached = cache.get(cache_key)
        if cached is not None:
            results.extend(cached)
        else:
            tasks.append(search_anilist(q, "anime"))
            providers.append(("anilist", "anime", cache_key))

    if type in ("all", "manga"):
        cache_key = ("anilist", "manga", q.lower())
        cached = cache.get(cache_key)
        if cached is not None:
            results.extend(cached)
        else:
            tasks.append(search_anilist(q, "manga"))
            providers.append(("anilist", "manga", cache_key))

    # Movie and TV are only searched when asked for explicitly; the app tracks anime, manga and manhwa.
    if type == "movie" and settings.tmdb_api_key:
        cache_key = ("tmdb", "movie", q.lower())
        cached = cache.get(cache_key)
        if cached is not None:
            results.extend(cached)
        else:
            tasks.append(search_tmdb(q, "movie"))
            providers.append(("tmdb", "movie", cache_key))
    elif type == "movie":
        errors["tmdb_movie"] = "TMDB key not configured"

    if type == "tv" and settings.tmdb_api_key:
        cache_key = ("tmdb", "tv", q.lower())
        cached = cache.get(cache_key)
        if cached is not None:
            results.extend(cached)
        else:
            tasks.append(search_tmdb(q, "tv"))
            providers.append(("tmdb", "tv", cache_key))
    elif type == "tv":
        errors["tmdb_tv"] = "TMDB key not configured"

    # Execute uncached queries concurrently
    if tasks:
        responses = await asyncio.gather(*tasks, return_exceptions=True)

        for i, (provider_name, provider_type, cache_key) in enumerate(providers):
            response = responses[i]

            if isinstance(response, Exception):
                if isinstance(response, asyncio.TimeoutError):
                    errors[f"{provider_name}_{provider_type}"] = "Request timed out"
                elif isinstance(response, ValueError):
                    errors[f"{provider_name}_{provider_type}"] = str(response)
                else:
                    errors[f"{provider_name}_{provider_type}"] = "Search failed"
            else:
                results.extend(response)
                cache.set(cache_key, response)

    return SearchResponse(results=results, errors=errors)
