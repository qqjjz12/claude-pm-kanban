import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Board'
);
CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);
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
    position INTEGER NOT NULL,
    priority TEXT NOT NULL DEFAULT 'none',
    due_date TEXT,
    labels TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_cards_column ON cards(column_id, position);
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_card ON comments(card_id, id);
CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    done INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_checklist_card ON checklist_items(card_id, position);
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

TEMPLATES = {
    "standard": [("To Do", []), ("In Progress", []), ("Done", [])],
    "sample": DEFAULT_BOARD,
    "empty": [],
}

PRIORITIES = ("none", "low", "medium", "high")

DEMO_USER = "user"
DEMO_PASSWORD = "password"
USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


def connect() -> sqlite3.Connection:
    path = Path(os.environ.get("PM_DB_PATH", "pm.db"))
    path.parent.mkdir(parents=True, exist_ok=True)
    # One connection per request, used by one thread at a time. FastAPI may run a
    # dependency's setup and teardown on different worker threads.
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_conn():
    """FastAPI dependency: one connection per request, committed on success."""
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${_scrypt(password, salt).hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, salt, digest = stored.split("$")
        actual = _scrypt(password, bytes.fromhex(salt))
    except ValueError:
        return False
    return scheme == "scrypt" and hmac.compare_digest(actual.hex(), digest)


def _migrate(conn: sqlite3.Connection) -> None:
    """Upgrade databases created before accounts and multiple boards existed."""
    if "password_hash" not in {r["name"] for r in conn.execute("PRAGMA table_info(users)")}:
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT")
    card_columns = {r["name"] for r in conn.execute("PRAGMA table_info(cards)")}
    for name, definition in [
        ("priority", "TEXT NOT NULL DEFAULT 'none'"),
        ("due_date", "TEXT"),
        ("labels", "TEXT NOT NULL DEFAULT '[]'"),
    ]:
        if name not in card_columns:
            conn.execute(f"ALTER TABLE cards ADD COLUMN {name} {definition}")
    # boards.user_id used to be UNIQUE (one board per user); SQLite cannot drop that, so rebuild.
    if any(r["unique"] for r in conn.execute("PRAGMA index_list(boards)")):
        conn.executescript(
            "PRAGMA foreign_keys = OFF;"
            "CREATE TABLE boards_new (id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,"
            " name TEXT NOT NULL DEFAULT 'My Board');"
            "INSERT INTO boards_new (id, user_id, name) SELECT id, user_id, name FROM boards;"
            "DROP TABLE boards;"
            "ALTER TABLE boards_new RENAME TO boards;"
            "CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id);"
            "PRAGMA foreign_keys = ON;"
        )


def init_db() -> None:
    conn = connect()
    conn.executescript(SCHEMA)
    _migrate(conn)
    # The demo account keeps working; its password can be changed like any other.
    user_id = create_user(conn, DEMO_USER, DEMO_PASSWORD, exist_ok=True)
    row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row["password_hash"]:
        set_password(conn, user_id, DEMO_PASSWORD)
    conn.commit()
    conn.close()


def find_user(conn: sqlite3.Connection, username: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, username, password_hash FROM users WHERE username = ? COLLATE NOCASE",
        (username,),
    ).fetchone()


def create_user(
    conn: sqlite3.Connection, username: str, password: str | None, exist_ok: bool = False
) -> int:
    """Create an account and return its id. Usernames are unique ignoring case."""
    existing = find_user(conn, username)
    if existing:
        if exist_ok:
            return existing["id"]
        raise ValueError("Username is already taken")
    user_id = conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (username, hash_password(password) if password else None),
    ).lastrowid
    create_board(conn, user_id, "My Board", "sample")
    return user_id


def set_password(conn: sqlite3.Connection, user_id: int, password: str) -> None:
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id)
    )


def delete_user(conn: sqlite3.Connection, user_id: int) -> None:
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))


def _add_columns(conn: sqlite3.Connection, board_id: int, layout) -> None:
    for col_pos, (title, cards) in enumerate(layout):
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


def create_board(
    conn: sqlite3.Connection, user_id: int, name: str, template: str = "standard"
) -> int:
    if template not in TEMPLATES:
        raise ValueError(f"Unknown template: {template}")
    board_id = conn.execute(
        "INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_id, name)
    ).lastrowid
    _add_columns(conn, board_id, TEMPLATES[template])
    return board_id


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    return [
        {"id": r["id"], "name": r["name"]}
        for r in conn.execute(
            "SELECT id, name FROM boards WHERE user_id = ? ORDER BY id", (user_id,)
        )
    ]


