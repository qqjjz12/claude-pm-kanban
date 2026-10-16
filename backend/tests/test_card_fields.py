import pytest

from tests.test_ai import board_of, mock_ai, op  # noqa: F401 (mock_ai is a fixture)


def first_column(client):
    return board_of(client)["columns"][0]["id"]


def create(client, **fields):
    return client.post(
        "/api/cards", json={"column_id": first_column(client), "title": "Card", **fields}
    )


def test_new_card_has_defaults(client):
    card = create(client).json()
    assert card["priority"] == "none"
    assert card["dueDate"] is None
    assert card["labels"] == []


def test_create_card_with_fields(client):
    response = create(client, priority="high", due_date="2030-01-31", labels=["bug", "ui"])
    assert response.status_code == 201
    card = response.json()
    assert (card["priority"], card["dueDate"], card["labels"]) == ("high", "2030-01-31", ["bug", "ui"])
    assert board_of(client)["cards"][card["id"]] == card


@pytest.mark.parametrize(
    "fields",
    [
        {"priority": "urgent"},
        {"due_date": "2030-13-01"},
        {"due_date": "2030-02-30"},
        {"due_date": "tomorrow"},
        {"due_date": "2030-1-1"},
        {"labels": ["x"] * 11},
        {"labels": [""]},
        {"labels": ["   "]},
        {"labels": ["y" * 31]},
        {"labels": "bug"},
    ],
)
def test_create_card_rejects_invalid_fields(client, fields):
    assert create(client, **fields).status_code == 422


def test_labels_are_trimmed_and_deduplicated_ignoring_case(client):
    card = create(client, labels=[" Bug ", "bug", "UI", "ui ", "Docs"]).json()
    assert card["labels"] == ["Bug", "UI", "Docs"]


def test_ten_labels_are_allowed(client):
    assert create(client, labels=[f"l{i}" for i in range(10)]).status_code == 201


def test_update_sets_fields(client):
    card = create(client).json()["id"]
    response = client.put(
        f"/api/cards/{card}",
        json={"title": "T", "priority": "low", "due_date": "2031-05-06", "labels": ["a"]},
    )
    assert response.status_code == 200
    saved = response.json()["cards"][card]
    assert (saved["priority"], saved["dueDate"], saved["labels"]) == ("low", "2031-05-06", ["a"])


def test_update_without_fields_keeps_them(client):
    card = create(client, priority="medium", due_date="2030-01-01", labels=["keep"]).json()["id"]
    saved = client.put(f"/api/cards/{card}", json={"title": "Renamed"}).json()["cards"][card]
    assert saved["title"] == "Renamed"
    assert (saved["priority"], saved["dueDate"], saved["labels"]) == ("medium", "2030-01-01", ["keep"])


def test_update_can_clear_due_date_and_labels_and_priority(client):
    card = create(client, priority="high", due_date="2030-01-01", labels=["x"]).json()["id"]
    saved = client.put(
        f"/api/cards/{card}",
        json={"title": "T", "priority": "none", "due_date": "", "labels": []},
    ).json()["cards"][card]
    assert (saved["priority"], saved["dueDate"], saved["labels"]) == ("none", None, [])


def test_update_rejects_invalid_fields(client):
    card = create(client).json()["id"]
    for fields in ({"priority": "x"}, {"due_date": "nope"}, {"labels": [""]}):
        response = client.put(f"/api/cards/{card}", json={"title": "T", **fields})
        assert response.status_code == 422, fields


def test_move_keeps_fields(client):
    board = board_of(client)
    card = create(client, priority="high", labels=["m"]).json()["id"]
    target = board["columns"][2]["id"]
    moved = client.post(f"/api/cards/{card}/move", json={"column_id": target, "position": 0})
    assert moved.json()["cards"][card]["priority"] == "high"
    assert moved.json()["cards"][card]["labels"] == ["m"]


def test_ai_creates_card_with_fields(client, mock_ai):  # noqa: F811
    column = first_column(client)
    mock_ai(operations=[op(
        "create_card", column_id=column, title="AI", details="d",
        priority="high", due_date="2032-02-02", labels=["ai"],
    )])
    data = client.post("/api/chat", json={"message": "x"}).json()
    card = data["board"]["cards"][data["board"]["columns"][0]["cardIds"][-1]]
    assert (card["priority"], card["dueDate"], card["labels"]) == ("high", "2032-02-02", ["ai"])


def test_ai_edit_changes_only_given_fields(client, mock_ai):  # noqa: F811
    card = create(client, priority="low", due_date="2030-01-01", labels=["keep"]).json()["id"]
    mock_ai(operations=[op("edit_card", card_id=card, title="T", details="D", priority="high")])
    saved = client.post("/api/chat", json={"message": "x"}).json()["board"]["cards"][card]
    assert (saved["priority"], saved["dueDate"], saved["labels"]) == ("high", "2030-01-01", ["keep"])


def test_ai_can_clear_due_date(client, mock_ai):  # noqa: F811
    card = create(client, due_date="2030-01-01").json()["id"]
    mock_ai(operations=[op("edit_card", card_id=card, title="T", details="", due_date="")])
    saved = client.post("/api/chat", json={"message": "x"}).json()["board"]["cards"][card]
    assert saved["dueDate"] is None


def test_ai_invalid_field_values_are_skipped_and_reported(client, mock_ai):  # noqa: F811
    column = first_column(client)
    before = board_of(client)
    mock_ai(operations=[
        op("create_card", column_id=column, title="A", priority="urgent"),
        op("create_card", column_id=column, title="B", due_date="31/01/2030"),
        op("create_card", column_id=column, title="C", labels=["ok", ""]),
    ])
    data = client.post("/api/chat", json={"message": "x"}).json()
    assert data["board"] is None
    assert data["reply"].count("invalid") == 3
    assert board_of(client) == before
