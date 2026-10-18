export type Priority = "none" | "low" | "medium" | "high";

export const PRIORITIES: Priority[] = ["none", "low", "medium", "high"];

export type CardFields = {
  priority: Priority;
  dueDate: string | null;
  labels: string[];
};

export type ChecklistSummary = { done: number; total: number };

export type Card = CardFields & {
  id: string;
  title: string;
  details: string;
  commentCount: number;
  checklist: ChecklistSummary;
};

// "high" -> "High"; "none" reads as "No priority".
export const priorityLabel = (priority: Priority) =>
  priority === "none" ? "No priority" : priority[0].toUpperCase() + priority.slice(1);

// "bug, UI,, bug" -> ["bug", "UI"]: trimmed, no blanks, no repeats ignoring case, at most 10.
export const parseLabels = (text: string): string[] => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const part of text.split(",")) {
    const label = part.trim().slice(0, 30);
    if (label && !seen.has(label.toLowerCase())) {
      seen.add(label.toLowerCase());
      labels.push(label);
    }
  }
  return labels.slice(0, 10);
};

const pad = (n: number) => String(n).padStart(2, "0");

export const today = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

// Dates are YYYY-MM-DD strings, so they compare correctly as text.
export const isOverdue = (dueDate: string | null, now = new Date()) =>
  dueDate !== null && dueDate < today(now);

export const formatDueDate = (dueDate: string) => {
  const [year, month, day] = dueDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export const formatTimestamp = (value: string) => {
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const date = new Date(value.replace(" ", "T") + "Z");
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

// The column with this id, or the column that holds the card with this id.
const findColumn = (columns: Column[], id: string) =>
  columns.find((column) => column.id === id) ??
  columns.find((column) => column.cardIds.includes(id));

const withCardIds = (columns: Column[], changes: Record<string, string[]>) =>
  columns.map((column) =>
    column.id in changes ? { ...column, cardIds: changes[column.id] } : column
  );

// Drop the active card on a card (takes its place) or on a column (goes to the end).
export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumn = findColumn(columns, activeId);
  const overColumn = findColumn(columns, overId);
  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = overColumn.id === overId;
  const remaining = activeColumn.cardIds.filter((cardId) => cardId !== activeId);

  if (activeColumn.id === overColumn.id) {
    if (isOverColumn) {
      return withCardIds(columns, { [activeColumn.id]: [...remaining, activeId] });
    }
    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);
    if (oldIndex === -1 || oldIndex === newIndex) {
      return columns;
    }
    remaining.splice(newIndex, 0, activeId);
    return withCardIds(columns, { [activeColumn.id]: remaining });
  }

  if (!activeColumn.cardIds.includes(activeId)) {
    return columns;
  }
  const overCardIds = [...overColumn.cardIds];
  overCardIds.splice(
    isOverColumn ? overCardIds.length : overCardIds.indexOf(overId),
    0,
    activeId
  );
  return withCardIds(columns, {
    [activeColumn.id]: remaining,
    [overColumn.id]: overCardIds,
  });
};

export type Filters = {
  query: string;
  priority: Priority | "any";
  label: string;
  overdueOnly: boolean;
};

export const EMPTY_FILTERS: Filters = {
  query: "",
  priority: "any",
  label: "",
  overdueOnly: false,
};

export const isFiltering = (filters: Filters) =>
  filters.query.trim() !== "" ||
  filters.priority !== "any" ||
  filters.label !== "" ||
  filters.overdueOnly;

export const matchesFilters = (card: Card, filters: Filters, now = new Date()) => {
  const query = filters.query.trim().toLowerCase();
  if (
    query &&
    ![card.title, card.details, ...card.labels].some((text) =>
      text.toLowerCase().includes(query)
    )
  ) {
    return false;
  }
  if (filters.priority !== "any" && card.priority !== filters.priority) {
    return false;
  }
  if (filters.label && !card.labels.includes(filters.label)) {
    return false;
  }
  return !filters.overdueOnly || isOverdue(card.dueDate, now);
};

export const allLabels = (cards: Record<string, Card>) =>
  [...new Set(Object.values(cards).flatMap((card) => card.labels))].sort((a, b) =>
    a.localeCompare(b)
  );

export const boardStats = (cards: Record<string, Card>, now = new Date()) => {
  const all = Object.values(cards);
  return {
    total: all.length,
    overdue: all.filter((card) => isOverdue(card.dueDate, now)).length,
    high: all.filter((card) => card.priority === "high").length,
  };
};

const addDays = (now: Date, days: number) => {
  const later = new Date(now);
  later.setDate(later.getDate() + days);
  return later;
};

export const dashboardStats = (board: BoardData, now = new Date()) => {
  const cards = Object.values(board.cards);
  const byPriority = { none: 0, low: 0, medium: 0, high: 0 } as Record<Priority, number>;
  const counts = new Map<string, number>();
  const todayText = today(now);
  const weekText = today(addDays(now, 7));
  let done = 0;
  let total = 0;
  let comments = 0;
  for (const card of cards) {
    byPriority[card.priority] += 1;
    done += card.checklist.done;
    total += card.checklist.total;
    comments += card.commentCount;
    for (const label of card.labels) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  const byDate = (a: Card, b: Card) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "");
  return {
    total: cards.length,
    perColumn: board.columns.map((column) => ({
      id: column.id,
      title: column.title,
      count: column.cardIds.length,
    })),
    byPriority,
    overdue: cards.filter((card) => isOverdue(card.dueDate, now)).sort(byDate),
    dueSoon: cards
      .filter((card) => card.dueDate !== null && card.dueDate >= todayText && card.dueDate <= weekText)
      .sort(byDate),
    labels: [...counts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    checklist: { done, total },
    comments,
  };
};

// Move a column one step (delta -1 or +1); returns the same array when it cannot move.
export const moveColumnBy = (columns: Column[], columnId: string, delta: number): Column[] => {
  const from = columns.findIndex((column) => column.id === columnId);
  const to = from + delta;
  if (from === -1 || to < 0 || to >= columns.length) {
    return columns;
  }
  const next = [...columns];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
};
