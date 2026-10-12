"""Chat route for OtakuVault RAG assistant."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.services.rag_service import rag_service

logger = logging.getLogger(__name__)

router = APIRouter()


class ChatMessagePayload(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessagePayload]
    shelfItems: list[dict[str, Any]] = Field(default_factory=list)
    contentMode: str = Field(default="creamy")


class ChatAction(BaseModel):
    label: str
    itemId: str | None = None
    slug: str | None = None
    title: str | None = None
    type: str | None = None
    url: str | None = None
    actionType: str = "open"  # "open", "message" or "link"


class ChatResponse(BaseModel):
    reply: str
    actions: list[ChatAction] = Field(default_factory=list)
    retrievedCount: int = 0


@router.get("/chat/status")
async def chat_status() -> dict[str, Any]:
    configured = rag_service.is_configured()
    indexed_count = len(rag_service._metadata) if rag_service._metadata else 0
    return {
        "configured": configured,
        "indexedCount": indexed_count,
        "model": "nvidia/nemotron-3.5-lightning-30b-a3b",
        "embedModel": "nvidia/nemotron-3-embed-1b",
    }


@router.post("/chat", response_model=ChatResponse)
async def chat_rag(payload: ChatRequest) -> ChatResponse:
    if not rag_service.is_configured():
        raise HTTPException(
            status_code=503,
            detail="NVIDIA AI service is not configured. Please set NVIDIA_API_KEY in backend/.env.",
        )

    try:
        messages = [{"role": m.role, "content": m.content} for m in payload.messages]
        result = await rag_service.chat_completion(
            messages=messages,
            shelf_items=payload.shelfItems,
            content_mode=payload.contentMode,
        )
        return ChatResponse(
            reply=result["reply"],
            actions=[ChatAction(**a) for a in result.get("actions", [])],
            retrievedCount=result.get("retrievedCount", 0),
        )
    except Exception as exc:
        logger.exception("Error during RAG chat completion: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))
