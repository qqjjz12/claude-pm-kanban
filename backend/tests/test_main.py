from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_hello():
    response = client.get("/api/hello")
    assert response.status_code == 200
    assert response.json() == {"message": "Hello from the API"}


def test_index():
    response = client.get("/")
    assert response.status_code == 200
    assert "Hello world" in response.text
