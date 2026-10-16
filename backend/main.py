from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

import db
from ai import router as ai_router
from auth import router as auth_router
from auth import warn_if_default_secret
from board import router as board_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    warn_if_default_secret()
    db.init_db()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(board_router)
app.include_router(ai_router)


@app.exception_handler(LookupError)
def not_found(request: Request, exc: LookupError):
    return JSONResponse({"detail": "Not found"}, status_code=404)


@app.get("/api/hello")
def hello():
    return {"message": "Hello from the API"}


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent / "static", html=True),
    name="static",
)
