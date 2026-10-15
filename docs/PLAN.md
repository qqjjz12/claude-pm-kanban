# Project plan

## Decisions (confirmed with user)

- Keep the existing frontend dependencies and versions.
- Next.js static export (`output: 'export'`), served by FastAPI at `/`.
- Auth: FastAPI `/api/login` sets a signed httpOnly cookie; `/api/logout` clears it. Hardcoded `user` / `password`.
- Database: raw `sqlite3` (no ORM). Created on startup if missing.
- AI chat history lives in frontend state only (not persisted).
- Tests: Vitest (frontend unit), Playwright (e2e), pytest (backend).
- Docker is the only run mode. Scripts in `scripts/` for Mac, Linux (`.sh`) and PC (`.ps1`).
- Pause for user approval at the end of every part. Commit after each part.

## Conventions

- Python in the container managed with `uv`. Backend in `backend/`, entry `backend/main.py` (FastAPI app).
- Single Docker image: multi-stage build (node builds frontend, python stage copies `out/` to be served as static files).
- SQLite file lives in a Docker volume path (`/data/pm.db`), so it survives container restarts.
- API routes all under `/api`. Static files mounted at `/` last.
- `.env` in project root holds `OPENROUTER_API_KEY`; passed to the container with `--env-file`.
- No emojis. Keep READMEs minimal.

---

## Part 1: Plan

- [x] Review AGENTS.md and the existing frontend
- [x] Write `frontend/AGENTS.md` describing the existing code
- [x] Enrich this document with substeps, tests, success criteria
- [x] User reviews and approves the plan

Success: user approves.

## Part 2: Scaffolding

Substeps:
- [x] `backend/pyproject.toml` (fastapi, uvicorn, pytest, httpx2) managed by uv
- [x] `backend/main.py`: FastAPI app with `GET /api/hello` returning JSON, and a static mount serving `backend/static/` with a hello world `index.html`
- [x] `Dockerfile` (python base, install uv, `uv sync`, run uvicorn on port 8000)
- [x] `scripts/start.sh`, `scripts/stop.sh` (Mac/Linux), `scripts/start.ps1`, `scripts/stop.ps1` (PC): build image, run container with `--env-file .env`, volume for `/data`
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md`
- [x] Minimal root `README.md` with how to start/stop

Tests:
- pytest: `GET /api/hello` returns 200 and expected JSON; `GET /` returns the hello HTML
- Manual: run start script, open `http://localhost:8000`, confirm page loads and its JS fetch of `/api/hello` displays the result; run stop script, confirm container is gone

Success: hello world page and API call work from within the container on Windows, scripts start and stop cleanly.

## Part 3: Add in Frontend

Substeps:
- [x] Set `output: 'export'` in `next.config.ts`; make `npm run build` produce `frontend/out`
- [x] Dockerfile adds a node build stage; copy `out/` into the image and serve it at `/` instead of the hello page
- [x] Remove the hello placeholder page
- [x] Update Playwright config to run against the Docker app on port 8000 (baseURL), keeping existing tests (no webServer; start the container first)
- [x] Fill coverage gaps in unit tests: `moveCard` (same column, cross column, onto column, invalid ids), `createId`, KanbanBoard (rename, add, delete)
- [x] Add card editing to the UI only if missing and required by the business requirements (cards "can be edited"); include tests

Tests:
- Vitest unit tests all pass with coverage report reviewed
- Playwright e2e against the container: board loads with 5 columns, add card, delete card, rename column, drag card between columns

Success: `/` shows the Kanban demo from the container; all unit and e2e tests pass.

## Part 4: Fake sign in

Substeps:
- [x] Backend: `POST /api/login` (checks `user` / `password`, sets signed cookie), `POST /api/logout`, `GET /api/me` (200 with username or 401)
- [x] Signing secret: fixed dev default, overridable by `PM_SECRET`
- [x] Frontend: on load call `/api/me`; if 401 show a login form (styled with the color scheme); on success show the board; add a Log out button in the header
- [x] Error message on bad credentials

Tests:
- pytest: login success sets cookie; wrong password returns 401; `/api/me` without cookie 401, with cookie 200; logout clears; tampered cookie rejected
- Vitest: login form renders, submits, shows error on failure; board hidden when unauthenticated
- Playwright: unauthenticated visit shows login; bad credentials show error; good credentials show board; logout returns to login; reload while logged in stays logged in

