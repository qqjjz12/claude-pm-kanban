"""End-to-end API journeys that cross several features."""
from fastapi.testclient import TestClient

from main import app

ALICE = {"username": "alice", "password": "alice-pass1"}
BOB = {"username": "bob", "password": "bob-pass-12"}


def test_full_user_journey(db_path):
    with TestClient(app) as alice:
        assert alice.post("/api/register", json=ALICE).status_code == 201

        # Starts with one sample board; add a project board and work in it.
        first = alice.get("/api/boards").json()[0]["id"]
        project = alice.post("/api/boards", json={"name": "Project X"}).json()["id"]
        scope = {"board": project}
        board = alice.get("/api/board", params=scope).json()
        todo, doing, _done = (c["id"] for c in board["columns"])

        card = alice.post(
            "/api/cards", params=scope, json={"column_id": todo, "title": "Write spec"}
        ).json()["id"]
        alice.post(f"/api/cards/{card}/move", params=scope, json={"column_id": doing, "position": 0})
        review = alice.post("/api/columns", params=scope, json={"title": "Review"}).json()["id"]
        alice.post(f"/api/cards/{card}/move", params=scope, json={"column_id": review, "position": 0})
        alice.post(f"/api/columns/{review}/move", params=scope, json={"position": 1})

        board = alice.get("/api/board", params=scope).json()
        assert [c["title"] for c in board["columns"]] == ["To Do", "Review", "In Progress", "Done"]
        assert board["columns"][1]["cardIds"] == [card]

        # The sample board is untouched.
        assert "Write spec" not in str(alice.get("/api/board", params={"board": first}).json())

        # Log out and back in; data persists.
        alice.post("/api/logout")
        assert alice.get("/api/board").status_code == 401
        alice.post("/api/login", json=ALICE)
        assert len(alice.get("/api/boards").json()) == 2

        # Change password; the old one stops working.
        alice.post(
            "/api/me/password",
            json={"current_password": ALICE["password"], "new_password": "alice-pass2"},
        )
        assert TestClient(app).post("/api/login", json=ALICE).status_code == 401


def test_two_users_never_see_each_other(db_path):
    with TestClient(app) as alice, TestClient(app) as bob:
        alice.post("/api/register", json=ALICE)
        bob.post("/api/register", json=BOB)
        secret = alice.post("/api/boards", json={"name": "Secret"}).json()["id"]
        column = alice.get("/api/board", params={"board": secret}).json()["columns"][0]["id"]
        card = alice.post(
            "/api/cards", params={"board": secret}, json={"column_id": column, "title": "Private"}
        ).json()["id"]

        assert "Secret" not in str(bob.get("/api/boards").json())
        assert bob.get("/api/board", params={"board": secret}).status_code == 404
        assert bob.delete(f"/api/cards/{card}").status_code == 404
        assert bob.post("/api/chat", params={"board": secret}, json={"message": "x"}).status_code == 404


def test_deleting_an_account_does_not_affect_others(db_path):
    with TestClient(app) as alice, TestClient(app) as bob:
        alice.post("/api/register", json=ALICE)
        bob.post("/api/register", json=BOB)
        bob_before = bob.get("/api/board").json()
        alice.post("/api/me/delete", json={"password": ALICE["password"]})
        assert bob.get("/api/board").json() == bob_before
