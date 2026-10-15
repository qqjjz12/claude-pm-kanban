import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<boolean>;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

export const LoginForm = ({ onLogin }: LoginFormProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onLogin(username, password);
    setError(ok ? "" : "Invalid username or password.");
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)]"
      >
        <div>
          <div className="h-1 w-12 rounded-full bg-[var(--accent-yellow)]" />
          <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            Sign in to open your Kanban board.
          </p>
        </div>
        <label className={labelClass}>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Sign in
        </button>
      </form>
    </main>
  );
};