Success: board is only visible after logging in with user/password; logout works.

## Part 5: Database modeling

Substeps:
- [x] Propose SQLite schema: `users` (id, username, password placeholder), `boards` (id, user_id unique for MVP, name), `columns` (id, board_id, title, position), `cards` (id, column_id, title, details, position)
- [x] Save schema as JSON in `docs/schema.json` (tables, columns, types, keys, constraints)
- [x] Write `docs/DATABASE.md` explaining the approach: ordering via `position`, one board per user enforced by unique constraint, DB created and seeded on startup, multi-user ready
- [x] User reviews and signs off

Success: user approves the schema and document.

## Part 6: Backend API

Substeps:
- [x] `backend/db.py`: connect, create tables if missing, seed default user and default board (5 columns, demo cards) on first login or startup
- [x] Routes (all require the auth cookie, scoped to the current user):
  - `GET /api/board` returns the full board in the frontend `BoardData` shape
  - `PUT /api/columns/{id}` rename
  - `POST /api/cards` create (column, title, details)
  - `PUT /api/cards/{id}` edit title/details
  - `DELETE /api/cards/{id}`
  - `POST /api/cards/{id}/move` (target column, position)
- [x] 404 for ids not owned by the user

Tests (pytest, temp DB per test):
- DB created when file does not exist; tables present; seed idempotent
- Each route: success path, persistence across a fresh connection, 401 without cookie, 404 for unknown id, positions contiguous after move/delete
- A second user cannot read or modify the first user's board

Success: all backend tests pass; API behaves per above.

## Part 7: Frontend + Backend

Substeps:
- [x] `frontend/src/lib/api.ts`: typed fetch wrappers for the routes above
- [x] KanbanBoard loads from `GET /api/board` and calls the API on each change (rename, add, edit, delete, move); optimistic update with refetch on error
- [x] Loading and error states
- [x] Remove `initialData` from runtime use (keep as test fixture if needed)

Tests:
- Vitest with mocked fetch: load, each mutation calls the right endpoint, error path refetches
- Playwright against the container: changes persist across page reload; changes persist across container restart (volume); logout/login retains data

Success: board is fully persistent; all unit and e2e tests pass.

## Part 8: AI connectivity

Substeps:
- [x] `backend/ai.py`: OpenRouter client (OpenAI SDK with base URL `https://openrouter.ai/api/v1`), model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`
- [x] Temporary `POST /api/ai/test` route (auth required) that asks "What is 2+2?" and returns the reply (removed in Part 9; `/api/chat` replaces it)

Tests:
- pytest with mocked client: request built with right model and key
- Live test (marked, skipped without key): reply contains "4"
- Manual: call the route from the container and confirm the response

Success: real call to OpenRouter returns a correct answer.

## Part 9: AI with Kanban context and Structured Outputs

Substeps:
- [x] `POST /api/chat` body: `{message, history[]}`; backend loads the user's board JSON and sends system prompt + board JSON + history + question
- [x] Structured Output schema: `{reply: string, operations: Operation[]}` (empty list means no board change) where operations are create card, edit card, move card, delete card, rename column (so one or more cards can be changed); validate with pydantic
- [x] Backend applies the operations through the same DB functions as Part 6, and returns `{reply, board}` with the fresh board when changed
- [x] Reject or ignore operations referencing unknown ids, reporting that in the reply

Tests:
- pytest with mocked model output: reply only; each operation type applied and persisted; multiple operations in one response; invalid ids handled; malformed model output returns a clear error
- Live test (skipped without key): ask to add a card and verify the board changed

Success: AI answers questions about the board and can modify it via structured output; DB reflects changes.

## Part 10: Chat sidebar UI

Substeps:
- [ ] Sidebar component with message list, input, send button, loading indicator; history in React state
- [ ] Sends `{message, history}` to `/api/chat`; renders the reply
- [ ] When the response includes an updated board, the board state refreshes automatically
- [ ] Styled with the color scheme (purple submit button, navy headings, yellow accents)
- [ ] Layout: board plus collapsible right-hand sidebar, responsive

Tests:
- Vitest: sidebar renders messages, sends, shows loading and error; board refresh on update response
- Playwright with the chat endpoint mocked (route interception): send a message, see reply, board updates without reload
- Manual live check: ask the AI to create and move a card

Success: full chat experience works end to end; AI-driven board changes appear immediately.
