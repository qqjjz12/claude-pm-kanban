# Backend

FastAPI app managed with uv (`pyproject.toml`). Run in Docker via the root `Dockerfile`.

- `main.py` - app; `GET /api/hello`; serves `static/` at `/` (mounted last)
- `static/` - placeholder hello world page (replaced by the built frontend in Part 3)
- `tests/` - pytest; run with `uv run pytest` from this directory
