# Database

SQLite via the stdlib `sqlite3` module, no ORM. Schema is defined in `schema.json`.

## Tables

- `users` - id, username. No password column: the MVP login is hardcoded (`user` / `password`). A hash column is added when real accounts are needed.
- `boards` - one per user (`UNIQUE(user_id)`). Removing that constraint is the only change needed to allow multiple boards.
- `columns` - belong to a board; `position` gives left-to-right order. Fixed at five, but renamable.
- `cards` - belong to a column; `position` gives top-to-bottom order.

Foreign keys cascade on delete, so deleting a column removes its cards, and so on up the chain. `PRAGMA foreign_keys = ON` is set on every connection.

## Ordering

`position` is a 0-based integer, kept contiguous within its parent. Moving or deleting a card rewrites the positions of the affected column(s) in one transaction. Boards are small, so this is simpler than fractional ordering.

## Lifecycle

- On startup the backend creates the tables if they do not exist (`CREATE TABLE IF NOT EXISTS`), which also creates the DB file and its directory.
- The first authenticated request for a user creates the user row and their board if missing (`ensure_board`). A new board is seeded with the five default columns (Backlog, Discovery, In Progress, Review, Done) and the demo cards currently in `frontend/src/lib/kanban.ts`.
- No migrations for the MVP. If the schema changes, delete the volume.

## API shape

The API returns the frontend's existing `BoardData` shape (`columns` with `cardIds`, and `cards` keyed by id). Database integer ids become prefixed strings at the API boundary (`col-3`, `card-7`). The prefix is required: drag and drop looks up column ids and card ids in the same namespace, so bare numbers could collide. Drag and drop code is unchanged.

## AI

The AI receives the same board JSON and returns operations referencing those ids (Part 9). Operations go through the same functions as the REST routes.
