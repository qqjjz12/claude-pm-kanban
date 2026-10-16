import ai
import db
from tests.test_ai import fake_client


def titles(board):
    return [c["title"] for c in board["columns"]]


def test_new_account_lists_one_sample_board(client):
    boards = client.get("/api/boards").json()
    assert len(boards) == 1
    assert boards[0]["name"] == "My Board"


def test_create_board_defaults_to_standard_template(client):
    created = client.post("/api/boards", json={"name": "Roadmap"})
    assert created.status_code == 201
    board = client.get("/api/board", params={"board": created.json()["id"]}).json()
    assert titles(board) == ["To Do", "In Progress", "Done"]
    assert board["cards"] == {}


def test_create_board_templates(client):
    sample = client.post("/api/boards", json={"name": "S", "template": "sample"}).json()["id"]
    empty = client.post("/api/boards", json={"name": "E", "template": "empty"}).json()["id"]
    assert len(client.get("/api/board", params={"board": sample}).json()["cards"]) == 8
    assert client.get("/api/board", params={"board": empty}).json()["columns"] == []


def test_create_board_rejects_bad_input(client):
    assert client.post("/api/boards", json={"name": "x", "template": "nope"}).status_code == 422
    assert client.post("/api/boards", json={"name": "   "}).status_code == 422
    assert client.post("/api/boards", json={"name": "x" * 201}).status_code == 422


def test_list_boards_in_creation_order(client):
    client.post("/api/boards", json={"name": "B"})
    client.post("/api/boards", json={"name": "C"})
    assert [b["name"] for b in client.get("/api/boards").json()] == ["My Board", "B", "C"]


def test_board_without_param_is_first_board(client):
    first = client.get("/api/boards").json()[0]["id"]
    client.post("/api/boards", json={"name": "B"})
    default = client.get("/api/board").json()
    assert default == client.get("/api/board", params={"board": first}).json()


def test_changes_apply_to_the_selected_board_only(client):
    first = client.get("/api/boards").json()[0]["id"]
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    column = client.get("/api/board", params={"board": second}).json()["columns"][0]["id"]
    created = client.post(
        "/api/cards", params={"board": second}, json={"column_id": column, "title": "Only here"}
    )
    assert created.status_code == 201
    assert "Only here" not in str(client.get("/api/board", params={"board": first}).json())
    assert "Only here" in str(client.get("/api/board", params={"board": second}).json())


def test_card_from_another_board_is_not_found_via_this_board(client):
    first = client.get("/api/boards").json()[0]["id"]
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    card = next(iter(client.get("/api/board", params={"board": first}).json()["cards"]))
    response = client.put(f"/api/cards/{card}", params={"board": second}, json={"title": "x"})
    assert response.status_code == 404


def test_rename_board(client):
    board_id = client.get("/api/boards").json()[0]["id"]
    response = client.put(f"/api/boards/{board_id}", json={"name": "Renamed"})
    assert response.json() == {"id": board_id, "name": "Renamed"}
    assert client.get("/api/boards").json()[0]["name"] == "Renamed"


def test_delete_board(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    response = client.delete(f"/api/boards/{second}")
    assert response.status_code == 200
    assert [b["name"] for b in response.json()] == ["My Board"]
    assert client.get("/api/board", params={"board": second}).status_code == 404


def test_delete_board_removes_its_columns_and_cards(client):
    client.get("/api/boards")
    second = client.post("/api/boards", json={"name": "B", "template": "sample"}).json()["id"]
    client.delete(f"/api/boards/{second}")
    conn = db.connect()
    count = conn.execute("SELECT COUNT(*) FROM columns WHERE board_id = ?", (second,)).fetchone()[0]
    conn.close()
    assert count == 0


def test_cannot_delete_only_board(client):
    board_id = client.get("/api/boards").json()[0]["id"]
    assert client.delete(f"/api/boards/{board_id}").status_code == 409
    assert len(client.get("/api/boards").json()) == 1


def test_unknown_board_is_404(client):
    assert client.get("/api/board", params={"board": 99999}).status_code == 404
    assert client.put("/api/boards/99999", json={"name": "x"}).status_code == 404
    assert client.delete("/api/boards/99999").status_code == 404


def test_other_users_boards_are_invisible_and_untouchable(client, other_client):
    mine = client.get("/api/boards").json()[0]["id"]
    theirs = [b["id"] for b in other_client.get("/api/boards").json()]
    assert mine not in theirs
    assert other_client.get("/api/board", params={"board": mine}).status_code == 404
    assert other_client.put(f"/api/boards/{mine}", json={"name": "hax"}).status_code == 404
    assert other_client.delete(f"/api/boards/{mine}").status_code == 404
    # Even with a second board of their own, they still cannot delete someone else's.
    other_client.post("/api/boards", json={"name": "extra"})
    assert other_client.delete(f"/api/boards/{mine}").status_code == 404
    assert client.get("/api/boards").json()[0]["name"] == "My Board"


def test_chat_targets_selected_board(client, monkeypatch):
    second = client.post("/api/boards", json={"name": "B"}).json()["id"]
    captured = {}
    result = ai.AIResponse(reply="hi", operations=[])
    monkeypatch.setattr(ai, "get_client", fake_client(captured, result))
    client.post("/api/chat", params={"board": second}, json={"message": "hello"})
    system = captured["messages"][0]["content"]
    assert "To Do" in system and "Backlog" not in system
