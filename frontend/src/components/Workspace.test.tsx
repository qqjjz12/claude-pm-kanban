import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import * as api from "@/lib/api";

vi.mock("@/lib/api");
vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: ({
    boardId,
    header,
    notice,
  }: {
    boardId: number;
    header: React.ReactNode;
    notice: React.ReactNode;
  }) => (
    <div>
      {header}
      {notice}
      <p data-testid="board-id">{boardId}</p>
    </div>
  ),
}));

const mocked = vi.mocked(api);

const boards = [
  { id: 1, name: "My Board" },
  { id: 2, name: "Roadmap" },
];

const renderWorkspace = async (onLogout = () => {}) => {
  render(<Workspace username="alice" onLogout={onLogout} />);
  await screen.findByRole("heading", { name: "Kanban Studio" });
};

const shownBoard = () => screen.getByTestId("board-id").textContent;

describe("Workspace", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.listBoards.mockResolvedValue(structuredClone(boards));
  });

  it("loads the boards and opens the first one", async () => {
    await renderWorkspace();
    expect(shownBoard()).toBe("1");
    expect(screen.getByLabelText("Board")).toHaveValue("1");
    expect(screen.getByRole("option", { name: "Roadmap" })).toBeInTheDocument();
  });

  it("shows an error with retry when boards cannot load", async () => {
    mocked.listBoards.mockRejectedValueOnce(new Error("down"));
    render(<Workspace username="alice" onLogout={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load your boards/i);
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  });

  it("switches boards", async () => {
    await renderWorkspace();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "2");
    expect(shownBoard()).toBe("2");
  });

  it("creates a board with a template and switches to it", async () => {
    mocked.createBoard.mockResolvedValue({ id: 3, name: "Sprint" });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Sprint");
    await userEvent.selectOptions(screen.getByLabelText("Template"), "empty");
    await userEvent.click(screen.getByRole("button", { name: "Save board" }));
    await waitFor(() => expect(shownBoard()).toBe("3"));
    expect(mocked.createBoard).toHaveBeenCalledWith("Sprint", "empty");
    expect(screen.getByRole("option", { name: "Sprint" })).toBeInTheDocument();
  });

  it("shows an error when creating a board fails and keeps the form open", async () => {
    mocked.createBoard.mockRejectedValue(new Error("nope"));
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "Sprint");
    await userEvent.click(screen.getByRole("button", { name: "Save board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not create/i);
    expect(screen.getByLabelText("Board name")).toBeVisible();
  });

  it("ignores a blank board name", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Save board" }));
    expect(mocked.createBoard).not.toHaveBeenCalled();
  });

  it("renames the current board", async () => {
    mocked.renameBoard.mockResolvedValue({ id: 1, name: "Home" });
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    const input = screen.getByLabelText("Board name");
    expect(input).toHaveValue("My Board");
    await userEvent.clear(input);
    await userEvent.type(input, "Home");
    await userEvent.click(screen.getByRole("button", { name: "Save board" }));
    expect(mocked.renameBoard).toHaveBeenCalledWith(1, "Home");
    expect(await screen.findByRole("option", { name: "Home" })).toBeInTheDocument();
  });

  it("cancels editing without calling the API", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "New board" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Board")).toBeVisible();
    expect(mocked.createBoard).not.toHaveBeenCalled();
  });

  it("deletes the current board after confirmation and falls back to another", async () => {
    mocked.deleteBoard.mockResolvedValue([{ id: 2, name: "Roadmap" }]);
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(mocked.deleteBoard).not.toHaveBeenCalled();
    expect(screen.getByText(/and all its cards/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(shownBoard()).toBe("2"));
    expect(mocked.deleteBoard).toHaveBeenCalledWith(1);
  });

  it("does not delete when cancelled", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocked.deleteBoard).not.toHaveBeenCalled();
    expect(shownBoard()).toBe("1");
  });

  it("disables delete when only one board is left", async () => {
    mocked.listBoards.mockResolvedValue([{ id: 1, name: "My Board" }]);
    await renderWorkspace();
    expect(screen.getByRole("button", { name: "Delete board" })).toBeDisabled();
  });

  it("calls onLogout and shows the username", async () => {
    const onLogout = vi.fn();
    await renderWorkspace(onLogout);
    expect(screen.getByText("alice")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("opens and closes the account panel", async () => {
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: /alice/i }));
    expect(screen.getByRole("region", { name: "Account" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Account" })).not.toBeInTheDocument();
  });

  it("shows an error and keeps the board when deleting fails", async () => {
    mocked.deleteBoard.mockRejectedValue(new Error("nope"));
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not delete/i);
    expect(shownBoard()).toBe("1");
  });

  it("shows an error when renaming fails", async () => {
    mocked.renameBoard.mockRejectedValue(new Error("nope"));
    await renderWorkspace();
    await userEvent.click(screen.getByRole("button", { name: "Rename board" }));
    await userEvent.type(screen.getByLabelText("Board name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Save board" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not rename/i);
  });

  it("deleting a board other than the current one keeps the current selection", async () => {
    mocked.deleteBoard.mockResolvedValue([{ id: 1, name: "My Board" }]);
    await renderWorkspace();
    await userEvent.selectOptions(screen.getByLabelText("Board"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete board" }));
    await waitFor(() => expect(shownBoard()).toBe("1"));
    expect(mocked.deleteBoard).toHaveBeenCalledWith(2);
  });
});
