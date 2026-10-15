import hashlib
import hmac
import os

from fastapi import APIRouter, Cookie, HTTPException, Response
from pydantic import BaseModel

USERNAME = "user"
PASSWORD = "password"
COOKIE = "session"
SECRET = os.environ.get("PM_SECRET", "dev-secret").encode()

router = APIRouter(prefix="/api")


class Credentials(BaseModel):
    username: str
    password: str


def sign(username: str) -> str:
    signature = hmac.new(SECRET, username.encode(), hashlib.sha256).hexdigest()
    return f"{username}.{signature}"


def current_user(session: str | None = Cookie(default=None)) -> str:
    if session:
        username, _, signature = session.rpartition(".")
        if hmac.compare_digest(sign(username), session):
            return username
    raise HTTPException(status_code=401, detail="Not authenticated")


@router.post("/login")
def login(credentials: Credentials, response: Response):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    response.set_cookie(COOKIE, sign(USERNAME), httponly=True, samesite="lax")
    return {"username": USERNAME}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {}


@router.get("/me")
def me(session: str | None = Cookie(default=None)):
    return {"username": current_user(session)}