def ensure_board(conn: sqlite3.Connection, username: str, board_id: int | None = None) -> int:
    """Return the id of one of the user's boards.

    Without board_id this is the user's first board. A board that does not exist or belongs
    to someone else raises LookupError.
    """
    user = find_user(conn, username)
    if not user:
        raise LookupError(username)
    user_id = user["id"]
    if board_id is not None:
        row = conn.execute(
            "SELECT id FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        ).fetchone()
        if not row:
            raise LookupError(f"board-{board_id}")
        return row["id"]
    boards = list_boards(conn, user_id)
    return boards[0]["id"] if boards else create_board(conn, user_id, "My Board", "sample")


def rename_board(conn: sqlite3.Connection, board_id: int, name: str) -> None:
    conn.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))


def delete_board(conn: sqlite3.Connection, user_id: int, board_id: int) -> None:
    if len(list_boards(conn, user_id)) <= 1:
        raise ValueError("You cannot delete your only board")
    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))


def _card_dict(row: sqlite3.Row) -> dict:
    return {
        "id": f"card-{row['id']}",
        "title": row["title"],
        "details": row["details"],
        "priority": row["priority"],
        "dueDate": row["due_date"],
        "labels": json.loads(row["labels"]),
        "commentCount": row["comment_count"],
        "checklist": {"done": row["check_done"], "total": row["check_total"]},
    }


CARD_SELECT = (
    "SELECT cards.*, "
    "(SELECT COUNT(*) FROM comments WHERE card_id = cards.id) AS comment_count, "
    "(SELECT COUNT(*) FROM checklist_items WHERE card_id = cards.id) AS check_total, "
    "(SELECT COUNT(*) FROM checklist_items WHERE card_id = cards.id AND done = 1) AS check_done "
    "FROM cards"
)


def fetch_board(conn: sqlite3.Connection, board_id: int) -> dict:
    columns = []
    cards = {}
    for col in conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position",
        (board_id,),
    ):
        card_ids = []
        for card in conn.execute(
            CARD_SELECT + " WHERE column_id = ? ORDER BY position",
            (col["id"],),
        ):
            data = _card_dict(card)
            card_ids.append(data["id"])
            cards[data["id"]] = data
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


def _column_ids(conn: sqlite3.Connection, board_id: int) -> list[int]:
    return [
        r["id"]
        for r in conn.execute(
            "SELECT id FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
        )
    ]


def _set_column_order(conn: sqlite3.Connection, ids: list[int]) -> None:
    for position, pk in enumerate(ids):
        conn.execute("UPDATE columns SET position = ? WHERE id = ?", (position, pk))


def create_column(conn: sqlite3.Connection, board_id: int, title: str) -> dict:
    position = len(_column_ids(conn, board_id))
    pk = conn.execute(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
        (board_id, title, position),
    ).lastrowid
    return {"id": f"col-{pk}", "title": title, "cardIds": []}


def delete_column(conn: sqlite3.Connection, board_id: int, column_id: str) -> None:
    pk = _require_column(conn, board_id, column_id)
    conn.execute("DELETE FROM columns WHERE id = ?", (pk,))
    _set_column_order(conn, _column_ids(conn, board_id))


def move_column(conn: sqlite3.Connection, board_id: int, column_id: str, position: int) -> None:
    pk = _require_column(conn, board_id, column_id)
    ids = [c for c in _column_ids(conn, board_id) if c != pk]
    ids.insert(max(0, min(position, len(ids))), pk)
    _set_column_order(conn, ids)


def create_card(
    conn: sqlite3.Connection,
    board_id: int,
    column_id: str,
    title: str,
    details: str,
    priority: str = "none",
    due_date: str | None = None,
    labels: list[str] | None = None,
) -> dict:
    col_pk = _require_column(conn, board_id, column_id)
    position = len(_card_ids(conn, col_pk))
    pk = conn.execute(
        "INSERT INTO cards (column_id, title, details, position, priority, due_date, labels) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (col_pk, title, details, position, priority, due_date or None, json.dumps(labels or [])),
    ).lastrowid
    return _card_dict(conn.execute(CARD_SELECT + " WHERE cards.id = ?", (pk,)).fetchone())


