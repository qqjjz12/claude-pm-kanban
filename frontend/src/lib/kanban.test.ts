import { formatDueDate, isOverdue, moveCard, parseLabels, today, type Column } from "@/lib/kanban";

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

describe("card field helpers", () => {
  it("parseLabels trims, drops blanks, dedupes ignoring case and caps the list", () => {
    expect(parseLabels(" bug , UI,, bug,ui ")).toEqual(["bug", "UI"]);
    expect(parseLabels("")).toEqual([]);
    expect(parseLabels(Array.from({ length: 15 }, (_, i) => `l${i}`).join(","))).toHaveLength(10);
    expect(parseLabels("x".repeat(40))[0]).toHaveLength(30);
  });

  it("today formats a local date as YYYY-MM-DD", () => {
    expect(today(new Date(2030, 0, 5))).toBe("2030-01-05");
    expect(today(new Date(2030, 11, 25))).toBe("2030-12-25");
  });

  it("isOverdue is true only for dates before today", () => {
    const now = new Date(2030, 5, 15);
    expect(isOverdue("2030-06-14", now)).toBe(true);
    expect(isOverdue("2030-06-15", now)).toBe(false);
    expect(isOverdue("2030-06-16", now)).toBe(false);
    expect(isOverdue(null, now)).toBe(false);
  });

  it("formatDueDate does not shift the day across time zones", () => {
    expect(formatDueDate("2030-01-05")).toContain("5");
    expect(formatDueDate("2030-01-05")).toContain("2030");
  });
});
