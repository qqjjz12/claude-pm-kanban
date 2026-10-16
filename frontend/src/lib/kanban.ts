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

export const NO_FIELDS: CardFields = { priority: "none", dueDate: null, labels: [] };

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

export type Column = {
  id: string;
  title: string;
  cardIds: string[];
};

export type BoardData = {
  columns: Column[];
  cards: Record<string, Card>;
};

const isColumnId = (columns: Column[], id: string) =>
  columns.some((column) => column.id === id);

const findColumnId = (columns: Column[], id: string) => {
  if (isColumnId(columns, id)) {
    return id;
  }
  return columns.find((column) => column.cardIds.includes(id))?.id;
};

export const moveCard = (
  columns: Column[],
  activeId: string,
  overId: string
): Column[] => {
  const activeColumnId = findColumnId(columns, activeId);
  const overColumnId = findColumnId(columns, overId);

  if (!activeColumnId || !overColumnId) {
    return columns;
  }

  const activeColumn = columns.find((column) => column.id === activeColumnId);
  const overColumn = columns.find((column) => column.id === overColumnId);

  if (!activeColumn || !overColumn) {
    return columns;
  }

  const isOverColumn = isColumnId(columns, overId);

  if (activeColumnId === overColumnId) {
    if (isOverColumn) {
      const nextCardIds = activeColumn.cardIds.filter(
        (cardId) => cardId !== activeId
      );
      nextCardIds.push(activeId);
      return columns.map((column) =>
        column.id === activeColumnId
          ? { ...column, cardIds: nextCardIds }
          : column
      );
    }

    const oldIndex = activeColumn.cardIds.indexOf(activeId);
    const newIndex = activeColumn.cardIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
      return columns;
    }

    const nextCardIds = [...activeColumn.cardIds];
    nextCardIds.splice(oldIndex, 1);
    nextCardIds.splice(newIndex, 0, activeId);

    return columns.map((column) =>
      column.id === activeColumnId
        ? { ...column, cardIds: nextCardIds }
        : column
    );
  }

  const activeIndex = activeColumn.cardIds.indexOf(activeId);
  if (activeIndex === -1) {
    return columns;
  }

  const nextActiveCardIds = [...activeColumn.cardIds];
  nextActiveCardIds.splice(activeIndex, 1);

  const nextOverCardIds = [...overColumn.cardIds];
  if (isOverColumn) {
    nextOverCardIds.push(activeId);
  } else {
    const overIndex = overColumn.cardIds.indexOf(overId);
    const insertIndex = overIndex === -1 ? nextOverCardIds.length : overIndex;
    nextOverCardIds.splice(insertIndex, 0, activeId);
  }

  return columns.map((column) => {
    if (column.id === activeColumnId) {
      return { ...column, cardIds: nextActiveCardIds };
    }
    if (column.id === overColumnId) {
      return { ...column, cardIds: nextOverCardIds };
    }
    return column;
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
