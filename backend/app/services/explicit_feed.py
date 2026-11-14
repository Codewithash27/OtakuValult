"""Free explicit anime/manhwa stills. No API key.

XBooru and TBIB both speak the Gelbooru post API and answer without an account.
Gelbooru itself and Rule34 now require a key, so they are not used here.
"""

from __future__ import annotations

import asyncio
import re
import xml.etree.ElementTree as ET
from typing import Any, Optional

import httpx

from app.services.cache import Cache
from app.services.image_proxy import HEADERS, is_allowed_image_url, register_search_image_urls
from app.services.web_image_search import search_web_images

PAGE_SIZE = 30
IMAGE_EXT = re.compile(r"\.(jpe?g|png|gif|webp)$", re.IGNORECASE)
_WORD = re.compile(r"[a-z0-9]{2,}")
_STOP = frozenset({"the", "and", "for", "with", "from", "that", "this", "into"})

# Exact tags that mark a minor. young_adult is intentionally not in this set.
BLOCKED_TAGS = frozenset(
    {
        "loli",
        "lolicon",
        "lolita",
        "shota",
        "shotacon",
        "child",
        "children",
        "kid",
        "kids",
        "toddler",
        "toddlercon",
        "baby",
        "infant",
        "kindergarten",
        "kindergartener",
        "elementary_school",
        "elementary_school_student",
        "middle_school",
        "middle_school_student",
        "high_school_student",
        "aged_down",
        "underage",
        "underaged",
        "preteen",
        "jailbait",
        "minor",
        "young",
        "young_girl",
        "young_boy",
        "young_male",
        "young_female",
        "teen",
        "teenage",
        "teenager",
        "child_on_child",
        "oppai_loli",
        "cub",
        "naruto",
        "naruto_uzumaki",
        "uzumaki_naruto",
        "boruto",
        "boruto_uzumaki",
        "uzumaki_boruto",
        "himawari",
        "himawari_uzumaki",
        "uzumaki_himawari",
    }
)

# Always sent upstream, then applied again on each post in case a board ignores it.
EXCLUSIONS = (
    "-loli -lolicon -shota -shotacon -child -children -young -toddler -underage "
    "-teen -teenager -minor -aged_down -naruto -boruto -himawari -anthro -furry -animal_humanoid"
)

BOARDS = (
    ("xbooru", "https://xbooru.com/index.php", "https://xbooru.com/index.php?page=post&s=view&id={id}"),
    ("tbib", "https://tbib.org/index.php", "https://tbib.org/index.php?page=post&s=view&id={id}"),
)

_cache = Cache(ttl=10 * 60, max_size=200)


class QueryRejected(ValueError):
    pass


def tag_is_blocked(tag: str) -> bool:
    if tag in BLOCKED_TAGS:
        return True
    if tag.startswith(("loli", "shota", "lolicon", "shotacon", "underage")):
        return True
    return any(name in tag for name in ("naruto", "boruto", "himawari"))


def search_words(raw: str) -> list[str]:
    """Words from the search box. Empty means the latest shelf. A blocked name is refused."""
    words = [w for w in _WORD.findall(raw.strip().lower()) if w not in _STOP]
    if not words:
        return []
    if len(words) > 6 or any(tag_is_blocked(w) for w in words):
        raise QueryRejected("That name is not available on this shelf")
    slug = "_".join(words)
    if tag_is_blocked(slug) or slug in {"anthro", "furry", "animal_humanoid"}:
        raise QueryRejected("That name is not available on this shelf")
    return words


def _posts_from(body: Any) -> list[dict]:
    if isinstance(body, list):
        return [p for p in body if isinstance(p, dict)]
    if isinstance(body, dict):
        posts = body.get("post") or []
        if isinstance(posts, dict):
            return [posts]
        if isinstance(posts, list):
            return [p for p in posts if isinstance(p, dict)]
    return []


def _pair(post: dict, board: str) -> Optional[tuple[str, str]]:
    file_url = (post.get("file_url") or "").strip()
    thumb = (post.get("preview_url") or post.get("sample_url") or "").strip()
    if board == "tbib" and not file_url.startswith("https://"):
        directory = post.get("directory")
        image = post.get("image") or ""
        if directory is not None and image:
            file_url = f"https://tbib.org/images/{directory}/{image}"
    if not file_url.startswith("https://") or not IMAGE_EXT.search(file_url) or not is_allowed_image_url(file_url):
        return None
    if not thumb.startswith("https://") or not IMAGE_EXT.search(thumb) or not is_allowed_image_url(thumb):
        thumb = file_url
    return file_url, thumb


def _tag_list(text: str) -> list[tuple[str, int]]:
    raw = text.strip()
    if not raw:
        return []
    found: list[tuple[str, int]] = []
    if raw.startswith("<"):
        try:
            root = ET.fromstring(raw)
        except ET.ParseError:
            return []
        nodes = root.findall("tag")
    else:
        try:
            body = json_loads(raw)
        except ValueError:
            return []
        nodes = body if isinstance(body, list) else body.get("tag") or []
        if isinstance(nodes, dict):
            nodes = [nodes]
    for node in nodes:
        if isinstance(node, dict):
            name = str(node.get("name") or "").lower()
            count = int(node.get("count") or 0)
        else:
            name = (node.get("name") or "").lower()
            count = int(node.get("count") or 0)
        if name and count > 0 and not tag_is_blocked(name):
            found.append((name, count))
    return found


