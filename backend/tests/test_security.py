import time

from fastapi.testclient import TestClient

import auth
import db
from main import app


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def fail_logins(client, count, username="user"):
    for _ in range(count):
        assert login(client, username, "wrong").status_code == 401


# --- session cookie ---------------------------------------------------------


def test_session_cookie_has_expiry_and_flags(anon):
    response = login(anon)
    header = response.headers["set-cookie"].lower()
    assert "httponly" in header
    assert "samesite=lax" in header
    assert f"max-age={auth.SESSION_SECONDS}" in header
    assert "secure" not in header


def test_secure_flag_follows_configuration(anon, monkeypatch):
    monkeypatch.setattr(auth, "COOKIE_SECURE", True)
    assert "secure" in login(anon).headers["set-cookie"].lower()


def test_expired_session_is_rejected(anon):
    anon.cookies.set("session", auth.sign("user", expires=int(time.time()) - 1))
    assert anon.get("/api/me").status_code == 401


def test_unexpired_session_is_accepted(anon):
    anon.cookies.set("session", auth.sign("user", expires=int(time.time()) + 60))
    assert anon.get("/api/me").json() == {"username": "user"}


def test_session_stops_working_when_time_passes(anon, monkeypatch):
    login(anon)
    assert anon.get("/api/me").status_code == 200
    later = time.time() + auth.SESSION_SECONDS + 5
    monkeypatch.setattr(auth.time, "time", lambda: later)
    assert anon.get("/api/me").status_code == 401


def test_expiry_cannot_be_extended_without_the_secret(anon):
    value = auth.sign("user", expires=int(time.time()) - 100)
    payload, _, signature = value.rpartition(".")
    username, _, _ = payload.rpartition("|")
    forged = f"{username}|{int(time.time()) + 10**6}.{signature}"
    anon.cookies.set("session", forged)
    assert anon.get("/api/me").status_code == 401


def test_malformed_session_values_are_401_not_errors(anon):
    for value in ["", ".", "..", "user", "user|", "|1.abc", "user|abc.def", "a" * 5000]:
        anon.cookies.set("session", value)
        assert anon.get("/api/me").status_code == 401, value


def test_non_ascii_session_values_are_rejected_without_error():
    # Browsers and servers can hand over latin-1 text; compare_digest would raise on it.
    assert auth.read_session("usér|9999999999.é") is None
    assert auth.read_session("é") is None


def test_username_with_a_pipe_cannot_forge_another_user(anon):
    # Usernames cannot contain "|", and the last "|" always splits off the expiry.
    assert anon.post("/api/register", json={"username": "evil|1", "password": "long-enough"}).status_code == 422
    value = auth.sign("evil|99999999999", expires=int(time.time()) + 60)
    anon.cookies.set("session", value)
    assert anon.get("/api/me").status_code == 401  # no such user


def test_sign_and_read_round_trip():
    assert auth.read_session(auth.sign("alice")) == "alice"
    assert auth.read_session(auth.sign("a.b-c_d")) == "a.b-c_d"


# --- login throttling --------------------------------------------------------


def test_login_is_blocked_after_too_many_failures_even_with_the_right_password(anon):
    fail_logins(anon, auth.MAX_FAILURES)
    response = login(anon)
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    assert "session" not in response.cookies


def test_four_failures_are_still_allowed(anon):
    fail_logins(anon, auth.MAX_FAILURES - 1)
    assert login(anon).status_code == 200


def test_success_resets_the_failure_count(anon):
    fail_logins(anon, auth.MAX_FAILURES - 1)
    assert login(anon).status_code == 200
    fail_logins(anon, auth.MAX_FAILURES - 1)
    assert login(anon).status_code == 200


def test_throttle_is_per_username(anon):
    fail_logins(anon, auth.MAX_FAILURES)
    assert login(anon).status_code == 429
    anon.post("/api/register", json={"username": "other1", "password": "long-enough"})
    assert login(TestClient(app), "other1", "long-enough").status_code == 200


def test_throttle_ignores_username_case(anon):
    fail_logins(anon, auth.MAX_FAILURES - 1, "user")
    assert login(anon, "USER", "wrong").status_code == 401
    assert login(anon, "user").status_code == 429


def test_unknown_usernames_are_throttled_too(anon):
    fail_logins(anon, auth.MAX_FAILURES, "ghost")
    assert login(anon, "ghost", "whatever").status_code == 429


def test_failures_expire_after_the_window(anon, monkeypatch):
    fail_logins(anon, auth.MAX_FAILURES)
    assert login(anon).status_code == 429
    later = time.time() + auth.FAILURE_WINDOW_SECONDS + 1
    monkeypatch.setattr(auth.time, "time", lambda: later)
    assert login(anon).status_code == 200


def test_password_change_is_throttled(client):
    def attempt(current):
        return client.post(
            "/api/me/password", json={"current_password": current, "new_password": "brand-new-pass"}
        )

    for _ in range(auth.MAX_FAILURES):
        assert attempt("wrong").status_code == 401
    assert attempt("password").status_code == 429
    conn = db.connect()
    assert db.verify_password("password", db.find_user(conn, "user")["password_hash"])
    conn.close()


def test_account_deletion_is_throttled(client):
    for _ in range(auth.MAX_FAILURES):
        assert client.post("/api/me/delete", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/me/delete", json={"password": "password"}).status_code == 429
    assert client.get("/api/me").status_code == 200


def test_login_and_account_checks_share_the_counter(anon, client):
    fail_logins(anon, auth.MAX_FAILURES - 1)
    assert client.post("/api/me/delete", json={"password": "wrong"}).status_code == 401
    assert client.post("/api/me/delete", json={"password": "password"}).status_code == 429


def test_throttle_state_stays_small(anon):
    fail_logins(anon, 1, "user")
    assert len(auth._failures) == 1
    login(anon)
    assert auth._failures == {}


# --- input limits ------------------------------------------------------------


def test_oversized_login_fields_are_rejected_without_hashing(anon):
    assert login(anon, "user", "x" * 201).status_code == 422
    assert login(anon, "u" * 101, "password").status_code == 422


def test_oversized_password_checks_are_rejected(client):
    assert client.post("/api/me/delete", json={"password": "x" * 201}).status_code == 422
    body = {"current_password": "x" * 201, "new_password": "long-enough"}
    assert client.post("/api/me/password", json=body).status_code == 422


def test_default_secret_warning(caplog, monkeypatch):
    monkeypatch.setattr(auth, "SECRET", auth.DEFAULT_SECRET.encode())
    with caplog.at_level("WARNING", logger="pm.auth"):
        auth.warn_if_default_secret()
    assert "PM_SECRET is not set" in caplog.text
    caplog.clear()
    monkeypatch.setattr(auth, "SECRET", b"something-else")
    auth.warn_if_default_secret()
    assert caplog.text == ""
