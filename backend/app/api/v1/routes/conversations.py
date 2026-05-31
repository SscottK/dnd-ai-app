import json
import logging
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, asc, desc, select

from app.api.schemas import (
    ConversationCreate,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRead,
    MessageCreate,
    MessageRead,
    SendMessageResponse,
    ChatMessage,  # Used by gemini_stream
)
from app.api.v1.routes.auth import require_auth
from app.core.exceptions import DatabaseSessionError, GeminiProxyException
from app.db.models import Conversation, Message
from app.db.session import get_session
from app.services.conversations import build_prompt_from_db_messages
from app.services.gemini import generate_text
from app.services.gemini_stream import gemini_stream

# Initialize logger for this module
logger = logging.getLogger("app.api.v1.conversations")

router = APIRouter(prefix="/conversations", tags=["conversations"])

SessionDep = Annotated[Session, Depends(get_session)]
AuthDep = Annotated[dict, Depends(require_auth)]


def to_conversation_read(conversation: Conversation) -> ConversationRead:
    if conversation.id is None:
        logger.error("DB entry missing sequence ID during conversation parse")
        raise GeminiProxyException(
            message="Conversation ID is missing from DB metadata",
            status_code=500,
        )

    return ConversationRead(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
    )


def to_message_read(message: Message) -> MessageRead:
    if message.id is None:
        logger.error("DB entry missing sequence ID during message parse")
        raise GeminiProxyException(
            message="Message ID is missing from DB records",
            status_code=500,
        )

    return MessageRead(
        id=message.id,
        conversation_id=message.conversation_id,
        role=message.role,
        content=message.content,
        created_at=message.created_at,
    )


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    data: ConversationCreate,
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = Conversation(title=data.title)
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        return to_conversation_read(conversation)
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to create conversation: {str(e)}")
        raise DatabaseSessionError("Could not create conversation thread.")


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    _: AuthDep,
    session: SessionDep,
):
    try:
        rows = list(
            session.exec(
                select(Conversation).order_by(desc(Conversation.created_at))
            ).all()
        )
        conversations = [to_conversation_read(row) for row in rows]
        return ConversationListResponse(conversations=conversations)
    except Exception as e:
        logger.exception(f"Failed to list conversation index: {str(e)}")
        raise DatabaseSessionError("Could not retrieve conversation listings.")


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: int,
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(f"Failed session lookup on conversation {conversation_id}: {str(e)}")
        raise DatabaseSessionError("Database lookup processing failure.")

    if conversation is None:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    try:
        messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )
    except Exception as e:
        logger.exception(f"Failed to query messages context: {str(e)}")
        raise DatabaseSessionError("Could not compile conversation history.")

    if conversation.id is None:
        raise GeminiProxyException(
            message="Conversation ID is missing",
            status_code=500,
        )

    return ConversationDetailResponse(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        messages=[to_message_read(message) for message in messages],
    )


@router.post(
    "/{conversation_id}/messages",
    response_model=SendMessageResponse,
    status_code=status.HTTP_201_CREATED,
)
async def send_message(
    conversation_id: int,
    data: MessageCreate,
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(f"Error validating conversation {conversation_id}: {str(e)}")
        raise DatabaseSessionError("Database error during verification.")

    if conversation is None:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    
    try:
        session.add(user_message)
        session.commit()
        session.refresh(user_message)
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to save user message to conversation {conversation_id}: {str(e)}")
        raise DatabaseSessionError("Failed to store user message.")

    try:
        all_messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )
    except Exception as e:
        logger.exception(f"Failed to read messages state layout: {str(e)}")
        raise DatabaseSessionError("Could not access history thread context.")

    prompt = build_prompt_from_db_messages(all_messages)

    try:
        assistant_text = await generate_text(prompt)
    except Exception as e:
        logger.error(f"Upstream provider failure at Gemini API endpoint: {str(e)}")
        raise GeminiProxyException(
            message="Upstream AI provider error. Could not reach assistant.",
            status_code=502,
        )

    assistant_message = Message(
        conversation_id=conversation_id,
        role="assistant",
        content=assistant_text,
    )
    
    try:
        session.add(assistant_message)
        session.commit()
        session.refresh(assistant_message)
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to secure AI reply write-back to database: {str(e)}")
        raise DatabaseSessionError("Could not store assistant response record.")

    return SendMessageResponse(
        user_message=to_message_read(user_message),
        assistant_message=to_message_read(assistant_message),
    )


