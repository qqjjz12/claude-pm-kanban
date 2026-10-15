import { createId, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });
});

describe("moveCard edge cases", () => {
  const columns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: [] },
  ];

  it("returns columns unchanged for unknown ids", () => {
    expect(moveCard(columns, "nope", "card-1")).toBe(columns);
    expect(moveCard(columns, "card-1", "nope")).toBe(columns);
  });

  it("returns columns unchanged when dropped on itself", () => {
    expect(moveCard(columns, "card-1", "card-1")).toBe(columns);
  });

  it("moves to an empty column", () => {
    const result = moveCard(columns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-1"]);
  });

  it("moves to the end of the same column when dropped on it", () => {
    const result = moveCard(columns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });
});

describe("createId", () => {
  it("uses the prefix and is unique", () => {
    const a = createId("card");
    const b = createId("card");
    expect(a.startsWith("card-")).toBe(true);
    expect(a).not.toBe(b);
  });
});
