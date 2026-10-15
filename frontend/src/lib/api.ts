import type { BoardData, Card } from "@/lib/kanban";

const request = async (method: string, url: string, body?: unknown) => {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: ${response.status}`);
  }
  return response.json();
};

export const getBoard = (): Promise<BoardData> => request("GET", "/api/board");

export const renameColumn = (columnId: string, title: string) =>
  request("PUT", `/api/columns/${columnId}`, { title });

export const createCard = (
  columnId: string,
  title: string,
  details: string
): Promise<Card> =>
  request("POST", "/api/cards", { column_id: columnId, title, details });

export const updateCard = (cardId: string, title: string, details: string) =>
  request("PUT", `/api/cards/${cardId}`, { title, details });

export const deleteCard = (cardId: string) =>
  request("DELETE", `/api/cards/${cardId}`);

export const moveCard = (cardId: string, columnId: string, position: number) =>
  request("POST", `/api/cards/${cardId}/move`, {
    column_id: columnId,
    position,
  });

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const chat = (
  message: string,
  history: ChatMessage[]
): Promise<{ reply: string; board: BoardData | null }> =>
  request("POST", "/api/chat", { message, history });
