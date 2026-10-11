import re

import httpx

# MangaDex rejects requests without an identifying User-Agent.
HEADERS = {"User-Agent": "OtakuVault/0.1 (personal catalogue)"}
MAX_IMAGE_BYTES = 15 * 1024 * 1024

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
