import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

vi.mock("@/components/KanbanBoard", () => ({
  KanbanBoard: ({ onLogout }: { onLogout: () => void }) => (
    <div>
      <h1>Kanban Studio</h1>
      <button onClick={onLogout}>Log out</button>
    </div>
  ),
}));

const respond = (ok: boolean) => Promise.resolve({ ok } as Response);

describe("AuthGate", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the login form when not authenticated", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(false)));
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
    expect(screen.queryByText("Kanban Studio")).not.toBeInTheDocument();
  });

  it("shows the board when already authenticated", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(true)));
    render(<AuthGate />);
    expect(await screen.findByText("Kanban Studio")).toBeVisible();
  });

  it("shows an error on bad credentials", async () => {
    vi.stubGlobal("fetch", vi.fn(() => respond(false)));
    render(<AuthGate />);
    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "nope");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid/i);
  });

  it("logs in and logs out", async () => {
    let loggedIn = false;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/api/login") loggedIn = true;
        if (url === "/api/logout") loggedIn = false;
        return respond(url === "/api/me" ? loggedIn : true);
      })
    );
    render(<AuthGate />);
    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Kanban Studio")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible()
    );
  });
});
