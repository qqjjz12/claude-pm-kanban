"""Overlapping requests must not lose updates (the UI saves changes in the background)."""
from concurrent.futures import ThreadPoolExecutor

import db


def positions(sql, *args):
    conn = db.connect()
    try:
        return [r[0] for r in conn.execute(sql, args)]
    finally:
        conn.close()


def test_concurrent_card_creates_keep_positions_contiguous(client):
    column = client.get("/api/board").json()["columns"][1]["id"]  # Discovery: 1 card
    pk = int(column.split("-")[1])

    def create(i):
        return client.post("/api/cards", json={"column_id": column, "title": f"c{i}"}).status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        statuses = list(pool.map(create, range(36)))

    assert statuses == [201] * 36
    found = positions("SELECT position FROM cards WHERE column_id = ? ORDER BY position", pk)
    assert found == list(range(37))


def test_concurrent_column_moves_end_with_a_valid_order(client):
    columns = [c["id"] for c in client.get("/api/board").json()["columns"]]

    def move(i):
        return client.post(
            f"/api/columns/{columns[i % len(columns)]}/move", json={"position": i % 3}
        ).status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        assert set(pool.map(move, range(30))) == {200}

    found = positions("SELECT position FROM columns ORDER BY position")
    assert found == list(range(len(columns)))


def test_concurrent_card_moves_and_deletes_keep_every_column_contiguous(client):
    board = client.get("/api/board").json()
    cards = [c for column in board["columns"] for c in column["cardIds"]]
    targets = [c["id"] for c in board["columns"]]

    def act(i):
        card = cards[i % len(cards)]
        if i % 5 == 4:
            return client.delete(f"/api/cards/{card}").status_code
        return client.post(
            f"/api/cards/{card}/move", json={"column_id": targets[i % len(targets)], "position": 0}
        ).status_code

    with ThreadPoolExecutor(max_workers=12) as pool:
        statuses = set(pool.map(act, range(40)))

    assert statuses <= {200, 404}
    conn = db.connect()
    try:
        for (column_pk,) in conn.execute("SELECT id FROM columns").fetchall():
            found = [
                r[0]
                for r in conn.execute(
                    "SELECT position FROM cards WHERE column_id = ? ORDER BY position", (column_pk,)
                )
            ]
            assert found == list(range(len(found))), (column_pk, found)
    finally:
        conn.close()
