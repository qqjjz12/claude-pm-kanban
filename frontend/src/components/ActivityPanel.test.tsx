import { render, screen } from "@testing-library/react";
import { ActivityPanel } from "@/components/ActivityPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api");

const mocked = vi.mocked(api);

describe("ActivityPanel", () => {
  beforeEach(() => vi.resetAllMocks());

  it("lists entries with the actor", async () => {
    mocked.getActivity.mockResolvedValue([
      { id: 2, actor: "AI assistant", message: 'created card "X"', createdAt: "2030-01-01 10:00:00" },
      { id: 1, actor: "alice", message: 'deleted card "Y"', createdAt: "2030-01-01 09:00:00" },
    ]);
    render(<ActivityPanel />);
    expect(await screen.findByText("AI assistant")).toBeVisible();
    expect(screen.getByText(/created card "X"/)).toBeVisible();
    expect(screen.getByText("alice")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows an empty state", async () => {
    mocked.getActivity.mockResolvedValue([]);
    render(<ActivityPanel />);
    expect(await screen.findByText(/no activity yet/i)).toBeVisible();
  });

  it("shows an error when loading fails", async () => {
    mocked.getActivity.mockRejectedValue(new Error("down"));
    render(<ActivityPanel />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("falls back to the raw timestamp when it cannot be parsed", async () => {
    mocked.getActivity.mockResolvedValue([
      { id: 1, actor: "a", message: "m", createdAt: "garbage" },
    ]);
    render(<ActivityPanel />);
    expect(await screen.findByText("garbage")).toBeVisible();
  });
});
