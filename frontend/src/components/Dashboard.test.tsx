import { render, screen, within } from "@testing-library/react";
import { Dashboard } from "@/components/Dashboard";
import { today, type BoardData } from "@/lib/kanban";
import { initialData } from "@/test/fixtures";

const boardWith = (changes: Record<string, Partial<BoardData["cards"][string]>>): BoardData => {
  const board = structuredClone(initialData);
  for (const [id, change] of Object.entries(changes)) {
    board.cards[id] = { ...board.cards[id], ...change };
  }
  return board;
};

describe("Dashboard", () => {
  it("shows totals, columns and priorities for a plain board", () => {
    render(<Dashboard board={structuredClone(initialData)} />);
    expect(within(screen.getByTestId("tile-Cards")).getByText("8")).toBeVisible();
    expect(within(screen.getByTestId("tile-Overdue")).getByText("0")).toBeVisible();
    const columns = screen.getByRole("list", { name: "Cards per column" });
    expect(within(columns).getByText("Backlog")).toBeVisible();
    expect(within(columns).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByText("Nothing is overdue or due this week.")).toBeVisible();
    expect(screen.getByText("No labels yet.")).toBeVisible();
    expect(screen.getByTestId("checklist-progress")).toHaveTextContent("No checklist items yet.");
  });

  it("lists overdue cards, labels and checklist progress", () => {
    render(
      <Dashboard
        board={boardWith({
          "card-1": { dueDate: "2000-01-01", labels: ["api", "ui"], priority: "high" },
          "card-2": {
            labels: ["api"],
            checklist: { done: 1, total: 4 },
            commentCount: 2,
          },
        })}
      />
    );
    expect(within(screen.getByTestId("tile-Overdue")).getByText("1")).toBeVisible();
    expect(within(screen.getByTestId("tile-Comments")).getByText("2")).toBeVisible();
    const attention = screen.getByRole("list", { name: "Needs attention" });
    expect(within(attention).getByText("Align roadmap themes")).toBeVisible();
    expect(within(attention).getByText(/^Overdue /)).toBeVisible();
    expect(screen.getByText("api (2)")).toBeVisible();
    expect(screen.getByText("ui (1)")).toBeVisible();
    expect(screen.getByTestId("checklist-progress")).toHaveTextContent(
      "1 of 4 checklist items done (25%)"
    );
    const priorities = screen.getByRole("list", { name: "Cards per priority" });
    expect(within(priorities).getByText("High").closest("li")).toHaveTextContent("1");
  });

  it("copes with a board that has no columns", () => {
    render(<Dashboard board={{ columns: [], cards: {} }} />);
    expect(screen.getByText("This board has no columns.")).toBeVisible();
    expect(within(screen.getByTestId("tile-Cards")).getByText("0")).toBeVisible();
  });

  it("lists cards due within the week as upcoming", () => {
    const soon = today(new Date(Date.now() + 2 * 24 * 60 * 60 * 1000));
    render(<Dashboard board={boardWith({ "card-3": { dueDate: soon } })} />);
    expect(within(screen.getByTestId("tile-Due this week")).getByText("1")).toBeVisible();
    const attention = screen.getByRole("list", { name: "Needs attention" });
    expect(within(attention).getByText("Prototype analytics view")).toBeVisible();
    expect(within(attention).getByText(/^Due /)).toBeVisible();
    expect(within(screen.getByTestId("tile-Overdue")).getByText("0")).toBeVisible();
  });
});
