"""Search local PornhwaDB JSON export (metadata + cover URLs). No live API."""

from __future__ import annotations

import json
import logging
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_bootstrap_attempted = False
_last_bootstrap_error: str | None = None


def _data_path() -> Path:
    raw = Path(settings.pornhwadb_data_path)
    if raw.is_absolute():
        return raw
    # backend/ when uvicorn runs with cwd=backend
    backend_root = Path(__file__).resolve().parents[2]
    return backend_root / raw


def is_configured() -> bool:
    return _data_path().is_file()


def _download_from_url(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, follow_redirects=True, timeout=180.0) as response:
        response.raise_for_status()
        with dest.open("wb") as out:
            for chunk in response.iter_bytes():
                out.write(chunk)


def _download_from_supabase_storage(bucket: str, object_path: str, dest: Path) -> None:
    """Storage REST download — avoids supabase-py / httpx proxy kwarg mismatch on Render."""
    if not settings.supabase_url or not settings.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for storage download")
    base = settings.supabase_url.rstrip("/")
    key = settings.supabase_service_role_key.strip()
    path_part = object_path.lstrip("/")
    url = f"{base}/storage/v1/object/{bucket}/{path_part}"
    headers = {"Authorization": f"Bearer {key}", "apikey": key}
    dest.parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, headers=headers, follow_redirects=True, timeout=180.0) as response:
        if response.status_code == 404:
            raise RuntimeError(f"Object not found: {bucket}/{path_part}")
        response.raise_for_status()
        with dest.open("wb") as out:
            for chunk in response.iter_bytes():
                out.write(chunk)
    if dest.stat().st_size == 0:
        dest.unlink(missing_ok=True)
        raise RuntimeError(f"Empty download from {bucket}/{path_part}")


def ensure_export_file() -> bool:
    """Load gitignored export on first boot (local file, URL, or Supabase Storage)."""
    global _bootstrap_attempted, _last_bootstrap_error

    path = _data_path()
    if path.is_file():
        return True
    if _bootstrap_attempted:
        return False
    _bootstrap_attempted = True
    _last_bootstrap_error = None

    url = (settings.pornhwadb_data_url or "").strip()
    bucket = (settings.pornhwadb_storage_bucket or "").strip()
    object_path = (settings.pornhwadb_storage_object or "pornhwa-export.json").strip()

    try:
        if url:
            logger.info("Downloading PornhwaDB export from PORNHWADB_DATA_URL → %s", path)
            _download_from_url(url, path)
        elif bucket and object_path:
            logger.info(
                "Downloading PornhwaDB export from Supabase %s/%s → %s",
                bucket,
                object_path,
                path,
            )
            _download_from_supabase_storage(bucket, object_path, path)
        else:
            return False
        clear_cache()
        logger.info("PornhwaDB export ready (%s bytes)", path.stat().st_size)
        return True
    except Exception as exc:
        _last_bootstrap_error = str(exc)
        logger.exception("PornhwaDB export bootstrap failed")
        if path.is_file():
            path.unlink(missing_ok=True)
        return False


def _status_hint() -> str:
    if _last_bootstrap_error:
        return f"Auto-download failed: {_last_bootstrap_error}"
    bucket = (settings.pornhwadb_storage_bucket or "").strip()
    if bucket:
        return (
            "Set PORNHWADB_STORAGE_BUCKET on Render and upload the export once "
            "(see backend/scripts/upload_pornhwadb_export.py)."
        )
    if (settings.pornhwadb_data_url or "").strip():
        return "PORNHWADB_DATA_URL is set but the file is missing — check the URL and redeploy logs."
    return (
        "Upload pornhwa-export.json to the API server, or set PORNHWADB_STORAGE_BUCKET / "
        "PORNHWADB_DATA_URL (file is not in git)."
    )


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


# Adult heat for Creamy charts. Keep in sync with frontend/src/lib/manhwaHeat.ts.
# School, age-gap, and family tags stay out of this boost.
_EXPLICIT_TAGS = frozenset(
    {
        "netorare",
        "netori",
        "netorase",
        "swapping",
        "multiple couples",
        "milf",
        "cougar",
        "threesome",
        "group sex",
        "oyakodon",
        "shimaidon",
        "exhibitionism",
        "voyeur",
        "voyeurism",
        "public sex",
        "blackmail",
        "mind control",
        "corruption",
        "cheating",
        "adulterer",
        "betrayal",
        "hardcore",
        "uncensored",
        "bdsm",
        "sex toys",
        "vanilla",
    }
)
_STEAMY_TAGS = frozenset(
    {
        "marriage",
        "arranged marriage",
        "female harem",
        "mixed gender harem",
        "harem",
        "office",
        "office lady",
        "workplace",
        "cohabitation",
    }
)
_KINK_TAGS = _EXPLICIT_TAGS | _STEAMY_TAGS
_HEATS = frozenset({"soft", "steamy", "explicit"})
_YOUTH_TAGS = frozenset({"school life", "teacher", "high school", "middle school", "elementary school"})


