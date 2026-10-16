import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardFields, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";
import { TrashIcon } from "@/components/icons";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  totalCount: number;
  filtering: boolean;
  onRename: (columnId: string, title: string) => void;
  onRenameCommit: (columnId: string, title: string) => void;
  onDelete: (columnId: string) => void;
  onAddCard: (columnId: string, title: string, details: string, fields: CardFields) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onOpenCard: (cardId: string) => void;
  onEditCard: (cardId: string, title: string, details: string, fields: CardFields) => void;
};

export const KanbanColumn = ({
  column,
  cards,
  totalCount,
  filtering,
  onRename,
  onRenameCommit,
  onDelete,
  onAddCard,
  onDeleteCard,
  onEditCard,
  onOpenCard,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [confirming, setConfirming] = useState(false);

  const handleDelete = () => {
    if (cards.length === 0 || confirming) {
      onDelete(column.id);
    } else {
      setConfirming(true);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[420px] min-w-0 flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center gap-2">
        <div className="h-6 w-1.5 shrink-0 rounded-full bg-[var(--accent-yellow)]" />
        <input
          value={column.title}
          onChange={(event) => onRename(column.id, event.target.value)}
          onBlur={(event) => onRenameCommit(column.id, event.target.value)}
          className="min-w-0 flex-1 rounded-lg bg-transparent px-1 font-display text-lg font-semibold text-[var(--navy-dark)] outline-none focus:bg-[var(--surface)]"
          aria-label="Column title"
        />
        <span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-xs font-semibold text-[var(--gray-text)]">
          {filtering ? `${cards.length}/${totalCount}` : cards.length}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          onBlur={() => setConfirming(false)}
          aria-label={confirming ? "Confirm delete column" : "Delete column"}
          title={confirming ? `Click again to delete ${cards.length} cards` : "Delete column"}
          className={clsx(
            "flex h-7 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-semibold transition",
            confirming
              ? "bg-red-600 text-white"
              : "text-[var(--gray-text)] hover:text-red-600"
          )}
        >
          {confirming ? "Delete?" : <TrashIcon />}
        </button>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-2.5">
        <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
              onOpen={onOpenCard}
              dragDisabled={filtering}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            {filtering ? "No matching cards" : "Drop a card here"}
          </div>
        )}
      </div>
      <NewCardForm
        onAdd={(title, details, fields) => onAddCard(column.id, title, details, fields)}
      />
    </section>
  );
};
