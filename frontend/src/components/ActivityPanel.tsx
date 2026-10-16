import { useEffect, useState } from "react";
import * as api from "@/lib/api";

const formatTimestamp = (value: string) => {
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const date = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export const ActivityPanel = () => {
  const [entries, setEntries] = useState<api.ActivityEntry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getActivity()
      .then(setEntries)
      .catch(() => setError("Could not load the activity."));
  }, []);

  return (
    <section
      aria-label="Activity"
      className="rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]"
    >
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
        Recent activity
      </h2>
      {error && (
        <p role="alert" className="mt-4 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
      {!entries && !error && <p className="mt-4 text-sm text-[var(--gray-text)]">Loading...</p>}
      {entries && entries.length === 0 && (
        <p className="mt-4 text-sm text-[var(--gray-text)]">
          No activity yet. Changes to this board will show up here.
        </p>
      )}
      {entries && entries.length > 0 && (
        <ul className="mt-4 divide-y divide-[var(--stroke)]">
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--navy-dark)]">
                <strong>{entry.actor}</strong> {entry.message}
              </span>
              <time className="shrink-0 text-xs text-[var(--gray-text)]">
                {formatTimestamp(entry.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