def series_heat(series: dict[str, Any]) -> str:
    names = {t.lower().strip() for t in _tag_names(series)}
    if names & _YOUTH_TAGS:
        return "soft"
    if names & _EXPLICIT_TAGS:
        return "explicit"
    if names & _STEAMY_TAGS:
        return "steamy"
    return "soft"


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


def chart_tag_counts(
    *,
    sort: str = "top-rated",
    limit: int = 48,
    heat: str | None = None,
) -> list[dict[str, Any]]:
    """Tag frequencies for titles in the current chart (for filter chips)."""
    key = sort if sort in ("top-rated", "trending", "recent") else "top-rated"
    ranked = _chart_candidates(key)
    if heat in _HEATS:
        ranked = [s for s in ranked if series_heat(s) == heat]
    counts: dict[str, int] = {}
    for series in ranked:
        for name in _tag_names(series):
            if _is_bl_or_yuri_tag(name):
                continue
            counts[name] = counts.get(name, 0) + 1
    rows = [{"name": name, "count": count} for name, count in counts.items()]
    rows.sort(key=lambda r: (-r["count"], r["name"].lower()))
    return rows[: max(1, min(limit, 80))]


def _norm_title(title: str) -> str:
    return "".join(ch for ch in title.lower() if ch.isalnum())


def chart_membership(sort: str = "top-rated") -> dict[str, list[str]]:
    """Slugs and normalized titles already included in a chart's tag counts."""
    key = sort if sort in ("top-rated", "trending", "recent") else "top-rated"
    slugs: list[str] = []
    titles: list[str] = []
    seen_titles: set[str] = set()
    for series in _chart_candidates(key):
        slug = str(series.get("slug") or "").strip()
        if slug:
            slugs.append(slug)
        names = [series.get("title"), *(series.get("alternativeTitles") or [])]
        for name in names:
            norm = _norm_title(str(name or ""))
            if norm and norm not in seen_titles:
                seen_titles.add(norm)
                titles.append(norm)
    return {"slugs": slugs, "titles": titles}


# Sin rooms match series genre tags. School-tagged titles stay out of every room.
SIN_ROOMS: dict[str, frozenset[str]] = {
    "affair": frozenset({"cheating", "adulterer", "betrayal"}),
    "netorare": frozenset({"netorare"}),
    "netori": frozenset({"netori"}),
    "netorase": frozenset({"netorase"}),
    "cuckold": frozenset(),
    "swap": frozenset({"swapping", "multiple couples", "sharing"}),
    "milf": frozenset({"milf", "cougar"}),
    "harem": frozenset({"harem", "reverse harem"}),
    "hardcore": frozenset({"hardcore"}),
    "uncensored": frozenset({"uncensored"}),
    "gangbang": frozenset(),
    "family": frozenset({"incest", "inseki", "oyakodon", "step-family", "step-incest", "stepmother", "mother-in-law"}),
    "blackmail": frozenset({"blackmail", "mind control", "corruption"}),
    "dare": frozenset({"exhibitionism", "voyeur", "voyeurism", "public sex"}),
    "bind": frozenset({"bdsm"}),
}

# Chapter-tag noise and tags we do not surface as an "act".
_ACT_SKIP = frozenset(
    {
        "short",
        "non-continuous",
        "dream",
        "imagination",
        "flashback",
        "interrupted",
        "yuri",
        "bl",
        "rape",
    }
)


_MINOR_BEAT = re.compile(
    r"\b(child|children|kid|kids|loli|shota|underage|preteen|toddler|minor)\b|"
    r"\byoung\s+(?!woman\b|lady\b|wife\b|man\b|adult\b|couple\b|mother\b|mom\b)|"
    r"\bage of (?:[1-9]|1[0-7])\b",
    re.IGNORECASE,
)


_MINOR_TEXT = re.compile(
    r"kindergarten|elementary|toddler|underage|preteen|\bloli\b|\bshota\b|\bchild\b|\bchildren\b",
    re.IGNORECASE,
)


def _mentions_minor(series: dict[str, Any]) -> bool:
    parts = [str(series.get("title") or ""), *(str(t) for t in (series.get("alternativeTitles") or []))]
    parts.extend(_tag_names(series))
    return bool(_MINOR_TEXT.search(" ".join(parts)))


def _has_youth_tag(series: dict[str, Any]) -> bool:
    names = {t.lower().strip() for t in _tag_names(series)}
    return bool(names & _YOUTH_TAGS)


def _kept_out(series: dict[str, Any]) -> bool:
    return _has_youth_tag(series) or _mentions_minor(series)


