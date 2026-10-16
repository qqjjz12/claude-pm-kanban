import clsx from "clsx";
import { formatDueDate, isOverdue, type Card, type Priority } from "@/lib/kanban";

export const PRIORITY_BORDER: Record<Priority, string> = {
  none: "border-l-[var(--primary-blue)]",
  low: "border-l-[var(--gray-text)]",
  medium: "border-l-[var(--accent-yellow)]",
  high: "border-l-red-500",
};

const PRIORITY_CHIP: Record<Priority, string> = {
  none: "",
  low: "bg-gray-100 text-[var(--gray-text)]",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-700",
};

const chip = "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

export const CardBadges = ({ card }: { card: Card }) => {
  const overdue = isOverdue(card.dueDate);
  const { done, total } = card.checklist;
  if (
    card.priority === "none" &&
    !card.dueDate &&
    card.labels.length === 0 &&
    total === 0 &&
    card.commentCount === 0
  ) {
    return null;
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {card.priority !== "none" && (
        <span className={clsx(chip, PRIORITY_CHIP[card.priority])}>{card.priority}</span>
      )}
      {card.dueDate && (
        <span
          className={clsx(
            chip,
            "normal-case tracking-normal",
            overdue ? "bg-red-100 text-red-700" : "bg-blue-50 text-[var(--primary-blue)]"
          )}
          title={overdue ? "Overdue" : "Due date"}
        >
          {overdue ? "Overdue " : "Due "}
          {formatDueDate(card.dueDate)}
        </span>
      )}
      {total > 0 && (
        <span
          className={clsx(chip, "normal-case tracking-normal", done === total ? "bg-green-100 text-green-800" : "bg-gray-100 text-[var(--gray-text)]")}
          title="Checklist progress"
        >
          {`Checklist ${done}/${total}`}
        </span>
      )}
      {card.commentCount > 0 && (
        <span className={clsx(chip, "bg-gray-100 normal-case tracking-normal text-[var(--gray-text)]")} title="Comments">
          {card.commentCount === 1 ? "1 comment" : `${card.commentCount} comments`}
        </span>
      )}
      {card.labels.map((label) => (
        <span key={label} className={clsx(chip, "bg-purple-50 normal-case tracking-normal text-[var(--secondary-purple)]")}>
          {label}
        </span>
      ))}
    </div>
  );
};
