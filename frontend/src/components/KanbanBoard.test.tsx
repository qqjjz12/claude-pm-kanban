import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import { initialData } from "@/test/fixtures";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);

const renderBoard = async () => {
  render(<KanbanBoard boardId={1} header={<h1>Header</h1>} />);
  await screen.findAllByTestId(/column-/i);
};

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getBoard.mockImplementation(async () => structuredClone(initialData));
    mocked.renameColumn.mockResolvedValue({});
    mocked.updateCard.mockResolvedValue({});
    mocked.deleteCard.mockResolvedValue({});
    mocked.moveCard.mockResolvedValue({});
    mocked.createCard.mockResolvedValue({
      id: "card-99",
      title: "New card",
      details: "Notes",
      priority: "none",
      dueDate: null,
      labels: [],
      commentCount: 0,
      checklist: { done: 0, total: 0 },
    });
  });

  it("shows a loading state, then five columns from the API", async () => {
    render(<KanbanBoard boardId={1} header={null} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(mocked.getBoard).toHaveBeenCalledOnce();
  });

  it("shows an error with retry when the board cannot load", async () => {
    mocked.getBoard.mockRejectedValueOnce(new Error("down"));
    render(<KanbanBoard boardId={1} header={null} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renders the header slot and selects the board for API calls", async () => {
    await renderBoard();
    expect(screen.getByRole("heading", { name: "Header" })).toBeVisible();
    expect(mocked.setActiveBoard).toHaveBeenCalledWith(1);
  });

  it("adds a column", async () => {
    mocked.createColumn.mockResolvedValue({ id: "col-77", title: "Blocked", cardIds: [] });
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: /add a column/i }));
    await userEvent.type(screen.getByLabelText("New column title"), "Blocked");
    await userEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(await screen.findByTestId("column-col-77")).toBeVisible();
    expect(mocked.createColumn).toHaveBeenCalledWith("Blocked");
  });

  it("deletes an empty column immediately", async () => {
    mocked.deleteColumn.mockResolvedValue({});
    mocked.getBoard.mockResolvedValue({
      columns: [{ id: "col-1", title: "Empty", cardIds: [] }],
      cards: {},
    });
    await renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "Delete column" }));
    await waitFor(() => expect(screen.queryByTestId("column-col-1")).not.toBeInTheDocument());
    expect(mocked.deleteColumn).toHaveBeenCalledWith("col-1");
  });

  it("asks twice before deleting a column that has cards", async () => {
    mocked.deleteColumn.mockResolvedValue({});
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: "Delete column" }));
    expect(mocked.deleteColumn).not.toHaveBeenCalled();
    await userEvent.click(within(column).getByRole("button", { name: "Confirm delete column" }));
    expect(mocked.deleteColumn).toHaveBeenCalledWith("col-backlog");
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("renames a column and saves on blur", async () => {
    await renderBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
    expect(mocked.renameColumn).not.toHaveBeenCalled();

    await userEvent.tab();
    expect(mocked.renameColumn).toHaveBeenCalledExactlyOnceWith(
      "col-backlog",
      "New Name"
    );
  });

  it("adds a card through the API", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(await within(column).findByText("New card")).toBeInTheDocument();
    expect(mocked.createCard).toHaveBeenCalledExactlyOnceWith(
      "col-backlog",
      "New card",
      "Notes",
      { priority: "none", dueDate: null, labels: [] }
    );
    expect(within(column).getByTestId("card-card-99")).toBeInTheDocument();
  });

  it("does not add a card with an empty title", async () => {
    await renderBoard();
    const column = getFirstColumn();
    const before = within(column).queryAllByTestId(/card-/).length;
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));
    expect(within(column).queryAllByTestId(/card-/)).toHaveLength(before);
    expect(mocked.createCard).not.toHaveBeenCalled();
  });

  it("deletes a card through the API", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /delete align roadmap themes/i })
    );
    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(mocked.deleteCard).toHaveBeenCalledExactlyOnceWith("card-1");
  });

  it("edits a card through the API", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    const title = within(column).getByLabelText("Edit card title");
    await userEvent.clear(title);
    await userEvent.type(title, "Renamed card");
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));

    expect(within(column).getByText("Renamed card")).toBeInTheDocument();
    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(mocked.updateCard).toHaveBeenCalledExactlyOnceWith(
      "card-1",
      "Renamed card",
      "Draft quarterly themes with impact statements and metrics.",
      { priority: "none", dueDate: null, labels: [] }
    );
  });

  it("cancels a card edit without calling the API", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    await userEvent.type(within(column).getByLabelText("Edit card title"), "xyz");
    await userEvent.click(within(column).getByRole("button", { name: "Cancel" }));

    expect(within(column).getByText("Align roadmap themes")).toBeInTheDocument();
    expect(mocked.updateCard).not.toHaveBeenCalled();
  });

  it("reloads the board and shows an error when saving fails", async () => {
    mocked.deleteCard.mockRejectedValueOnce(new Error("boom"));
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /delete align roadmap themes/i })
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not save/i);
    await waitFor(() => expect(mocked.getBoard).toHaveBeenCalledTimes(2));
    expect(within(getFirstColumn()).getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("adds a card with priority, due date and labels", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "high");
    await userEvent.type(within(column).getByLabelText("Due date"), "2030-05-06");
    await userEvent.type(within(column).getByLabelText("Labels"), "bug, UI, bug");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(mocked.createCard).toHaveBeenCalledExactlyOnceWith("col-backlog", "New card", "", {
      priority: "high",
      dueDate: "2030-05-06",
      labels: ["bug", "UI"],
    });
  });

  it("shows badges for a card with fields", async () => {
    const data = structuredClone(initialData);
    data.cards["card-1"] = {
      ...data.cards["card-1"],
      priority: "high",
      dueDate: "2000-01-01",
      labels: ["urgent-fix"],
    };
    mocked.getBoard.mockResolvedValue(data);
    await renderBoard();
    const card = within(getFirstColumn()).getByTestId("card-card-1");
    expect(within(card).getByText("high")).toBeVisible();
    expect(within(card).getByText(/overdue/i)).toBeVisible();
    expect(within(card).getByText("urgent-fix")).toBeVisible();
  });

  it("edits the fields of a card and can clear them", async () => {
    const data = structuredClone(initialData);
    data.cards["card-1"] = {
      ...data.cards["card-1"],
      priority: "low",
      dueDate: "2030-01-01",
      labels: ["a"],
    };
    mocked.getBoard.mockResolvedValue(data);
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /edit align roadmap themes/i })
    );
    expect(within(column).getByLabelText("Priority")).toHaveValue("low");
    expect(within(column).getByLabelText("Due date")).toHaveValue("2030-01-01");
    expect(within(column).getByLabelText("Labels")).toHaveValue("a");

    await userEvent.selectOptions(within(column).getByLabelText("Priority"), "none");
    await userEvent.clear(within(column).getByLabelText("Due date"));
    await userEvent.clear(within(column).getByLabelText("Labels"));
    await userEvent.click(within(column).getByRole("button", { name: "Save" }));
    expect(mocked.updateCard).toHaveBeenCalledExactlyOnceWith(
      "card-1",
      "Align roadmap themes",
      "Draft quarterly themes with impact statements and metrics.",
      { priority: "none", dueDate: null, labels: [] }
    );
  });

  describe("search and filters", () => {
    const withFields = () => {
      const data = structuredClone(initialData);
      data.cards["card-1"] = {
        ...data.cards["card-1"],
        priority: "high",
        labels: ["roadmap"],
      };
      data.cards["card-2"] = { ...data.cards["card-2"], dueDate: "2000-01-01" };
      mocked.getBoard.mockResolvedValue(data);
    };

    it("shows a summary and no filters by default", async () => {
      withFields();
      await renderBoard();
      expect(screen.getByTestId("board-summary")).toHaveTextContent(
        "8 cards, 1 overdue, 1 high priority"
      );
      expect(screen.queryByRole("button", { name: /clear filters/i })).not.toBeInTheDocument();
    });

    it("hides cards that do not match the search and shows counts", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "signals");
      expect(screen.getByText("Gather customer signals")).toBeVisible();
      expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
      expect(screen.getByTestId("board-summary")).toHaveTextContent("Showing 1 of 8 cards");
      expect(within(getFirstColumn()).getByText("1/2")).toBeVisible();
      expect(screen.getAllByText("No matching cards").length).toBeGreaterThan(0);
    });

    it("filters by priority, label and overdue, and clears", async () => {
      withFields();
      await renderBoard();
      await userEvent.selectOptions(screen.getByLabelText("Filter by priority"), "high");
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);

      await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(8);

      await userEvent.selectOptions(screen.getByLabelText("Filter by label"), "roadmap");
      expect(screen.getByText("Align roadmap themes")).toBeVisible();
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);

      await userEvent.click(screen.getByRole("button", { name: /clear filters/i }));
      await userEvent.click(screen.getByLabelText("Overdue only"));
      expect(screen.getAllByTestId(/^card-/)).toHaveLength(1);
      expect(screen.getByText("Gather customer signals")).toBeVisible();
    });

    it("disables the label filter when no card has labels", async () => {
      await renderBoard();
      expect(screen.getByLabelText("Filter by label")).toBeDisabled();
    });

    it("keeps editing working on a filtered card", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "signals");
      await userEvent.click(
        screen.getByRole("button", { name: /edit gather customer signals/i })
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(mocked.updateCard).toHaveBeenCalledOnce();
    });
  });

  describe("card details", () => {
    it("opens the details dialog for a card and updates its badges", async () => {
      mocked.getCardDetail.mockResolvedValue({ comments: [], checklist: [] });
      mocked.addComment.mockResolvedValue({
        comments: [{ id: 1, author: "u", body: "hi", createdAt: "2030-01-01 00:00:00" }],
        checklist: [],
      });
      await renderBoard();
      const card = within(getFirstColumn()).getByTestId("card-card-1");
      await userEvent.click(
        within(card).getByRole("button", { name: "Details for Align roadmap themes" })
      );
      expect(await screen.findByRole("dialog", { name: "Card details" })).toBeVisible();
      await userEvent.type(screen.getByLabelText("New comment"), "hi");
      await userEvent.click(screen.getByRole("button", { name: "Add comment" }));
      await screen.findByText("hi");
      await userEvent.click(screen.getByRole("button", { name: "Close details" }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(within(card).getByText("1 comment")).toBeVisible();
    });

    it("shows checklist and comment badges from the board", async () => {
      const data = structuredClone(initialData);
      data.cards["card-1"] = {
        ...data.cards["card-1"],
        commentCount: 3,
        checklist: { done: 1, total: 2 },
      };
      mocked.getBoard.mockResolvedValue(data);
      await renderBoard();
      const card = within(getFirstColumn()).getByTestId("card-card-1");
      expect(within(card).getByText("Checklist 1/2")).toBeVisible();
      expect(within(card).getByText("3 comments")).toBeVisible();
    });
  });

  describe("views", () => {
    it("switches between board, dashboard and activity", async () => {
      mocked.getActivity.mockResolvedValue([
        { id: 1, actor: "user", message: 'created card "X"', createdAt: "2030-01-01 00:00:00" },
      ]);
      await renderBoard();
      expect(screen.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");

      await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));
      expect(screen.getByRole("region", { name: "Dashboard" })).toBeVisible();
      expect(screen.queryAllByTestId(/^column-/)).toHaveLength(0);
      expect(screen.queryByLabelText("Search cards")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Activity" }));
      expect(await screen.findByText(/created card "X"/)).toBeVisible();
      expect(mocked.getActivity).toHaveBeenCalledOnce();

      await userEvent.click(screen.getByRole("button", { name: "Board" }));
      expect(screen.getAllByTestId(/^column-/)).toHaveLength(5);
    });

    it("keeps the filters when returning to the board", async () => {
      await renderBoard();
      await userEvent.type(screen.getByLabelText("Search cards"), "signals");
      await userEvent.click(screen.getByRole("button", { name: "Dashboard" }));
      await userEvent.click(screen.getByRole("button", { name: "Board" }));
      expect(screen.getByLabelText("Search cards")).toHaveValue("signals");
    });
  });

  describe("when saving fails", () => {
    const rename = async () => {
      await renderBoard();
      const input = within(getFirstColumn()).getByLabelText("Column title");
      await userEvent.clear(input);
      await userEvent.type(input, "Broken");
      await userEvent.tab();
    };

    it("reloads the board and says so", async () => {
      mocked.renameColumn.mockRejectedValue(new Error("500"));
      await rename();
      expect(await screen.findByRole("alert")).toHaveTextContent(/board was reloaded/i);
      expect(within(getFirstColumn()).getByLabelText("Column title")).toHaveValue("Backlog");
    });

    it("says the server is unreachable when the reload fails too", async () => {
      mocked.renameColumn.mockRejectedValue(new Error("down"));
      await renderBoard();
      mocked.getBoard.mockRejectedValue(new Error("down"));
      const input = within(getFirstColumn()).getByLabelText("Column title");
      await userEvent.clear(input);
      await userEvent.type(input, "Broken");
      await userEvent.tab();
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    });
  });

  describe("reordering columns", () => {
    const titles = () => screen.getAllByLabelText("Column title").map((el) => (el as HTMLInputElement).value);

    it("moves a column right and left and saves the new position", async () => {
      mocked.moveColumn.mockResolvedValue({});
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Move Backlog right" }));
      expect(titles().slice(0, 2)).toEqual(["Discovery", "Backlog"]);
      expect(mocked.moveColumn).toHaveBeenLastCalledWith("col-backlog", 1);

      await userEvent.click(screen.getByRole("button", { name: "Move Done left" }));
      expect(titles().slice(-2)).toEqual(["Done", "Review"]);
      expect(mocked.moveColumn).toHaveBeenLastCalledWith("col-done", 3);
    });

    it("disables the buttons at the edges", async () => {
      await renderBoard();
      expect(screen.getByRole("button", { name: "Move Backlog left" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Done right" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Move Backlog right" })).toBeEnabled();
    });

    it("reloads the saved order when saving fails", async () => {
      mocked.moveColumn.mockRejectedValue(new Error("500"));
      await renderBoard();
      await userEvent.click(screen.getByRole("button", { name: "Move Backlog right" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/reloaded/i);
      expect(titles()[0]).toBe("Backlog");
    });
  });
});
