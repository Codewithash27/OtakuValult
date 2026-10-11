from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import health, images, pornhwadb, search
from app.core.config import settings
from app.services import pornhwadb as phdb_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    phdb_service.ensure_export_file()
    yield


app = FastAPI(title="MediaShelf API", version="0.1.0", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip().rstrip("/") for o in settings.frontend_origin.split(",") if o.strip()],
    allow_origin_regex=settings.frontend_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api", tags=["health"])
app.include_router(search.router, prefix="/api", tags=["search"])
app.include_router(images.router, prefix="/api", tags=["images"])
app.include_router(pornhwadb.router, prefix="/api", tags=["pornhwadb"])
