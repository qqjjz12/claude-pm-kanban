import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountPanel } from "@/components/AccountPanel";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, changePassword: vi.fn(), deleteAccount: vi.fn() };
});

const mocked = vi.mocked(api);

const fillPasswords = async (current: string, next: string) => {
  await userEvent.type(screen.getByLabelText("Current password"), current);
  await userEvent.type(screen.getByLabelText("New password"), next);
  await userEvent.click(screen.getByRole("button", { name: "Change password" }));
};

describe("AccountPanel", () => {
  beforeEach(() => vi.resetAllMocks());

  it("changes the password and clears the fields", async () => {
    mocked.changePassword.mockResolvedValue({});
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={() => {}} />);
    await fillPasswords("old-password", "new-password");
    expect(mocked.changePassword).toHaveBeenCalledWith("old-password", "new-password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("explains a wrong current password", async () => {
    mocked.changePassword.mockRejectedValue(new api.ApiError("POST", "/x", 401, ""));
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={() => {}} />);
    await fillPasswords("bad", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(/current password is wrong/i);
  });

  it("shows a generic error for other failures", async () => {
    mocked.changePassword.mockRejectedValue(new Error("offline"));
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={() => {}} />);
    await fillPasswords("old-password", "new-password");
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not change/i);
  });

  it("requires confirmation with the password to delete the account", async () => {
    mocked.deleteAccount.mockResolvedValue({});
    const onDeleted = vi.fn();
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    expect(mocked.deleteAccount).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "pw-12345");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(mocked.deleteAccount).toHaveBeenCalledWith("pw-12345");
    expect(onDeleted).toHaveBeenCalledOnce();
  });

  it("stays signed in when the delete password is wrong", async () => {
    mocked.deleteAccount.mockRejectedValue(new api.ApiError("POST", "/x", 401, ""));
    const onDeleted = vi.fn();
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={onDeleted} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.type(screen.getByLabelText("Confirm with your password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/password is wrong/i);
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("can back out of deleting", async () => {
    render(<AccountPanel username="alice" onClose={() => {}} onDeleted={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Delete account" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Delete account" })).toBeVisible();
  });
});
