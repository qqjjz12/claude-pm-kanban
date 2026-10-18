import { useState, type FormEvent } from "react";
import * as api from "@/lib/api";

type AccountPanelProps = {
  username: string;
  onClose: () => void;
  onDeleted: () => void;
};

const field =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const label =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";
const primary =
  "rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110";

const statusOf = (error: unknown) => (error instanceof api.ApiError ? error.status : 0);

const passwordChangeError = (status: number) => {
  if (status === 401) {
    return "The current password is wrong.";
  }
  if (status === 422) {
    return "The new password must be at least 8 characters.";
  }
  return "Could not change the password.";
};

export const AccountPanel = ({ username, onClose, onDeleted }: AccountPanelProps) => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [passwordMessage, setPasswordMessage] = useState<{ ok: boolean; text: string } | null>(
    null
  );
  const [confirming, setConfirming] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const handleChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setPasswordMessage({ ok: true, text: "Password changed." });
    } catch (error) {
      setPasswordMessage({ ok: false, text: passwordChangeError(statusOf(error)) });
    }
  };

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await api.deleteAccount(deletePassword);
      onDeleted();
    } catch (error) {
      setDeleteError(
        statusOf(error) === 401 ? "The password is wrong." : "Could not delete the account."
      );
    }
  };

  return (
    <section
      aria-label="Account"
      className="rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-[var(--navy-dark)]">
          Account: {username}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] hover:text-[var(--navy-dark)]"
        >
          Close
        </button>
      </div>
      <div className="mt-4 grid gap-8 md:grid-cols-2">
        <form onSubmit={handleChangePassword} className="space-y-3">
          <label className={label}>
            Current password
            <input
              type="password"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
              autoComplete="current-password"
              required
              className={field}
            />
          </label>
          <label className={label}>
            New password
            <input
              type="password"
              value={next}
              onChange={(event) => setNext(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              className={field}
            />
          </label>
          <button type="submit" className={primary}>
            Change password
          </button>
          {passwordMessage && (
            <p
              role={passwordMessage.ok ? "status" : "alert"}
              className={`text-sm font-medium ${passwordMessage.ok ? "text-green-700" : "text-red-600"}`}
            >
              {passwordMessage.text}
            </p>
          )}
        </form>
        <div className="space-y-3">
          {confirming ? (
            <form onSubmit={handleDelete} className="space-y-3">
              <p className="text-sm text-[var(--navy-dark)]">
                This permanently deletes your account and all of your boards.
              </p>
              <label className={label}>
                Confirm with your password
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className={field}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-full bg-red-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
                >
                  Permanently delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setDeleteError("");
                  }}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
                >
                  Cancel
                </button>
              </div>
              {deleteError && (
                <p role="alert" className="text-sm font-medium text-red-600">
                  {deleteError}
                </p>
              )}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full border border-red-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-600 transition hover:bg-red-50"
            >
              Delete account
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
