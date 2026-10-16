import { act, render, screen, waitFor } from "@testing-library/react";
import * as api from "@/lib/api";
import userEvent from "@testing-library/user-event";
import { AuthGate } from "@/components/AuthGate";

vi.mock("@/components/Workspace", () => ({
  Workspace: ({ onLogout, username }: { onLogout: () => void; username: string }) => (
    <div>
      <h1>Kanban Studio</h1>
      <p>Hello {username}</p>
      <button onClick={onLogout}>Log out</button>
    </div>
  ),
}));

// Simulates the API layer discovering that the session is gone.
const expireSession = () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ detail: "Not authenticated" }),
      })
    )
  );
  api.getBoard().catch(() => {});
};

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

  it("shows the login form when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("offline"))));
    render(<AuthGate />);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  it("shows an error when login cannot reach the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        url === "/api/login" ? Promise.reject(new TypeError("offline")) : respond(false)
      )
    );
    render(<AuthGate />);
    await userEvent.type(await screen.findByLabelText("Username"), "user");
    await userEvent.type(screen.getByLabelText("Password"), "password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toBeVisible();
  });

  describe("registration", () => {
    const openRegister = async () => {
      await userEvent.click(await screen.findByRole("button", { name: /create an account/i }));
    };
    const fill = async (name: string, password: string, confirm = password) => {
      await userEvent.type(screen.getByLabelText("Username"), name);
      await userEvent.type(screen.getByLabelText("Password"), password);
      await userEvent.type(screen.getByLabelText("Confirm password"), confirm);
      await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    };

    it("creates an account and shows the board with the username", async () => {
      const fetchMock = vi.fn((url: string) =>
        url === "/api/register"
          ? Promise.resolve({ ok: true, json: () => Promise.resolve({ username: "alice" }) })
          : respond(false)
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<AuthGate />);
      await openRegister();
      await fill("alice", "secret-pass");
      expect(await screen.findByText("Hello alice")).toBeVisible();
      const [, init] = fetchMock.mock.calls.find(([url]) => url === "/api/register")!;
      expect(JSON.parse(init.body)).toEqual({ username: "alice", password: "secret-pass" });
    });

    it("does not call the server when the passwords differ", async () => {
      const fetchMock = vi.fn(() => respond(false));
      vi.stubGlobal("fetch", fetchMock);
      render(<AuthGate />);
      await openRegister();
      await fill("alice", "secret-pass", "other-pass");
      expect(await screen.findByRole("alert")).toHaveTextContent(/do not match/i);
      expect(fetchMock).toHaveBeenCalledTimes(1); // only the initial /api/me
    });

    it("reports a taken username", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/register"
            ? Promise.resolve({ ok: false, status: 409 } as Response)
            : respond(false)
        )
      );
      render(<AuthGate />);
      await openRegister();
      await fill("alice", "secret-pass");
      expect(await screen.findByRole("alert")).toHaveTextContent(/already taken/i);
    });

    it("explains validation failures", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/register"
            ? Promise.resolve({ ok: false, status: 422 } as Response)
            : respond(false)
        )
      );
      render(<AuthGate />);
      await openRegister();
      await fill("al", "secret-pass");
      expect(await screen.findByRole("alert")).toHaveTextContent(/at least 8 characters/i);
    });

    it("reports an unreachable server and can switch back to sign in", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/register" ? Promise.reject(new TypeError("offline")) : respond(false)
        )
      );
      render(<AuthGate />);
      await openRegister();
      await fill("alice", "secret-pass");
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach/i);
      await userEvent.click(screen.getByRole("button", { name: /have an account/i }));
      expect(screen.getByRole("heading", { name: "Sign in" })).toBeVisible();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  describe("hardening", () => {
    const signIn = async () => {
      await userEvent.type(await screen.findByLabelText("Username"), "user");
      await userEvent.type(screen.getByLabelText("Password"), "password");
      await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    };

    it("tells the user when too many attempts were made", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/login"
            ? Promise.resolve({ ok: false, status: 429 } as Response)
            : respond(false)
        )
      );
      render(<AuthGate />);
      await signIn();
      expect(await screen.findByRole("alert")).toHaveTextContent(/too many failed attempts/i);
    });

    it("says the server cannot be reached rather than blaming the password", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          url === "/api/login" ? Promise.reject(new TypeError("offline")) : respond(false)
        )
      );
      render(<AuthGate />);
      await signIn();
      expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
    });

    it("returns to sign in with a notice when the session expires", async () => {
      vi.stubGlobal("fetch", vi.fn(() => respond(true)));
      render(<AuthGate />);
      expect(await screen.findByText("Kanban Studio")).toBeVisible();
      act(() => expireSession());
      expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
      expect(screen.getByRole("status")).toHaveTextContent(/session expired/i);
    });

    it("clears the notice on a fresh sign in and on log out", async () => {
      let loggedIn = true;
      const stateful = vi.fn((url: string) => {
        if (url === "/api/login") loggedIn = true;
        return respond(url === "/api/me" ? loggedIn : true);
      });
      vi.stubGlobal("fetch", stateful);
      render(<AuthGate />);
      await screen.findByText("Kanban Studio");
      loggedIn = false;
      act(() => expireSession());
      await screen.findByRole("status");
      vi.stubGlobal("fetch", stateful);
      await signIn();
      expect(await screen.findByText("Kanban Studio")).toBeVisible();
      await userEvent.click(screen.getByRole("button", { name: /log out/i }));
      expect(await screen.findByRole("heading", { name: "Sign in" })).toBeVisible();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});
