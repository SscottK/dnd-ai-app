import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router
from app.core.config import settings
from app.core.exceptions import GeminiProxyException  # We will create this file next
from app.core.logging_config import setup_logging
from app.db.session import create_db_and_tables

# 1. Initialize Logging Configuration
setup_logging()
logger = logging.getLogger("app.main")


# 2. Manage Database Session Lifespan
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    yield


# 3. Initialize FastAPI App
app = FastAPI(title=settings.app_name, lifespan=lifespan)

# 4. Global CORS Middleware Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 5. Include Backend Router Group
app.include_router(api_router, prefix="/api/v1")


# 6. Global Exception Handlers
@app.exception_handler(GeminiProxyException)
async def gemini_proxy_exception_handler(request: Request, exc: GeminiProxyException):
    logger.error(f"Application error on {request.url.path}: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message, "error_type": exc.__class__.__name__},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception(
        f"Unhandled critical crash on {request.url.path}: {str(exc)}"
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected server error occurred.",
            "error_type": "InternalServerError",
        },
    )


# 7. Basic Health & Root Endpoints
@app.get("/health")
def root_health():
    return {
        "status": "ok",
        "app_name": settings.app_name,
    }


@app.get("/")
def read_root():
    return {"message": f"Hello from {settings.app_name}"}