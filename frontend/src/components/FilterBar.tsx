import {
  EMPTY_FILTERS,
  PRIORITIES,
  isFiltering,
  priorityLabel,
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
  // Keep a selected label listed even if its last card lost it, so the select shows what is applied.
  const labelOptions =
    filters.label && !labels.includes(filters.label) ? [...labels, filters.label] : labels;
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
            {priorityLabel(priority)}
          </option>
        ))}
      </select>
      <select
        value={filters.label}
        onChange={(event) => onChange({ ...filters, label: event.target.value })}
        aria-label="Filter by label"
        className={`${field} disabled:cursor-not-allowed disabled:opacity-50`}
        disabled={labelOptions.length === 0}
        title={
          labelOptions.length === 0
            ? "No cards have labels yet. Add labels when editing a card to filter by them."
            : undefined
        }
      >
        <option value="">{labelOptions.length === 0 ? "No labels yet" : "Any label"}</option>
        {labelOptions.map((label) => (
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
