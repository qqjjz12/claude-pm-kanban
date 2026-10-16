import db


def test_create_column_appends(client):
    response = client.post("/api/columns", json={"title": "Blocked"})
    assert response.status_code == 201
    column = response.json()
    assert column["title"] == "Blocked" and column["cardIds"] == []
    assert client.get("/api/board").json()["columns"][-1]["id"] == column["id"]


def test_create_column_validates_title(client):
    assert client.post("/api/columns", json={"title": "  "}).status_code == 422
    assert client.post("/api/columns", json={"title": "x" * 201}).status_code == 422


def test_new_column_accepts_cards(client):
    column = client.post("/api/columns", json={"title": "Blocked"}).json()["id"]
    response = client.post("/api/cards", json={"column_id": column, "title": "Stuck"})
    assert response.status_code == 201


def test_delete_column_removes_cards_and_keeps_order_contiguous(client):
    board = client.get("/api/board").json()
    doomed = board["columns"][1]
    after = client.delete(f"/api/columns/{doomed['id']}")
    assert after.status_code == 200
    assert doomed["id"] not in [c["id"] for c in after.json()["columns"]]
    assert all(card not in after.json()["cards"] for card in doomed["cardIds"])
    conn = db.connect()
    positions = [r[0] for r in conn.execute("SELECT position FROM columns ORDER BY position")]
    conn.close()
    assert positions == list(range(len(positions)))


def test_delete_unknown_column_is_404(client):
    assert client.delete("/api/columns/col-99999").status_code == 404
    assert client.delete("/api/columns/bogus").status_code == 404


def test_move_column(client):
    board = client.get("/api/board").json()
    last = board["columns"][-1]["id"]
    moved = client.post(f"/api/columns/{last}/move", json={"position": 0}).json()
    assert moved["columns"][0]["id"] == last
    assert len(moved["columns"]) == len(board["columns"])


def test_move_column_clamps_position(client):
    first = client.get("/api/board").json()["columns"][0]["id"]
    to_end = client.post(f"/api/columns/{first}/move", json={"position": 999}).json()
    assert to_end["columns"][-1]["id"] == first
    to_start = client.post(f"/api/columns/{first}/move", json={"position": -5}).json()
    assert to_start["columns"][0]["id"] == first


def test_move_column_preserves_cards(client):
    before = client.get("/api/board").json()
    moved = client.post(
        f"/api/columns/{before['columns'][0]['id']}/move", json={"position": 3}
    ).json()
    assert moved["cards"] == before["cards"]


def test_cannot_touch_other_users_columns(client, other_client):
    column = client.get("/api/board").json()["columns"][0]["id"]
    assert other_client.delete(f"/api/columns/{column}").status_code == 404
    assert other_client.post(f"/api/columns/{column}/move", json={"position": 0}).status_code == 404
