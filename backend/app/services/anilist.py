import re
import httpx
from app.schemas.search import SearchResult


async def search_anilist(query: str, media_type: str) -> list[SearchResult]:
    """Search AniList for anime or manga.
    
    Args:
        query: Search query (trimmed, 2-100 chars)
        media_type: 'ANIME' or 'MANGA'
    
    Returns:
        List of SearchResult objects
    """
    anilist_type = "ANIME" if media_type == "anime" else "MANGA"

    gql_query = """
    query Page($page: Int, $perPage: Int, $search: String, $type: MediaType) {
        Page(page: $page, perPage: $perPage) {
            media(search: $search, type: $type, sort: SEARCH_MATCH) {
                id
                title {
                    romaji
                    english
                }
                coverImage {
                    large
                }
                startDate {
                    year
                }
                format
                episodes
                chapters
                countryOfOrigin
                averageScore
                genres
                description(asHtml: false)
            }
        }
    }
    """

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                "https://graphql.anilist.co",
                json={
                    "query": gql_query,
                    "variables": {
                        "page": 1,
                        "perPage": 10,
                        "search": query,
                        "type": anilist_type,
                    },
                },
                timeout=8.0,
            )
            response.raise_for_status()
            data = response.json()

            if "errors" in data:
                return []

            results: list[SearchResult] = []
            for media in data.get("data", {}).get("Page", {}).get("media") or []:
                if not media:
                    continue
                is_anime = media_type == "anime"
                country = media.get("countryOfOrigin", "")

                # Determine media type for manga
                if not is_anime and country == "KR":
                    result_type = "manhwa"
                else:
                    result_type = media_type

                title = media.get("title") or {}
                title_main = title.get("english") or title.get("romaji") or ""
                if not title_main:
                    continue
                title_alt = title.get("romaji") or title.get("english")
                if title_main == title_alt:
                    title_alt = None

                overview = media.get("description") or ""
                overview = re.sub(r"<[^>]+>", " ", overview)
                overview = re.sub(r"\s+", " ", overview).strip()
                if len(overview) > 300:
                    overview = overview[:297] + "..."

                total = media.get("episodes") if is_anime else media.get("chapters")
                rating = None
                score = media.get("averageScore")
                if score:
                    rating = round(score / 10, 1)

                external_id = f"{'anime' if is_anime else 'manga'}:{media.get('id')}"

                results.append(
                    SearchResult(
                        source="anilist",
                        external_id=external_id,
                        media_type=result_type,
                        title=title_main,
                        alt_title=title_alt,
                        year=media.get("startDate", {}).get("year"),
                        poster_url=media.get("coverImage", {}).get("large"),
                        overview=overview,
                        total=total,
                        rating=rating,
                    )
                )

            return results

        except httpx.TimeoutException:
            raise TimeoutError("AniList request timed out")
        except httpx.RequestError as e:
            raise RuntimeError(f"AniList request failed: {str(e)}")
