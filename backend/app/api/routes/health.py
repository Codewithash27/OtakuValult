from fastapi import APIRouter

from app.services import pornhwadb as phdb

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "mediashelf-api",
        "capabilities": {
            "images": True,
            "web_search": True,
            "pornhwadb": phdb.is_configured(),
        },
    }
