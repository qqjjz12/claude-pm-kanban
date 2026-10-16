import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as api from "@/lib/api";
import { initialData } from "@/test/fixtures";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);

const send = async (text: string) => {
  await userEvent.type(screen.getByLabelText("Chat message"), text);
  await userEvent.click(screen.getByRole("button", { name: "Send" }));
};

describe("ChatSidebar", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sends the message with history and shows the reply", async () => {
    mocked.chat
      .mockResolvedValueOnce({ reply: "Hello there", board: null })
      .mockResolvedValueOnce({ reply: "Second reply", board: null });
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await send("Hi");
    expect(await screen.findByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(mocked.chat).toHaveBeenNthCalledWith(1, "Hi", []);
    expect(screen.getByLabelText("Chat message")).toHaveValue("");

    await send("Again");
    expect(await screen.findByText("Second reply")).toBeInTheDocument();
    expect(mocked.chat).toHaveBeenNthCalledWith(2, "Again", [
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello there" },
    ]);
  });

  it("shows a loading indicator while waiting", async () => {
    let finish: (value: { reply: string; board: null }) => void = () => {};
    mocked.chat.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await send("Hi");
    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();

    finish({ reply: "Done", board: null });
    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument();
  });

  it("ignores an empty message", async () => {
    render(<ChatSidebar onBoardUpdate={() => {}} />);
    await userEvent.type(screen.getByLabelText("Chat message"), "   ");
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(mocked.chat).not.toHaveBeenCalled();
  });

  it("shows an error when the request fails", async () => {
    mocked.chat.mockRejectedValue(new Error("502"));
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    await send("Hi");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not respond/i);
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  it("passes an updated board to the parent", async () => {
    const board = structuredClone(initialData);
    mocked.chat.mockResolvedValue({ reply: "Changed", board });
    const onBoardUpdate = vi.fn();
    render(<ChatSidebar onBoardUpdate={onBoardUpdate} />);

    await send("Do it");
    await screen.findByText("Changed");
    expect(onBoardUpdate).toHaveBeenCalledExactlyOnceWith(board);
  });

  it("sends only the most recent messages as history", async () => {
    mocked.chat.mockResolvedValue({ reply: "ok", board: null });
    render(<ChatSidebar onBoardUpdate={() => {}} />);

    for (let i = 0; i < 12; i++) {
      await send(`message ${i}`);
      await screen.findAllByText("ok");
      await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeEnabled());
    }

    const history = mocked.chat.mock.calls[11][1];
    expect(history).toHaveLength(20);
    expect(history[0].content).toBe("message 1");
  });

  it("collapses and expands", async () => {
    render(<ChatSidebar onBoardUpdate={() => {}} />);
    expect(screen.getByLabelText("Chat message")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
    expect(screen.getByLabelText("Chat message")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Expand chat" }));
    expect(screen.getByLabelText("Chat message")).toBeVisible();
  });
});

describe("KanbanBoard with chat", () => {
  it("refreshes the board when the chat returns one", async () => {
    vi.resetAllMocks();
    mocked.getBoard.mockImplementation(async () => structuredClone(initialData));
    const changed = structuredClone(initialData);
    changed.columns[0].title = "Renamed by AI";
    mocked.chat.mockResolvedValue({ reply: "Renamed it", board: changed });

    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);
    await send("Rename the first column");

    expect(await screen.findByDisplayValue("Renamed by AI")).toBeInTheDocument();
    expect(mocked.getBoard).toHaveBeenCalledOnce();
  });

  it("opens the card editor with the values the chat just set", async () => {
    vi.resetAllMocks();
    mocked.getBoard.mockImplementation(async () => structuredClone(initialData));
    const changed = structuredClone(initialData);
    changed.cards["card-1"].title = "AI renamed";
    mocked.chat.mockResolvedValue({ reply: "Done", board: changed });

    render(<KanbanBoard onLogout={() => {}} />);
    await screen.findAllByTestId(/column-/i);
    await send("Rename the first card");
    await screen.findByText("AI renamed");
    await userEvent.click(screen.getByRole("button", { name: /edit ai renamed/i }));

    expect(screen.getByLabelText("Edit card title")).toHaveValue("AI renamed");
  });
});
