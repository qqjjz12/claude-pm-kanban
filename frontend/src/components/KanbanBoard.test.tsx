import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import { initialData } from "@/test/fixtures";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);

const renderBoard = async (onLogout = () => {}) => {
  render(<KanbanBoard onLogout={onLogout} />);
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
    });
  });

  it("shows a loading state, then five columns from the API", async () => {
    render(<KanbanBoard onLogout={() => {}} />);
    expect(screen.getByText(/loading board/i)).toBeInTheDocument();
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
    expect(mocked.getBoard).toHaveBeenCalledOnce();
  });

  it("shows an error with retry when the board cannot load", async () => {
    mocked.getBoard.mockRejectedValueOnce(new Error("down"));
    render(<KanbanBoard onLogout={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);

    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("calls onLogout from the log out button", async () => {
    const onLogout = vi.fn();
    await renderBoard(onLogout);
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
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
      "Notes"
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
      "Draft quarterly themes with impact statements and metrics."
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
});
