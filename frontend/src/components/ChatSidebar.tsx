"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import * as api from "@/lib/api";
import type { BoardData } from "@/lib/kanban";
import { ChatIcon, ChevronRightIcon, SendIcon } from "@/components/icons";

type ChatSidebarProps = {
  onBoardUpdate: (board: BoardData) => void;
};

const MAX_HISTORY = 20;

export const ChatSidebar = ({ onBoardUpdate }: ChatSidebarProps) => {
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, loading]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) {
      return;
    }
    setInput("");
    setError("");
    setLoading(true);
    const sent: api.ChatMessage[] = [...messages, { role: "user", content: text }];
    try {
      const { reply, board } = await api.chat(text, messages.slice(-MAX_HISTORY));
      setMessages([...sent, { role: "assistant", content: reply }]);
      if (board) {
        onBoardUpdate(board);
      }
    } catch {
      setMessages(sent);
      setError("The assistant could not respond. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="AI chat"
      className={`flex shrink-0 flex-col border-t border-[var(--stroke)] bg-white lg:sticky lg:top-0 lg:h-screen lg:border-l lg:border-t-0 ${
        open ? "lg:w-72 xl:w-80" : "lg:w-14"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] px-4 py-4">
        {open && (
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-[var(--navy-dark)]">
            <ChatIcon className="h-5 w-5 text-[var(--secondary-purple)]" />
            AI Assistant
          </h2>
        )}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? "Collapse chat" : "Expand chat"}
          title={open ? "Collapse chat" : "Expand chat"}
          className="rounded-full border border-[var(--stroke)] p-2 text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
        >
          {open ? <ChevronRightIcon /> : <ChatIcon />}
        </button>
      </div>

      <div hidden={!open} className="min-h-0 flex-1">
        <div className="flex h-full flex-col">
          <div
            className="flex max-h-[60vh] min-h-48 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 lg:max-h-none"
            aria-live="polite"
          >
            {messages.length === 0 && !loading && (
              <p className="text-sm leading-6 text-[var(--gray-text)]">
                Ask me to add, edit, move or delete cards, or to rename columns.
              </p>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                data-testid={`chat-${message.role}`}
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-6 ${
                  message.role === "user"
                    ? "self-end bg-[var(--secondary-purple)] text-white"
                    : "self-start border border-[var(--stroke)] border-l-[var(--accent-yellow)] border-l-4 bg-[var(--surface)] text-[var(--navy-dark)]"
                }`}
              >
                {message.content}
              </div>
            ))}
            {loading && (
              <p className="self-start text-sm text-[var(--gray-text)]">Thinking...</p>
            )}
            {error && (
              <p role="alert" className="text-sm font-medium text-red-600">
                {error}
              </p>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={handleSubmit}
            className="flex gap-2 border-t border-[var(--stroke)] p-4"
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              aria-label="Chat message"
              maxLength={4000}
              placeholder="Message the assistant"
              className="min-w-0 flex-1 rounded-full border border-[var(--stroke)] px-4 py-2 text-sm text-[var(--navy-dark)] outline-none focus:border-[var(--primary-blue)]"
            />
            <button
              type="submit"
              disabled={loading}
              aria-label="Send"
              title="Send"
              className="flex shrink-0 items-center justify-center rounded-full bg-[var(--secondary-purple)] p-2.5 text-white transition hover:opacity-90 disabled:opacity-50"
            >
              <SendIcon />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
};
