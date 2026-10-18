import { useEffect, useRef, useState, type FormEvent } from "react";
import { CloseIcon, TrashIcon } from "@/components/icons";
import * as api from "@/lib/api";
import { formatTimestamp, type Card, type ChecklistSummary } from "@/lib/kanban";

type CardDetailModalProps = {
  card: Card;
  onClose: () => void;
  onSummary: (cardId: string, commentCount: number, checklist: ChecklistSummary) => void;
};

const field =
  "min-w-0 flex-1 rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";
const primary =
  "rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110";
const sectionTitle =
  "text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]";

export const CardDetailModal = ({ card, onClose, onSummary }: CardDetailModalProps) => {
  const [detail, setDetail] = useState<api.CardDetail | null>(null);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const [item, setItem] = useState("");
  const cardId = card.id;
  const onSummaryRef = useRef(onSummary);

  useEffect(() => {
    onSummaryRef.current = onSummary;
  });

  useEffect(() => {
    api
      .getCardDetail(cardId)
      .then(setDetail)
      .catch(() => setError("Could not load the card details."));
  }, [cardId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Every change returns the card's fresh detail; keep the board's badges in step.
  // Changes run one at a time so a slow response can never overwrite a newer one.
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const apply = (action: () => Promise<api.CardDetail>) => {
    const run = queue.current.then(async () => {
      try {
        const next = await action();
        setDetail(next);
        setError("");
        onSummaryRef.current(cardId, next.comments.length, {
          done: next.checklist.filter((entry) => entry.done).length,
          total: next.checklist.length,
        });
        return true;
      } catch {
        setError("Could not save your change.");
        return false;
      }
    });
    queue.current = run;
    return run;
  };

  // Clear the input at once so text typed while the save is in flight is not lost;
  // put the text back only if the save fails and the input is still empty.
  const submitComment = async (event: FormEvent) => {
    event.preventDefault();
    const text = comment.trim();
    if (!text) {
      return;
    }
    setComment("");
    if (!(await apply(() => api.addComment(cardId, text)))) {
      setComment((current) => current || text);
    }
  };

  const submitItem = async (event: FormEvent) => {
    event.preventDefault();
    const text = item.trim();
    if (!text) {
      return;
    }
    setItem("");
    if (!(await apply(() => api.addChecklistItem(cardId, text)))) {
      setItem((current) => current || text);
    }
  };

  const done = detail?.checklist.filter((entry) => entry.done).length ?? 0;
  const total = detail?.checklist.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(3,33,71,0.45)] px-4 py-10"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Card details"
        className="w-full max-w-xl space-y-6 rounded-3xl border border-[var(--stroke)] bg-white p-6 shadow-[var(--shadow)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <h2 className="font-display text-xl font-semibold text-[var(--navy-dark)]">
              {card.title}
            </h2>
            {card.details && (
              <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">{card.details}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-full p-2 text-[var(--gray-text)] transition hover:bg-[var(--surface)]"
          >
            <CloseIcon />
          </button>
        </div>

        {error && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {error}
          </p>
        )}
        {!detail && !error && <p className="text-sm text-[var(--gray-text)]">Loading...</p>}

        {detail && (
          <>
            <section aria-label="Checklist" className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={sectionTitle}>Checklist</h3>
                {total > 0 && (
                  <span className="text-xs font-semibold text-[var(--gray-text)]">
                    {done}/{total} done
                  </span>
                )}
              </div>
              {total > 0 && (
                <div
                  role="progressbar"
                  aria-label="Checklist progress"
                  aria-valuemin={0}
                  aria-valuemax={total}
                  aria-valuenow={done}
                  className="h-2 overflow-hidden rounded-full bg-[var(--surface)]"
                >
                  <div
                    className="h-full bg-[var(--primary-blue)] transition-all"
                    style={{ width: `${(done / total) * 100}%` }}
                  />
                </div>
              )}
              <ul className="space-y-1">
                {detail.checklist.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={entry.done}
                      onChange={(event) => {
                        // Read now: the queued call runs after React resets the input.
                        const done = event.target.checked;
                        apply(() => api.updateChecklistItem(entry.id, { done }));
                      }}
                      aria-label={entry.text}
                    />
                    <span
                      className={`min-w-0 flex-1 text-sm [overflow-wrap:anywhere] ${entry.done ? "text-[var(--gray-text)] line-through" : "text-[var(--navy-dark)]"}`}
                    >
                      {entry.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => apply(() => api.deleteChecklistItem(entry.id))}
                      aria-label={`Remove ${entry.text}`}
                      className="rounded-full p-1.5 text-[var(--gray-text)] transition hover:bg-red-50 hover:text-red-600"
                    >
                      <TrashIcon />
                    </button>
                  </li>
                ))}
              </ul>
              <form onSubmit={submitItem} className="flex gap-2">
                <input
                  value={item}
                  onChange={(event) => setItem(event.target.value)}
                  aria-label="New checklist item"
                  placeholder="Add an item"
                  maxLength={200}
                  className={field}
                />
                <button type="submit" className={primary}>
                  Add item
                </button>
              </form>
            </section>

            <section aria-label="Comments" className="space-y-3">
              <h3 className={sectionTitle}>Comments</h3>
              {detail.comments.length === 0 && (
                <p className="text-sm text-[var(--gray-text)]">No comments yet.</p>
              )}
              <ul className="space-y-3">
                {detail.comments.map((entry) => (
                  <li
                    key={entry.id}
                    className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs text-[var(--gray-text)]">
                      <span>
                        <strong className="text-[var(--navy-dark)]">{entry.author}</strong>{" "}
                        {formatTimestamp(entry.createdAt)}
                      </span>
                      <button
                        type="button"
                        onClick={() => apply(() => api.deleteComment(entry.id))}
                        aria-label="Delete comment"
                        className="rounded-full p-1 transition hover:text-red-600"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--navy-dark)] [overflow-wrap:anywhere]">
                      {entry.body}
                    </p>
                  </li>
                ))}
              </ul>
              <form onSubmit={submitComment} className="space-y-2">
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  aria-label="New comment"
                  placeholder="Write a comment"
                  rows={3}
                  maxLength={2000}
                  className={`${field} w-full resize-none`}
                />
                <button type="submit" className={primary}>
                  Add comment
                </button>
              </form>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
