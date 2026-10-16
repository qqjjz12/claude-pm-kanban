import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { parseLabels, type Card, type CardFields } from "@/lib/kanban";
import { CardBadges, PRIORITY_BORDER } from "@/components/CardBadges";
import { CardFieldsEditor, type FieldsDraft } from "@/components/CardFieldsEditor";
import { PencilIcon, TrashIcon } from "@/components/icons";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, title: string, details: string, fields: CardFields) => void;
  dragDisabled?: boolean;
};

const toDraft = (card: Card): FieldsDraft => ({
  priority: card.priority,
  dueDate: card.dueDate ?? "",
  labels: card.labels.join(", "),
});

export const KanbanCard = ({ card, onDelete, onEdit, dragDisabled }: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);
  const [draft, setDraft] = useState<FieldsDraft>(toDraft(card));

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: card.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleEdit = () => {
    // The card may have changed since the last edit (for example by the AI).
    setTitle(card.title);
    setDetails(card.details);
    setDraft(toDraft(card));
    setIsEditing(true);
  };

  const handleSave = () => {
    if (!title.trim()) {
      return;
    }
    onEdit(card.id, title.trim(), details.trim(), {
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      labels: parseLabels(draft.labels),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setTitle(card.title);
    setDetails(card.details);
    setIsEditing(false);
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={clsx(
        "group rounded-2xl border border-[var(--stroke)] border-l-4 bg-white px-4 py-3 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        PRIORITY_BORDER[card.priority],
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]"
      )}
      {...attributes}
      {...listeners}
      data-testid={`card-${card.id}`}
    >
      {isEditing ? (
        <div className="space-y-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Edit card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            aria-label="Edit card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <CardFieldsEditor value={draft} onChange={setDraft} idPrefix={card.id} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h4>
            {card.details && (
              <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
                {card.details}
              </p>
            )}
            <CardBadges card={card} />
          </div>
          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <button
              type="button"
              onClick={handleEdit}
              title="Edit card"
              className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-[var(--surface)] hover:text-[var(--primary-blue)]"
              aria-label={`Edit ${card.title}`}
            >
              <PencilIcon />
            </button>
            <button
              type="button"
              onClick={() => onDelete(card.id)}
              title="Delete card"
              className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
              aria-label={`Delete ${card.title}`}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}
    </article>
  );
};
