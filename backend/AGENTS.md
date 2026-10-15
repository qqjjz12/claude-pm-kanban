# Backend

FastAPI app managed with uv (`pyproject.toml`). Run in Docker via the root `Dockerfile`.

- `main.py` - app; `GET /api/hello`; serves `static/` at `/` (mounted last)
- `auth.py` - fake login: `POST /api/login` (user/password) sets an HMAC-signed httpOnly `session` cookie; `POST /api/logout`; `GET /api/me`; `current_user` dependency for protected routes. Secret from `PM_SECRET` (dev default)
- `db.py` - sqlite3 access: schema creation, `ensure_board` (creates and seeds a user's board), `fetch_board`, and card/column mutations. DB path from `PM_DB_PATH` (default `pm.db`). Unknown or foreign ids raise `LookupError`, mapped to 404 in `main.py`
- `board.py` - routes, all scoped to the signed-in user: `GET /api/board`, `PUT /api/columns/{id}`, `POST /api/cards`, `PUT|DELETE /api/cards/{id}`, `POST /api/cards/{id}/move` (`column_id`, `position`). Ids are `col-N` / `card-N`. Create returns the card (201); the others return the full board
- `ai.py` - OpenRouter client (OpenAI SDK, model `openai/gpt-oss-120b`, key from `OPENROUTER_API_KEY`), `ask(prompt)`, and a temporary `POST /api/ai/test` that asks "What is 2+2?". The live test in `tests/test_ai.py` is skipped without the key; run it with `uv run --env-file ../.env pytest`
- `static/` - empty in git; the Dockerfile copies the built frontend (`frontend/out`) here
- `tests/` - pytest (`conftest.py` gives a temp DB and logged-in `client` / `other_client`); run with `uv run pytest` from this directory
