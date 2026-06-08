from fastapi import APIRouter

from app.api.v1.routes import admin, auth, campaigns, characters, chat, conversations, health, notes, rules

api_router = APIRouter()

api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(admin.router, tags=["admin"])
api_router.include_router(chat.router, tags=["chat"])
api_router.include_router(conversations.router, tags=["conversations"])
api_router.include_router(campaigns.router, tags=["campaigns"])
api_router.include_router(characters.router, tags=["characters"])
api_router.include_router(rules.router, tags=["rules"])
api_router.include_router(notes.router, prefix="/notes", tags=["notes"])