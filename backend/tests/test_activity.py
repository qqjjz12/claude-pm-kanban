import db
from tests.test_ai import mock_ai, op  # noqa: F401 (mock_ai is a fixture)


def activity(client, **params):
    response = client.get("/api/activity", params=params)
    assert response.status_code == 200
    return response.json()


def messages(client, **params):
    return [entry["message"] for entry in activity(client, **params)]


def first_column(client):
    return client.get("/api/board").json()["columns"][0]["id"]


def test_fresh_board_has_no_activity(client):
    assert activity(client) == []


def test_create_edit_delete_card_are_logged_newest_first(client):
    column = first_column(client)
    card = client.post("/api/cards", json={"column_id": column, "title": "Spec"}).json()["id"]
    client.put(f"/api/cards/{card}", json={"title": "Spec"})
    client.put(f"/api/cards/{card}", json={"title": "Spec v2"})
    client.delete(f"/api/cards/{card}")
    assert messages(client) == [
        'deleted card "Spec v2"',
        'edited card "Spec" (now "Spec v2")',
        'edited card "Spec"',
        'created card "Spec" in "Backlog"',
    ]


def test_entries_record_actor_and_timestamp(client):
    client.post("/api/cards", json={"column_id": first_column(client), "title": "x"})
    [entry] = activity(client)
    assert entry["actor"] == "user"
    assert entry["createdAt"]
    assert isinstance(entry["id"], int)


def test_move_between_columns_is_logged_but_reorder_is_not(client):
    board = client.get("/api/board").json()
    first, second = board["columns"][0], board["columns"][2]
    card = first["cardIds"][0]
    client.post(f"/api/cards/{card}/move", json={"column_id": first["id"], "position": 1})
    assert activity(client) == []
    client.post(f"/api/cards/{card}/move", json={"column_id": second["id"], "position": 0})
    assert messages(client) == ['moved card "Align roadmap themes" from "Backlog" to "In Progress"']


def test_column_changes_are_logged(client):
    column = client.post("/api/columns", json={"title": "Blocked"}).json()["id"]
    client.put(f"/api/columns/{column}", json={"title": "Waiting"})
    client.put(f"/api/columns/{column}", json={"title": "Waiting"})  # unchanged: not logged
    client.delete(f"/api/columns/{first_column(client)}")
    assert messages(client) == [
        'deleted column "Backlog" and its 2 cards',
        'renamed column "Blocked" to "Waiting"',
        'added column "Blocked"',
    ]


def test_comments_are_logged(client):
    card = client.get("/api/board").json()["columns"][0]["cardIds"][0]
    client.post(f"/api/cards/{card}/comments", json={"body": "hi"})
    assert messages(client) == ['commented on "Align roadmap themes"']


def test_failed_requests_log_nothing(client):
    client.put("/api/cards/card-9999", json={"title": "x"})
    client.delete("/api/columns/col-9999")
    client.post("/api/cards", json={"column_id": "col-9999", "title": "x"})
    client.post("/api/cards", json={"column_id": first_column(client), "title": ""})
    assert activity(client) == []


def test_limit(client):
    column = first_column(client)
    for i in range(5):
        client.post("/api/cards", json={"column_id": column, "title": f"c{i}"})
    assert len(activity(client)) == 5
    assert messages(client, limit=2) == ['created card "c4" in "Backlog"', 'created card "c3" in "Backlog"']
    assert client.get("/api/activity", params={"limit": 0}).status_code == 422
    assert client.get("/api/activity", params={"limit": 201}).status_code == 422


def test_activity_is_scoped_to_the_board(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    column = client.get("/api/board", params={"board": second}).json()["columns"][0]["id"]
    client.post("/api/cards", params={"board": second}, json={"column_id": column, "title": "Only B"})
    assert messages(client, board=second) == ['created card "Only B" in "To Do"']
    assert activity(client) == []


def test_activity_is_private_to_the_owner(client, other_client):
    client.post("/api/cards", json={"column_id": first_column(client), "title": "Mine"})
    mine = client.get("/api/boards").json()[0]["id"]
    assert other_client.get("/api/activity", params={"board": mine}).status_code == 404
    assert activity(other_client) == []


def test_requires_login(anon):
    assert anon.get("/api/activity").status_code == 401


def test_log_is_capped_per_board(client, monkeypatch):
    monkeypatch.setattr(db, "MAX_ACTIVITY", 3)
    column = first_column(client)
    for i in range(6):
        client.post("/api/cards", json={"column_id": column, "title": f"c{i}"})
    assert messages(client) == [
        'created card "c5" in "Backlog"',
        'created card "c4" in "Backlog"',
        'created card "c3" in "Backlog"',
    ]


def test_deleting_a_board_deletes_its_activity(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B", "template": "sample"}).json()["id"]
    client.post(
        "/api/cards",
        params={"board": second},
        json={"column_id": client.get("/api/board", params={"board": second}).json()["columns"][0]["id"], "title": "x"},
    )
    client.delete(f"/api/boards/{second}")
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM activity WHERE board_id = ?", (second,)).fetchone()[0] == 0
    conn.close()


def test_ai_changes_are_attributed_to_the_assistant(client, mock_ai):  # noqa: F811
    column = first_column(client)
    mock_ai(operations=[
        op("create_card", column_id=column, title="From AI"),
        op("rename_column", column_id=column, title="Inbox"),
    ])
    client.post("/api/chat", json={"message": "do it"})
    entries = activity(client)
    assert [e["actor"] for e in entries] == ["AI assistant", "AI assistant"]
    assert entries[1]["message"] == 'created card "From AI" in "Backlog"'
    assert entries[0]["message"] == 'renamed column "Backlog" to "Inbox"'


def test_user_actions_after_ai_are_attributed_to_the_user(client, mock_ai):  # noqa: F811
    column = first_column(client)
    mock_ai(operations=[op("create_card", column_id=column, title="From AI")])
    client.post("/api/chat", json={"message": "do it"})
    client.post("/api/cards", json={"column_id": column, "title": "Mine"})
    assert [e["actor"] for e in activity(client)] == ["user", "AI assistant"]
