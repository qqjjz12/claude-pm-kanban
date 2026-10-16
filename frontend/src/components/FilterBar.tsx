import {
  EMPTY_FILTERS,
  PRIORITIES,
  isFiltering,
  type Filters,
} from "@/lib/kanban";

type FilterBarProps = {
  filters: Filters;
  onChange: (filters: Filters) => void;
  labels: string[];
  shown: number;
  stats: { total: number; overdue: number; high: number };
};

const field =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-1.5 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const FilterBar = ({ filters, onChange, labels, shown, stats }: FilterBarProps) => {
  const active = isFiltering(filters);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-white/80 px-4 py-3">
      <input
        type="search"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        aria-label="Search cards"
        placeholder="Search cards"
        className={`${field} w-full min-w-0 sm:w-56`}
      />
      <select
        value={filters.priority}
        onChange={(event) =>
          onChange({ ...filters, priority: event.target.value as Filters["priority"] })
        }
        aria-label="Filter by priority"
        className={field}
      >
        <option value="any">Any priority</option>
        {PRIORITIES.map((priority) => (
          <option key={priority} value={priority}>
            {priority === "none" ? "No priority" : priority[0].toUpperCase() + priority.slice(1)}
          </option>
        ))}
      </select>
      <select
        value={filters.label}
        onChange={(event) => onChange({ ...filters, label: event.target.value })}
        aria-label="Filter by label"
        className={field}
        disabled={labels.length === 0}
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label} value={label}>
            {label}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-sm text-[var(--navy-dark)]">
        <input
          type="checkbox"
          checked={filters.overdueOnly}
          onChange={(event) => onChange({ ...filters, overdueOnly: event.target.checked })}
        />
        Overdue only
      </label>
      {active && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTERS)}
          className="text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] hover:underline"
        >
          Clear filters
        </button>
      )}
      <p
        data-testid="board-summary"
        className="ml-auto text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
      >
        {active
          ? `Showing ${shown} of ${stats.total} cards`
          : `${stats.total} cards, ${stats.overdue} overdue, ${stats.high} high priority`}
      </p>
    </div>
  );
};
