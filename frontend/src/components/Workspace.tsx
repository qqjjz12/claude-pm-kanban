"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountPanel } from "@/components/AccountPanel";
import { BoardControls } from "@/components/BoardControls";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LogoutIcon, UserIcon } from "@/components/icons";
import * as api from "@/lib/api";
import { downloadJson, fileSlug } from "@/lib/download";

type WorkspaceProps = {
  username: string;
  onLogout: () => void;
};

const headerButton =
  "flex shrink-0 items-center gap-2 rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]";

export const Workspace = ({ username, onLogout }: WorkspaceProps) => {
  const [boards, setBoards] = useState<api.BoardSummary[] | null>(null);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [error, setError] = useState("");

  const applyBoards = useCallback((list: api.BoardSummary[]) => {
    setBoards(list);
    setBoardId((current) =>
      list.some((board) => board.id === current) ? current : (list[0]?.id ?? null)
    );
    setError("");
  }, []);

  const loadBoards = useCallback(() => {
    api
      .listBoards()
      .then(applyBoards)
      .catch(() => setError("Could not load your boards."));
  }, [applyBoards]);

  useEffect(loadBoards, [loadBoards]);

  const handleCreate = async (name: string, template: api.BoardTemplate) => {
    const board = await api.createBoard(name, template);
    setBoards((list) => [...(list ?? []), board]);
    setBoardId(board.id);
  };

  const handleRename = async (id: number, name: string) => {
    await api.renameBoard(id, name);
    setBoards((list) => list?.map((b) => (b.id === id ? { ...b, name } : b)) ?? null);
  };

  const handleDelete = async (id: number) => {
    const remaining = await api.deleteBoard(id);
    setBoards(remaining);
    if (id === boardId) {
      setBoardId(remaining[0].id);
    }
  };

  const handleExport = async (id: number) => {
    const data = await api.exportBoard(id);
    const name = boards?.find((board) => board.id === id)?.name ?? "board";
    downloadJson(`${fileSlug(name)}.json`, data);
  };

  if (!boards || boardId === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6 text-sm text-[var(--gray-text)]">
        {error ? (
          <div className="flex flex-col items-center gap-4">
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={loadBoards}
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

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--stroke)] bg-white/80 px-6 py-4 shadow-[var(--shadow)] backdrop-blur">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
          Project management
        </p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-[var(--navy-dark)]">
          Kanban Studio
        </h1>
      </div>
      <BoardControls
        boards={boards}
        boardId={boardId}
        onSelect={setBoardId}
        onCreate={handleCreate}
        onRename={handleRename}
        onDelete={handleDelete}
        onExport={handleExport}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAccountOpen(!accountOpen)}
          aria-expanded={accountOpen}
          title="Account"
          className={headerButton}
        >
          <UserIcon />
          <span className="hidden sm:inline">{username || "Account"}</span>
        </button>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className={headerButton}
        >
          <LogoutIcon />
          <span className="hidden sm:inline">Log out</span>
        </button>
      </div>
    </header>
  );

  return (
    <KanbanBoard
      key={boardId}
      boardId={boardId}
      header={header}
      notice={
        accountOpen ? (
          <AccountPanel
            username={username}
            onClose={() => setAccountOpen(false)}
            onDeleted={onLogout}
          />
        ) : null
      }
    />
  );
};
