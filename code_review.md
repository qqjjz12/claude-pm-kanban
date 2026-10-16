# Code review

Scope: all backend (`backend/*.py`, tests config), frontend components and libs, Dockerfile, scripts, docs. Date: 2026-10-15.

Baseline: backend 50/50, frontend unit 35/35, e2e 14/14, `npm run lint` clean. Frontend line coverage 84%.

Items marked **Verified** were reproduced during the review. The rest come from reading the code and are marked as such.

## Status of high and medium items (2026-10-16)

All nine are addressed and retested. After the changes: backend 57 passed plus 2 live tests (59 passed with the key), frontend unit 39 passed, e2e 14 passed against a rebuilt container, lint clean.

| Item | Resolution |
| --- | --- |
| 1 Stale edit form | Edit now resets the form from the current card. Test added (chat renames a card, Edit shows the new title). |
| 2 Commit after response | The connection dependency uses `scope="function"`, so the commit happens before the response is sent. A test that reads the database when the response starts fails without the change. |
| 3 Exposure | Scripts publish `127.0.0.1:8000` only (checked with `docker port`). The default secret is unchanged: a random per-start secret would log the user out on every restart, so that stays a decision for the user. |
| 4 Blank titles | Titles are trimmed, 1-200 characters; details up to 5000. Applies to the REST routes (422) and to AI operations (skipped and reported). |
| 5 Unicode digit ids | `parse_id` accepts ASCII digits only. |
| 6 AuthGate network errors | Rejected `/api/me`, login and logout requests are handled. |
| 7 AI timeout and key | 60 second timeout, one retry, missing key returns 502 with a clear message. The client is still built per request (cheap, and keeps the key lookup testable). |
| 8 Unbounded chat | Message 4000 characters, history 20 messages of up to 10000 characters each; the frontend sends only the last 20 and limits the input. |
| 9 E2E data safety | The rename test always restores the original title (`try/finally`). Running e2e on a separate container and volume was not done. |

Items 10-17 are unchanged.

## Summary

The code is small, consistent and matches the plan. User scoping is applied on every query, ids are parsed strictly, and secrets are not committed (`.env` is ignored and never appears in git history). The issues below are mostly input validation, one UI bug caused by the AI feature, and a few hardening items. No critical issues.

## High priority

### 1. Card edit form shows stale values after the AI (or a reload) changes the card -- Verified
`frontend/src/components/KanbanCard.tsx:19-21` initialises `title` and `details` from props with `useState` and never resyncs. Only Cancel resets them. The card component stays mounted (stable `key`), so after the AI renames a card, clicking Edit shows the old title, and Save writes it back, silently undoing the AI's change.

Evidence: a throwaway test rendering `KanbanBoard`, having the mocked chat return a board where `card-1` is "AI renamed", then clicking Edit showed the input value "Align roadmap themes".

Action: in the Edit button handler, set `title` and `details` from `card` before `setIsEditing(true)`. Add a unit test (chat updates a card, then Edit shows the new title).

### 2. Writes are committed after the response is sent -- Verified
`backend/board.py:get_conn` commits after `yield`. With the installed FastAPI (0.143.2), that exit code runs after the response is sent. Evidence: a dependency whose teardown sleeps 1.5s still returned the response in 0.2s. Consequences: a client can receive 200 and immediately reload before the commit lands, and a failed commit (for example a locked database) is never reported to the client.

Action: commit inside the route path instead. Simplest: have each mutating `db.py` function (or the route) call `conn.commit()` before returning, and keep the dependency only for close and rollback. Or use `Depends(get_conn, scope="function")` if the installed version supports it; check the FastAPI docs first. Add a test that fails if the commit is missing at response time.

### 3. Server binds to all interfaces with a forgeable session secret
`scripts/start.sh` and `scripts/start.ps1` publish `-p 8000:8000`, so anyone on the local network can reach the app and log in with `user` / `password`. The session cookie secret defaults to the public `dev-secret` (`backend/auth.py:11`) and the scripts never set `PM_SECRET`, so cookies can also be forged without the password.

Action: publish on loopback only (`-p 127.0.0.1:8000:8000`) in both script pairs. Optionally generate a random `PM_SECRET` per container start (`-e PM_SECRET=...`), which logs everyone out on restart; decide whether that is acceptable.

## Medium priority

### 4. Empty and whitespace-only titles are accepted by the API and by the AI -- Verified
`PUT /api/columns/col-1` with `{"title": ""}` returns 200, and `POST /api/cards` with `"   "` returns 201. The UI trims and blocks blank card titles, but the REST routes and the AI path (`ai.py` create/edit/rename) do not.

Action: validate titles in the request models, for example `Field(min_length=1)` with whitespace stripping (`StringConstraints(strip_whitespace=True, min_length=1)`), and apply the same check to AI operations. Optionally cap lengths (title and details) to bound database and prompt size. Add backend tests for each.

### 5. A non-ASCII digit in an id causes a 500 -- Verified
`db.parse_id` uses `str.isdigit()`, which is true for characters such as the superscript two, but `int()` then raises `ValueError`. `DELETE /api/cards/card-%C2%B2` returns 500 instead of 404. (The AI path is unaffected because it catches `ValueError`.)

Action: use `number.isascii() and number.isdigit()` (or `isdecimal()` plus `isascii()`). Add a test with `card-²` expecting 404.

### 6. `AuthGate` has no network error handling
`frontend/src/components/AuthGate.tsx:12-16`: the `/api/me` fetch has no `.catch`. If the server is unreachable the page stays blank (the loading state renders `null`) with an unhandled rejection. `handleLogin` and `handleLogout` also throw on network errors, and the login form would never show an error.

