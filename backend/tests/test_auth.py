from fastapi.testclient import TestClient

from auth import sign
from main import app


def make_client():
    return TestClient(app)


def login(client, password="password"):
    return client.post("/api/login", json={"username": "user", "password": password})


def test_login_success_sets_cookie():
    client = make_client()
    response = login(client)
    assert response.status_code == 200
    assert "session" in response.cookies
    assert "httponly" in response.headers["set-cookie"].lower()


def test_login_wrong_password():
    client = make_client()
    response = login(client, "wrong")
    assert response.status_code == 401
    assert "session" not in response.cookies


def test_login_wrong_username():
    client = make_client()
    response = client.post("/api/login", json={"username": "x", "password": "password"})
    assert response.status_code == 401


def test_me_without_cookie():
    assert make_client().get("/api/me").status_code == 401


def test_me_with_cookie():
    client = make_client()
    login(client)
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session():
    client = make_client()
    login(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401


def test_tampered_cookie_rejected():
    client = make_client()
    client.cookies.set("session", "user.deadbeef")
    assert client.get("/api/me").status_code == 401


def test_cookie_for_other_user_without_valid_signature_rejected():
    client = make_client()
    client.cookies.set("session", "admin." + sign("user").split(".")[1])
    assert client.get("/api/me").status_code == 401