_ROOM_ACTS: dict[str, frozenset[str]] = {
    "netorare": frozenset({"netorare"}),
    "netori": frozenset({"netori"}),
    "netorase": frozenset({"netorase"}),
    "cuckold": frozenset({"cuckold", "cucking"}),
    "swap": frozenset({"swapping", "swining", "sharing"}),
    "gangbang": frozenset({"gangbang", "mmf"}),
    "dare": frozenset({"public", "voyeurism", "exhibitionism"}),
    "bind": frozenset({"bdsm", "spanking", "femdom"}),
}

# Dare and bind need two chapter hits. A single cuckold, swap, or gangbang tag is the point of that room.
_ROOM_ACT_MIN = {"cuckold": 1, "swap": 1, "gangbang": 1}

_FAMILY_DROP = re.compile(
    r"daughter|sister|daddy|\bdad\b|school|teen|loli|shota|underage|\bchild\b|\bchildren\b|"
    r"younger|brother|niece|imouto|toddler|kindergarten|elementary|preteen",
    re.IGNORECASE,
)
_FAMILY_OK = re.compile(
    r"step|milf|cougar|\baunt\b|in-law|in law|stepmother|mother-in-law|\bmom\b|\bmother\b",
    re.IGNORECASE,
)


def _chapter_act_hits(series: dict[str, Any], wanted: frozenset[str]) -> int:
    hits = 0
    for chapter in series.get("chapters") or []:
        if not isinstance(chapter, dict):
            continue
        if any(name.lower() in wanted for name in _chapter_act_names(chapter)):
            hits += 1
    return hits


def _family_allowed(series: dict[str, Any]) -> bool:
    """Adult stepmom, milf, aunt, and in-law titles. Daughter, sister, and school titles stay out."""
    title_bits = [
        str(series.get("title") or ""),
        *(str(t) for t in (series.get("alternativeTitles") or [])),
        *_tag_names(series),
    ]
    label = " ".join(title_bits)
    blob = f"{label} {series.get('description') or ''}"
    if _FAMILY_DROP.search(blob) or _MINOR_TEXT.search(blob):
        return False
    return bool(_FAMILY_OK.search(label))


def series_in_room(series: dict[str, Any], room: str) -> bool:
    if room not in SIN_ROOMS or _kept_out(series):
        return False
    if room == "family" and not _family_allowed(series):
        return False
    names = {t.lower().strip() for t in _tag_names(series)}
    wanted = SIN_ROOMS[room]
    if wanted and names & wanted:
        return True
    acts = _ROOM_ACTS.get(room)
    # Dare and bind ignore a single stray chapter. Cuckold, swap, and gangbang count from one.
    need = _ROOM_ACT_MIN.get(room, 2)
    return bool(acts and _chapter_act_hits(series, acts) >= need)


