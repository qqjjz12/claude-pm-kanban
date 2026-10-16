# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kanban project management app with an AI chat sidebar. `AGENTS.md` (root), `backend/AGENTS.md`, `frontend/AGENTS.md` and `scripts/AGENTS.md` hold the coding standards and detailed per-area notes; `docs/PLAN.md` is the part-by-part plan (pause for user approval and commit after each part); `docs/test.md` lists every test; `docs/DATABASE.md` and `docs/schema.json` describe the schema. No emojis anywhere. Keep it simple, do not over-engineer, and find the root cause with evidence before fixing bugs.

## Commands

Docker is the only run mode. Needs a `.env` in the project root (see `.env.example`): `OPENROUTER_API_KEY`, and `PM_SECRET` for real use.

- Start / stop (serves http://localhost:8000): `scripts/start.sh` / `scripts/stop.sh` (Mac/Linux), `scripts/start.ps1` / `scripts/stop.ps1` (Windows)
- Backend tests (from `backend/`): `uv run pytest`; single test: `uv run pytest tests/test_board.py::test_move_within_column`; include the live AI tests: `uv run --env-file ../.env pytest`
- Frontend (from `frontend/`): `npm run test:unit` (Vitest), single file: `npx vitest run src/lib/kanban.test.ts`; `npm run lint`; `npm run build` (static export to `frontend/out`)
- E2E (from `frontend/`): `npm run test:e2e`; it runs against the already running container at localhost:8000 (no webServer), so start it first and rebuild the image after code changes. Single spec: `npx playwright test tests/chat.spec.ts`

## Architecture

One Docker image, multi-stage: Node builds the Next.js static export (`output: 'export'`), then a Python image (uv) copies it to `backend/static/`, which FastAPI mounts at `/` (last, after all `/api` routes). SQLite lives at `/data/pm.db` (`PM_DB_PATH`) on the `pm-data` volume.

Backend (`backend/`, raw `sqlite3`, no ORM):
- `auth.py`: accounts (`/api/register`, `/api/login`, `/api/logout`, `/api/me`, `/api/me/password`, `/api/me/delete`). Passwords are scrypt-hashed. The session is an HMAC-signed httpOnly cookie `username|expiry.signature` (secret `PM_SECRET`, expiry `PM_SESSION_SECONDS`). Failed password checks are throttled per client and username (429). `current_user` guards every other route and requires the user to still exist. The demo account `user` / `password` is created at startup.
- `db.py`: schema creation and `_migrate` for older databases, users, boards (several per user, templates), and all column/card/comment/checklist mutations. Mutations also write the activity log through `conn.actor`. Ids exposed to the frontend are strings `col-N` / `card-N`; order is stored in `position` columns that must stay contiguous. Unknown or other-user ids raise `LookupError`, which `main.py` maps to 404.
- `board.py`: REST routes that call `db.py`. Board-level routes take an optional `?board=<id>` (default: the user's first board). `ai.py`: `POST /api/chat` sends the user's current board JSON plus history to OpenRouter (`openai/gpt-oss-120b`) with Structured Outputs (`reply` + list of `operations`, including column and card-field operations) and applies those operations through the same `db.py` functions as `AI assistant`; invalid ones are skipped and reported in the reply. The response is `{reply, board}` with `board` null if nothing changed.

Frontend (`frontend/src`): `AuthGate` (sign in / create account, session-expiry notice) renders `Workspace`, which owns the board list, the board switcher and the account panel and renders one `KanbanBoard` per selected board. `KanbanBoard` loads from `lib/api.ts` (`setActiveBoard` scopes calls), applies changes optimistically (dnd-kit; pure reorder and filter logic in `lib/kanban.ts`), persists via the API, and reloads on failure. Views: board (with filters), dashboard, activity. `CardDetailModal` handles checklist and comments. `ChatSidebar` keeps chat history in React state only (not persisted) and pushes the updated board into the board state when a reply includes one.

Colors come from CSS variables in `globals.css` (yellow `#ecad0a`, blue `#209dd7`, purple `#753991`, navy `#032147`, gray `#888888`).
