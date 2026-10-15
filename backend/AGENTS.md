# Backend

FastAPI app managed with uv (`pyproject.toml`). Run in Docker via the root `Dockerfile`.

- `main.py` - app; `GET /api/hello`; serves `static/` at `/` (mounted last)
- `auth.py` - fake login: `POST /api/login` (user/password) sets an HMAC-signed httpOnly `session` cookie; `POST /api/logout`; `GET /api/me`; `current_user` dependency for protected routes. Secret from `PM_SECRET` (dev default)
- `static/` - empty in git; the Dockerfile copies the built frontend (`frontend/out`) here
- `tests/` - pytest; run with `uv run pytest` from this directory
