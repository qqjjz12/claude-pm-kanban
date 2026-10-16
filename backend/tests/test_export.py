def board_id(client):
    return client.get("/api/boards").json()[0]["id"]


def test_export_contains_the_whole_sample_board(client):
    data = client.get(f"/api/boards/{board_id(client)}/export").json()
    assert data["name"] == "My Board"
    assert [c["title"] for c in data["columns"]] == [
        "Backlog", "Discovery", "In Progress", "Review", "Done",
    ]
    assert sum(len(c["cards"]) for c in data["columns"]) == 8
    first = data["columns"][0]["cards"][0]
    assert first["title"] == "Align roadmap themes"
    assert set(first) == {"title", "details", "priority", "dueDate", "labels", "checklist", "comments"}


def test_export_includes_fields_checklists_and_comments_in_order(client):
    bid = board_id(client)
    board = client.get("/api/board").json()
    card = board["columns"][0]["cardIds"][0]
    client.put(
        f"/api/cards/{card}",
        json={"title": "Align roadmap themes", "priority": "high", "due_date": "2030-01-02", "labels": ["a", "b"]},
    )
    client.post(f"/api/cards/{card}/checklist", json={"text": "one"})
    detail = client.post(f"/api/cards/{card}/checklist", json={"text": "two"}).json()
    client.put(f"/api/checklist/{detail['checklist'][0]['id']}", json={"done": True})
    client.post(f"/api/cards/{card}/comments", json={"body": "first"})
    client.post(f"/api/cards/{card}/comments", json={"body": "second"})

    exported = client.get(f"/api/boards/{bid}/export").json()["columns"][0]["cards"][0]
    assert (exported["priority"], exported["dueDate"], exported["labels"]) == ("high", "2030-01-02", ["a", "b"])
    assert exported["checklist"] == [{"text": "one", "done": True}, {"text": "two", "done": False}]
    assert [c["body"] for c in exported["comments"]] == ["first", "second"]
    assert exported["comments"][0]["author"] == "user"
    assert "id" not in exported


def test_export_follows_column_and_card_order(client):
    bid = board_id(client)
    board = client.get("/api/board").json()
    client.post(f"/api/columns/{board['columns'][4]['id']}/move", json={"position": 0})
    data = client.get(f"/api/boards/{bid}/export").json()
    assert data["columns"][0]["title"] == "Done"


def test_export_of_an_empty_board(client):
    new = client.post("/api/boards", json={"name": "Blank", "template": "empty"}).json()["id"]
    assert client.get(f"/api/boards/{new}/export").json() == {"name": "Blank", "columns": []}


def test_export_unknown_board_is_404(client):
    assert client.get("/api/boards/99999/export").status_code == 404


def test_cannot_export_another_users_board(client, other_client):
    mine = board_id(client)
    assert other_client.get(f"/api/boards/{mine}/export").status_code == 404


def test_export_requires_login(anon):
    assert anon.get("/api/boards/1/export").status_code == 401
