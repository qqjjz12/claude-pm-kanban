from fastapi import APIRouter, Depends
from pydantic import BaseModel

import db
from auth import current_user

router = APIRouter(prefix="/api")


class ColumnUpdate(BaseModel):
    title: str


class CardCreate(BaseModel):
    column_id: str
    title: str
    details: str = ""


class CardUpdate(BaseModel):
    title: str
    details: str = ""


class CardMove(BaseModel):
    column_id: str
    position: int


def get_conn():
    conn = db.connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def get_board_id(username: str = Depends(current_user), conn=Depends(get_conn)) -> int:
    return db.ensure_board(conn, username)


@router.get("/board")
def read_board(board_id: int = Depends(get_board_id), conn=Depends(get_conn)):
    return db.fetch_board(conn, board_id)


@router.put("/columns/{column_id}")
def rename_column(
    column_id: str,
    body: ColumnUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn),
):
    db.rename_column(conn, board_id, column_id, body.title)
    return db.fetch_board(conn, board_id)


@router.post("/cards", status_code=201)
def create_card(
    body: CardCreate, board_id: int = Depends(get_board_id), conn=Depends(get_conn)
):
    return db.create_card(conn, board_id, body.column_id, body.title, body.details)


@router.put("/cards/{card_id}")
def update_card(
    card_id: str,
    body: CardUpdate,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn),
):
    db.update_card(conn, board_id, card_id, body.title, body.details)
    return db.fetch_board(conn, board_id)


@router.delete("/cards/{card_id}")
def delete_card(
    card_id: str, board_id: int = Depends(get_board_id), conn=Depends(get_conn)
):
    db.delete_card(conn, board_id, card_id)
    return db.fetch_board(conn, board_id)


@router.post("/cards/{card_id}/move")
def move_card(
    card_id: str,
    body: CardMove,
    board_id: int = Depends(get_board_id),
    conn=Depends(get_conn),
):
    db.move_card(conn, board_id, card_id, body.column_id, body.position)
    return db.fetch_board(conn, board_id)