def json_loads(raw: str) -> Any:
    import json

    return json.loads(raw)


def _covers(name: str, words: list[str]) -> int:
    parts = set(name.split("_"))
    return sum(1 for w in words if len(w) >= 3 and w in parts)


def _keep(post: dict, board: str, seen: set[str], required: Optional[set[str]] = None) -> Optional[dict]:
    rating = (post.get("rating") or "").lower()
    if rating not in {"e", "explicit"}:
        return None
    tags = set((post.get("tags") or "").split())
    if any(tag_is_blocked(tag) for tag in tags):
        return None
    if required is not None and tags.isdisjoint(required):
        return None
    pair = _pair(post, board)
    if pair is None or pair[0] in seen:
        return None
    seen.add(pair[0])
    post_id = post.get("id")
    try:
        post_id = int(post_id)
    except (TypeError, ValueError):
        return None
    width = post.get("width") or post.get("image_width")
    height = post.get("height") or post.get("image_height")
    return {
        "id": post_id,
        "source": board,
        "width": int(width) if isinstance(width, int) else None,
        "height": int(height) if isinstance(height, int) else None,
        "file_url": pair[0],
        "thumb_url": pair[1],
        "post_url": next(tmpl.format(id=post_id) for name, _api, tmpl in BOARDS if name == board),
    }


def _browse_queries(kind: str) -> list[str]:
    tail = f"rating:explicit {EXCLUSIONS}"
    if kind == "manhwa":
        return [f"manhwa {tail}", f"webtoon {tail}"]
    return [tail]


def _pick_tags(found: dict[str, int], words: list[str]) -> list[str]:
    """Only a tag that contains every searched word. A partial like "love" is not a match."""
    needed = [w for w in words if len(w) >= 3] or words
    full = [
        name
        for name in found
        if all(w in set(name.split("_")) for w in needed)
    ]
    full.sort(key=lambda name: found[name], reverse=True)
    return full[:3]


async def _lookup_tags(client: httpx.AsyncClient, api: str, pattern: str) -> list[tuple[str, int]]:
    try:
        res = await client.get(
            api,
            params={
                "page": "dapi",
                "s": "tag",
                "q": "index",
                "name_pattern": pattern,
                "orderby": "count",
                "limit": 20,
            },
        )
        if res.status_code >= 400:
            return []
        return _tag_list(res.text)
    except httpx.HTTPError:
        return []


async def _resolve_tags(client: httpx.AsyncClient, words: list[str]) -> list[str]:
    slug = "_".join(words)
    patterns = [f"%{slug}%"]
    for word in words:
        if len(word) >= 3:
            pattern = f"%{word}%"
            if pattern not in patterns:
                patterns.append(pattern)
    jobs = [
        _lookup_tags(client, api, pattern)
        for pattern in patterns[:4]
        for _name, api, _tmpl in BOARDS
    ]
    batches = await asyncio.gather(*jobs)
    found: dict[str, int] = {}
    for batch in batches:
        for name, count in batch:
            if _covers(name, words) <= 0:
                continue
            found[name] = max(found.get(name, 0), count)
    return _pick_tags(found, words)


async def _fetch_board(client: httpx.AsyncClient, api: str, tags: str, page: int) -> Optional[list[dict]]:
    try:
        res = await client.get(
            api,
            params={
                "page": "dapi",
                "s": "post",
                "q": "index",
                "json": "1",
                "tags": tags,
                "limit": PAGE_SIZE,
                "pid": page - 1,
            },
        )
        if res.status_code >= 400:
            return None
        if not res.content.strip():
            return []
        return _posts_from(res.json())
    except (httpx.HTTPError, ValueError):
        return None


_BLOCK_TEXT = re.compile(
    r"loli|shota|naruto|boruto|himawari|underage|toddler|preteen|jailbait",
    re.IGNORECASE,
)


def _register_posts(posts: list[dict]) -> None:
    register_search_image_urls([url for post in posts for url in (post["file_url"], post["thumb_url"])])


def _mentions_title(text: str, words: list[str]) -> bool:
    """True when the page title or address actually names this series."""
    folded = re.sub(r"[^a-z0-9]+", "", text.lower())
    needed = [w for w in words if len(w) >= 3] or words
    return bool(needed) and all(w in folded for w in needed)


# Chapter-page files from a sex-scene search. Covers, pins, and article thumbnails are left out.
_PANEL_PATH = re.compile(r"/(?:chapters?|uploads)/\d+/|/chapter[-_/]\d+", re.IGNORECASE)
_EXPLICIT_WORD = re.compile(r"sex|nude|uncensored|smut|xxx|nsfw|hentai", re.IGNORECASE)
_COVER_URL = re.compile(
    r"ytimg\.com|pinimg\.com|pinterest\.|goodreads\.com|amazon\.com|ssl-images-amazon|"
    r"pstatic\.net|github\.com|flickr\.com|wp-content|youtube\.com",
    re.IGNORECASE,
)


