# Project Management App

Kanban boards with accounts, cards (priority, due date, labels, checklist, comments), search and filters, a dashboard, an activity log and an AI chat sidebar that can change the board. See `docs/PLAN.md`.

Requires Docker and a `.env` file (copy `.env.example`).

- Start: `scripts/start.sh` (Mac/Linux) or `scripts/start.ps1` (Windows)
- Stop: `scripts/stop.sh` or `scripts/stop.ps1`
- Open http://localhost:8000 and create an account, or sign in as `user` / `password`

Settings in `.env`: `OPENROUTER_API_KEY` (required for the chat), `PM_SECRET` (signs sessions; set it to a long random value), `PM_SESSION_SECONDS` (default 7 days), `PM_COOKIE_SECURE=1` (when served over HTTPS).

Tests: see `docs/test.md` for what exists and how to run it.
