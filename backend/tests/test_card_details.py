import db


def card_of(client, index=0):
    board = client.get("/api/board").json()
    return board["columns"][0]["cardIds"][index]


def summary(client, card):
    data = client.get("/api/board").json()["cards"][card]
    return data["commentCount"], data["checklist"]


def test_new_card_has_empty_detail(client):
    card = card_of(client)
    assert client.get(f"/api/cards/{card}/detail").json() == {"comments": [], "checklist": []}
    assert summary(client, card) == (0, {"done": 0, "total": 0})


def test_add_comment_records_author_and_returns_detail(client):
    card = card_of(client)
    response = client.post(f"/api/cards/{card}/comments", json={"body": "  First!  "})
    assert response.status_code == 201
    [comment] = response.json()["comments"]
    assert comment["body"] == "First!"
    assert comment["author"] == "user"
    assert comment["createdAt"]
    assert summary(client, card)[0] == 1


def test_comments_are_ordered_oldest_first(client):
    card = card_of(client)
    for text in ("one", "two", "three"):
        client.post(f"/api/cards/{card}/comments", json={"body": text})
    bodies = [c["body"] for c in client.get(f"/api/cards/{card}/detail").json()["comments"]]
    assert bodies == ["one", "two", "three"]


def test_comment_validation(client):
    card = card_of(client)
    for body in ("", "   ", "x" * 2001):
        assert client.post(f"/api/cards/{card}/comments", json={"body": body}).status_code == 422
    assert client.post(f"/api/cards/{card}/comments", json={"body": "x" * 2000}).status_code == 201


def test_delete_comment(client):
    card = card_of(client)
    comment = client.post(f"/api/cards/{card}/comments", json={"body": "bye"}).json()["comments"][0]
    response = client.delete(f"/api/comments/{comment['id']}")
    assert response.status_code == 200
    assert response.json()["comments"] == []
    assert summary(client, card)[0] == 0


def test_checklist_lifecycle(client):
    card = card_of(client)
    client.post(f"/api/cards/{card}/checklist", json={"text": "write"})
    detail = client.post(f"/api/cards/{card}/checklist", json={"text": "test"}).json()
    first, second = detail["checklist"]
    assert (first["text"], first["done"]) == ("write", False)
    assert summary(client, card)[1] == {"done": 0, "total": 2}

    detail = client.put(f"/api/checklist/{first['id']}", json={"done": True}).json()
    assert detail["checklist"][0]["done"] is True
    assert summary(client, card)[1] == {"done": 1, "total": 2}

    detail = client.put(f"/api/checklist/{second['id']}", json={"text": "test more"}).json()
    assert detail["checklist"][1]["text"] == "test more"
    assert detail["checklist"][1]["done"] is False

    detail = client.put(f"/api/checklist/{first['id']}", json={"done": False}).json()
    assert detail["checklist"][0]["done"] is False

    detail = client.delete(f"/api/checklist/{first['id']}").json()
    assert [i["text"] for i in detail["checklist"]] == ["test more"]
    assert summary(client, card)[1] == {"done": 0, "total": 1}


def test_checklist_positions_stay_contiguous_after_delete(client):
    card = card_of(client)
    for text in "abc":
        detail = client.post(f"/api/cards/{card}/checklist", json={"text": text}).json()
    client.delete(f"/api/checklist/{detail['checklist'][0]['id']}")
    client.post(f"/api/cards/{card}/checklist", json={"text": "d"})
    texts = [i["text"] for i in client.get(f"/api/cards/{card}/detail").json()["checklist"]]
    assert texts == ["b", "c", "d"]


def test_checklist_validation(client):
    card = card_of(client)
    assert client.post(f"/api/cards/{card}/checklist", json={"text": "  "}).status_code == 422
    item = client.post(f"/api/cards/{card}/checklist", json={"text": "ok"}).json()["checklist"][0]
    assert client.put(f"/api/checklist/{item['id']}", json={"text": ""}).status_code == 422


def test_deleting_a_card_removes_its_comments_and_items(client):
    card = card_of(client)
    client.post(f"/api/cards/{card}/comments", json={"body": "x"})
    client.post(f"/api/cards/{card}/checklist", json={"text": "y"})
    client.delete(f"/api/cards/{card}")
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM checklist_items").fetchone()[0] == 0
    conn.close()


def test_deleting_a_board_removes_everything_under_it(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B", "template": "sample"}).json()["id"]
    scope = {"board": second}
    board = client.get("/api/board", params=scope).json()
    card = board["columns"][0]["cardIds"][0]
    client.post(f"/api/cards/{card}/comments", params=scope, json={"body": "x"})
    client.delete(f"/api/boards/{second}")
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
    conn.close()


def test_unknown_ids_are_404(client):
    assert client.get("/api/cards/card-9999/detail").status_code == 404
    assert client.post("/api/cards/card-9999/comments", json={"body": "x"}).status_code == 404
    assert client.post("/api/cards/bogus/checklist", json={"text": "x"}).status_code == 404
    assert client.delete("/api/comments/9999").status_code == 404
    assert client.put("/api/checklist/9999", json={"done": True}).status_code == 404
    assert client.delete("/api/checklist/9999").status_code == 404


def test_other_users_cannot_see_or_change_details(client, other_client):
    card = card_of(client)
    comment = client.post(f"/api/cards/{card}/comments", json={"body": "private"}).json()["comments"][0]
    item = client.post(f"/api/cards/{card}/checklist", json={"text": "secret"}).json()["checklist"][0]
    assert other_client.get(f"/api/cards/{card}/detail").status_code == 404
    assert other_client.post(f"/api/cards/{card}/comments", json={"body": "x"}).status_code == 404
    assert other_client.delete(f"/api/comments/{comment['id']}").status_code == 404
    assert other_client.put(f"/api/checklist/{item['id']}", json={"done": True}).status_code == 404
    assert other_client.delete(f"/api/checklist/{item['id']}").status_code == 404
    detail = client.get(f"/api/cards/{card}/detail").json()
    assert len(detail["comments"]) == 1 and detail["checklist"][0]["done"] is False


def test_item_from_another_board_is_404_through_this_board(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    card = card_of(client)
    comment = client.post(f"/api/cards/{card}/comments", json={"body": "x"}).json()["comments"][0]
    assert client.delete(f"/api/comments/{comment['id']}", params={"board": second}).status_code == 404


def test_requires_login(anon):
    assert anon.get("/api/cards/card-1/detail").status_code == 401
    assert anon.post("/api/cards/card-1/comments", json={"body": "x"}).status_code == 401
    assert anon.delete("/api/comments/1").status_code == 401
    assert anon.put("/api/checklist/1", json={"done": True}).status_code == 401
