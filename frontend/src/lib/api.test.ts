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
});
