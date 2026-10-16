import sqlite3

import db

OLD_SCHEMA = """
CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE);
CREATE TABLE boards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Board'
);
CREATE TABLE columns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    title TEXT NOT NULL, position INTEGER NOT NULL
);
CREATE TABLE cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
);
INSERT INTO users (username) VALUES ('legacy');
INSERT INTO boards (user_id, name) VALUES (1, 'Old Board');
INSERT INTO columns (board_id, title, position) VALUES (1, 'Only', 0);
INSERT INTO cards (column_id, title, position) VALUES (1, 'Keep me', 0);
"""


def test_old_database_is_upgraded_in_place(db_path):
    db_path.parent.mkdir(parents=True)
    old = sqlite3.connect(db_path)
    old.executescript(OLD_SCHEMA)
    old.commit()
    old.close()

    db.init_db()
    db.init_db()  # running twice must be harmless

    conn = db.connect()
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    card = db.fetch_board(conn, 1)["cards"]["card-1"]
    assert card["title"] == "Keep me"
    assert (card["priority"], card["dueDate"], card["labels"]) == ("none", None, [])
    # Multiple boards per user are now possible and the demo account exists.
    db.create_board(conn, 1, "Second")
    assert len(db.list_boards(conn, 1)) == 2
    assert db.verify_password("password", db.find_user(conn, "user")["password_hash"])
    # The legacy user has no password and so cannot log in.
    assert db.find_user(conn, "legacy")["password_hash"] is None
    conn.close()


def test_init_db_is_idempotent_and_keeps_changed_demo_password(db_path):
    db.init_db()
    conn = db.connect()
    db.set_password(conn, db.find_user(conn, "user")["id"], "changed-pass")
    conn.commit()
    conn.close()
    db.init_db()
    conn = db.connect()
    assert db.verify_password("changed-pass", db.find_user(conn, "user")["password_hash"])
    conn.close()


def test_demo_user_without_a_password_gets_one(db_path):
    db.init_db()
    conn = db.connect()
    conn.execute("UPDATE users SET password_hash = NULL WHERE username = ?", (db.DEMO_USER,))
    conn.commit()
    conn.close()
    db.init_db()
    conn = db.connect()
    assert db.verify_password(db.DEMO_PASSWORD, db.find_user(conn, db.DEMO_USER)["password_hash"])
    conn.close()


def test_ensure_board_for_unknown_user_is_not_found(db_path):
    import pytest

    db.init_db()
    conn = db.connect()
    with pytest.raises(LookupError):
        db.ensure_board(conn, "ghost")
    conn.close()
