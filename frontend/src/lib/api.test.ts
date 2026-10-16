import * as api from "@/lib/api";

const stubFetch = (ok = true, body: unknown = {}) => {
  const fetchMock = vi.fn(() =>
    Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const lastCall = (fetchMock: ReturnType<typeof stubFetch>) => {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, method: init.method, body: init.body && JSON.parse(init.body as string) };
};

describe("api", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("getBoard fetches the board", async () => {
    const fetchMock = stubFetch(true, { columns: [], cards: {} });
    expect(await api.getBoard()).toEqual({ columns: [], cards: {} });
    expect(lastCall(fetchMock)).toMatchObject({ url: "/api/board", method: "GET" });
  });

  it("renameColumn", async () => {
    const fetchMock = stubFetch();
    await api.renameColumn("col-1", "Ideas");
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/columns/col-1",
      method: "PUT",
      body: { title: "Ideas" },
    });
  });

  it("createCard sends snake_case column_id and returns the card", async () => {
    const card = { id: "card-9", title: "T", details: "D" };
    const fetchMock = stubFetch(true, card);
    expect(await api.createCard("col-2", "T", "D")).toEqual(card);
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/cards",
      method: "POST",
      body: { column_id: "col-2", title: "T", details: "D" },
    });
  });

  it("updateCard", async () => {
    const fetchMock = stubFetch();
    await api.updateCard("card-1", "T", "D");
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/cards/card-1",
      method: "PUT",
      body: { title: "T", details: "D" },
    });
  });

  it("deleteCard", async () => {
    const fetchMock = stubFetch();
    await api.deleteCard("card-1");
    expect(lastCall(fetchMock)).toMatchObject({
      url: "/api/cards/card-1",
      method: "DELETE",
    });
  });

  it("moveCard", async () => {
    const fetchMock = stubFetch();
    await api.moveCard("card-1", "col-3", 2);
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/cards/card-1/move",
      method: "POST",
      body: { column_id: "col-3", position: 2 },
    });
  });

  it("throws on a failed response", async () => {
    stubFetch(false);
    await expect(api.getBoard()).rejects.toThrow(/500/);
  });

  it("scopes board-level calls to the active board", async () => {
    const fetchMock = stubFetch();
    api.setActiveBoard(7);
    await api.getBoard();
    expect(lastCall(fetchMock).url).toBe("/api/board?board=7");
    api.setActiveBoard(null);
  });

  it("scopes cards, columns and chat but not the boards list", async () => {
    api.setActiveBoard(3);
    const urls: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      urls.push(url);
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
    });
    vi.stubGlobal("fetch", fetchMock);
    await api.createCard("col-1", "T", "D");
    await api.updateCard("card-1", "T", "D");
    await api.deleteCard("card-1");
    await api.moveCard("card-1", "col-2", 0);
    await api.renameColumn("col-1", "X");
    await api.createColumn("Y");
    await api.deleteColumn("col-1");
    await api.moveColumn("col-1", 2);
    await api.chat("hi", []);
    await api.listBoards();
    api.setActiveBoard(null);
    expect(urls).toEqual([
      "/api/cards?board=3",
      "/api/cards/card-1?board=3",
      "/api/cards/card-1?board=3",
      "/api/cards/card-1/move?board=3",
      "/api/columns/col-1?board=3",
      "/api/columns?board=3",
      "/api/columns/col-1?board=3",
      "/api/columns/col-1/move?board=3",
      "/api/chat?board=3",
      "/api/boards",
    ]);
  });

  it("board CRUD", async () => {
    const fetchMock = stubFetch(true, { id: 2, name: "B" });
    await api.createBoard("B", "sample");
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/boards",
      method: "POST",
      body: { name: "B", template: "sample" },
    });
    fetchMock.mockClear();
    await api.renameBoard(2, "C");
    expect(lastCall(fetchMock)).toEqual({ url: "/api/boards/2", method: "PUT", body: { name: "C" } });
    fetchMock.mockClear();
    await api.deleteBoard(2);
    expect(lastCall(fetchMock)).toMatchObject({ url: "/api/boards/2", method: "DELETE" });
  });

  it("account calls use snake_case bodies", async () => {
    const fetchMock = stubFetch();
    await api.changePassword("old", "new");
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/me/password",
      method: "POST",
      body: { current_password: "old", new_password: "new" },
    });
    fetchMock.mockClear();
    await api.deleteAccount("pw");
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/me/delete",
      method: "POST",
      body: { password: "pw" },
    });
  });

  it("errors carry the status and the server's detail", async () => {
    stubFetch(false, { detail: "Username is already taken" });
    await expect(api.createBoard("x", "standard")).rejects.toMatchObject({
      status: 500,
      detail: "Username is already taken",
    });
  });

  it("errors tolerate a body that is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: false, status: 502, json: () => Promise.reject(new Error("html")) })
      )
    );
    await expect(api.getBoard()).rejects.toMatchObject({ status: 502, detail: "" });
  });
});
