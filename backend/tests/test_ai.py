import json
import os
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from openai import OpenAIError
from pydantic import ValidationError

import ai
from ai import AIResponse, Operation
from main import app


def op(type, **fields):
    base = dict(card_id=None, column_id=None, title=None, details=None, position=None)
    return Operation(type=type, **{**base, **fields})


def fake_client(captured, result=None, error=None):
    def parse(**kwargs):
        captured.update(kwargs)
        if error:
            raise error
        message = SimpleNamespace(parsed=result)
        return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    completions = SimpleNamespace(parse=parse)
    return lambda: SimpleNamespace(chat=SimpleNamespace(completions=completions))


@pytest.fixture
def mock_ai(monkeypatch):
    """Make the model return the given operations; returns the captured request."""
    captured = {}

    def use(reply="ok", operations=(), error=None, parsed="default"):
        result = AIResponse(reply=reply, operations=list(operations))
        if parsed != "default":
            result = parsed
        monkeypatch.setattr(ai, "get_client", fake_client(captured, result, error))
        return captured

    return use


def board_of(client):
    return client.get("/api/board").json()


def chat(client, message="hi", history=()):
    return client.post("/api/chat", json={"message": message, "history": list(history)})


# request sent to the model


def test_request_has_board_history_and_question(client, mock_ai):
    captured = mock_ai()
    board = board_of(client)
    history = [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "second"},
    ]
    assert chat(client, "third", history).status_code == 200

    assert captured["model"] == "openai/gpt-oss-120b"
    assert captured["response_format"] is AIResponse
    system, *middle, last = captured["messages"]
    assert system["role"] == "system"
    assert json.dumps(board) in system["content"]
    assert middle == history
    assert last == {"role": "user", "content": "third"}


def test_board_in_prompt_is_current(client, mock_ai):
    column_id = board_of(client)["columns"][0]["id"]
    client.put(f"/api/columns/{column_id}", json={"title": "Renamed Backlog"})
    captured = mock_ai()
    chat(client)
    assert "Renamed Backlog" in captured["messages"][0]["content"]


# applying operations


def test_reply_only_leaves_board_unchanged(client, mock_ai):
    mock_ai(reply="Just an answer")
    before = board_of(client)
    response = chat(client)
    assert response.json() == {"reply": "Just an answer", "board": None}
    assert board_of(client) == before


def test_create_card(client, mock_ai):
    board = board_of(client)
    column_id = board["columns"][3]["id"]
    mock_ai(operations=[op("create_card", column_id=column_id, title="AI card", details="d")])
    data = chat(client).json()
    titles = [data["board"]["cards"][c]["title"] for c in data["board"]["columns"][3]["cardIds"]]
    assert titles[-1] == "AI card"
    assert board_of(client) == data["board"]


def test_edit_card(client, mock_ai):
    card_id = board_of(client)["columns"][0]["cardIds"][0]
    mock_ai(operations=[op("edit_card", card_id=card_id, title="New title", details="New details")])
    data = chat(client).json()
    assert data["board"]["cards"][card_id] == {
        "id": card_id,
        "title": "New title",
        "details": "New details",
    }


def test_move_card(client, mock_ai):
    board = board_of(client)
    card_id = board["columns"][0]["cardIds"][0]
    target = board["columns"][2]["id"]
    mock_ai(operations=[op("move_card", card_id=card_id, column_id=target, position=0)])
    data = chat(client).json()
    assert data["board"]["columns"][2]["cardIds"][0] == card_id
    assert card_id not in data["board"]["columns"][0]["cardIds"]


def test_move_card_without_position_goes_to_end(client, mock_ai):
    board = board_of(client)
    card_id = board["columns"][0]["cardIds"][0]
    target = board["columns"][2]["id"]
    mock_ai(operations=[op("move_card", card_id=card_id, column_id=target)])
    data = chat(client).json()
    assert data["board"]["columns"][2]["cardIds"][-1] == card_id


def test_delete_card(client, mock_ai):
    card_id = board_of(client)["columns"][0]["cardIds"][0]
    mock_ai(operations=[op("delete_card", card_id=card_id)])
    data = chat(client).json()
    assert card_id not in data["board"]["cards"]


def test_rename_column(client, mock_ai):
    column_id = board_of(client)["columns"][4]["id"]
    mock_ai(operations=[op("rename_column", column_id=column_id, title="Shipped")])
    data = chat(client).json()
    assert data["board"]["columns"][4]["title"] == "Shipped"


def test_create_column(client, mock_ai):
    mock_ai(operations=[op("create_column", title="Blocked")])
    data = chat(client).json()
    assert data["board"]["columns"][-1]["title"] == "Blocked"


def test_delete_column_removes_its_cards(client, mock_ai):
    column = board_of(client)["columns"][0]
    mock_ai(operations=[op("delete_column", column_id=column["id"])])
    data = chat(client).json()
    assert column["id"] not in [c["id"] for c in data["board"]["columns"]]
    assert not set(column["cardIds"]) & set(data["board"]["cards"])


def test_move_column(client, mock_ai):
    column = board_of(client)["columns"][4]["id"]
    mock_ai(operations=[op("move_column", column_id=column, position=0)])
    assert chat(client).json()["board"]["columns"][0]["id"] == column


def test_column_operations_missing_fields_are_reported(client, mock_ai):
    mock_ai(operations=[op("create_column"), op("delete_column"), op("move_column", column_id="col-1")])
    data = chat(client).json()
    assert data["board"] is None
    assert data["reply"].count("needs") == 3


