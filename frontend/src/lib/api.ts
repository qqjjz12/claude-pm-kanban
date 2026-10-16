import type { BoardData, Card, CardFields, Column } from "@/lib/kanban";

export class ApiError extends Error {
  status: number;
  detail: string;

  constructor(method: string, url: string, status: number, detail: string) {
    super(`${method} ${url} failed: ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

// Board-level routes act on the selected board; the server defaults to the first one.
let activeBoard: number | null = null;

export const setActiveBoard = (id: number | null) => {
  activeBoard = id;
};

const scoped = (url: string) =>
  activeBoard === null ? url : `${url}?board=${activeBoard}`;

// Called when the server says the session is gone (expired or the account was deleted).
let onSessionExpired: (() => void) | null = null;

export const setSessionExpiredHandler = (handler: (() => void) | null) => {
  onSessionExpired = handler;
};

const errorDetail = async (response: Response) => {
  try {
    const { detail } = await response.json();
    return typeof detail === "string" ? detail : "";
  } catch {
    return "";
  }
};

const request = async (method: string, url: string, body?: unknown) => {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const detail = await errorDetail(response);
    // A wrong password is also a 401, so only the session check's message counts.
    if (response.status === 401 && detail === "Not authenticated") {
      onSessionExpired?.();
    }
    throw new ApiError(method, url, response.status, detail);
  }
  return response.json();
};

export type BoardSummary = { id: number; name: string };
export type BoardTemplate = "standard" | "sample" | "empty";

export const listBoards = (): Promise<BoardSummary[]> => request("GET", "/api/boards");

export const createBoard = (
  name: string,
  template: BoardTemplate
): Promise<BoardSummary> => request("POST", "/api/boards", { name, template });

export const renameBoard = (id: number, name: string): Promise<BoardSummary> =>
  request("PUT", `/api/boards/${id}`, { name });

export const deleteBoard = (id: number): Promise<BoardSummary[]> =>
  request("DELETE", `/api/boards/${id}`);

export const exportBoard = (id: number): Promise<unknown> =>
  request("GET", `/api/boards/${id}/export`);

export const getBoard = (): Promise<BoardData> => request("GET", scoped("/api/board"));

export const renameColumn = (columnId: string, title: string) =>
  request("PUT", scoped(`/api/columns/${columnId}`), { title });

export const createColumn = (title: string): Promise<Column> =>
  request("POST", scoped("/api/columns"), { title });

export const deleteColumn = (columnId: string) =>
  request("DELETE", scoped(`/api/columns/${columnId}`));

export const moveColumn = (columnId: string, position: number) =>
  request("POST", scoped(`/api/columns/${columnId}/move`), { position });

const fieldsBody = (fields?: CardFields) =>
  fields && {
    priority: fields.priority,
    due_date: fields.dueDate ?? "",
    labels: fields.labels,
  };

export const createCard = (
  columnId: string,
  title: string,
  details: string,
  fields?: CardFields
): Promise<Card> =>
  request("POST", scoped("/api/cards"), {
    column_id: columnId,
    title,
    details,
    ...fieldsBody(fields),
  });

export const updateCard = (
  cardId: string,
  title: string,
  details: string,
  fields?: CardFields
) =>
  request("PUT", scoped(`/api/cards/${cardId}`), {
    title,
    details,
    ...fieldsBody(fields),
  });

export const deleteCard = (cardId: string) =>
  request("DELETE", scoped(`/api/cards/${cardId}`));

export const moveCard = (cardId: string, columnId: string, position: number) =>
  request("POST", scoped(`/api/cards/${cardId}/move`), {
    column_id: columnId,
    position,
  });

export type Comment = { id: number; author: string; body: string; createdAt: string };
export type ChecklistItem = { id: number; text: string; done: boolean };
export type CardDetail = { comments: Comment[]; checklist: ChecklistItem[] };

export const getCardDetail = (cardId: string): Promise<CardDetail> =>
  request("GET", scoped(`/api/cards/${cardId}/detail`));

export const addComment = (cardId: string, body: string): Promise<CardDetail> =>
  request("POST", scoped(`/api/cards/${cardId}/comments`), { body });

export const deleteComment = (commentId: number): Promise<CardDetail> =>
  request("DELETE", scoped(`/api/comments/${commentId}`));

export const addChecklistItem = (cardId: string, text: string): Promise<CardDetail> =>
  request("POST", scoped(`/api/cards/${cardId}/checklist`), { text });

export const updateChecklistItem = (
  itemId: number,
  changes: { text?: string; done?: boolean }
): Promise<CardDetail> => request("PUT", scoped(`/api/checklist/${itemId}`), changes);

export const deleteChecklistItem = (itemId: number): Promise<CardDetail> =>
  request("DELETE", scoped(`/api/checklist/${itemId}`));

export type ActivityEntry = { id: number; actor: string; message: string; createdAt: string };

export const getActivity = (): Promise<ActivityEntry[]> =>
  request("GET", scoped("/api/activity"));

export type ChatMessage = { role: "user" | "assistant"; content: string };

export const chat = (
  message: string,
  history: ChatMessage[]
): Promise<{ reply: string; board: BoardData | null }> =>
  request("POST", scoped("/api/chat"), { message, history });

export const changePassword = (currentPassword: string, newPassword: string) =>
  request("POST", "/api/me/password", {
    current_password: currentPassword,
    new_password: newPassword,
  });

export const deleteAccount = (password: string) =>
  request("POST", "/api/me/delete", { password });
