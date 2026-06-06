import contextlib
import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, status
from fastapi.responses import StreamingResponse
from sqlmodel import asc, desc, select

from app.api.deps import CurrentUser, SessionDep
from app.api.schemas import (
    ChatMessage,
    ConversationCreate,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationRead,
    MessageCreate,
    MessageRead,
    SendMessageResponse,
)
from app.core.exceptions import DatabaseSessionError, GeminiProxyException
from app.db.models import Conversation, Message, User
from app.db.session import get_session
from app.services.conversations import build_prompt_from_db_messages
from app.services.gemini import generate_text
from app.services.gemini_stream import gemini_stream

logger = logging.getLogger("app.api.v1.conversations")

router = APIRouter(prefix="/conversations", tags=["conversations"])


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


def get_owned_conversation(
    conversation_id: int,
    current_user: User,
    session: SessionDep,
) -> Conversation:
    try:
        conversation = session.get(Conversation, conversation_id)
    except Exception as e:
        logger.exception(
            "Failed session lookup on conversation %s: %s",
            conversation_id,
            str(e),
        )
        raise DatabaseSessionError("Database lookup processing failure.") from e

    if conversation is None or conversation.user_id != current_user.id:
        raise GeminiProxyException(
            message="Conversation not found",
            status_code=404,
        )

    return conversation


@router.post("", response_model=ConversationRead, status_code=status.HTTP_201_CREATED)
def create_conversation(
    data: ConversationCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        conversation = Conversation(title=data.title, user_id=current_user.id)
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        return to_conversation_read(conversation)
    except Exception as e:
        session.rollback()
        logger.exception("Failed to create conversation: %s", str(e))
        raise DatabaseSessionError("Could not create conversation thread.") from e


@router.get("", response_model=ConversationListResponse)
def list_conversations(
    current_user: CurrentUser,
    session: SessionDep,
):
    try:
        rows = list(
            session.exec(
                select(Conversation)
                .where(Conversation.user_id == current_user.id)
                .order_by(desc(Conversation.created_at))
            ).all()
        )
        conversations = [to_conversation_read(row) for row in rows]
        return ConversationListResponse(conversations=conversations)
    except Exception as e:
        logger.exception("Failed to list conversation index: %s", str(e))
        raise DatabaseSessionError("Could not retrieve conversation listings.") from e


@router.get("/{conversation_id}", response_model=ConversationDetailResponse)
def get_conversation(
    conversation_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    conversation = get_owned_conversation(conversation_id, current_user, session)

    try:
        messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )
    except Exception as e:
        logger.exception("Failed to query messages context: %s", str(e))
        raise DatabaseSessionError("Could not compile conversation history.") from e

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
    current_user: CurrentUser,
    session: SessionDep,
):
    get_owned_conversation(conversation_id, current_user, session)

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
        logger.exception(
            "Failed to save user message to conversation %s: %s",
            conversation_id,
            str(e),
        )
        raise DatabaseSessionError("Failed to store user message.") from e

    try:
        all_messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )
    except Exception as e:
        logger.exception("Failed to read messages state layout: %s", str(e))
        raise DatabaseSessionError("Could not access history thread context.") from e

    prompt = build_prompt_from_db_messages(all_messages)

    try:
        assistant_text = await generate_text(prompt)
    except Exception as e:
        logger.error("Upstream provider failure at Gemini API endpoint: %s", str(e))
        raise GeminiProxyException(
            message="Upstream AI provider error. Could not reach assistant.",
            status_code=502,
        ) from e

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
        logger.exception("Failed to secure AI reply write-back to database: %s", str(e))
        raise DatabaseSessionError("Could not store assistant response record.") from e

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
    current_user: CurrentUser,
    session: SessionDep,
):
    get_owned_conversation(conversation_id, current_user, session)

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
        logger.exception("Failed to save user dynamic stream message: %s", str(e))
        raise DatabaseSessionError("Failed to store user message.") from e

    try:
        all_messages = list(
            session.exec(
                select(Message)
                .where(Message.conversation_id == conversation_id)
                .order_by(asc(Message.created_at))
            ).all()
        )

        chat_history_payload = [
            ChatMessage(role=msg.role, text=msg.content) for msg in all_messages
        ]
    except Exception as e:
        logger.exception("Failed to load stream context message map: %s", str(e))
        raise DatabaseSessionError("Could not retrieve prompt context history.") from e

    try:
        session.commit()
    except Exception:
        pass

    async def sse_event_generator() -> AsyncGenerator[str, None]:
        completed_reply = []
        try:
            async for chunk in gemini_stream(chat_history_payload):
                completed_reply.append(chunk)
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error("Error during Gemini generator stream: %s", str(e))
            yield f"data: {json.dumps({'error': 'Upstream connection crashed mid-stream'})}\n\n"
            return

        full_response_text = "".join(completed_reply)
        if full_response_text:
            context_session = contextlib.contextmanager(get_session)

            try:
                with context_session() as bg_session:
                    assistant_message = Message(
                        conversation_id=conversation_id,
                        role="assistant",
                        content=full_response_text,
                    )
                    bg_session.add(assistant_message)
                    bg_session.commit()
                    bg_session.refresh(assistant_message)

                    message_data = {
                        "id": assistant_message.id,
                        "conversation_id": assistant_message.conversation_id,
                        "role": assistant_message.role,
                        "content": assistant_message.content,
                        "created_at": assistant_message.created_at.isoformat()
                        if assistant_message.created_at
                        else None,
                    }
                    yield f"data: {json.dumps({'status': 'DONE', 'message': message_data})}\n\n"
            except Exception as e:
                logger.exception(
                    "Failed committing fully assembled streaming reply in background context: %s",
                    str(e),
                )

    return StreamingResponse(sse_event_generator(), media_type="text/event-stream")


@router.patch("/{conversation_id}", response_model=ConversationRead)
def update_conversation_title(
    conversation_id: int,
    payload: ConversationCreate,
    current_user: CurrentUser,
    session: SessionDep,
):
    conversation = get_owned_conversation(conversation_id, current_user, session)

    new_title = payload.title.strip() if payload.title else ""
    if not new_title:
        raise GeminiProxyException(
            message="A non-empty conversation title is required.",
            status_code=400,
        )

    try:
        conversation.title = new_title
        session.add(conversation)
        session.commit()
        session.refresh(conversation)
        return to_conversation_read(conversation)
    except Exception as e:
        session.rollback()
        logger.exception(
            "Failed to update title for conversation %s: %s",
            conversation_id,
            str(e),
        )
        raise DatabaseSessionError("Could not update conversation thread title.") from e


@router.delete("/{conversation_id}", status_code=status.HTTP_200_OK)
def delete_conversation(
    conversation_id: int,
    current_user: CurrentUser,
    session: SessionDep,
):
    conversation = get_owned_conversation(conversation_id, current_user, session)

    try:
        session.delete(conversation)
        session.commit()
        return {
            "status": "ok",
            "message": f"Conversation {conversation_id} deleted successfully.",
        }
    except Exception as e:
        session.rollback()
        logger.exception("Failed to delete conversation %s: %s", conversation_id, str(e))
        raise DatabaseSessionError("Could not delete conversation thread.") from e
