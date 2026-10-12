"""RAG service for OtakuVault assistant using NVIDIA NIM and local vector index."""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path
from typing import Any, AsyncGenerator

import httpx
import numpy as np

from app.core.config import settings

logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BACKEND_DIR / "data"
NPZ_PATH = DATA_DIR / "catalogue_embeddings.npz"
META_PATH = DATA_DIR / "catalogue_embeddings_meta.json"

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
EMBED_MODEL = "nvidia/nemotron-3-embed-1b"
CHAT_MODEL = "nvidia/nemotron-3.5-lightning-30b-a3b"

GREETING_RE = re.compile(
    r"^\s*(hi+|hii+|hello+|hey+|yo|sup|hola|namaste|konnichiwa|ohayo|good\s+(morning|afternoon|evening|night)|what'?s\s+up)"
    r"(\s+(there|kimetsu|buddy|bro))?[\s!.?~]*$",
    re.I,
)
THANKS_RE = re.compile(r"^\s*(thanks?|thank\s+you|thx|ty|ok(ay)?|cool|nice|great|bye|good\s*bye|see\s+ya)[\s!.~]*$", re.I)
DOMAIN_RE = re.compile(
    r"\b(anime|manga|manhwa|manhua|webtoon|pornhwa|isekai|shonen|shounen|shojo|seinen|josei|harem|ecchi|hentai|"
    r"romance|action|fantasy|drama|comedy|horror|thriller|mystery|slice\s+of\s+life|sports|mecha|revenge|regression|"
    r"murim|system|villainess|bl|gl|yaoi|yuri|genre|episode|chapter|season|arc|character|mc|plot|story|synopsis|ending|"
    r"recommend|suggest|similar|like|watch|read|binge|next|top|rated|rating|popular|best|trending|random|surprise|"
    r"library|shelf|list|status|progress|stats|completed|dropped|on\s+hold|plan|gallery|import|anilist|creamy|clean|"
    r"mode|feature|app|otakuvault|vault|kimetsu|how\s+to|help)\b",
    re.I,
)
OFF_TOPIC_RE = re.compile(
    r"\b(prime\s+minister|pm|minister|president|india|usa|china|country|war|politic\w*|election|government|stock|crypto|bitcoin|weather|recipe|homework|"
    r"math|equation|physics|chemistry|biology|history\s+of|python|javascript|java|sql|program(ming)?|code|"
    r"covid|news|capital\s+of|population|celebrity|cricket|football|ipl|movie\s+review|translate|essay)\b",
    re.I,
)
SHELF_RE = re.compile(r"\b(my|mine|shelf|library|stats|watching|reading|completed|dropped|plan|progress|next|recommend|suggest|similar|like)\b", re.I)


def detect_intent(text: str, has_history: bool, known_titles: set[str]) -> str:
    """Cheap local intent classifier used to steer the LLM and skip unneeded retrieval."""
    t = text.strip()
    lower = t.lower()
    if not t:
        return "vague"
    if GREETING_RE.match(t):
        return "greeting"
    if THANKS_RE.match(t):
        return "smalltalk"
    has_domain = bool(DOMAIN_RE.search(lower))
    mentions_title = any(len(k) >= 4 and k in lower for k in known_titles)
    if OFF_TOPIC_RE.search(lower) and not has_domain and not mentions_title:
        return "off_topic"
    if has_domain or mentions_title:
        return "query"
    if has_history:
        return "followup"
    return "vague"


INTENT_GUIDE = {
    "greeting": "The user is greeting you. Greet back warmly in your own words (vary it, use their shelf for a personal touch if available), then ask what they're in the mood for and offer options.",
    "smalltalk": "The user sent a short acknowledgement/thanks/bye. Respond naturally in one sentence; offer 2-3 relevant next steps only if it fits.",
    "off_topic": "The message is outside your scope. Politely decline in one sentence in your own words and steer back to anime/manga/manhwa or OtakuVault with options.",
    "vague": "The input is unclear or too short to act on. Do NOT guess. Ask ONE short clarifying question about what they want (e.g. type, genre, mood, or a feature) and give options that would make their intent clear.",
    "followup": "This is likely a reply to your previous message (e.g. picking an option or answering your question). Interpret it using the conversation and continue: if you now have enough info, give the answer/recommendations; otherwise ask the next narrowing question.",
    "query": "Answer the request directly using the knowledge base and shelf below. If key details are missing for a good answer (e.g. genre or anime vs manhwa), ask one short clarifying question with options instead of guessing.",
}


