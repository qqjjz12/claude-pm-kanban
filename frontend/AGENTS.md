# Frontend

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind 4. Board data is loaded from and saved to the backend API (`src/lib/api.ts`).

## Structure

- `src/app/page.tsx` - renders `<AuthGate />`
- `src/app/layout.tsx`, `globals.css` - layout, fonts, CSS variables for the color scheme
- `src/components/AuthGate.tsx` - checks `/api/me`, shows `LoginForm` (sign in or create account) or `Workspace`; handles login/register/logout
- `src/components/Workspace.tsx` - header (title, `BoardControls`, account button, log out) and the selected board; owns the board list and selection. `BoardControls.tsx` is the board switcher with new/rename/delete; `AccountPanel.tsx` changes the password or deletes the account
- `src/components/LoginForm.tsx` - username/password form with error message
- `src/components/ChatSidebar.tsx` - collapsible right-hand AI chat; messages and loading/error state in React state; sends `{message, history}` via `api.chat` and calls `onBoardUpdate(board)` when the reply includes a board
- `src/components/KanbanBoard.tsx` - client component; renders `ChatSidebar` beside the board and passes `setBoard` to it; loads the board, owns `BoardData` state, dnd-kit `DndContext`, `boardId`, `header` and `notice` props (the header comes from `Workspace`; it is remounted per board with `key`), add/delete column (`NewColumnForm`, delete asks twice when the column has cards). Changes apply optimistically then persist via the API; on failure it reloads the board and shows an error. Column renames save on blur; new cards wait for the server id
- `src/components/KanbanColumn.tsx` - one column; editable title, card list, new card form
- `src/components/KanbanCard.tsx` - sortable card with inline edit and delete
- `src/components/KanbanCardPreview.tsx` - card rendering used in the drag overlay
- `src/components/NewCardForm.tsx` - collapsible add-card form
- `src/components/icons.tsx` - small inline SVG icon set (edit, delete, add, send, chat, logout); icon-only buttons keep an `aria-label`
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`) and `moveCard` (pure reorder logic)
- `src/lib/api.ts` - typed fetch wrappers for the backend routes; `setActiveBoard` appends `?board=<id>` to board-level calls; errors are `ApiError` with `status` and `detail`
- `src/test/fixtures.ts` - `initialData` board used by unit tests

## Data model

`BoardData = { columns: {id, title, cardIds[]}[], cards: Record<id, {id, title, details}> }`. Column order and card order are array order.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/**/*.test.ts(x)`, run with `npm run test:unit`; the board tests mock `@/lib/api`
- E2E (Playwright, chromium): `tests/*.spec.ts`, run with `npm run test:e2e`; runs against the running container at http://localhost:8000 (start it with scripts/start first); `tests/helpers.ts` has a `login` helper. Data persists in the backend, so e2e tests create their own uniquely named cards and delete them afterwards

## Notes

- Test ids: `column-<id>`, `card-<id>`
- Colors come from the project color scheme via CSS variables (`--accent-yellow`, `--primary-blue`, `--navy-dark`, `--gray-text`, etc.)
