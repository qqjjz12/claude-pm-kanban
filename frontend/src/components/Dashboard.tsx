import {
  PRIORITIES,
  dashboardStats,
  formatDueDate,
  priorityLabel,
  type BoardData,
  type Priority,
} from "@/lib/kanban";

type DashboardProps = {
  board: BoardData;
};

const panel =
  "rounded-3xl border border-[var(--stroke)] bg-white px-6 py-5 shadow-[var(--shadow)]";
const heading = "text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

const Bar = ({ label, count, max, color }: { label: string; count: number; max: number; color: string }) => (
  <li className="flex items-center gap-3 text-sm">
    <span className="w-32 shrink-0 truncate text-[var(--navy-dark)]" title={label}>
      {label}
    </span>
    <div className="h-3 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
      <div
        className="h-full rounded-full"
        style={{ width: max ? `${(count / max) * 100}%` : "0%", background: color }}
      />
    </div>
    <span className="w-8 shrink-0 text-right font-semibold text-[var(--navy-dark)]">{count}</span>
  </li>
);

const PRIORITY_COLOR: Record<Priority, string> = {
  none: "var(--gray-text)",
  low: "var(--primary-blue)",
  medium: "var(--accent-yellow)",
  high: "#dc2626",
};

export const Dashboard = ({ board }: DashboardProps) => {
  const stats = dashboardStats(board);
  const maxColumn = Math.max(0, ...stats.perColumn.map((column) => column.count));
  const maxPriority = Math.max(0, ...PRIORITIES.map((priority) => stats.byPriority[priority]));
  const checklistPercent = stats.checklist.total
    ? Math.round((stats.checklist.done / stats.checklist.total) * 100)
    : 0;

  const tiles = [
    { label: "Cards", value: stats.total },
    { label: "Overdue", value: stats.overdue.length },
    { label: "Due this week", value: stats.dueSoon.length },
    { label: "Comments", value: stats.comments },
  ];

  return (
    <section aria-label="Dashboard" className="space-y-4">
      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label} className={panel} data-testid={`tile-${tile.label}`}>
            <p className={heading}>{tile.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
              {tile.value}
            </p>
          </li>
        ))}
      </ul>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panel}>
          <h2 className={heading}>Cards per column</h2>
          <ul className="mt-4 space-y-2" aria-label="Cards per column">
            {stats.perColumn.map((column) => (
              <Bar
                key={column.id}
                label={column.title}
                count={column.count}
                max={maxColumn}
                color="var(--primary-blue)"
              />
            ))}
            {stats.perColumn.length === 0 && (
              <li className="text-sm text-[var(--gray-text)]">This board has no columns.</li>
            )}
          </ul>
        </div>

        <div className={panel}>
          <h2 className={heading}>Priority</h2>
          <ul className="mt-4 space-y-2" aria-label="Cards per priority">
            {PRIORITIES.map((priority) => (
              <Bar
                key={priority}
                label={priorityLabel(priority)}
                count={stats.byPriority[priority]}
                max={maxPriority}
                color={PRIORITY_COLOR[priority]}
              />
            ))}
          </ul>
        </div>

        <div className={panel}>
          <h2 className={heading}>Needs attention</h2>
          {stats.overdue.length === 0 && stats.dueSoon.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--gray-text)]">Nothing is overdue or due this week.</p>
          ) : (
            <ul className="mt-4 space-y-2 text-sm" aria-label="Needs attention">
              {stats.overdue.map((card) => (
                <li key={card.id} className="flex justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--navy-dark)]">{card.title}</span>
                  <span className="shrink-0 font-semibold text-red-600">
                    Overdue {formatDueDate(card.dueDate!)}
                  </span>
                </li>
              ))}
              {stats.dueSoon.map((card) => (
                <li key={card.id} className="flex justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere] text-[var(--navy-dark)]">{card.title}</span>
                  <span className="shrink-0 text-[var(--gray-text)]">
                    Due {formatDueDate(card.dueDate!)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={panel}>
          <h2 className={heading}>Checklists and labels</h2>
          <p className="mt-4 text-sm text-[var(--navy-dark)]" data-testid="checklist-progress">
            {stats.checklist.total === 0
              ? "No checklist items yet."
              : `${stats.checklist.done} of ${stats.checklist.total} checklist items done (${checklistPercent}%)`}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Labels">
            {stats.labels.map(({ label, count }) => (
              <li
                key={label}
                className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-[var(--secondary-purple)]"
              >
                {label} ({count})
              </li>
            ))}
            {stats.labels.length === 0 && (
              <li className="text-sm text-[var(--gray-text)]">No labels yet.</li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
};
