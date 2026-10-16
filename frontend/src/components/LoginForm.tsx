import { useState, type FormEvent } from "react";

type LoginFormProps = {
  onLogin: (username: string, password: string) => Promise<boolean>;
  onRegister: (username: string, password: string) => Promise<string>;
};

const inputClass =
  "mt-2 w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const labelClass =
  "block text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

export const LoginForm = ({ onLogin, onRegister }: LoginFormProps) => {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (registering) {
      if (password !== confirm) {
        setError("The passwords do not match.");
        return;
      }
      setError(await onRegister(username.trim(), password));
    } else {
      const ok = await onLogin(username, password);
      setError(ok ? "" : "Invalid username or password.");
    }
  };

  const switchMode = () => {
    setRegistering(!registering);
    setError("");
    setConfirm("");
  };

  const title = registering ? "Create account" : "Sign in";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-5 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)]"
      >
        <div>
          <div className="h-1 w-12 rounded-full bg-[var(--accent-yellow)]" />
          <h1 className="mt-4 font-display text-3xl font-semibold text-[var(--navy-dark)]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[var(--gray-text)]">
            {registering
              ? "Create an account to get your own boards."
              : "Sign in to open your Kanban boards."}
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
            autoComplete={registering ? "new-password" : "current-password"}
            required
            className={inputClass}
          />
        </label>
        {registering && (
          <label className={labelClass}>
            Confirm password
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              required
              className={inputClass}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="w-full rounded-full bg-[var(--secondary-purple)] px-4 py-3 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          {title}
        </button>
        <button
          type="button"
          onClick={switchMode}
          className="w-full text-center text-xs font-semibold text-[var(--primary-blue)] hover:underline"
        >
          {registering ? "Have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </main>
  );
};