def _chapter_act_names(chapter: dict[str, Any]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for tag in chapter.get("tags") or []:
        raw = tag.get("name") if isinstance(tag, dict) else tag
        name = str(raw or "").strip()
        key = name.lower()
        if not name or key in seen or key in _ACT_SKIP:
            continue
        seen.add(key)
        names.append(name)
    return names


# Who the sex is with. The couple alone stays unmarked. Another man, or a swap, is marked.
_OTHER_MAN_TAGS = frozenset({"cuckold", "netorase"})
_GROUP_TAGS = frozenset({"gangbang", "mmf", "double penetration"})
_NTR_TAGS = frozenset({"netorare", "netori"})
_SWAP_TAGS = frozenset({"swapping", "sharing", "netorase"})
_CHEAT_TAGS = frozenset({"cheating", "affair", "betrayal", "office affair", "adulterer"})
_OTHER_MAN_TEXT = re.compile(
    r"stranger|another man|other man|someone else|not her husband|another guy|\bbull\b|"
    r"\bcuck|\bntr\b|netorare|netori|mc joins later|without the mc",
    re.IGNORECASE,
)
_SWAP_TEXT = re.compile(
    r"\bswap|wife exchange|partner exchange|exchanged|traded wives|traded partners|couples? swap",
    re.IGNORECASE,
)


def _gender_of(description: str) -> str:
    """Best-effort m/f from a catalogue bio. Unknown stays u."""
    head = (description or "").lower()[:180]
    if re.search(r"\bshe\b", head):
        return "f"
    if re.search(r"\b(a man|he is|he's)\b", head):
        return "m"
    if re.search(r"'s wife\b|\bgirlfriend\b", head):
        return "f"
    if re.search(r"\bhe\b", head):
        return "m"
    return "u"


_POSSESSIVE_REL = re.compile(
    r"([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,2})['’]s\s+"
    r"(?:(?:younger|older|little|eldest|youngest|childhood|easy-going|ex)\s+){0,3}"
    r"((?i:step-?mother|step-?father|mother-in-law|father-in-law|sister-in-law|"
    r"ex-?wife|ex-?husband|ex-?girlfriend|ex-?boyfriend|"
    r"girlfriend|boyfriend|wife|husband|mother|father|sister|brother|"
    r"friend|daughter|son|boss|crush|fianc[eé]e?|"
    r"aunt|uncle|cousin|neighbou?r))",
)

# Specific words first. "girlfriend" must win before "friend".
_REL_WORDS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("shopkeeper", re.compile(r"shop\s*keeper|shop owner|store owner|store clerk", re.I)),
    ("student", re.compile(r"\bstudent\b|\bclassmate\b|\bpupil\b", re.I)),
    ("teacher", re.compile(r"\bteacher\b|\bprofessor\b|\btutor\b", re.I)),
    ("stepmother", re.compile(r"step-?mom|step-?mother", re.I)),
    ("stepfather", re.compile(r"step-?dad|step-?father", re.I)),
    ("mother-in-law", re.compile(r"mother-in-law", re.I)),
    ("sister-in-law", re.compile(r"sister-in-law", re.I)),
    ("ex-wife", re.compile(r"ex-?wife", re.I)),
    ("ex-girlfriend", re.compile(r"ex-?girlfriend", re.I)),
    ("ex-boyfriend", re.compile(r"ex-?boyfriend", re.I)),
    ("girlfriend", re.compile(r"\bgirlfriend\b", re.I)),
    ("boyfriend", re.compile(r"\bboyfriend\b", re.I)),
    ("wife", re.compile(r"\bwife\b|\bhousewife\b", re.I)),
    ("husband", re.compile(r"\bhusband\b", re.I)),
    ("mother", re.compile(r"\bmother\b|\bmom\b", re.I)),
    ("father", re.compile(r"\bfather\b|\bdad\b", re.I)),
    ("sister", re.compile(r"\bsister\b", re.I)),
    ("brother", re.compile(r"\bbrother\b", re.I)),
    ("aunt", re.compile(r"\baunt\b", re.I)),
    ("uncle", re.compile(r"\buncle\b", re.I)),
    ("cousin", re.compile(r"\bcousin\b", re.I)),
    ("niece", re.compile(r"\bniece\b", re.I)),
    ("relative", re.compile(r"\brelative\b|\bin-law\b", re.I)),
    ("neighbor", re.compile(r"\bneighbou?r\b", re.I)),
    ("boss", re.compile(r"\bboss\b", re.I)),
    ("coworker", re.compile(r"\bcoworker\b|\bcolleague\b|\bco-worker\b", re.I)),
    ("nurse", re.compile(r"\bnurse\b", re.I)),
    ("doctor", re.compile(r"\bdoctor\b", re.I)),
    ("maid", re.compile(r"\bmaid\b", re.I)),
    ("secretary", re.compile(r"\bsecretary\b", re.I)),
    ("landlord", re.compile(r"\blandlord\b", re.I)),
    ("model", re.compile(r"\bmodel\b|\bidol\b", re.I)),
    ("friend", re.compile(r"\bfriend\b", re.I)),
    ("crush", re.compile(r"\bcrush\b", re.I)),
    ("bully", re.compile(r"\bbully\b", re.I)),
    ("detective", re.compile(r"\bdetective\b", re.I)),
)


def _bio_relation(name: str, bio: str) -> str:
    """Short relation from the catalogue bio or from a name like \"Juhui's Husband\"."""
    text = bio or ""
    of_rel = re.search(
        r"\b(friend|wife|husband|girlfriend|boyfriend|daughter|son|sister|brother)\s+of\s+"
        r"([A-Z][\w'’-]+)(?:['’]s)?\s+(mother|mom|father|dad|friend|wife|husband)\b",
        text,
        re.I,
    )
    if of_rel:
        who = re.sub(r"['’]s$", "", of_rel.group(2))
        return f"{who}'s {of_rel.group(3).lower()}'s {of_rel.group(1).lower()}"
    found = _POSSESSIVE_REL.search(text)
    if found:
        who = re.sub(r"^(?:As|A|An|The)\s+", "", found.group(1))
        return f"{who}'s {found.group(2).lower()}"
    named = re.match(r"(.+?)['’]s\s+(.+)$", (name or "").strip())
    if named:
        return f"{named.group(1)}'s {named.group(2).strip().lower()}"
    for label, pattern in _REL_WORDS:
        for match in pattern.finditer(bio or ""):
            prefix = (bio or "")[max(0, match.start() - 12) : match.start()].lower()
            # "his wife" talks about someone else. "a dirty wife" is this character.
            if re.search(r"\b(his|her|their|your|my)\s+$", prefix):
                continue
            return label
    short = " ".join((bio or "").split())
    if short and len(short) <= 42:
        return short.rstrip(".")
    return ""