def test_column_operations_on_unknown_column_are_reported(client, mock_ai):
    mock_ai(operations=[op("delete_column", column_id="col-9999")])
    data = chat(client).json()
    assert data["board"] is None
    assert "delete_column" in data["reply"]


def test_multiple_operations_in_one_response(client, mock_ai):
    board = board_of(client)
    first, second = board["columns"][0]["cardIds"]
    cols = [c["id"] for c in board["columns"]]
    mock_ai(
        operations=[
            op("create_card", column_id=cols[1], title="One"),
            op("create_card", column_id=cols[1], title="Two"),
            op("move_card", card_id=first, column_id=cols[4], position=0),
            op("delete_card", card_id=second),
            op("rename_column", column_id=cols[0], title="Inbox"),
        ]
    )
    data = chat(client).json()["board"]
    assert data["columns"][0]["title"] == "Inbox"
    assert data["columns"][0]["cardIds"] == []
    assert data["columns"][4]["cardIds"][0] == first
    assert second not in data["cards"]
    assert len(data["columns"][1]["cardIds"]) == 3


# invalid operations


def test_unknown_ids_are_skipped_and_reported(client, mock_ai):
    board = board_of(client)
    card_id = board["columns"][0]["cardIds"][0]
    mock_ai(
        reply="Done.",
        operations=[
            op("delete_card", card_id="card-9999"),
            op("rename_column", column_id=board["columns"][0]["id"], title="Kept"),
        ],
    )
    data = chat(client).json()
    assert data["board"]["columns"][0]["title"] == "Kept"
    assert card_id in data["board"]["cards"]
    assert data["reply"].startswith("Done.")
    assert "could not apply" in data["reply"].lower()
    assert "delete_card" in data["reply"]


def test_missing_fields_are_skipped(client, mock_ai):
    mock_ai(operations=[op("create_card", title="No column")])
    before = board_of(client)
    data = chat(client).json()
    assert data["board"] is None
    assert "create_card needs column_id" in data["reply"]
    assert board_of(client) == before


def test_other_users_ids_are_rejected(client, other_client, mock_ai):
    theirs = board_of(other_client)
    mock_ai(operations=[op("delete_card", card_id=theirs["columns"][0]["cardIds"][0])])
    data = chat(client).json()
    assert data["board"] is None
    assert board_of(other_client) == theirs


# failures


def test_malformed_model_output_returns_502(client, mock_ai):
    try:
        AIResponse.model_validate({"reply": 1})
    except ValidationError as error:
        mock_ai(error=error)
    response = chat(client)
    assert response.status_code == 502
    assert "AI request failed" in response.json()["detail"]


def test_empty_parsed_response_returns_502(client, mock_ai):
    mock_ai(parsed=None)
    assert chat(client).status_code == 502


def test_provider_error_returns_502(client, mock_ai):
    mock_ai(error=OpenAIError("down"))
    assert chat(client).status_code == 502


def test_chat_requires_auth(db_path):
    with TestClient(app) as anon:
        assert anon.post("/api/chat", json={"message": "hi"}).status_code == 401


def test_invalid_history_role_rejected(client):
    body = {"message": "hi", "history": [{"role": "system", "content": "x"}]}
    assert client.post("/api/chat", json=body).status_code == 422


# live (needs OPENROUTER_API_KEY)

live = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)


@live
def test_live_question_changes_nothing(client):
    data = chat(client, "What is 2+2? Answer briefly.").json()
    assert "4" in data["reply"]
    assert data["board"] is None


@live
def test_live_add_card(client):
    board = board_of(client)
    review = board["columns"][3]
    data = chat(client, "Add a card titled 'Live test card' to the Review column.").json()
    assert data["board"] is not None
    titles = [data["board"]["cards"][c]["title"] for c in data["board"]["columns"][3]["cardIds"]]
    assert any("Live test card" in t for t in titles)
    assert len(titles) == len(review["cardIds"]) + 1


def test_invalid_output_is_retried_once(client, monkeypatch):
    calls = []
    good = AIResponse(reply="second try", operations=[])

    def parse(**kwargs):
        calls.append(1)
        if len(calls) == 1:
            AIResponse.model_validate({"reply": 1})
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(parsed=good))])

    completions = SimpleNamespace(parse=parse)
    monkeypatch.setattr(ai, "get_client", lambda: SimpleNamespace(chat=SimpleNamespace(completions=completions)))
    assert chat(client).json()["reply"] == "second try"
    assert len(calls) == 2


# validation and limits


def test_blank_title_operations_are_skipped_and_reported(client, mock_ai):
    mock_ai(
        operations=[
            op("create_card", column_id="col-1", title="   ", details=""),
            op("rename_column", column_id="col-1", title=""),
            op("edit_card", card_id="card-1", title="", details="x"),
        ]
    )
    before = board_of(client)
    data = chat(client).json()
    assert data["board"] is None
    assert data["reply"].count("invalid title") == 3
    assert board_of(client) == before


def test_ai_titles_are_trimmed(client, mock_ai):
    mock_ai(operations=[op("rename_column", column_id="col-1", title="  Tidy  ")])
    assert chat(client).json()["board"]["columns"][0]["title"] == "Tidy"


def test_missing_api_key_returns_502(client, monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    response = chat(client)
    assert response.status_code == 502
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_client_has_a_timeout(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    assert ai.get_client().timeout == ai.TIMEOUT_SECONDS


def test_oversized_chat_requests_rejected(client):
    assert chat(client, "x" * 4001).status_code == 422
    history = [{"role": "user", "content": "hi"}] * (ai.MAX_HISTORY + 1)
    assert chat(client, "hi", history).status_code == 422
    assert chat(client, "hi", [{"role": "user", "content": "x" * 10001}]).status_code == 422
