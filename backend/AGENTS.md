# Backend

FastAPI app managed with uv (`pyproject.toml`). Run in Docker via the root `Dockerfile`.

- `main.py` - app; `GET /api/hello`; serves `static/` at `/` (mounted last)
- `static/` - empty in git; the Dockerfile copies the built frontend (`frontend/out`) here
- `tests/` - pytest; run with `uv run pytest` from this directory