def _relation_label(person: dict[str, str], *, sole_main: bool) -> str:
    bio = person.get("bio") or ""
    role = person["role"].lower()
    is_mc = bool(re.search(r"main character|protagonist|story revolves", bio, re.I)) or (role == "main" and sole_main)
    rel = _bio_relation(person["name"], bio)
    if rel and rel.lower() in person["name"].lower():
        rel = ""
    if rel:
        return f"MC, {rel}" if is_mc and sole_main else rel
    if is_mc:
        return "MC"
    if role == "main":
        return "lead"
    return ""


def _with_relation(person: dict[str, str]) -> str:
    rel = person.get("relation") or ""
    if not rel:
        return person["name"]
    return f"{person['name']} ({rel})"


def _series_people(raw: dict[str, Any]) -> dict[str, dict[str, str]]:
    people: dict[str, dict[str, str]] = {}
    for person in raw.get("characters") or []:
        if not isinstance(person, dict) or not person.get("name"):
            continue
        name = str(person["name"])
        bio = str(person.get("description") or "")
        people[name] = {
            "name": name,
            "role": str(person.get("role") or ""),
            "gender": _gender_of(bio),
            "bio": bio,
            "relation": "",
            "has_spouse": bool(re.search(r"\b(?:his|her)\s+(?:wife|husband)\b", bio, re.I)),
        }
    sole_main = sum(1 for person in people.values() if person["role"].lower() == "main") == 1
    for person in people.values():
        person["relation"] = _relation_label(person, sole_main=sole_main)
    _apply_story_roles(raw, people)
    return people


def _apply_story_roles(raw: dict[str, Any], people: dict[str, dict[str, str]]) -> None:
    """Use the synopsis when it says whose mom, and which friend is with her son."""
    text = " ".join(
        [
            str(raw.get("title") or ""),
            *(str(title) for title in (raw.get("alternativeTitles") or [])),
            str(raw.get("description") or ""),
        ]
    )
    names = set(people)
    sons: list[tuple[str, str, str]] = []

    def add_son(found: str, hint: str, role: str) -> None:
        if found and found not in {name for name, _hint, _role in sons}:
            sons.append((found, hint, role))

    for match in re.finditer(r"([A-Z][\w'’-]+)['’]s\s+(?:mom|mother)\b", text):
        window = text[match.end() : match.end() + 70]
        he = re.search(r"\b(?:he|him|his)\b", window, re.I)
        she = re.search(r"\b(?:she|her)\b", window, re.I)
        if he and (not she or he.start() < she.start()):
            role = "son"
        else:
            role = ""
        add_son(_match_cast(match.group(1), names), match.group(1), role)
    for match in re.finditer(r"([A-Z][\w'’-]+)\s+is\b.{0,80}\bhis\s+mom", text):
        add_son(_match_cast(match.group(1), names), match.group(1), "son")
    mothers = [
        person["name"]
        for person in people.values()
        if (person.get("relation") or "").lower() in {"mother", "mom"}
        or _bio_relation(person["name"], person.get("bio") or "").lower() in {"mother", "mom"}
    ]
    if len(sons) == 1:
        son, hint, role = sons[0]
        if role:
            people[son]["relation"] = role
        if len(mothers) == 1 and mothers[0] != son:
            people[mothers[0]]["relation"] = f"{hint}'s mother"
    elif len(mothers) == 1:
        named = re.search(r"([A-Z][\w'’-]+)['’]s\s+(?:mom|mother)\b", text)
        if named and not _match_cast(named.group(1), names):
            people[mothers[0]]["relation"] = f"{named.group(1)}'s mother"
    named_mom = re.search(
        r"([A-Z][\w'’-]+)['’]s\s+(?:mom|mother),?\s+((?:Mrs\.?\s+|Mr\.?\s+)?[A-Z][\w'’-]+)",
        text,
    )
    if named_mom:
        mom = _match_cast(named_mom.group(2), names)
        if mom:
            people[mom]["relation"] = f"{named_mom.group(1)}'s mother"
    friend_story = bool(
        re.search(r"mom['’]s\s+friends?|\bfriends?\b.{0,50}\b(?:tempt|seduc|teas)", text, re.I)
    )
    if friend_story and len(sons) == 1 and len(mothers) == 1:
        for person in people.values():
            person["mom_circle"] = sons[0][0]


