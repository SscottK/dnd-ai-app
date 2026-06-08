# app/services/gemini_stream.py
import asyncio
import json
import logging
from typing import AsyncGenerator
import httpx

from app.api.schemas import ChatMessage
from app.core.config import settings
from app.core.exceptions import UpstreamAPIError
from app.services.gemini import _extract_response_text, _primary_model
from app.services.rules_prompt import build_prompt_from_chat_messages

logger = logging.getLogger("app.services.gemini_stream")


def build_prompt_from_messages(messages: list[ChatMessage]) -> str:
    return build_prompt_from_chat_messages(messages)


async def gemini_stream(messages: list[ChatMessage]) -> AsyncGenerator[str, None]:
    """
    Connects to live Gemini Streaming API and yields assistant chunks 
    by accumulating multi-line JSON fragments into a clean semantic buffer.
    """
    prompt = build_prompt_from_messages(messages)
    
    model = _primary_model()
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:streamGenerateContent?key={settings.gemini_api_key}"
    )
    
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}]
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                if response.status_code != 200:
                    error_body = await response.aread()
                    logger.error(f"Gemini API streaming error response: {error_body.decode()}")
                    raise UpstreamAPIError("Gemini streaming request failed")
                
                buffer = ""
                brace_count = 0
                in_object = False
                
                async for chunk in response.aiter_text():
                    for char in chunk:
                        buffer += char
                        
                        if char == "{":
                            brace_count += 1
                            in_object = True
                        elif char == "}":
                            brace_count -= 1
                        
                        # Once brace balance is restored to 0, we have matching outer braces!
                        if in_object and brace_count == 0:
                            # Strip out any potential streaming array delimiters
                            candidate_json = buffer.strip().lstrip(",").lstrip("[").rstrip("]").strip()
                            if candidate_json:
                                try:
                                    chunk_data = json.loads(candidate_json)
                                    text_chunk = _extract_response_text(chunk_data)
                                    yield text_chunk
                                except (json.JSONDecodeError, KeyError, IndexError):
                                    # Fallback for heartbeat markers or helper protocol frames
                                    pass
                            
                            # Clean the parser buffer for the next incoming JSON frame
                            buffer = ""
                            in_object = False
                            
        except httpx.RequestError as e:
            logger.exception(f"Network transport level error in Gemini streaming connection: {str(e)}")
            raise UpstreamAPIError("Network communication error with Gemini provider")