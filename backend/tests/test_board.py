import sqlite3

from fastapi.testclient import TestClient

from main import app


def titles(board):
    return [c["title"] for c in board["columns"]]


def column_cards(board, index):
    column = board["columns"][index]
    return [board["cards"][cid]["title"] for cid in column["cardIds"]]


def positions_contiguous(db_path):
    conn = sqlite3.connect(db_path)
    for (column_id,) in conn.execute("SELECT id FROM columns").fetchall():
        rows = conn.execute(
            "SELECT position FROM cards WHERE column_id = ? ORDER BY position",
            (column_id,),
        ).fetchall()
        if [r[0] for r in rows] != list(range(len(rows))):
            return False
    return True


def move(client, card_id, column_id, position):
    return client.post(
        f"/api/cards/{card_id}/move", json={"column_id": column_id, "position": position}
    )


# database creation and seeding


def test_db_created_when_missing(client, db_path):
    assert db_path.exists()
    conn = sqlite3.connect(db_path)
    names = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    assert {"users", "boards", "columns", "cards"} <= {r[0] for r in names}


def test_seeded_board(client):
    board = client.get("/api/board").json()
    assert titles(board) == ["Backlog", "Discovery", "In Progress", "Review", "Done"]
    assert len(board["cards"]) == 8
    assert column_cards(board, 0) == ["Align roadmap themes", "Gather customer signals"]


def test_seed_is_idempotent(client, db_path):
    first = client.get("/api/board").json()
    second = client.get("/api/board").json()
    assert first == second
    conn = sqlite3.connect(db_path)
    assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1
    assert conn.execute("SELECT COUNT(*) FROM columns").fetchone()[0] == 5


def test_restart_keeps_data(client):
    column_id = client.get("/api/board").json()["columns"][0]["id"]
    client.put(f"/api/columns/{column_id}", json={"title": "Ideas"})
    with TestClient(app) as fresh:
        fresh.cookies.set("session", client.cookies["session"])
        assert titles(fresh.get("/api/board").json())[0] == "Ideas"


# auth


def test_routes_require_auth(db_path):
    with TestClient(app) as anon:
        assert anon.get("/api/board").status_code == 401
        assert anon.put("/api/columns/col-1", json={"title": "x"}).status_code == 401
        body = {"column_id": "col-1", "title": "x"}
        assert anon.post("/api/cards", json=body).status_code == 401
        assert anon.put("/api/cards/card-1", json={"title": "x"}).status_code == 401
        assert anon.delete("/api/cards/card-1").status_code == 401
        assert move(anon, "card-1", "col-1", 0).status_code == 401


# columns


def test_rename_column(client):
    column_id = client.get("/api/board").json()["columns"][1]["id"]
    response = client.put(f"/api/columns/{column_id}", json={"title": "Research"})
    assert response.status_code == 200
    assert titles(response.json())[1] == "Research"
    assert titles(client.get("/api/board").json())[1] == "Research"


def test_rename_unknown_column(client):
    assert client.put("/api/columns/col-9999", json={"title": "x"}).status_code == 404
    assert client.put("/api/columns/bogus", json={"title": "x"}).status_code == 404


# cards


def test_create_card(client, db_path):
    board = client.get("/api/board").json()
    column_id = board["columns"][3]["id"]
    response = client.post(
        "/api/cards", json={"column_id": column_id, "title": "New", "details": "Notes"}
    )
    assert response.status_code == 201
    card = response.json()
    assert card["title"] == "New" and card["details"] == "Notes"
    after = client.get("/api/board").json()
    assert after["cards"][card["id"]] == card
    assert after["columns"][3]["cardIds"][-1] == card["id"]
    assert positions_contiguous(db_path)


def test_create_card_default_details(client):
    column_id = client.get("/api/board").json()["columns"][0]["id"]
    card = client.post("/api/cards", json={"column_id": column_id, "title": "T"}).json()
    assert card["details"] == ""


