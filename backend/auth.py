import hashlib
import hmac
import logging
import os
import time
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from pydantic import BaseModel, StringConstraints

import db

COOKIE = "session"
DEFAULT_SECRET = "dev-secret"
SECRET = os.environ.get("PM_SECRET", DEFAULT_SECRET).encode()
SESSION_SECONDS = int(os.environ.get("PM_SESSION_SECONDS", 7 * 24 * 3600))
# Set PM_COOKIE_SECURE=1 when serving over HTTPS.
COOKIE_SECURE = os.environ.get("PM_COOKIE_SECURE", "") not in ("", "0")

MAX_FAILURES = 5
FAILURE_WINDOW_SECONDS = 300

router = APIRouter(prefix="/api")
log = logging.getLogger("pm.auth")

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=db.USERNAME_RE.pattern)]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=200)]
# Longer than any real password; stops a huge body from being fed to scrypt.
AnyPassword = Annotated[str, StringConstraints(max_length=200)]


class Credentials(BaseModel):
    username: Annotated[str, StringConstraints(max_length=100)]
    password: AnyPassword


class Registration(BaseModel):
    username: Username
    password: NewPassword


class PasswordChange(BaseModel):
    current_password: AnyPassword
    new_password: NewPassword


class AccountDeletion(BaseModel):
    password: AnyPassword


def warn_if_default_secret() -> None:
    if SECRET == DEFAULT_SECRET.encode():
        log.warning("PM_SECRET is not set; sessions are signed with a public development secret")


def _signature(payload: str) -> bytes:
    return hmac.new(SECRET, payload.encode(), hashlib.sha256).hexdigest().encode()


def sign(username: str, expires: int | None = None) -> str:
    """A session value: `username|expiry.signature` (expiry is a unix time)."""
    if expires is None:
        expires = int(time.time()) + SESSION_SECONDS
    payload = f"{username}|{expires}"
    return f"{payload}.{_signature(payload).decode()}"


def read_session(session: str) -> str | None:
    """The username in a genuine, unexpired session value, else None."""
    payload, _, signature = session.rpartition(".")
    # Compare as bytes: compare_digest raises on non-ASCII text.
    if not hmac.compare_digest(_signature(payload), signature.encode()):
        return None
    username, _, expires = payload.rpartition("|")
    if not (username and expires.isdigit()) or int(expires) < time.time():
        return None
    return username


def current_user(
    session: str | None = Cookie(default=None), conn=Depends(db.get_conn, scope="function")
) -> str:
    username = read_session(session) if session else None
    if username and db.find_user(conn, username):
        return username
    raise HTTPException(status_code=401, detail="Not authenticated")


def start_session(response: Response, username: str) -> None:
    response.set_cookie(
        COOKIE,
        sign(username),
        httponly=True,
        samesite="lax",
        max_age=SESSION_SECONDS,
        secure=COOKIE_SECURE,
    )


# Failed password checks per (client, username), kept in memory: enough to slow guessing
# down on a single server, and reset by a restart.
_failures: dict[tuple[str, str], list[float]] = {}


def reset_throttle() -> None:
    _failures.clear()


def _recent_failures(key: tuple[str, str]) -> list[float]:
    cutoff = time.time() - FAILURE_WINDOW_SECONDS
    recent = [t for t in _failures.get(key, []) if t > cutoff]
    if recent:
        _failures[key] = recent
    else:
        _failures.pop(key, None)
    return recent


def authenticated_user(request: Request, username: str, password: str, conn) -> int:
    """Return the user's id if the password is right; otherwise 401, or 429 after too many tries."""
    key = (request.client.host if request.client else "", username.lower())
    recent = _recent_failures(key)
    if len(recent) >= MAX_FAILURES:
        retry_after = max(1, int(recent[0] + FAILURE_WINDOW_SECONDS - time.time()))
        raise HTTPException(
            status_code=429,
            detail="Too many failed attempts. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    user = db.find_user(conn, username)
    if not user or not db.verify_password(password, user["password_hash"]):
        _failures.setdefault(key, []).append(time.time())
        raise HTTPException(status_code=401, detail="Invalid credentials")
    _failures.pop(key, None)
    return user["id"]


@router.post("/register", status_code=201)
def register(body: Registration, response: Response, conn=Depends(db.get_conn, scope="function")):
    try:
        db.create_user(conn, body.username, body.password)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error))
    start_session(response, body.username)
    return {"username": body.username}


@router.post("/login")
def login(
    credentials: Credentials,
    request: Request,
    response: Response,
    conn=Depends(db.get_conn, scope="function"),
):
    authenticated_user(request, credentials.username, credentials.password, conn)
    # Use the stored spelling so the session matches however the user typed the name.
    username = db.find_user(conn, credentials.username)["username"]
    start_session(response, username)
    return {"username": username}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {}


@router.get("/me")
def me(username: str = Depends(current_user)):
    return {"username": username}


@router.post("/me/password")
def change_password(
    body: PasswordChange,
    request: Request,
    username: str = Depends(current_user),
    conn=Depends(db.get_conn, scope="function"),
):
    user_id = authenticated_user(request, username, body.current_password, conn)
    db.set_password(conn, user_id, body.new_password)
    return {}


@router.post("/me/delete")
def delete_account(
    body: AccountDeletion,
    request: Request,
    response: Response,
    username: str = Depends(current_user),
    conn=Depends(db.get_conn, scope="function"),
):
    user_id = authenticated_user(request, username, body.password, conn)
    db.delete_user(conn, user_id)
    response.delete_cookie(COOKIE)
    return {}