def _chapter_people(chapter: dict[str, Any], people: dict[str, dict[str, str]]) -> list[dict[str, str]]:
    present: list[dict[str, str]] = []
    seen: set[str] = set()
    for person in chapter.get("characters") or []:
        if not isinstance(person, dict) or not person.get("name"):
            continue
        name = str(person["name"])
        if name in seen:
            continue
        seen.add(name)
        known = people.get(name) or {}
        present.append(
            {
                "name": name,
                "role": str(person.get("role") or known.get("role") or ""),
                "gender": known.get("gender") or "u",
                "relation": known.get("relation") or "",
                "bio": known.get("bio") or "",
            }
        )
    return present


def _match_cast(hint: str, names: set[str]) -> str:
    key = re.sub(r"[^a-z0-9]+", "", hint.lower())
    if len(key) < 3:
        return ""

    def fold(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "", value.lower())

    exact = [name for name in names if fold(name) == key]
    if exact:
        return exact[0]
    hits = [name for name in names if key in fold(name)]
    if len(hits) == 1:
        return hits[0]
    return ""


def _cast_bonds(people: dict[str, dict[str, str]]) -> list[tuple[str, str, str]]:
    """(spouse owner, the other person, wife|husband|girlfriend|boyfriend)."""
    bonds: list[tuple[str, str, str]] = []
    names = set(people)
    for person in people.values():
        raw = _bio_relation(person["name"], person.get("bio") or "")
        match = re.fullmatch(r"(.+?)'s ([a-z][a-z -]{1,24})", raw.strip(), re.I)
        if not match:
            continue
        owner = _match_cast(match.group(1), names)
        kind = match.group(2).strip().lower()
        if owner and owner != person["name"] and kind in {"wife", "husband", "girlfriend", "boyfriend", "ex-wife", "ex-girlfriend", "ex-boyfriend"}:
            bonds.append((owner, person["name"], kind))
    return bonds


def _between(left: str, right: str, bonds: list[tuple[str, str, str]], married: tuple[str, str] | None) -> str:
    """How these two are connected. Blank when the catalogue never says."""
    for owner, other, kind in bonds:
        if {owner, other} != {left, right}:
            continue
        if kind == "wife":
            return "his wife"
        if kind == "husband":
            return "her husband"
        if kind == "girlfriend":
            return "his girlfriend"
        if kind == "boyfriend":
            return "her boyfriend"
        if kind.startswith("ex-"):
            return kind
    for person, partner in ((right, left), (left, right)):
        for owner, other, kind in bonds:
            if person not in {owner, other} or partner in {owner, other}:
                continue
            if kind == "wife" and other == person:
                return f"she is {owner}'s wife, not his"
            if kind == "husband" and owner == person:
                return "she is married to someone else"
            if kind == "girlfriend" and other == person:
                return f"she is {owner}'s girlfriend, not his"
            if kind == "boyfriend" and owner == person:
                return "her boyfriend is someone else"
            if kind == "wife" and owner == person:
                return "he is married to someone else"
            if kind == "husband" and other == person:
                return f"he is {owner}'s husband, not hers"
    if married and {left, right} == set(married):
        return "his wife"
    if married and (left in married) ^ (right in married):
        return "not his wife"
    return ""


def _pairing(
    present: list[dict[str, str]],
    people: dict[str, dict[str, str]],
    *,
    series_is_swap: bool,
    series_is_ntr: bool,
) -> tuple[str, list[str]]:
    """Who is with whom. The couple alone is unmarked. Someone else with her is marked."""
    mains = [person for person in people.values() if person["role"].lower() == "main"]
    male_main = next((person for person in mains if person["gender"] == "m"), None)
    female_main = next((person for person in mains if person["gender"] == "f"), None)
    if male_main and female_main:
        couple = {male_main["name"], female_main["name"]}
    else:
        couple = {person["name"] for person in mains}
    male_name = male_main["name"] if male_main else ""
    female_name = female_main["name"] if female_main else ""
    names = {person["name"] for person in present}
    outsiders = [person for person in present if person["name"] not in couple]
    other_men = [person for person in outsiders if person["gender"] != "f"]
    other_women = [person for person in outsiders if person["gender"] == "f"]
    only_couple = bool(couple) and bool(names) and names <= couple
    other_with_her = bool(female_name) and female_name in names and bool(other_men)
    bonds = _cast_bonds(people)
    spouse_mains = [
        person for person in people.values() if person["role"].lower() == "main" and person.get("has_spouse")
    ]
    husbands = [person["name"] for person in spouse_mains if person["gender"] == "m"]
    wives = [person["name"] for person in spouse_mains if person["gender"] == "f"]
    married = (husbands[0], wives[0]) if len(husbands) == 1 and len(wives) == 1 else None

    pairs: list[str] = []
    by_name = {person["name"]: person for person in present}

    def who(name: str) -> str:
        return _with_relation(by_name.get(name) or people.get(name) or {"name": name, "relation": ""})

    def shown(name: str, partner: str) -> str:
        person = people.get(name) or {"name": name, "relation": ""}
        rel = person.get("relation") or ""
        partner_rel = (people.get(partner) or {}).get("relation") or ""
        if (
            rel in {"", "lead"}
            and partner_rel == "son"
            and person.get("mom_circle")
            and person.get("gender") != "m"
            and "husband" not in name.lower()
        ):
            rel = "his mom's friend"
        if not rel:
            return name
        return f"{name} ({rel})"

    def linked(left: str, right: str) -> str:
        base = f"{shown(left, right)} with {shown(right, left)}"
        extra = _between(left, right, bonds, married)
        return f"{base} — {extra}" if extra else base

    if other_with_her:
        pairs.append(linked(female_name, other_men[0]["name"]))
    if male_name and male_name in names and other_women:
        pairs.append(linked(male_name, other_women[0]["name"]))
    if not pairs and only_couple:
        ordered = [person["name"] for person in present if person["name"] in couple]
        if len(ordered) >= 2:
            pairs.append(linked(ordered[0], ordered[1]))
        elif ordered:
            pairs.append(who(ordered[0]))
    elif not pairs and len(present) >= 2:
        pairs.append(linked(present[0]["name"], present[1]["name"]))
    elif not pairs and present:
        pairs.append(_with_relation(present[0]))

    marks: list[str] = []
    if only_couple:
        return " · ".join(pairs), marks
    if other_with_her or (outsiders and series_is_ntr and not other_women):
        marks.append("cuckold")
        if series_is_ntr:
            marks.append("ntr")
    if series_is_swap and outsiders:
        marks.append("swap")
    elif other_with_her and "cuckold" not in marks:
        marks.append("cuckold")
    return " · ".join(pairs), list(dict.fromkeys(marks))


