import os
from types import SimpleNamespace

import pytest

import ai


def fake_openai(captured, reply="4"):
    class FakeOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.chat = SimpleNamespace(
                completions=SimpleNamespace(create=self.create)
            )

        def create(self, **kwargs):
            captured["request"] = kwargs
            message = SimpleNamespace(content=reply)
            return SimpleNamespace(choices=[SimpleNamespace(message=message)])

    return FakeOpenAI


def test_client_uses_openrouter_and_key(monkeypatch):
    captured = {}
    monkeypatch.setattr(ai, "OpenAI", fake_openai(captured))
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    ai.get_client()
    assert captured["client"] == {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": "test-key",
    }


def test_ask_sends_model_and_prompt(monkeypatch):
    captured = {}
    monkeypatch.setattr(ai, "OpenAI", fake_openai(captured, reply="four"))
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    assert ai.ask("hello") == "four"
    assert captured["request"] == {
        "model": "openai/gpt-oss-120b",
        "messages": [{"role": "user", "content": "hello"}],
    }


def test_test_route_returns_reply(client, monkeypatch):
    monkeypatch.setattr(ai, "ask", lambda prompt: "4")
    response = client.post("/api/ai/test")
    assert response.status_code == 200
    assert response.json() == {"reply": "4"}


def test_test_route_requires_auth(db_path):
    from fastapi.testclient import TestClient

    from main import app

    with TestClient(app) as anon:
        assert anon.post("/api/ai/test").status_code == 401


@pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)
def test_live_two_plus_two():
    assert "4" in ai.ask("What is 2+2? Answer with just the number.")
