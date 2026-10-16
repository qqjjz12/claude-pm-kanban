# Database

SQLite via the stdlib `sqlite3` module, no ORM. The schema is described in `schema.json` and created by `SCHEMA` in `backend/db.py`.

## Tables

- `users` - `username` (unique, matched ignoring case) and `password_hash` (scrypt, salted). A NULL hash cannot sign in.
- `boards` - many per user. Deleting a user deletes their boards.
- `columns` - belong to a board; `position` gives left-to-right order.
- `cards` - belong to a column; `position` gives top-to-bottom order. Also `priority`, `due_date` (`YYYY-MM-DD`) and `labels` (JSON array).
- `comments` and `checklist_items` - belong to a card. Checklist items have their own `position`.
- `activity` - one row per logged change on a board (who and what). Only the newest 500 per board are kept.

Foreign keys cascade on delete, so deleting a board removes its columns, cards, comments, checklist items and activity, and deleting a column removes its cards. `PRAGMA foreign_keys = ON` is set on every connection.

## Ordering

`position` is a 0-based integer, kept contiguous within its parent (columns in a board, cards in a column, checklist items in a card). Moving or deleting rewrites the positions of the affected parent in one transaction. Boards are small, so this is simpler than fractional ordering.

## Lifecycle and migration

- On startup the backend creates missing tables (`CREATE TABLE IF NOT EXISTS`), which also creates the DB file and its directory, then runs `_migrate` for databases created by older versions: it adds `users.password_hash`, the card columns (`priority`, `due_date`, `labels`), and rebuilds `boards` to drop its old `UNIQUE(user_id)` constraint. Running it again changes nothing. `backend/tests/test_migration.py` covers this.
- It also makes sure the demo account `user` / `password` exists (and has a password).
- `create_user` gives every new account a board seeded with the five sample columns and cards. New boards can use the `standard` (To Do / In Progress / Done), `sample` or `empty` template.

## Transactions

Each request gets its own connection (`get_conn`) and commits when the handler finishes without an error, otherwise rolls back. The dependency has `scope="function"` so the commit happens before the response is sent.

## API shape

Board responses use the frontend's `BoardData` shape: `columns` with `cardIds`, and `cards` keyed by id. Database integer ids become prefixed strings at the API boundary (`col-3`, `card-7`). The prefix is required: drag and drop looks up column ids and card ids in the same namespace, so bare numbers could collide. Comment and checklist ids, and board ids, are plain integers.

## AI

The AI receives the same board JSON and returns operations referencing those ids. Operations go through the same `db.py` functions as the REST routes, so validation and the activity log apply equally (entries are attributed to `AI assistant`).