def update_card(
    conn: sqlite3.Connection,
    board_id: int,
    card_id: str,
    title: str,
    details: str,
    priority: str | None = None,
    due_date: str | None = None,
    labels: list[str] | None = None,
) -> None:
    """Replace title and details. priority, due_date and labels are left alone when None;
    an empty due_date clears it."""
    card = _require_card(conn, board_id, card_id)
    conn.execute(
        "UPDATE cards SET title = ?, details = ? WHERE id = ?", (title, details, card["id"])
    )
    if priority is not None:
        conn.execute("UPDATE cards SET priority = ? WHERE id = ?", (priority, card["id"]))
    if due_date is not None:
        conn.execute("UPDATE cards SET due_date = ? WHERE id = ?", (due_date or None, card["id"]))
    if labels is not None:
        conn.execute("UPDATE cards SET labels = ? WHERE id = ?", (json.dumps(labels), card["id"]))


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


def _comment_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "author": row["author"],
        "body": row["body"],
        "createdAt": row["created_at"],
    }


def card_detail(conn: sqlite3.Connection, board_id: int, card_id: str) -> dict:
    card = _require_card(conn, board_id, card_id)
    comments = conn.execute(
        "SELECT id, author, body, created_at FROM comments WHERE card_id = ? ORDER BY id",
        (card["id"],),
    )
    checklist = conn.execute(
        "SELECT id, text, done FROM checklist_items WHERE card_id = ? ORDER BY position",
        (card["id"],),
    )
    return {
        "comments": [_comment_dict(r) for r in comments],
        "checklist": [
            {"id": r["id"], "text": r["text"], "done": bool(r["done"])} for r in checklist
        ],
    }


def _require_child(conn: sqlite3.Connection, board_id: int, table: str, pk: int) -> int:
    """Return the card pk that owns comment/checklist row `pk`, if it is on this board."""
    row = conn.execute(
        f"SELECT item.card_id FROM {table} AS item "
        "JOIN cards ON cards.id = item.card_id "
        "JOIN columns ON columns.id = cards.column_id "
        "WHERE item.id = ? AND columns.board_id = ?",
        (pk, board_id),
    ).fetchone()
    if not row:
        raise LookupError(f"{table}-{pk}")
    return row["card_id"]


def add_comment(
    conn: sqlite3.Connection, board_id: int, card_id: str, author: str, body: str
) -> str:
    card = _require_card(conn, board_id, card_id)
    conn.execute(
        "INSERT INTO comments (card_id, author, body) VALUES (?, ?, ?)",
        (card["id"], author, body),
    )
    return card_id


def delete_comment(conn: sqlite3.Connection, board_id: int, comment_id: int) -> str:
    card_pk = _require_child(conn, board_id, "comments", comment_id)
    conn.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
    return f"card-{card_pk}"


def add_checklist_item(conn: sqlite3.Connection, board_id: int, card_id: str, text: str) -> str:
    card = _require_card(conn, board_id, card_id)
    position = conn.execute(
        "SELECT COUNT(*) FROM checklist_items WHERE card_id = ?", (card["id"],)
    ).fetchone()[0]
    conn.execute(
        "INSERT INTO checklist_items (card_id, text, position) VALUES (?, ?, ?)",
        (card["id"], text, position),
    )
    return card_id


def update_checklist_item(
    conn: sqlite3.Connection,
    board_id: int,
    item_id: int,
    text: str | None = None,
    done: bool | None = None,
) -> str:
    card_pk = _require_child(conn, board_id, "checklist_items", item_id)
    if text is not None:
        conn.execute("UPDATE checklist_items SET text = ? WHERE id = ?", (text, item_id))
    if done is not None:
        conn.execute("UPDATE checklist_items SET done = ? WHERE id = ?", (int(done), item_id))
    return f"card-{card_pk}"


def delete_checklist_item(conn: sqlite3.Connection, board_id: int, item_id: int) -> str:
    card_pk = _require_child(conn, board_id, "checklist_items", item_id)
    conn.execute("DELETE FROM checklist_items WHERE id = ?", (item_id,))
    for position, row in enumerate(
        conn.execute(
            "SELECT id FROM checklist_items WHERE card_id = ? ORDER BY position", (card_pk,)
        ).fetchall()
    ):
        conn.execute("UPDATE checklist_items SET position = ? WHERE id = ?", (position, row["id"]))
    return f"card-{card_pk}"
