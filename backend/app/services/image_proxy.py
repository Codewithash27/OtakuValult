import re

import httpx

# MangaDex rejects requests without an identifying User-Agent.
HEADERS = {"User-Agent": "OtakuVault/0.1 (personal catalogue)"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024

# URLs returned by /api/images/web-search are registered here so the proxy can fetch them once.
_search_url_cache: dict[str, float] = {}
_SEARCH_URL_TTL = 3600


def register_search_image_urls(urls: list[str]) -> None:
    import time

    now = time.time()
    for url in urls:
        u = url.strip()
        if u.startswith("https://"):
            _search_url_cache[u] = now
    if len(_search_url_cache) > 2000:
        cutoff = now - _SEARCH_URL_TTL
        for k, ts in list(_search_url_cache.items()):
            if ts < cutoff:
                del _search_url_cache[k]


def _search_url_allowed(url: str) -> bool:
    import time

    ts = _search_url_cache.get(url)
    if ts is None:
        return False
    if time.time() - ts > _SEARCH_URL_TTL:
        del _search_url_cache[url]
        return False
    return True


# Only image files from the sources the finder uses; anything else is refused.
ALLOWED: list[tuple[re.Pattern, re.Pattern]] = [
    (re.compile(r"^uploads\.mangadex\.org$"), re.compile(r"^/covers/[0-9a-f-]{36}/[\w.-]+$")),
    (re.compile(r"^s4\.anilist\.co$"), re.compile(r"^/file/anilistcdn/[\w/.-]+$")),
    (re.compile(r"^w\.wallhaven\.cc$"), re.compile(r"^/full/\w{2}/wallhaven-\w+\.(jpg|png)$")),
    (re.compile(r"^th\.wallhaven\.cc$"), re.compile(r"^/(lg|orig|small)/\w{2}/\w+\.(jpg|png)$")),
    (re.compile(r"^media\.kitsu\.(app|io)$"), re.compile(r"^/(anime|manga)/[\w/.-]+$")),
    (
        re.compile(r"^(img\d*|video-cdn\d*)\.gelbooru\.com$"),
        re.compile(r"^/(images|samples|thumbnails)/[\w/.-]+\.(jpe?g|png|gif|webp)$", re.IGNORECASE),
    ),
]


def is_allowed_image_url(url: str) -> bool:
    parsed = httpx.URL(url)
    if parsed.scheme != "https":
        return False
    if _search_url_allowed(url):
        return True
    return any(host.match(parsed.host) and path.match(parsed.path) for host, path in ALLOWED)


def _headers_for(url: str) -> dict:
    # Gelbooru's image servers answer with an HTML page unless the request comes from gelbooru.com.
    if httpx.URL(url).host.endswith(".gelbooru.com"):
        return {**HEADERS, "Referer": "https://gelbooru.com/"}
    return HEADERS


async def fetch_image(url: str) -> tuple[bytes, str]:
    async with httpx.AsyncClient(timeout=20.0, headers=_headers_for(url), follow_redirects=False) as client:
        async with client.stream("GET", url) as res:
            res.raise_for_status()
            content_type = res.headers.get("content-type", "")
            if not content_type.startswith("image/"):
                raise ValueError("Not an image")
            data = bytearray()
            async for chunk in res.aiter_bytes():
                data.extend(chunk)
                if len(data) > MAX_IMAGE_BYTES:
                    raise ValueError("Image too large")
            return bytes(data), content_type