def _chapter_marks(acts: list[str], line: str, *, series_is_swap: bool, series_is_ntr: bool) -> list[str]:
    """Couple-only chapters stay empty. Another man, or a partner swap, is marked."""
    keys = {act.lower() for act in acts}
    text_other = bool(line and _OTHER_MAN_TEXT.search(line))
    text_swap = bool(line and _SWAP_TEXT.search(line))
    group = bool(keys & _GROUP_TAGS)
    other_man = bool(keys & (_OTHER_MAN_TAGS | _NTR_TAGS)) or text_other or (group and (series_is_ntr or series_is_swap))
    swapped = bool(keys & _SWAP_TAGS) or text_swap or (series_is_swap and (other_man or group))
    marks: list[str] = []
    if keys & _NTR_TAGS or (other_man and series_is_ntr and not swapped):
        marks.append("ntr")
    if other_man:
        marks.append("cuckold")
    if swapped:
        marks.append("swap")
    if keys & _CHEAT_TAGS:
        marks.append("cheating")
    return list(dict.fromkeys(marks))


def series_acts(slug: str) -> dict[str, Any] | None:
    """Chapter beats labeled with the sex acts tagged on that stretch. Youth-tagged series are empty."""
    raw = _find_series_raw(slug)
    if not raw:
        return None
    title = str(raw.get("title") or "Untitled")
    if _kept_out(raw):
        return {"slug": raw.get("slug"), "title": title, "blocked": True, "beats": []}

    series_tags = {name.lower().strip() for name in _tag_names(raw)}
    series_is_swap = bool(series_tags & {"swapping", "multiple couples"})
    series_is_ntr = bool(series_tags & {"netorare", "netori", "netorase", "cuckold", "cheating", "adulterer"})
    people = _series_people(raw)
    beats: list[dict[str, Any]] = []
    for chapter in raw.get("chapters") or []:
        if not isinstance(chapter, dict):
            continue
        acts = _chapter_act_names(chapter)
        present = _chapter_people(chapter, people)
        if not acts and len(present) < 2:
            continue
        start = chapter.get("chapterStart")
        end = chapter.get("chapterEnd")
        if start is None:
            continue
        start_n = int(start)
        end_n = int(end) if isinstance(end, int) and end != start_n else None
        label = f"Ch {start_n}–{end_n}" if end_n else f"Ch {start_n}"
        note = " ".join(str(chapter.get("description") or "").split())
        if note and _MINOR_BEAT.search(note):
            continue
        who, cast_marks = _pairing(present, people, series_is_swap=series_is_swap, series_is_ntr=series_is_ntr)
        tag_marks = _chapter_marks(acts, note, series_is_swap=series_is_swap, series_is_ntr=series_is_ntr)
        # The relation line is what the card shows. The raw note stays only when no role is known.
        line = who
        if note and note.lower() not in (who or "").lower():
            line = f"{who}. {note}" if who else note
        beats.append(
            {
                "start": start_n,
                "end": end_n,
                "label": label,
                "acts": acts[:4],
                "marks": list(dict.fromkeys([*cast_marks, *tag_marks])),
                "line": line[:420],
            }
        )
    beats.sort(key=lambda beat: (beat["start"], beat["end"] or beat["start"]))
    return {"slug": raw.get("slug"), "title": title, "blocked": False, "beats": beats[:80]}


