import json
import os
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

import db
from board import get_board_id, get_conn

MODEL = "openai/gpt-oss-120b"

SYSTEM_PROMPT = """You are the assistant inside a Kanban project management app.
You can answer questions about the board and change it for the user.

Each reply has:
- reply: your message to the user, short and friendly.
- operations: the changes to make to the board, in order. Use an empty list when
  the user did not ask for a change. Only change what the user asked for.

Operation types and the fields they need (set every unused field to null):
- create_card: column_id, title, details
- edit_card: card_id, title, details (the full new values; keep the old value of a field you are not changing)
- move_card: card_id, column_id, position (0 is the top of the column)
- delete_card: card_id
- rename_column: column_id, title

Use only the ids that appear in the board JSON below. A card you create has no id yet,
so later operations cannot refer to it: create it directly in its final column. Cards are listed in each
column's cardIds in display order.

Current board:
"""

router = APIRouter(prefix="/api")


class Operation(BaseModel):
    type: Literal["create_card", "edit_card", "move_card", "delete_card", "rename_column"]
    card_id: str | None
    column_id: str | None
    title: str | None
    details: str | None
    position: int | None


class AIResponse(BaseModel):
    reply: str
    operations: list[Operation]


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = []


def get_client() -> OpenAI:
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ["OPENROUTER_API_KEY"],
    )


def ask_ai(board: dict, history: list[Message], message: str) -> AIResponse:
    messages = [{"role": "system", "content": SYSTEM_PROMPT + json.dumps(board)}]
    messages += [m.model_dump() for m in history]
    messages.append({"role": "user", "content": message})
    # The model occasionally answers in plain text instead of the schema; try once more.
    for attempt in range(2):
        try:
            completion = get_client().chat.completions.parse(
                model=MODEL, messages=messages, response_format=AIResponse
            )
            break
        except ValidationError:
            if attempt:
                raise
    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise ValueError("The AI returned no structured response")
    return parsed


def need(op: Operation, *fields: str):
    values = [getattr(op, f) for f in fields]
    if any(v is None for v in values):
        raise ValueError(f"{op.type} needs {', '.join(fields)}")
    return values


def apply_operation(conn: sqlite3.Connection, board_id: int, op: Operation) -> None:
    match op.type:
        case "create_card":
            column_id, title = need(op, "column_id", "title")
            db.create_card(conn, board_id, column_id, title, op.details or "")
        case "edit_card":
            card_id, title, details = need(op, "card_id", "title", "details")
            db.update_card(conn, board_id, card_id, title, details)
        case "move_card":
            card_id, column_id = need(op, "card_id", "column_id")
            db.move_card(conn, board_id, card_id, column_id, op.position if op.position is not None else 10**9)
        case "delete_card":
            (card_id,) = need(op, "card_id")
            db.delete_card(conn, board_id, card_id)
        case "rename_column":
            column_id, title = need(op, "column_id", "title")
            db.rename_column(conn, board_id, column_id, title)


@router.post("/chat")
def chat(
    body: ChatRequest,
    board_id: int = Depends(get_board_id),
    conn: sqlite3.Connection = Depends(get_conn),
):
    board = db.fetch_board(conn, board_id)
    try:
        result = ask_ai(board, body.history, body.message)
    except (OpenAIError, ValidationError, ValueError) as error:
        raise HTTPException(status_code=502, detail=f"AI request failed: {error}")

    failed = []
    for op in result.operations:
        try:
            apply_operation(conn, board_id, op)
        except (LookupError, ValueError) as error:
            failed.append(f"{op.type} ({error})")

    reply = result.reply
    if failed:
        reply += "\n\nI could not apply: " + "; ".join(failed)
    applied = len(result.operations) - len(failed)
    return {
        "reply": reply,
        "board": db.fetch_board(conn, board_id) if applied else None,
    }
