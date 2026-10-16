import hashlib
import hmac
import os
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, StringConstraints

import db

COOKIE = "session"
SECRET = os.environ.get("PM_SECRET", "dev-secret").encode()

router = APIRouter(prefix="/api")

Username = Annotated[str, StringConstraints(strip_whitespace=True, pattern=db.USERNAME_RE.pattern)]
NewPassword = Annotated[str, StringConstraints(min_length=8, max_length=200)]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Username
    password: NewPassword


class PasswordChange(BaseModel):
    current_password: str
    new_password: NewPassword


class AccountDeletion(BaseModel):
    password: str


def sign(username: str) -> str:
    signature = hmac.new(SECRET, username.encode(), hashlib.sha256).hexdigest()
    return f"{username}.{signature}"


def current_user(
    session: str | None = Cookie(default=None), conn=Depends(db.get_conn, scope="function")
) -> str:
    if session:
        username, _, signature = session.rpartition(".")
        if hmac.compare_digest(sign(username), session) and db.find_user(conn, username):
            return username
    raise HTTPException(status_code=401, detail="Not authenticated")


def start_session(response: Response, username: str) -> None:
    response.set_cookie(COOKIE, sign(username), httponly=True, samesite="lax")


def authenticated_user(username: str, password: str, conn) -> int:
    """Return the user's id if the password is right, otherwise raise 401."""
    user = db.find_user(conn, username)
    if not user or not db.verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
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
def login(credentials: Credentials, response: Response, conn=Depends(db.get_conn, scope="function")):
    authenticated_user(credentials.username, credentials.password, conn)
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
    body: PasswordChange, username: str = Depends(current_user), conn=Depends(db.get_conn, scope="function")
):
    user_id = authenticated_user(username, body.current_password, conn)
    db.set_password(conn, user_id, body.new_password)
    return {}


@router.post("/me/delete")
def delete_account(
    body: AccountDeletion,
    response: Response,
    username: str = Depends(current_user),
    conn=Depends(db.get_conn, scope="function"),
):
    user_id = authenticated_user(username, body.password, conn)
    db.delete_user(conn, user_id)
    response.delete_cookie(COOKIE)
    return {}
