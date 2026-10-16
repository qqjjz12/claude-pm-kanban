"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { NewColumnForm } from "@/components/NewColumnForm";
import * as api from "@/lib/api";
import { CardDetailModal } from "@/components/CardDetailModal";
import { FilterBar } from "@/components/FilterBar";
import {
  EMPTY_FILTERS,
  allLabels,
  boardStats,
  isFiltering,
  matchesFilters,
  moveCard,
  type BoardData,
  type CardFields,
  type Filters,
} from "@/lib/kanban";

type KanbanBoardProps = {
  boardId: number;
  header: ReactNode;
  notice?: ReactNode;
};

export const KanbanBoard = ({ boardId, header, notice }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  const load = useCallback(async () => {
    try {
      api.setActiveBoard(boardId);
      setBoard(await api.getBoard());
      return true;
    } catch {
      return false;
    }
  }, [boardId]);

  useEffect(() => {
    api.setActiveBoard(boardId);
    api
      .getBoard()
      .then(setBoard)
      .catch(() => setError("Could not load the board."));
  }, [boardId]);

  // Apply a change locally, then persist it. On failure, reload the server state.
  const persist = async (save: () => Promise<unknown>) => {
    try {
      await save();
      setError("");
    } catch {
      const reloaded = await load();
      setError(
        reloaded
          ? "Could not save your change. The board was reloaded."
          : "Could not reach the server."
      );
    }
  };

  if (!board) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-sm text-[var(--gray-text)]">
        {error ? (
          <div className="flex flex-col items-center gap-4">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => load().then((ok) => ok && setError(""))}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              Retry
            </button>
          </div>
        ) : (
          "Loading board..."
        )}
      </main>
    );
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!over || active.id === over.id) {
      return;
    }

    const cardId = active.id as string;
    const columns = moveCard(board.columns, cardId, over.id as string);
    if (columns === board.columns) {
      return;
    }
    setBoard({ ...board, columns });

    const target = columns.find((column) => column.cardIds.includes(cardId));
    if (target) {
      persist(() =>
        api.moveCard(cardId, target.id, target.cardIds.indexOf(cardId))
      );
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard({
      ...board,
      columns: board.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column
      ),
    });
  };

  const handleRenameCommit = (columnId: string, title: string) => {
    persist(() => api.renameColumn(columnId, title));
  };

  const handleSummary = (
    cardId: string,
    commentCount: number,
    checklist: { done: number; total: number }
  ) => {
    setBoard((prev) =>
      prev && prev.cards[cardId]
        ? {
            ...prev,
            cards: { ...prev.cards, [cardId]: { ...prev.cards[cardId], commentCount, checklist } },
          }
        : prev
    );
  };

  const handleAddColumn = (title: string) => {
    persist(async () => {
      const column = await api.createColumn(title);
      setBoard((prev) => prev && { ...prev, columns: [...prev.columns, column] });
    });
  };

  const handleDeleteColumn = (columnId: string) => {
    const doomed = board.columns.find((column) => column.id === columnId);
    setBoard({
      ...board,
      columns: board.columns.filter((column) => column.id !== columnId),
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => !doomed?.cardIds.includes(id))
      ),
    });
    persist(() => api.deleteColumn(columnId));
  };

  const handleAddCard = (
    columnId: string,
    title: string,
    details: string,
    fields: CardFields
  ) => {
    persist(async () => {
      const card = await api.createCard(columnId, title, details, fields);
      setBoard((prev) =>
        prev && {
          ...prev,
          cards: { ...prev.cards, [card.id]: card },
          columns: prev.columns.map((column) =>
            column.id === columnId
              ? { ...column, cardIds: [...column.cardIds, card.id] }
              : column
          ),
        }
      );
    });
  };

  const handleEditCard = (
    cardId: string,
    title: string,
    details: string,
    fields: CardFields
  ) => {
    setBoard({
      ...board,
      cards: { ...board.cards, [cardId]: { ...board.cards[cardId], title, details, ...fields } },
    });
    persist(() => api.updateCard(cardId, title, details, fields));
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
    persist(() => api.deleteCard(cardId));
  };

  const activeCard = activeCardId ? board.cards[activeCardId] : null;
  const filtering = isFiltering(filters);
  const visibleCards = (cardIds: string[]) =>
    cardIds.map((id) => board.cards[id]).filter((card) => matchesFilters(card, filters));
  const shown = board.columns.reduce(
    (sum, column) => sum + visibleCards(column.cardIds).length,
    0
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
    <div className="relative min-w-0 flex-1 overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <main className="relative flex min-h-screen flex-col gap-6 px-4 pb-10 pt-6 lg:px-6">
        {header}
        {notice}

        <FilterBar
          filters={filters}
          onChange={setFilters}
          labels={allLabels(board.cards)}
          shown={shown}
          stats={boardStats(board.cards)}
        />

        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-[var(--stroke)] bg-white px-5 py-3 text-sm font-medium text-red-600"
          >
            {error}
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid auto-cols-[minmax(230px,1fr)] grid-flow-col gap-4 overflow-x-auto px-1 pb-8 -mb-6 -mx-1">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={visibleCards(column.cardIds)}
                totalCount={column.cardIds.length}
                filtering={filtering}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameCommit}
                onDelete={handleDeleteColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
                onOpenCard={setDetailCardId}
              />
            ))}
            <NewColumnForm onAdd={handleAddColumn} />
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[280px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
    </div>
    {detailCardId && board.cards[detailCardId] && (
      <CardDetailModal
        card={board.cards[detailCardId]}
        onClose={() => setDetailCardId(null)}
        onSummary={handleSummary}
      />
    )}
    <ChatSidebar onBoardUpdate={setBoard} />
    </div>
  );
};