@router.post(
    "/{conversation_id}/messages/stream",
    status_code=status.HTTP_200_OK,
)
async def stream_message(
    conversation_id: int,
    data: MessageCreate,
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(f"Error validating conversation {conversation_id} during stream: {str(e)}")
        raise DatabaseSessionError("Database error during verification.")

    if conversation is None:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    # 1. Save user message to database using the active request session
    user_message = Message(
        conversation_id=conversation_id,
        role="user",
        content=data.content,
    )
    try:
        session.add(user_message)
        session.commit()
        session.refresh(user_message)
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to save user dynamic stream message: {str(e)}")
        raise DatabaseSessionError("Failed to store user message.")

    # 2. Grab entire updated conversation message history
    try:
        all_messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )
        
        # MAP AND STRIP any database-tied models to plain dataclasses immediately
        # (This prevents SQLAlchemy from lazy-loading via a dead session inside the stream generator)
        chat_history_payload = [
            ChatMessage(role=msg.role, text=msg.content)
            for msg in all_messages
        ]
    except Exception as e:
        logger.exception(f"Failed to load stream context message map: {str(e)}")
        raise DatabaseSessionError("Could not retrieve prompt context history.")

    # COMMIT & CLOSE any outstanding operations on the request transaction
    try:
        session.commit()
    except Exception:
        pass

    # 3. Create the SSE generator using a clean, separate database session context
    async def sse_event_generator() -> AsyncGenerator[str, None]:
        completed_reply = []
        try:
            async for chunk in gemini_stream(chat_history_payload):
                completed_reply.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error(f"Error during Gemini generator stream: {str(e)}")
            yield f"data: {json.dumps({'error': 'Upstream connection crashed mid-stream'})}\n\n"
            return

        # 4. Save the fully assembled Assistant message using a clean, fresh database session
        full_response_text = "".join(completed_reply)
        if full_response_text:
            import contextlib
            from app.db.session import get_session
            
            # Wrap get_session in a standard contextmanager to guarantee clean creation/cleanup
            context_session = contextlib.contextmanager(get_session)
            
            try:
                # Open a fresh database transaction separate from the routing framework
                with context_session() as bg_session:
                    assistant_message = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response_text,
                    )
                    bg_session.add(assistant_message)
                    bg_session.commit()
                    bg_session.refresh(assistant_message)
                    
                    # Convert properties to hard copy types for the final SSE payload
                    message_data = {
                        "id": assistant_message.id,
                        "conversation_id": assistant_message.conversation_id,
                        "role": assistant_message.role,
                        "content": assistant_message.content,
                        "created_at": assistant_message.created_at.isoformat() if assistant_message.created_at else None
                    }
                    yield f"data: {json.dumps({'status': 'DONE', 'message': message_data})}\n\n"
            except Exception as e:
                logger.exception(f"Failed committing fully assembled streaming reply in background context: {str(e)}")

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")

@router.patch("/{conversation_id}", response_model=ConversationRead)
def update_conversation_title(
    conversation_id: int,
    payload: ConversationCreate,  # Reuses ConversationCreate schema to validate 'title' securely
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(f"Error accessing conversation {conversation_id} during patch: {str(e)}")
        raise DatabaseSessionError("Database transaction lookup failing.")

    if conversation is None:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    # Validate incoming title value
    new_title = payload.title.strip() if payload.title else ""
    if not new_title:
        raise GeminiProxyException(
            message="A non-empty conversation title is required.",
            status_code=400,
        )

    # Update database record
    try:
        conversation.title = new_title
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        return to_conversation_read(conversation)
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to update title for conversation {conversation_id}: {str(e)}")
        raise DatabaseSessionError("Could not update conversation thread title.")
    

@router.delete("/{conversation_id}", status_code=status.HTTP_200_OK)
def delete_conversation(
    conversation_id: int,
    _: AuthDep,
    session: SessionDep,
):
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(f"Error accessing conversation {conversation_id} during delete: {str(e)}")
        raise DatabaseSessionError("Database transaction lookup failing.")

    if conversation is None:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    try:
        # SQLite wipes all associated child messages automatically due to cascade relationship rules
        session.delete(conversation)
        session.commit()
        return {"status": "ok", "message": f"Conversation {conversation_id} deleted successfully."}
    except Exception as e:
        session.rollback()
        logger.exception(f"Failed to delete conversation {conversation_id}: {str(e)}")
        raise DatabaseSessionError("Could not delete conversation thread.")