class RAGService:
    def __init__(self) -> None:
        self._embeddings: np.ndarray | None = None
        self._metadata: list[dict[str, Any]] | None = None
        self._norms: np.ndarray | None = None

    def _ensure_index_loaded(self) -> bool:
        if self._embeddings is not None and self._metadata is not None:
            return True

        if not NPZ_PATH.is_file() or not META_PATH.is_file():
            logger.warning("RAG index files not found at %s or %s", NPZ_PATH, META_PATH)
            return False

        try:
            data = np.load(NPZ_PATH)
            raw_embeddings = data["embeddings"].astype(np.float32)
            with META_PATH.open("r", encoding="utf-8") as f:
                self._metadata = json.load(f)

            # Pre-compute L2 norms for cosine similarity
            norms = np.linalg.norm(raw_embeddings, axis=1, keepdims=True)
            norms[norms == 0] = 1e-10
            self._embeddings = raw_embeddings / norms
            logger.info("Loaded RAG index with %d documents (dim: %d)", len(self._metadata), raw_embeddings.shape[1])
            return True
        except Exception as e:
            logger.exception("Failed to load RAG index: %s", e)
            return False

    def is_configured(self) -> bool:
        key = settings.nvidia_api_key or os.getenv("NVIDIA_API_KEY", "")
        return bool(key.strip())

    async def get_query_embedding(self, query: str) -> list[float] | None:
        key = (settings.nvidia_api_key or os.getenv("NVIDIA_API_KEY", "")).strip()
        if not key:
            return None

        url = f"{NVIDIA_BASE_URL}/embeddings"
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "model": EMBED_MODEL,
            "input": [query],
            "input_type": "query",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                return data["data"][0]["embedding"]
            else:
                logger.error("NVIDIA query embedding error (%d): %s", res.status_code, res.text)
                return None

    def search_similar(
        self,
        query_vec: list[float],
        top_k: int = 5,
        content_mode: str = "creamy",
    ) -> list[dict[str, Any]]:
        """Perform cosine similarity search over catalogue embeddings."""
        if not self._ensure_index_loaded() or self._embeddings is None or self._metadata is None:
            return []

        q = np.array(query_vec, dtype=np.float32)
        q_norm = np.linalg.norm(q)
        if q_norm > 0:
            q = q / q_norm

        scores = np.dot(self._embeddings, q)
        ranked_indices = np.argsort(scores)[::-1]

        results = []
        for idx in ranked_indices:
            meta = self._metadata[idx]
            # Content filter: In 'clean' mode, do not retrieve adult titles
            if content_mode == "clean" and meta.get("isAdult"):
                continue

            score = float(scores[idx])
            results.append({**meta, "similarity": round(score, 4)})
            if len(results) >= top_k:
                break

        return results

    def build_prompt_context(
        self,
        retrieved_docs: list[dict[str, Any]],
        shelf_items: list[dict[str, Any]],
        user_query: str,
        full_shelf: bool = True,
    ) -> str:
        """Construct prompt context containing user shelf info and retrieved knowledge."""
        lines = []

        if shelf_items:
            counts: dict[str, int] = {}
            for item in shelf_items:
                s = item.get("status") or "unknown"
                counts[s] = counts.get(s, 0) + 1
            watching = [i.get("title") for i in shelf_items if i.get("status") == "watching"][:5]
            lines.append(
                f"### User Shelf: {len(shelf_items)} titles ("
                + ", ".join(f"{k} {v}" for k, v in counts.items())
                + ")"
                + (f"; currently watching: {', '.join(watching)}" if watching else "")
            )

        if shelf_items and full_shelf:
            lines.append("Shelf titles (already owned — don't recommend these as new):")
            for item in shelf_items[:25]:
                title = item.get("title", "Untitled")
                status = item.get("status", "unknown")
                mtype = item.get("media_type", "title")
                rating = f"★ {item['rating']}" if item.get("rating") else ""
                progress = f"progress: {item['progress']}/{item['total']}" if item.get("total") else ""
                notes = f"notes: {item['notes']}" if item.get("notes") else ""
                details = " · ".join(filter(None, [mtype, status, rating, progress, notes]))
                lines.append(f"- **{title}** ({details})")

        if retrieved_docs:
            lines.append("\n### Relevant Catalogue Knowledge Base (synopses & metadata):")
            for doc in retrieved_docs:
                title = doc.get("title")
                tags = ", ".join(doc.get("tags") or [])
                rating = f"Rating: {doc.get('averageRating')}/5" if doc.get("averageRating") else ""
                desc = doc.get("description") or ""
                lines.append(f"- **{title}** | {tags} | {rating}\n  {desc[:300]}")

        return "\n".join(lines)

    async def chat_completion(
        self,
        messages: list[dict[str, str]],
        shelf_items: list[dict[str, Any]] | None = None,
        content_mode: str = "creamy",
    ) -> dict[str, Any]:
        """Perform RAG chat completion and return response with clickable action items."""
        key = (settings.nvidia_api_key or os.getenv("NVIDIA_API_KEY", "")).strip()
        if not key:
            raise RuntimeError("NVIDIA_API_KEY is not configured.")

        last_user_msg = next((m["content"] for m in reversed(messages) if m.get("role") == "user"), "")
        user_msgs = [m["content"] for m in messages if m.get("role") == "user" and m.get("content")]
        has_history = any(m.get("role") == "assistant" for m in messages[:-1])

        self._ensure_index_loaded()
        known_titles = {(m.get("title") or "").strip().lower() for m in (self._metadata or [])}
        known_titles |= {(s.get("title") or "").strip().lower() for s in (shelf_items or [])}
        known_titles.discard("")
        intent = detect_intent(last_user_msg, has_history, known_titles)

        # 1. Retrieve only when it can help (saves an embedding call + prompt tokens on greetings/off-topic)
        retrieved_docs: list[dict[str, Any]] = []
        if intent in ("query", "followup"):
            # Follow-ups like "romance" only make sense with the previous user turn
            retrieval_query = " ".join(user_msgs[-2:])[-400:] if intent == "followup" else last_user_msg[:400]
            q_vec = await self.get_query_embedding(retrieval_query)
            if q_vec:
                docs = self.search_similar(q_vec, top_k=4, content_mode=content_mode)
                if docs:
                    best = docs[0]["similarity"]
                    retrieved_docs = [d for d in docs if d["similarity"] >= best - 0.12]

        # 2. Build RAG context (full shelf list only when the user is asking about it / recommendations)
        full_shelf = intent in ("query", "followup") and bool(SHELF_RE.search(" ".join(user_msgs[-2:])))
        context_str = "" if intent == "off_topic" else self.build_prompt_context(
            retrieved_docs, shelf_items or [], last_user_msg, full_shelf=full_shelf
        )

        system_prompt = f"""You are Kimetsu, the friendly in-app AI buddy for OtakuVault. Talk like a fun otaku friend, never like a script.

### HOW TO RESPOND
- Reply to what the user actually said, in fresh wording every time. Never reuse canned phrases or repeat a previous reply.
- Keep it short: 1-4 sentences or up to 4 brief bullets. Bold every title, e.g. **Solo Leveling**.
- Only recommend titles from the knowledge base or shelf below; if nothing fits, say so and ask to narrow down.
- For recommendations give 2-4 picks, each with a one-line reason tied to the user's request.
- When you ask the user a question or a choice helps, end with ONE line: [OPTIONS: a | b | c]
  2-4 options, max 4 words each, specific to THIS conversation (e.g. genres they hinted at, titles you just mentioned, the next logical step). Don't offer what they already picked.

### CURRENT TURN
{INTENT_GUIDE[intent]}

### SCOPE (STRICT)
Only OtakuVault features, anime, manga, manhwa/manhua/webtoons (plots, characters, relations, recommendations). For anything else, briefly decline and steer back.

### OTAKUVAULT APP CHEAT SHEET:
- **Clean Mode (SFW)**: Mainstream anime & manga only. Hides all 18+ adult titles and adult gallery art.
- **Creamy Mode (18+)**: Unlocks adult manhwa, the Top Rated community chart (#1-#100), and adult gallery art.
- **Library (`/`)**: Track titles (Watching, Completed, Plan to watch, On hold, Dropped), log progress, ratings (1-10★), and notes.
- **Top Rated (`/community-lists`)**: Community top-100 manhwa ranking (Creamy mode only).
- **Gallery (`/gallery`)**: Browse and save high-res art & panels.
- **Import (`/import`)**: Import watchlists from AniList or JSON.
- **Shortcuts**: Ctrl+K opens this chat; trash icon clears chat history.

{context_str}"""

        api_messages = [{"role": "system", "content": system_prompt}]
        for m in messages[-8:]:
            if m.get("role") in ("user", "assistant") and m.get("content"):
                api_messages.append({"role": m["role"], "content": m["content"][:700]})

        payload = {
            "model": CHAT_MODEL,
            "messages": api_messages,
            "temperature": 0.8,
            "max_tokens": 200 if intent in ("greeting", "smalltalk", "off_topic", "vague") else 380,
            "chat_template_kwargs": {"enable_thinking": False},
        }

        url = f"{NVIDIA_BASE_URL}/chat/completions"
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code != 200:
                logger.error("NVIDIA chat completion error (%d): %s", res.status_code, res.text)
                raise RuntimeError(f"NVIDIA AI service error ({res.status_code}): {res.text[:120]}")

            data = res.json()
            raw_reply = (data.get("choices") or [{}])[0].get("message", {}).get("content") or ""
            raw_reply = re.sub(r"<think>.*?</think>", "", raw_reply, flags=re.DOTALL).strip()

        # Extract model-generated [OPTIONS: opt1 | opt2 ...]
        options: list[str] = []
        options_re = r"\[OPTIONS:\s*(.*?)\]"
        options_match = re.search(options_re, raw_reply, re.DOTALL | re.IGNORECASE)
        if options_match:
            raw_opts = options_match.group(1).strip()
            delimiter = "|" if "|" in raw_opts else ","
            options = [opt.strip().strip('"') for opt in raw_opts.split(delimiter) if opt.strip()]
            reply_text = re.sub(options_re, "", raw_reply, flags=re.DOTALL | re.IGNORECASE).strip()
        else:
            reply_text = raw_reply

        # If the model asked a question but forgot options, derive them from what was retrieved
        if not options and reply_text.rstrip().endswith("?") and retrieved_docs:
            tags: list[str] = []
            for d in retrieved_docs:
                for tag in d.get("tags") or []:
                    if tag not in tags and tag.lower() not in last_user_msg.lower():
                        tags.append(tag)
            options = [f"More {t}" for t in tags[:3]]

        # Build interactive action buttons
        actions = []
        
        # 1. Option buttons first so the user can easily click choices
        for opt in options[:4]:
            actions.append({
                "label": opt,
                "actionType": "message",
                "title": opt,
            })

        # 2. Add media title "Open <Title>" buttons if titles are mentioned
        seen_titles = set()
        ignored_names = {"gate", "mode", "clean", "creamy", "top", "rated", "gallery", "library", "anime", "manga", "manhwa", "vault"}

        # Build quick slug lookup from metadata
        slug_lookup: dict[str, str] = {}
        if self._metadata:
            for m in self._metadata:
                t_key = (m.get("title") or "").strip().lower()
                s_val = m.get("slug")
                if t_key and s_val:
                    slug_lookup[t_key] = s_val

        # Check titles from shelf or retrieved docs that appear in reply
        candidates = []
        for d in retrieved_docs:
            candidates.append({
                "title": d.get("title"),
                "slug": d.get("slug"),
                "itemId": d.get("slug"),
                "type": "catalogue",
            })
        for s in (shelf_items or []):
            t_key = (s.get("title") or "").strip().lower()
            s_slug = s.get("external_id") if s.get("source") == "pornhwadb" else None
            if not s_slug:
                s_slug = slug_lookup.get(t_key)
            candidates.append({
                "title": s.get("title"),
                "itemId": s.get("id"),
                "slug": s_slug,
                "type": "shelf",
            })

        for c in candidates:
            t = (c.get("title") or "").strip()
            t_lower = t.lower()
            if not t or t_lower in seen_titles or t_lower in ignored_names or len(t) < 3:
                continue

            # Check if title is mentioned with markdown bold **Title** or distinct word boundary
            bold_pat = r'\*\*' + re.escape(t) + r'\*\*'
            word_pat = r'(?<!\w)' + re.escape(t) + r'(?!\w)'
            if re.search(bold_pat, reply_text, re.IGNORECASE) or (len(t) >= 5 and re.search(word_pat, reply_text, re.IGNORECASE)):
                seen_titles.add(t_lower)
                slug = c.get("slug") or slug_lookup.get(t_lower)
                actions.append({
                    "label": f"Open {t[:22] + '…' if len(t) > 22 else t}",
                    "itemId": c.get("itemId"),
                    "slug": slug,
                    "title": t,
                    "type": c.get("type", "catalogue"),
                    "actionType": "open",
                })
                if len(actions) >= 6:
                    break

        return {
            "reply": reply_text,
            "actions": actions,
            "retrievedCount": len(retrieved_docs),
        }


rag_service = RAGService()
