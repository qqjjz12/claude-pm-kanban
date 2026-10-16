import os
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Board'
);
CREATE TABLE IF NOT EXISTS columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id, position);
CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id, position);
"""

DEFAULT_BOARD = [
    ("Backlog", [
        ("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
        ("Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ]),
    ("Discovery", [
        ("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ]),
    ("In Progress", [
        ("Refine status language", "Standardize column labels and tone across the board."),
        ("Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ]),
    ("Review", [
        ("QA micro-interactions", "Verify hover, focus, and loading states."),
    ]),
    ("Done", [
        ("Ship marketing page", "Final copy approved and asset pack delivered."),
        ("Close onboarding sprint", "Document release notes and share internally."),
    ]),
]


def connect() -> sqlite3.Connection:
    path = Path(os.environ.get("PM_DB_PATH", "pm.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    # One connection per request, used by one thread at a time. FastAPI may run a
    # dependency's setup and teardown on different worker threads.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    conn = connect()
    conn.executescript(SCHEMA)
    conn.close()


def ensure_board(conn: sqlite3.Connection, username: str) -> int:
    """Return the user's board id, creating the user and a seeded board if needed."""
    row = conn.execute(
        "SELECT boards.id FROM boards JOIN users ON users.id = boards.user_id "
        "WHERE users.username = ?",
        (username,),
    ).fetchone()
    if row:
        return row["id"]
    conn.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (username,))
    user_id = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()["id"]
    board_id = conn.execute(
        "INSERT INTO boards (user_id) VALUES (?)", (user_id,)
    ).lastrowid
    for col_pos, (title, cards) in enumerate(DEFAULT_BOARD):
        column_id = conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board_id, title, col_pos),
        ).lastrowid
        for card_pos, (card_title, details) in enumerate(cards):
            conn.execute(
                "INSERT INTO cards (column_id, title, details, position) "
                "VALUES (?, ?, ?, ?)",
                (column_id, card_title, details, card_pos),
            )
    return board_id


def fetch_board(conn: sqlite3.Connection, board_id: int) -> dict:
    columns = []
    cards = {}
    for col in conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ):
        card_ids = []
        for card in conn.execute(
            "SELECT id, title, details FROM cards WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ):
            card_id = f"card-{card['id']}"
            card_ids.append(card_id)
            cards[card_id] = {
                "id": card_id,
                "title": card["title"],
                "details": card["details"],
            }
        columns.append({"id": f"col-{col['id']}", "title": col["title"], "cardIds": card_ids})
    return {"columns": columns, "cards": cards}


def parse_id(prefix: str, value: str) -> int:
    head, _, number = value.partition("-")
    if head != prefix or not (number.isascii() and number.isdigit()):
        raise LookupError(value)
    return int(number)


def _require_column(conn: sqlite3.Connection, board_id: int, column_id: str) -> int:
    pk = parse_id("col", column_id)
    row = conn.execute(
        "SELECT id FROM columns WHERE id = ? AND board_id = ?", (pk, board_id)
    ).fetchone()
    if not row:
        raise LookupError(column_id)
    return pk


def _require_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> sqlite3.Row:
    pk = parse_id("card", card_id)
    row = conn.execute(
        "SELECT cards.id, cards.column_id FROM cards "
        "JOIN columns ON columns.id = cards.column_id "
        "WHERE cards.id = ? AND columns.board_id = ?",
        (pk, board_id),
    ).fetchone()
    if not row:
        raise LookupError(card_id)
    return row


def _card_ids(conn: sqlite3.Connection, column_id: int) -> list[int]:
    return [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
        )
    ]


def _set_order(conn: sqlite3.Connection, column_id: int, card_ids: list[int]) -> None:
    for position, pk in enumerate(card_ids):
        conn.execute(
            "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
            (column_id, position, pk),
        )


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: str, title: str) -> None:
    pk = _require_column(conn, board_id, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, pk))


def create_card(
    conn: sqlite3.Connection, board_id: int, column_id: str, title: str, details: str
) -> dict:
    col_pk = _require_column(conn, board_id, column_id)
    position = len(_card_ids(conn, col_pk))
    pk = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (col_pk, title, details, position),
    ).lastrowid
    return {"id": f"card-{pk}", "title": title, "details": details}


def update_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, title: str, details: str
) -> None:
    card = _require_card(conn, board_id, card_id)
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?",
        (title, details, card["id"]),
    )


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> None:
    card = _require_card(conn, board_id, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card["id"],))
    _set_order(conn, card["column_id"], _card_ids(conn, card["column_id"]))


def move_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int
) -> None:
    card = _require_card(conn, board_id, card_id)
    target = _require_column(conn, board_id, column_id)
    source = card["column_id"]
    _set_order(conn, source, [p for p in _card_ids(conn, source) if p != card["id"]])
    ids = [p for p in _card_ids(conn, target) if p != card["id"]]
    ids.insert(max(0, min(position, len(ids))), card["id"])
    _set_order(conn, target, ids)
