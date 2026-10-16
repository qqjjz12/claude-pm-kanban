import pytest
from fastapi.testclient import TestClient

import db
from auth import sign
from main import app


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "data" / "pm.db"
    monkeypatch.setenv("PM_DB_PATH", str(path))
    return path


@pytest.fixture
def client(db_path):
    # Entering the client runs startup, which creates the database and the demo user.
    with TestClient(app) as c:
        c.cookies.set("session", sign("user"))
        yield c


@pytest.fixture
def other_client(client):
    """A second, separate account that is already signed in."""
    conn = db.connect()
    db.create_user(conn, "other", "otherpass1")
    conn.commit()
    conn.close()
    other = TestClient(app)
    other.cookies.set("session", sign("other"))
    yield other
    other.close()


@pytest.fixture
def anon(client):
    """A client with no session, against the same database as `client`."""
    return TestClient(app)