def test_create_card_unknown_column(client):
    response = client.post("/api/cards", json={"column_id": "col-9999", "title": "x"})
    assert response.status_code == 404


def test_update_card(client):
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    response = client.put(f"/api/cards/{card_id}", json={"title": "Edited", "details": "D"})
    assert response.status_code == 200
    assert response.json()["cards"][card_id]["title"] == "Edited"
    assert client.get("/api/board").json()["cards"][card_id]["details"] == "D"


def test_update_unknown_card(client):
    assert client.put("/api/cards/card-9999", json={"title": "x"}).status_code == 404


def test_delete_card(client, db_path):
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    response = client.delete(f"/api/cards/{card_id}")
    assert response.status_code == 200
    after = client.get("/api/board").json()
    assert card_id not in after["cards"]
    assert column_cards(after, 0) == ["Gather customer signals"]
    assert positions_contiguous(db_path)


def test_delete_unknown_card(client):
    assert client.delete("/api/cards/card-9999").status_code == 404


# moves


def test_move_within_column(client, db_path):
    column = client.get("/api/board").json()["columns"][0]
    response = move(client, column["cardIds"][0], column["id"], 1)
    assert response.status_code == 200
    assert column_cards(response.json(), 0) == [
        "Gather customer signals",
        "Align roadmap themes",
    ]
    assert positions_contiguous(db_path)


def test_move_to_other_column(client, db_path):
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    response = move(client, card_id, board["columns"][2]["id"], 1).json()
    assert column_cards(response, 0) == ["Gather customer signals"]
    assert column_cards(response, 2) == [
        "Refine status language",
        "Align roadmap themes",
        "Design card layout",
    ]
    assert positions_contiguous(db_path)


def test_move_clamps_position(client, db_path):
    board = client.get("/api/board").json()
    discovery = board["columns"][1]
    only = discovery["cardIds"][0]
    move(client, only, board["columns"][0]["id"], 99)
    after = client.get("/api/board").json()
    assert column_cards(after, 1) == []
    assert column_cards(after, 0)[-1] == "Prototype analytics view"
    move(client, only, discovery["id"], -5)
    assert column_cards(client.get("/api/board").json(), 1) == ["Prototype analytics view"]
    assert positions_contiguous(db_path)


def test_move_unknown_ids(client):
    board = client.get("/api/board").json()
    card_id = board["columns"][0]["cardIds"][0]
    column_id = board["columns"][0]["id"]
    assert move(client, "card-9999", column_id, 0).status_code == 404
    assert move(client, card_id, "col-9999", 0).status_code == 404


# isolation between users


def test_users_have_separate_boards(client, other_client):
    mine = client.get("/api/board").json()
    theirs = other_client.get("/api/board").json()
    assert set(mine["cards"]).isdisjoint(theirs["cards"])
    assert {c["id"] for c in mine["columns"]}.isdisjoint({c["id"] for c in theirs["columns"]})


def test_cannot_modify_other_users_board(client, other_client):
    mine = client.get("/api/board").json()
    theirs = other_client.get("/api/board").json()
    my_card = mine["columns"][0]["cardIds"][0]
    my_column = mine["columns"][0]["id"]
    their_card = theirs["columns"][0]["cardIds"][0]
    their_column = theirs["columns"][0]["id"]

    assert other_client.put(f"/api/columns/{my_column}", json={"title": "x"}).status_code == 404
    body = {"column_id": my_column, "title": "x"}
    assert other_client.post("/api/cards", json=body).status_code == 404
    assert other_client.put(f"/api/cards/{my_card}", json={"title": "x"}).status_code == 404
    assert other_client.delete(f"/api/cards/{my_card}").status_code == 404
    assert move(other_client, my_card, their_column, 0).status_code == 404
    assert move(other_client, their_card, my_column, 0).status_code == 404

    assert client.get("/api/board").json() == mine
    assert other_client.get("/api/board").json() == theirs
