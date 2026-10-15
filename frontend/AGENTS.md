# Frontend

Next.js 16 (App Router, static export), React 19, TypeScript, Tailwind 4. Board state lives in React state and resets on reload. Auth only; board data is not yet fetched from the backend.

## Structure

- `src/app/page.tsx` - renders `<AuthGate />`
- `src/app/layout.tsx`, `globals.css` - layout, fonts, CSS variables for the color scheme
- `src/components/AuthGate.tsx` - checks `/api/me`, shows `LoginForm` or the board; handles login/logout
- `src/components/LoginForm.tsx` - username/password form with error message
- `src/components/KanbanBoard.tsx` - client component; owns `BoardData` state, dnd-kit `DndContext`, `onLogout` prop (Log out button), handlers for rename column, add, edit, delete card, drag end
- `src/components/KanbanColumn.tsx` - one column; editable title, card list, new card form
- `src/components/KanbanCard.tsx` - sortable card with inline edit and delete
- `src/components/KanbanCardPreview.tsx` - card rendering used in the drag overlay
- `src/components/NewCardForm.tsx` - collapsible add-card form
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`), `initialData` (5 columns, 8 cards), `moveCard`, `createId`

## Data model

`BoardData = { columns: {id, title, cardIds[]}[], cards: Record<id, {id, title, details}> }`. Column order and card order are array order.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/**/*.test.ts(x)`, run with `npm run test:unit`
- E2E (Playwright, chromium): `tests/*.spec.ts`, run with `npm run test:e2e`; runs against the running container at http://localhost:8000 (start it with scripts/start first); `tests/helpers.ts` has a `login` helper

## Notes

- Test ids: `column-<id>`, `card-<id>`
- Colors come from the project color scheme via CSS variables (`--accent-yellow`, `--primary-blue`, `--navy-dark`, `--gray-text`, etc.)
