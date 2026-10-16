from fastapi.testclient import TestClient

import db
from auth import sign
from main import app


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def register(client, username="alice", password="secret-pass"):
    return client.post("/api/register", json={"username": username, "password": password})


def test_login_success_sets_cookie(anon):
    response = login(anon)
    assert response.status_code == 200
    assert "session" in response.cookies
    assert "httponly" in response.headers["set-cookie"].lower()


def test_login_wrong_password(anon):
    response = login(anon, password="wrong")
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_unknown_user(anon):
    assert login(anon, "nobody", "password").status_code == 401


def test_login_username_is_case_insensitive_and_session_uses_stored_name(anon):
    response = login(anon, "USER")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert anon.get("/api/me").json() == {"username": "user"}


def test_me_without_cookie(anon):
    assert anon.get("/api/me").status_code == 401


def test_me_with_cookie(anon):
    login(anon)
    assert anon.get("/api/me").json() == {"username": "user"}


def test_logout_clears_session(anon):
    login(anon)
    assert anon.post("/api/logout").status_code == 200
    assert anon.get("/api/me").status_code == 401


def test_tampered_cookie_rejected(anon):
    anon.cookies.set("session", "user.deadbeef")
    assert anon.get("/api/me").status_code == 401


def test_signature_of_one_user_does_not_work_for_another(anon):
    anon.cookies.set("session", "admin." + sign("user").split(".")[1])
    assert anon.get("/api/me").status_code == 401


def test_valid_signature_for_unknown_user_rejected(anon):
    anon.cookies.set("session", sign("ghost"))
    assert anon.get("/api/me").status_code == 401
    assert anon.get("/api/board").status_code == 401


def test_every_data_route_requires_login(anon):
    for method, url in [
        ("get", "/api/board"),
        ("get", "/api/boards"),
        ("post", "/api/boards"),
        ("post", "/api/columns"),
        ("post", "/api/cards"),
        ("post", "/api/chat"),
        ("post", "/api/me/password"),
        ("post", "/api/me/delete"),
    ]:
        assert getattr(anon, method)(url).status_code == 401, url


def test_register_creates_account_and_signs_in(anon):
    response = register(anon)
    assert response.status_code == 201
    assert anon.get("/api/me").json() == {"username": "alice"}
    assert len(anon.get("/api/boards").json()) == 1


def test_register_then_login_from_new_client(anon):
    register(anon)
    assert login(TestClient(app), "alice", "secret-pass").status_code == 200


def test_register_duplicate_username_ignoring_case(anon):
    register(anon)
    assert register(anon, "ALICE").status_code == 409
    assert register(anon, "user").status_code == 409


def test_register_validates_input(anon):
    assert register(anon, "ab").status_code == 422
    assert register(anon, "has space").status_code == 422
    assert register(anon, "x" * 33).status_code == 422
    assert register(anon, "bob", "short").status_code == 422
    assert register(anon, "bob", "x" * 201).status_code == 422


def test_register_trims_username(anon):
    assert register(anon, "  carol  ").json() == {"username": "carol"}


def test_passwords_are_hashed_not_stored(anon, db_path):
    register(anon, "alice", "secret-pass")
    conn = db.connect()
    stored = db.find_user(conn, "alice")["password_hash"]
    conn.close()
    assert "secret-pass" not in stored
    assert stored.startswith("scrypt$")


def test_same_password_gets_different_hashes():
    assert db.hash_password("abcdefgh") != db.hash_password("abcdefgh")


def test_verify_password_handles_garbage():
    assert not db.verify_password("x", None)
    assert not db.verify_password("x", "")
    assert not db.verify_password("x", "plaintext")
    assert not db.verify_password("x", "scrypt$zz$zz")
    assert db.verify_password("pw", db.hash_password("pw"))


def test_change_password(anon):
    register(anon)
    response = anon.post(
        "/api/me/password",
        json={"current_password": "secret-pass", "new_password": "brand-new-pass"},
    )
    assert response.status_code == 200
    fresh = TestClient(app)
    assert login(fresh, "alice", "secret-pass").status_code == 401
    assert login(fresh, "alice", "brand-new-pass").status_code == 200


def test_change_password_requires_current_password(anon):
    register(anon)
    response = anon.post(
        "/api/me/password",
        json={"current_password": "wrong", "new_password": "brand-new-pass"},
    )
    assert response.status_code == 401
    assert login(TestClient(app), "alice", "secret-pass").status_code == 200


def test_change_password_enforces_minimum_length(anon):
    register(anon)
    response = anon.post(
        "/api/me/password", json={"current_password": "secret-pass", "new_password": "short"}
    )
    assert response.status_code == 422


def test_delete_account_removes_user_and_boards(anon, db_path):
    register(anon)
    anon.post("/api/boards", json={"name": "Second"})
    response = anon.post("/api/me/delete", json={"password": "secret-pass"})
    assert response.status_code == 200
    assert anon.get("/api/me").status_code == 401
    conn = db.connect()
    assert db.find_user(conn, "alice") is None
    # Only the demo user's board remains.
    assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1
    conn.close()
    assert login(TestClient(app), "alice", "secret-pass").status_code == 401


def test_delete_account_needs_correct_password(anon):
    register(anon)
    assert anon.post("/api/me/delete", json={"password": "nope"}).status_code == 401
    assert anon.get("/api/me").status_code == 200


def test_deleted_users_stale_cookie_does_not_recreate_account(anon):
    register(anon)
    stale = anon.cookies.get("session")
    anon.post("/api/me/delete", json={"password": "secret-pass"})
    anon.cookies.set("session", stale)
    assert anon.get("/api/board").status_code == 401
