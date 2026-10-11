from fastapi import APIRouter

router = APIRouter()


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "mediashelf-api",
        "capabilities": {"images": True, "web_search": True},
    }