Action: treat a rejected `/api/me` as anonymous or show an error with retry; make `handleLogin` return false on a network error. Add tests.

### 7. Chat request has no timeout, and the missing API key is an unhandled 500
`backend/ai.py:get_client` uses the OpenAI client defaults (long timeout, automatic retries), so a stalled provider holds a worker thread and leaves the UI on "Thinking..." for a very long time. If `OPENROUTER_API_KEY` is not set, `os.environ[...]` raises `KeyError`, which `chat` does not catch (500 with no useful message). The client is also rebuilt on every call.

Action: set an explicit `timeout` (for example 60s) and `max_retries`; create the client once (lazily); turn a missing key into a clear 502/503 message. Add a test for the missing-key case.

### 8. Chat history and message size are unbounded
`ChatRequest` accepts any number and size of messages, and the frontend sends the entire conversation each time. Cost and latency grow without limit and a large request could exceed the model context.

Action: cap `message` length and the number of history messages in `ChatRequest` (for example the most recent 20), and trim on the frontend as well.

### 9. E2E tests run against the real data volume
Playwright runs against the running container, which uses the same `pm-data` volume as normal use. Tests clean up after themselves, but the rename test (`frontend/tests/kanban.spec.ts`, "a renamed column persists across reload") restores the original title only at the end; a failure in between leaves the user's board renamed.

Action: use `try/finally` for the restore in that test, or run e2e against a separate container and volume (`pm-test`, another port) via an env var for the base URL. Document it in `docs/test.md`.

## Low priority

### 10. Dockerfile and runtime hardening (from reading, not run)
- The final image runs as root. Add a non-root user and make `/data` writable by it.
- `ghcr.io/astral-sh/uv:latest` is unpinned, so builds are not reproducible. Pin a version.
- `CMD ["uv", "run", "--no-dev", ...]` re-checks the environment at startup. Add `--frozen` (or call `.venv/bin/uvicorn` directly) so startup never tries to resolve or install.
- `COPY backend/ ./` also copies `tests/` into the image; add `backend/tests` to `.dockerignore`.

### 11. Session cookie never expires
`auth.py:sign` is deterministic per user and the cookie has no max-age or expiry, so a captured cookie is valid forever (until `PM_SECRET` changes). Acceptable for the local MVP; revisit with real accounts. Also `login` compares credentials with `!=` rather than `hmac.compare_digest` (irrelevant for a hardcoded local login, but trivial to fix).

### 12. Frontend loses the typed chat text on failure
`ChatSidebar.tsx:34` clears the input before the request. If the request fails, the user must retype. Restore the text on error.

### 13. Column rename saves on every blur
`KanbanColumn.tsx` calls `onRenameCommit` on blur even when the title did not change, and also for an empty value (see item 4). Skip the call when unchanged, and revert to the previous title if the new one is empty.

### 14. Rapid successive moves can arrive out of order
Each drag fires its own `POST /api/cards/{id}/move` and the server handles them concurrently. Two quick moves of the same card could be applied in the reverse order and leave the server out of sync with the screen until the next reload (not reproduced). Fix only if it shows up: serialise persist calls in `KanbanBoard`.

### 15. Chat operations are applied to a snapshot taken before the model call
`ai.py` reads the board, waits for the model, then applies operations by id and absolute position. Edits the user makes in that window may be overwritten (for example `edit_card` replaces both fields). The window is a few seconds on a single-user app; note it rather than fix it.

### 16. First-request race in `ensure_board`
Two simultaneous first requests for a new user can both try to insert a board; the loser hits the unique constraint and returns 500. Not reachable with the single hardcoded user today. Handle it (`INSERT OR IGNORE` plus re-select) when real accounts are added.

### 17. Housekeeping
- `npx tsc --noEmit` reports 137 errors, all in test files, because vitest globals (`it`, `expect`, `vi`) are not typed for the root `tsconfig.json`. `next build` and lint pass, but editors and any future CI type-check will fail. Add `"types": ["vitest/globals"]` (or the existing `src/test/vitest.d.ts` to `include`).
- `GET /api/hello` and `test_main.py` are leftovers from Part 2 scaffolding. Remove both, or keep and say why.
- `KanbanBoard.tsx` has an initial-load `useEffect` that duplicates `load`; reuse `load` and keep the error message in one place. The outer wrapper div around the board is also not indented like the rest of the file.
- `KanbanCardPreview.tsx` has 7.7% coverage (drag overlay only). Acceptable; the e2e drag test covers it.
- Dragging inside an open edit form: the sortable listeners are on the whole `<article>`, so a text-selection drag in the title input may start a card drag after 6px. Not tested; check manually.

## Not issues (checked)

- Authorization: every `db.py` mutation resolves ids through the user's `board_id`; the isolation tests cover read and write attempts.
- SQL: all queries are parameterised; no string-built SQL.
- Secrets: `.env` is in `.gitignore` and `.dockerignore` and was never committed.
- `scripts/start.ps1` works when run directly (an earlier note in this session that it failed was caused by redirecting stderr with `2>&1` in the tool call, not by the script).
- N+1 queries in `fetch_board` (one query per column) are fine at this scale.

## Suggested order of work

1. Items 1, 2, 3 (user-visible bug, data integrity, exposure).
2. Items 4, 5, 6, 7 (validation and error handling), each with tests.
3. Items 8, 9.
4. Low-priority items as time allows; item 17 is quick.