def chart_page(
    *,
    sort: str = "top-rated",
    page: int = 1,
    limit: int = 24,
    tag: str | None = None,
    heat: str | None = None,
    room: str | None = None,
    also: str | None = None,
    act: str | None = None,
) -> dict[str, Any]:
    """Ranked manhwa from export (matches PornhwaDB-style top lists; no Yuri/BL)."""
    key = sort if sort in ("top-rated", "trending", "recent") else "top-rated"
    heat_key = heat if heat in _HEATS else None
    room_key = room if room in SIN_ROOMS else None
    also_key = also if also in SIN_ROOMS and also != room_key else None
    raw_act = (act or "").strip().lower()[:40]
    act_blocked = bool(raw_act) and (
        raw_act in _ACT_SKIP or bool(_MINOR_TEXT.search(raw_act)) or bool(_FAMILY_DROP.search(raw_act))
    )
    act_key = "" if act_blocked else raw_act
    # Rooms and act search use the whole catalogue. The default chart stays on its curated list.
    ranked = [] if act_blocked else _chart_candidates("trending" if room_key or also_key or act_key else key)
    if room_key:
        ranked = [s for s in ranked if series_in_room(s, room_key)]
    if also_key:
        ranked = [s for s in ranked if series_in_room(s, also_key)]
    if act_key:
        wanted_act = frozenset({act_key})
        ranked = [s for s in ranked if _chapter_act_hits(s, wanted_act) >= 1]
    if room_key or act_key:
        act_wanted = _ROOM_ACTS.get(room_key or "", frozenset())
        if act_key:
            act_wanted = frozenset({act_key})
        ranked.sort(
            key=lambda s: (
                -_chapter_act_hits(s, act_wanted),
                -_weighted_rating(s),
                -int((s.get("ratingAggregate") or {}).get("totalRatings") or 0),
            )
        )
    if heat_key:
        ranked = [s for s in ranked if series_heat(s) == heat_key]
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
        "heat": heat_key,
        "room": room_key,
        "also": also_key,
        "act": act_key or None,
        "page": page,
        "perPage": limit,
        "total": len(ranked),
        "hasNextPage": end < len(ranked),
        "items": items,
    }


def catalogue_status() -> dict[str, Any]:
    cat = _catalogue()
    if not cat:
        return {
            "configured": False,
            "path": str(_data_path()),
            "hint": _status_hint(),
            "remoteBootstrap": bool(
                (settings.pornhwadb_data_url or "").strip()
                or (settings.pornhwadb_storage_bucket or "").strip()
            ),
        }
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


def search_all_public() -> list[dict[str, Any]]:
    cat = _catalogue()
    return [_public_series(s) for s in (cat or {}).get("pornhwa") or []]


def _find_series_raw(slug: str) -> dict[str, Any] | None:
    cat = _catalogue()
    if not cat or not slug.strip():
        return None
    key = slug.strip().lower()
    for series in cat.get("pornhwa") or []:
        if str(series.get("slug") or "").lower() == key:
            return series
    return None


def same_kink_series(slug: str, *, limit: int = 10, exclude: set[str] | None = None) -> list[dict[str, Any]]:
    """Titles that share explicit or steamy tags with this series."""
    target = get_series(slug)
    if not target:
        return []
    want = {t.lower() for t in target.get("tags") or []} & _KINK_TAGS
    if not want:
        return []
    skip = {slug.lower(), *(s.lower() for s in (exclude or set()))}
    scored: list[tuple[int, int, float, dict[str, Any], set[str]]] = []
    for row in search_all_public():
        key = str(row.get("slug") or "").lower()
        if not key or key in skip:
            continue
        names = {t.lower() for t in row.get("tags") or []}
        if names & _YOUTH_TAGS:
            continue
        overlap = names & want
        if not overlap:
            continue
        scored.append(
            (
                len(overlap & _EXPLICIT_TAGS),
                len(overlap),
                float(row.get("averageRating") or 0),
                row,
                overlap,
            )
        )
    scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    cards: list[dict[str, Any]] = []
    for hit in scored[: max(1, min(limit, 20))]:
        row, overlap = hit[3], hit[4]
        tags = list(row.get("tags") or [])
        spicy = [t for t in tags if t.lower() in overlap]
        rest = [t for t in tags if t.lower() not in overlap]
        cards.append(
            {
                "slug": row.get("slug"),
                "title": row.get("title"),
                "coverImage": row.get("coverImage"),
                "averageRating": row.get("averageRating"),
                "tags": (spicy + rest)[:3],
            }
        )
    return cards


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
