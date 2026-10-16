from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, StringConstraints

import db
from auth import current_user
from db import get_conn

router = APIRouter(prefix="/api")

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Details = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]


class ColumnUpdate(BaseModel):
    title: Title


class CardCreate(BaseModel):
    column_id: str
    title: Title
    details: Details = ""


class CardUpdate(BaseModel):
    title: Title
    details: Details = ""


class CardMove(BaseModel):
    column_id: str
    position: int


def get_board_id(
    username: str = Depends(current_user),
    board: int | None = Query(default=None),
    conn=Depends(get_conn, scope="function"),
) -> int:
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
    return db.create_card(conn, board_id, body.column_id, body.title, body.details)


@router.put("/cards/{card_id}")
def update_card(
    card_id: str,
    body: CardUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn, scope="function"),
):
    db.update_card(conn, board_id, card_id, body.title, body.details)
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
