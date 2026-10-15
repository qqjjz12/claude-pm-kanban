# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4. Currently a standalone demo: board state lives in React state and resets on reload. No backend calls, no auth.

## Structure

- `src/app/page.tsx` - renders `<KanbanBoard />`
- `src/app/layout.tsx`, `globals.css` - layout, fonts, CSS variables for the color scheme
- `src/components/KanbanBoard.tsx` - client component; owns `BoardData` state, dnd-kit `DndContext`, handlers for rename column, add card, delete card, drag end
- `src/components/KanbanColumn.tsx` - one column; editable title, card list, new card form
- `src/components/KanbanCard.tsx` - sortable card with delete button
- `src/components/KanbanCardPreview.tsx` - card rendering used in the drag overlay
- `src/components/NewCardForm.tsx` - collapsible add-card form
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`), `initialData` (5 columns, 8 cards), `moveCard`, `createId`

## Data model

`BoardData = { columns: {id, title, cardIds[]}[], cards: Record<id, {id, title, details}> }`. Column order and card order are array order.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/**/*.test.ts(x)`, run with `npm run test:unit`
- E2E (Playwright, chromium): `tests/*.spec.ts`, run with `npm run test:e2e`; config starts `next dev` on port 3000

## Notes

- Test ids: `column-<id>`, `card-<id>`
- Card editing (title/details) is not yet implemented in the UI; only add and delete exist
- Colors come from the project color scheme via CSS variables (`--accent-yellow`, `--primary-blue`, `--navy-dark`, `--gray-text`, etc.)
