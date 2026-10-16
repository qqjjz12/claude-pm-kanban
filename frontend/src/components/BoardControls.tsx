import { useState, type FormEvent } from "react";
import { CheckIcon, CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/icons";
import type { BoardSummary, BoardTemplate } from "@/lib/api";

type BoardControlsProps = {
  boards: BoardSummary[];
  boardId: number;
  onSelect: (id: number) => void;
  onCreate: (name: string, template: BoardTemplate) => Promise<void>;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

type Mode = "idle" | "create" | "rename" | "delete";

const iconButton =
  "flex h-9 w-9 items-center justify-center rounded-full border border-[var(--stroke)] text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)] disabled:cursor-not-allowed disabled:opacity-40";
const field =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const BoardControls = ({
  boards,
  boardId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: BoardControlsProps) => {
  const [mode, setMode] = useState<Mode>("idle");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<BoardTemplate>("standard");
  const [error, setError] = useState("");
  const current = boards.find((board) => board.id === boardId);

  const open = (next: Mode) => {
    setMode(next);
    setError("");
    setName(next === "rename" ? (current?.name ?? "") : "");
    setTemplate("standard");
  };

  const run = async (action: () => Promise<void>, failure: string) => {
    try {
      await action();
      setMode("idle");
    } catch {
      setError(failure);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }
    if (mode === "create") {
      run(() => onCreate(trimmed, template), "Could not create the board.");
    } else {
      run(() => onRename(boardId, trimmed), "Could not rename the board.");
    }
  };

  if (mode === "create" || mode === "rename") {
    return (
      <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Board name"
          placeholder="Board name"
          maxLength={200}
          autoFocus
          className={field}
        />
        {mode === "create" && (
          <select
            value={template}
            onChange={(event) => setTemplate(event.target.value as BoardTemplate)}
            aria-label="Template"
            className={field}
          >
            <option value="standard">To Do / In Progress / Done</option>
            <option value="sample">Sample board</option>
            <option value="empty">Empty</option>
          </select>
        )}
        <button type="submit" aria-label="Save board" title="Save" className={iconButton}>
          <CheckIcon />
        </button>
        <button
          type="button"
          onClick={() => open("idle")}
          aria-label="Cancel"
          title="Cancel"
          className={iconButton}
        >
          <CloseIcon />
        </button>
        {error && (
          <p role="alert" className="w-full text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </form>
    );
  }

  if (mode === "delete") {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--navy-dark)]">
        <span>
          Delete <strong>{current?.name}</strong> and all its cards?
        </span>
        <button
          type="button"
          onClick={() => run(() => onDelete(boardId), "Could not delete the board.")}
          className="rounded-full bg-red-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white"
        >
          Delete board
        </button>
        <button
          type="button"
          onClick={() => open("idle")}
          className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
        >
          Cancel
        </button>
        {error && (
          <p role="alert" className="w-full text-sm font-medium text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={boardId}
        onChange={(event) => onSelect(Number(event.target.value))}
        aria-label="Board"
        className={`${field} max-w-[14rem]`}
      >
        {boards.map((board) => (
          <option key={board.id} value={board.id}>
            {board.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => open("create")}
        aria-label="New board"
        title="New board"
        className={iconButton}
      >
        <PlusIcon />
      </button>
      <button
        type="button"
        onClick={() => open("rename")}
        aria-label="Rename board"
        title="Rename board"
        className={iconButton}
      >
        <PencilIcon />
      </button>
      <button
        type="button"
        onClick={() => open("delete")}
        disabled={boards.length <= 1}
        aria-label="Delete board"
        title={boards.length <= 1 ? "You cannot delete your only board" : "Delete board"}
        className={iconButton}
      >
        <TrashIcon />
      </button>
    </div>
  );
};
