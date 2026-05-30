from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    ChatRequest,
    ChatResponseChunk,
    GenerateRequest,
    GenerateResponse,
)
from app.services.gemini import generate_text
from app.services.gemini_stream import gemini_stream

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate(req: GenerateRequest):
    try:
        text = await generate_text(req.prompt)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Upstream AI provider error",
        )

    return GenerateResponse(text=text)


@router.post("/chat")
async def chat(req: ChatRequest):
    async def event_generator():
        try:
            async for token in gemini_stream(req.messages):
                chunk = ChatResponseChunk(token=token)
                yield f"data: {chunk.model_dump_json()}\n\n"
        except Exception:
            yield 'data: {"token":"[ERROR]"}\n\n'

        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
    )