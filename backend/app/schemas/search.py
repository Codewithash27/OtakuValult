from typing import Optional
from pydantic import BaseModel


class SearchResult(BaseModel):
    source: str
    external_id: str
    media_type: str
    title: str
    alt_title: Optional[str] = None
    year: Optional[int] = None
    poster_url: Optional[str] = None
    overview: Optional[str] = None
    total: Optional[int] = None
    rating: Optional[float] = None


class SearchResponse(BaseModel):
    results: list[SearchResult]
    errors: dict[str, str]