def _explicit_panel(file_url: str, title: str) -> bool:
    if _COVER_URL.search(file_url):
        return False
    if _PANEL_PATH.search(file_url):
        return True
    return "redd.it" in file_url and bool(_EXPLICIT_WORD.search(title))


def _web_posts(payload: dict, words: list[str], *, panels_only: bool) -> list[dict]:
    posts: list[dict] = []
    for item in payload.get("items") or []:
        title = str(item.get("title") or "")
        page_url = str(item.get("page_url") or "")
        file_url = str(item.get("file_url") or "")
        thumb_url = str(item.get("thumb_url") or file_url)
        blob = f"{title} {page_url}"
        if not file_url.startswith("https://") or _BLOCK_TEXT.search(blob):
            continue
        if words and not _mentions_title(blob, words):
            continue
        if panels_only and not _explicit_panel(file_url, title):
            continue
        if not panels_only and words and not _EXPLICIT_WORD.search(blob):
            continue
        if not thumb_url.startswith("https://"):
            thumb_url = file_url
        if not is_allowed_image_url(file_url):
            continue
        post_id = abs(hash(file_url)) % 1_000_000_000
        posts.append(
            {
                "id": post_id,
                "source": "web",
                "width": item.get("width") if isinstance(item.get("width"), int) else None,
                "height": item.get("height") if isinstance(item.get("height"), int) else None,
                "file_url": file_url,
                "thumb_url": thumb_url if is_allowed_image_url(thumb_url) else file_url,
                "post_url": page_url if page_url.startswith("https://") else file_url,
            }
        )
    return posts


async def _web_for(kind: str, phrase: str, words: list[str], page: int) -> list[dict]:
    # "panel" stops the shared search helper from appending a safe "read chapter" variant.
    if kind == "manhwa":
        queries = [
            f'"{phrase}" manhwa sex scene panel',
            f"{phrase} manhwa nude uncensored panel",
            f"{phrase} raw sex chapter manhwa panel",
        ]
    else:
        queries = [f'"{phrase}" hentai sex panel', f"{phrase} anime nude hentai panel"]
    if page > 1:
        queries = queries[:1]
    batches = await asyncio.gather(
        *(search_web_images(q, safe=False, start=(page - 1) * 15 + 1) for q in queries)
    )
    seen: set[str] = set()
    posts: list[dict] = []
    for data in batches:
        for post in _web_posts(data, words, panels_only=kind == "manhwa"):
            if post["file_url"] in seen:
                continue
            seen.add(post["file_url"])
            posts.append(post)
    return posts


async def search_explicit(kind: str, raw_query: str, page: int) -> dict:
    words = search_words(raw_query)
    phrase = " ".join(words)
    key = ("explicit-feed-v3", kind, phrase, page)
    cached = _cache.get(key)
    if cached is not None:
        _register_posts(cached["posts"])
        return cached

    async def boards() -> tuple[list[str], list[dict], bool]:
        async with httpx.AsyncClient(timeout=18.0, headers={**HEADERS, "Accept": "application/json"}) as client:
            matched = await _resolve_tags(client, words) if words else []
            if words and not matched:
                return [], [], False
            queries = (
                [f"{tag} rating:explicit {EXCLUSIONS}" for tag in matched]
                if matched
                else _browse_queries(kind)
            )
            jobs = [
                _fetch_board(client, api, tags, page)
                for tags in queries
                for _name, api, _tmpl in BOARDS
            ]
            batches = await asyncio.gather(*jobs)
        if all(batch is None for batch in batches):
            return matched, [], False
        required = set(matched) if matched else None
        seen: set[str] = set()
        posts: list[dict] = []
        has_more = False
        board_names = [name for name, _api, _tmpl in BOARDS]
        for index, batch in enumerate(batches):
            if batch is None:
                continue
            if len(batch) >= PAGE_SIZE:
                has_more = True
            board = board_names[index % len(BOARDS)]
            for post in batch:
                kept = _keep(post, board, seen, required)
                if kept:
                    posts.append(kept)
        return matched, posts, has_more

    web_task = _web_for(kind, phrase, words, page) if phrase else None
    if web_task is not None:
        (matched, board_posts, board_more), web_posts = await asyncio.gather(boards(), web_task)
    else:
        matched, board_posts, board_more = await boards()
        web_posts = []

    seen_urls = {post["file_url"] for post in web_posts}
    posts = list(web_posts)
    for post in board_posts:
        if post["file_url"] not in seen_urls:
            posts.append(post)
            seen_urls.add(post["file_url"])

    result = {
        "kind": kind,
        "query": phrase or None,
        "matched": matched,
        "message": None if posts or not phrase else "No pictures turned up for that name.",
        "page": page,
        "has_more": board_more or len(web_posts) >= 8,
        "posts": posts,
    }
    _register_posts(posts)
    _cache.set(key, result)
    return result
