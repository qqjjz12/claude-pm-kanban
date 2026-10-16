import type { Card } from "@/lib/kanban";
import { CardBadges, PRIORITY_BORDER } from "@/components/CardBadges";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article
    className={`rounded-2xl border border-[var(--stroke)] border-l-4 ${PRIORITY_BORDER[card.priority]} bg-white px-4 py-3 shadow-[0_18px_32px_rgba(3,33,71,0.16)]`}
  >
    <div className="flex items-start justify-between gap-3">
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
    </div>
  </article>
);
