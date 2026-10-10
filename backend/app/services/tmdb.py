import httpx
from typing import Optional
from app.schemas.search import SearchResult
from app.core.config import settings


async def search_tmdb(query: str, media_type: str) -> list[SearchResult]:
    """Search TMDB for movies or TV shows.
    
    Args:
        query: Search query (trimmed, 2-100 chars)
        media_type: 'movie' or 'tv'
    
    Returns:
        List of SearchResult objects
    
    Raises:
        ValueError: If TMDB API key is not configured
        TimeoutError: If request times out
        RuntimeError: If request fails
    """
    if not settings.tmdb_api_key:
        raise ValueError("TMDB key not configured")

    endpoint = f"https://api.themoviedb.org/3/search/{media_type}"
    headers = {}
    params = {
        "query": query,
        "include_adult": False,
    }

    if settings.tmdb_api_key.startswith("eyJ"):
        headers["Authorization"] = f"Bearer {settings.tmdb_api_key}"
    else:
        params["api_key"] = settings.tmdb_api_key

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                endpoint,
                headers=headers,
                params=params,
                timeout=8.0,
            )
            response.raise_for_status()
            data = response.json()

            results: list[SearchResult] = []
            for item in data.get("results", []):
                title = item.get("title") or item.get("name", "")
                if not title:
                    continue

                release_date = item.get("release_date") or item.get("first_air_date", "")
                year = None
                if release_date:
                    year = int(release_date[:4])

                poster_url = None
                poster_path = item.get("poster_path")
                if poster_path:
                    poster_url = f"https://image.tmdb.org/t/p/w342{poster_path}"

                rating = None
                vote_avg = item.get("vote_average")
                if vote_avg:
                    rating = round(float(vote_avg), 1)

                external_id = f"{media_type}:{item.get('id')}"

                results.append(
                    SearchResult(
                        source="tmdb",
                        external_id=external_id,
                        media_type=media_type,
                        title=title,
                        year=year,
                        poster_url=poster_url,
                        overview=item.get("overview"),
                        rating=rating,
                    )
                )

            return results

        except httpx.TimeoutException:
            raise TimeoutError("TMDB request timed out")
        except httpx.RequestError as e:
            raise RuntimeError(f"TMDB request failed: {str(e)}")
