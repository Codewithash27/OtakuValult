from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import jwt
from datetime import datetime
from app.core.config import settings

router = APIRouter()
security = HTTPBearer()

class MediaItemCreate(BaseModel):
    """Schema for creating media items"""
    title: str
    media_type: str
    source: str
    external_id: str
    year: Optional[int] = None
    poster_url: Optional[str] = None
    rating: Optional[int] = None
    progress: int = 0
    total: Optional[int] = None
    status: str = "plan_to_watch"
    notes: Optional[str] = None


class MediaItemResponse(BaseModel):
    """Response schema for media items"""
    id: str
    title: str
    media_type: str
    source: str
    external_id: str
    year: Optional[int]
    poster_url: Optional[str]
    rating: Optional[int]
    progress: int
    total: Optional[int]
    status: str
    created_at: datetime


def get_user_id_from_token(credentials: HTTPAuthorizationCredentials) -> str:
    """Extract user_id from JWT token"""
    try:
        token = credentials.credentials
        # Decode without verification for testing (normally you'd verify)
        payload = jwt.decode(token, options={"verify_signature": False})
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_id
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


@router.post("/media_items", response_model=MediaItemResponse)
async def create_media_item(
    item: MediaItemCreate,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """Create a new media item (requires authentication)"""
    try:
        user_id = get_user_id_from_token(credentials)
        
        # TODO: Connect to Supabase to insert the item
        # This would require the supabase client
        
        raise HTTPException(status_code=501, detail="Endpoint not yet fully implemented")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/media_items")
async def list_media_items(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """List media items for authenticated user"""
    try:
        user_id = get_user_id_from_token(credentials)
        
        # TODO: Connect to Supabase to fetch items
        
        raise HTTPException(status_code=501, detail="Endpoint not yet fully implemented")
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
