from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AfterValidator, BaseModel, Field, StringConstraints

import db
from auth import current_user
from db import get_conn

router = APIRouter(prefix="/api")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


def _check_date(value: str) -> str:
    if value:
        date.fromisoformat(value)  # ValueError becomes a 422
    return value


def _clean_labels(labels: list[str]) -> list[str]:
    seen = set()
    cleaned = []
    for label in labels:
        label = label.strip()
        if not 0 < len(label) <= 30:
            raise ValueError("labels must be 1 to 30 characters")
        if label.lower() not in seen:
            seen.add(label.lower())
            cleaned.append(label)
    return cleaned


Priority = Literal["none", "low", "medium", "high"]
# "" clears the due date.
DueDate = Annotated[str, StringConstraints(pattern=r"^(\d{4}-\d{2}-\d{2})?$"), AfterValidator(_check_date)]
Labels = Annotated[list[str], Field(max_length=10), AfterValidator(_clean_labels)]


class ColumnUpdate(BaseModel):
    title: Title


class CardCreate(BaseModel):
    column_id: str
    title: Title
    details: Details = ""
    priority: Priority = "none"
    due_date: DueDate | None = None
    labels: Labels = Field(default_factory=list)


class CardUpdate(BaseModel):
    title: Title
    details: Details = ""
    # Omitted fields keep their current value.
    priority: Priority | None = None
    due_date: DueDate | None = None
    labels: Labels | None = None


class CardMove(BaseModel):
    column_id: str
    position: int


def get_board_id(
    username: str = Depends(current_user),
    board: int | None = Query(default=None),
    conn=Depends(get_conn, scope="function"),
) -> int:
    conn.actor = username
    return db.ensure_board(conn, username, board)


def get_user_id(username: str = Depends(current_user), conn=Depends(get_conn, scope="function")) -> int:
    return db.find_user(conn, username)["id"]


class BoardCreate(BaseModel):
    name: Title
    template: str = "standard"


class BoardUpdate(BaseModel):
    name: Title


class ColumnCreate(BaseModel):
    title: Title


class ColumnMove(BaseModel):
    position: int


@router.get("/boards")
def list_boards(
    username: str = Depends(current_user),
    user_id: int = Depends(get_user_id),
    conn=Depends(get_conn, scope="function"),
):
    db.ensure_board(conn, username)  # a new account gets its first board here
    return db.list_boards(conn, user_id)


@router.post("/boards", status_code=201)
def create_board(
    body: BoardCreate, user_id: int = Depends(get_user_id), conn=Depends(get_conn, scope="function")
):
    try:
        board_id = db.create_board(conn, user_id, body.name, body.template)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    return {"id": board_id, "name": body.name}


@router.put("/boards/{board_id}")
def rename_board(
    board_id: int,
    body: BoardUpdate,
    username: str = Depends(current_user),
    conn=Depends(get_conn, scope="function"),
):
    db.rename_board(conn, db.ensure_board(conn, username, board_id), body.name)
    return {"id": board_id, "name": body.name}


@router.delete("/boards/{board_id}")
def delete_board(
    board_id: int,
    user_id: int = Depends(get_user_id),
    username: str = Depends(current_user),
    conn=Depends(get_conn, scope="function"),
):
    db.ensure_board(conn, username, board_id)
    try:
        db.delete_board(conn, user_id, board_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))
    return db.list_boards(conn, user_id)


@router.get("/board")
def read_board(board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")):
    return db.fetch_board(conn, board_id)


@router.post("/columns", status_code=201)
def create_column(
    body: ColumnCreate, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    return db.create_column(conn, board_id, body.title)


@router.delete("/columns/{column_id}")
def delete_column(
    column_id: str, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    db.delete_column(conn, board_id, column_id)
    return db.fetch_board(conn, board_id)


@router.post("/columns/{column_id}/move")
def move_column(
    column_id: str,
    body: ColumnMove,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.move_column(conn, board_id, column_id, body.position)
    return db.fetch_board(conn, board_id)


@router.put("/columns/{column_id}")
def rename_column(
    column_id: str,
    body: ColumnUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.rename_column(conn, board_id, column_id, body.title)
    return db.fetch_board(conn, board_id)


@router.post("/cards", status_code=201)
def create_card(
    body: CardCreate, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    return db.create_card(
        conn, board_id, body.column_id, body.title, body.details,
        body.priority, body.due_date, body.labels,
    )


@router.put("/cards/{card_id}")
def update_card(
    card_id: str,
    body: CardUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.update_card(
        conn, board_id, card_id, body.title, body.details,
        body.priority, body.due_date, body.labels,
    )
    return db.fetch_board(conn, board_id)


@router.delete("/cards/{card_id}")
def delete_card(
    card_id: str, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    db.delete_card(conn, board_id, card_id)
    return db.fetch_board(conn, board_id)


@router.post("/cards/{card_id}/move")
def move_card(
    card_id: str,
    body: CardMove,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.move_card(conn, board_id, card_id, body.column_id, body.position)
    return db.fetch_board(conn, board_id)


class CommentCreate(BaseModel):
    body: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class ChecklistCreate(BaseModel):
    text: Title


class ChecklistUpdate(BaseModel):
    text: Title | None = None
    done: bool | None = None


@router.get("/cards/{card_id}/detail")
def card_detail(
    card_id: str, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    return db.card_detail(conn, board_id, card_id)


@router.post("/cards/{card_id}/comments", status_code=201)
def add_comment(
    card_id: str,
    body: CommentCreate,
    username: str = Depends(current_user),
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.add_comment(conn, board_id, card_id, username, body.body)
    return db.card_detail(conn, board_id, card_id)


@router.delete("/comments/{comment_id}")
def delete_comment(
    comment_id: int, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    card_id = db.delete_comment(conn, board_id, comment_id)
    return db.card_detail(conn, board_id, card_id)


@router.post("/cards/{card_id}/checklist", status_code=201)
def add_checklist_item(
    card_id: str,
    body: ChecklistCreate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.add_checklist_item(conn, board_id, card_id, body.text)
    return db.card_detail(conn, board_id, card_id)


@router.put("/checklist/{item_id}")
def update_checklist_item(
    item_id: int,
    body: ChecklistUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    card_id = db.update_checklist_item(conn, board_id, item_id, body.text, body.done)
    return db.card_detail(conn, board_id, card_id)


@router.delete("/checklist/{item_id}")
def delete_checklist_item(
    item_id: int, board_id: int = Depends(get_board_id), conn=Depends(get_conn, scope="function")
):
    card_id = db.delete_checklist_item(conn, board_id, item_id)
    return db.card_detail(conn, board_id, card_id)


@router.get("/activity")
def activity(
    limit: int = Query(default=50, ge=1, le=200),
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    return db.list_activity(conn, board_id, limit)
