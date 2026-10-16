import { useState, type FormEvent } from "react";
import { PlusIcon } from "@/components/icons";

type NewColumnFormProps = {
  onAdd: (title: string) => void;
};

export const NewColumnForm = ({ onAdd }: NewColumnFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim()) {
      return;
    }
    onAdd(title.trim());
    setTitle("");
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex min-h-[120px] items-center justify-center gap-2 self-start rounded-3xl border border-dashed border-[var(--stroke)] px-4 py-6 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue)] transition hover:border-[var(--primary-blue)] hover:bg-[var(--surface)]"
      >
        <PlusIcon />
        Add a column
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 self-start rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4"
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Column title"
        aria-label="New column title"
        maxLength={200}
        autoFocus
        className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
        >
          Add column
        </button>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setTitle("");
          }}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          Cancel
        </button>
      </div>
    </form>
  );
};
