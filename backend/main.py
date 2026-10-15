from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from auth import router as auth_router

app = FastAPI()
app.include_router(auth_router)


@app.get("/api/hello")
def hello():
    return {"message": "Hello from the API"}


app.mount(
    "/",
    StaticFiles(directory=Path(__file__).parent / "static", html=True),
    name="static",
)
