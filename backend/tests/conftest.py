import pytest
from fastapi.testclient import TestClient

from auth import sign
from main import app


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "data" / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(path))
    return path


@pytest.fixture
def client(db_path):
    with TestClient(app) as c:
        c.cookies.set("session", sign("user"))
        yield c


@pytest.fixture
def other_client(db_path):
    with TestClient(app) as c:
        c.cookies.set("session", sign("other"))
        yield c
