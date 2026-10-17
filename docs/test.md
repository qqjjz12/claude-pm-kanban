# Tests

## How to run

| Suite | Command | Notes |
| --- | --- | --- |
| Backend (pytest) | `cd backend && uv run pytest` | Temp database per test. Live AI tests are skipped without the key; run them with `uv run --env-file ../.env pytest` |
| Frontend unit (Vitest) | `cd frontend && npm run test:unit` | jsdom; the API module or `fetch` is mocked |
| End to end (Playwright) | `cd frontend && npm run test:e2e` | Needs the container running (`scripts/start`), at http://localhost:8000 |

Counts: backend 196 passing plus 2 live tests skipped without the key, frontend unit 150, end to end 35.

Coverage (last measured): backend source files 100% (`uv run pytest --cov=.`); frontend about 95% (`npx vitest run --coverage`), the remainder being the drag-and-drop handlers, which the end to end tests exercise.

The end to end tests register a new account per test and leave it behind in the container's database. To keep your own data clean, run them against a throwaway volume: `docker run -d --name pm-app -p 127.0.0.1:8000:8000 --env-file .env -v pm-test:/data pm-app`, then `docker volume rm pm-test` afterwards.

## Backend (pytest) - `backend/tests/`

### test_main.py

| Test | What it checks |
| --- | --- |
| test_hello | `GET /api/hello` returns 200 and the expected JSON message |

### test_auth.py

| Test | What it checks |
| --- | --- |
| test_login_success_sets_cookie | Logging in as the demo user returns 200 and sets an httpOnly session cookie |
| test_login_wrong_password / test_login_unknown_user | Bad credentials return 401 and no cookie |
| test_login_username_is_case_insensitive_and_session_uses_stored_name | `USER` logs in as `user` |
| test_me_without_cookie / test_me_with_cookie / test_logout_clears_session | Session lifecycle |
| test_tampered_cookie_rejected / test_signature_of_one_user_does_not_work_for_another | Cookie signing |
| test_valid_signature_for_unknown_user_rejected | A correctly signed cookie for a nonexistent user is 401 |
| test_every_data_route_requires_login | All data routes return 401 anonymously |
| test_register_creates_account_and_signs_in / test_register_then_login_from_new_client | Registration works and the account can log in |
| test_register_duplicate_username_ignoring_case / test_register_validates_input / test_register_trims_username | Username and password rules |
| test_passwords_are_hashed_not_stored / test_same_password_gets_different_hashes / test_verify_password_handles_garbage | scrypt hashing with salt; malformed hashes never verify |
| test_change_password (3 tests) | Change works, needs the current password, enforces the minimum length |
| test_delete_account_* / test_deleted_users_stale_cookie_does_not_recreate_account | Account deletion needs the password, removes boards, and invalidates the old cookie |

### test_boards.py

| Test | What it checks |
| --- | --- |
| test_new_account_lists_one_sample_board / test_list_boards_in_creation_order | Board listing |
| test_create_board_defaults_to_standard_template / test_create_board_templates / test_create_board_rejects_bad_input | Templates (`standard`, `sample`, `empty`) and validation |
| test_board_without_param_is_first_board / test_changes_apply_to_the_selected_board_only / test_card_from_another_board_is_not_found_via_this_board | `?board=` selects the board; cards cannot cross boards |
| test_rename_board / test_delete_board / test_delete_board_removes_its_columns_and_cards / test_cannot_delete_only_board | Board rename and delete rules |
| test_unknown_board_is_404 / test_other_users_boards_are_invisible_and_untouchable | Ownership checks |
| test_chat_targets_selected_board | The AI sees the selected board |

### test_columns.py

| Test | What it checks |
| --- | --- |
| test_create_column_* / test_new_column_accepts_cards | Add a column, validation, cards can be added to it |
| test_delete_column_removes_cards_and_keeps_order_contiguous / test_delete_unknown_column_is_404 | Delete cascades and positions stay contiguous |
| test_move_column* | Reorder, clamping, cards preserved |
| test_cannot_touch_other_users_columns | Ownership |

### test_card_fields.py

| Test | What it checks |
| --- | --- |
| test_new_card_has_defaults / test_create_card_with_fields | priority `none`, no due date, no labels by default; fields round-trip |
| test_create_card_rejects_invalid_fields | Bad priority, impossible or badly formatted dates, too many / blank / long labels, wrong types are 422 |
| test_labels_are_trimmed_and_deduplicated_ignoring_case / test_ten_labels_are_allowed | Label normalisation and limit |
| test_update_* | Update sets fields, omitted fields are kept, `""` / `[]` / `none` clear them, invalid values are 422 |
| test_move_keeps_fields | Moving a card does not lose its fields |
| test_ai_* | The AI can set fields on create and edit, edits change only given fields, can clear a due date, invalid values are skipped and reported |

### test_card_details.py

| Test | What it checks |
| --- | --- |
| test_new_card_has_empty_detail / test_add_comment_records_author_and_returns_detail / test_comments_are_ordered_oldest_first | Comments, author, timestamps, ordering, board summary counts |
| test_comment_validation / test_checklist_validation | Blank and over-long input is 422 |
| test_delete_comment / test_checklist_lifecycle / test_checklist_positions_stay_contiguous_after_delete | Checklist add, tick, rename, remove; comment delete |
| test_deleting_a_card_* / test_deleting_a_board_* | Cascade deletes |
| test_unknown_ids_are_404 / test_other_users_* / test_item_from_another_board_* / test_requires_login | Ownership and auth |

### test_activity.py

| Test | What it checks |
| --- | --- |
| test_create_edit_delete_card_are_logged_newest_first / test_column_changes_are_logged / test_comments_are_logged | The messages written for each kind of change |
| test_move_between_columns_is_logged_but_reorder_is_not | Only cross-column moves are logged |
| test_entries_record_actor_and_timestamp / test_failed_requests_log_nothing | Entry shape; rejected requests leave no trace |
| test_limit / test_log_is_capped_per_board | Query limit validation; old entries are pruned |
| test_activity_is_scoped_to_the_board / test_activity_is_private_to_the_owner / test_requires_login / test_deleting_a_board_deletes_its_activity | Scoping, privacy, auth, cascade |
| test_ai_changes_are_attributed_to_the_assistant / test_user_actions_after_ai_are_attributed_to_the_user | Actor is `AI assistant` only for chat operations |

### test_security.py

| Test | What it checks |
| --- | --- |
| test_session_cookie_has_expiry_and_flags / test_secure_flag_follows_configuration | httpOnly, SameSite=Lax, Max-Age, optional Secure |
| test_expired_session_is_rejected / test_unexpired_session_is_accepted / test_session_stops_working_when_time_passes | Session expiry |
| test_expiry_cannot_be_extended_without_the_secret | Changing the expiry invalidates the signature |
| test_malformed_session_values_are_401_not_errors / test_non_ascii_session_values_are_rejected_without_error / test_username_with_a_pipe_cannot_forge_another_user | Garbage cookies never cause a 500 or impersonation |
| test_login_is_blocked_after_too_many_failures_even_with_the_right_password and the throttle tests that follow | 5 failures in 5 minutes give 429 with Retry-After; per username (ignoring case) and per client; success resets; the window expires; password change and account deletion are throttled and share the counter |
| test_oversized_* | Login and password fields over 200 characters are 422 and never hashed |
| test_default_secret_warning | A warning is logged when `PM_SECRET` is unset |

### test_export.py

| Test | What it checks |
| --- | --- |
| test_export_contains_the_whole_sample_board / test_export_includes_fields_checklists_and_comments_in_order | Every card field, checklist and comments are exported, in order, without internal ids |
| test_export_follows_column_and_card_order / test_export_of_an_empty_board | Ordering and empty boards |
| test_export_unknown_board_is_404 / test_cannot_export_another_users_board / test_export_requires_login | Ownership and auth |

### test_concurrency.py

| Test | What it checks |
| --- | --- |
| test_concurrent_card_creates_keep_positions_contiguous | 36 overlapping creates in one column still give positions 0..n-1 (this failed with duplicate positions before `@writes` was added) |
| test_concurrent_column_moves_end_with_a_valid_order / test_concurrent_card_moves_and_deletes_keep_every_column_contiguous | Overlapping moves and deletes leave every parent contiguous |

### test_migration.py

| Test | What it checks |
| --- | --- |
| test_old_database_is_upgraded_in_place | A pre-accounts database keeps its data, gains password support and allows several boards per user |
| test_init_db_is_idempotent_and_keeps_changed_demo_password | Restarting does not reset a changed demo password |

### test_integration.py

| Test | What it checks |
| --- | --- |
| test_full_user_journey | Register, create board, cards, columns, move, logout/login, change password |
| test_two_users_never_see_each_other | Cross-account isolation including chat |
| test_deleting_an_account_does_not_affect_others | Account deletion is scoped |

### test_board.py

Database and seeding:

| Test | What it checks |
| --- | --- |
| test_db_created_when_missing | The database file and tables are created when the file does not exist |
| test_seeded_board | The first board request returns the seeded board of 5 columns |
| test_seed_is_idempotent | Repeated requests do not seed twice (one board, five columns in the database) |
| test_restart_keeps_data | Data saved before an app restart is still there with a fresh app instance |

Authentication:

| Test | What it checks |
| --- | --- |
| test_routes_require_auth | Every board route returns 401 without a cookie |

Columns and cards:

| Test | What it checks |
| --- | --- |
| test_rename_column | Renaming a column is saved and returned |
| test_rename_unknown_column | Renaming an unknown column returns 404 |
| test_create_card | Creating a card returns 201 and persists it at the end of the column |
| test_create_card_default_details | A card created without details gets an empty string |
| test_create_card_unknown_column | Creating a card in an unknown column returns 404 |
| test_update_card | Editing title and details is saved |
| test_update_unknown_card | Editing an unknown card returns 404 |
| test_delete_card | Deleting removes the card and keeps positions contiguous |
| test_delete_unknown_card | Deleting an unknown card returns 404 |
| test_move_within_column | Moving inside a column reorders it with contiguous positions |
| test_move_to_other_column | Moving to another column updates both columns, persisted |
| test_move_clamps_position | A position beyond the end is clamped to the end of the column |
| test_move_unknown_ids | An unknown card or column in a move returns 404 |

User isolation:

| Test | What it checks |
| --- | --- |
| test_users_have_separate_boards | Two users get different boards with no shared ids |
| test_cannot_modify_other_users_board | A second user gets 404 on every attempt to read or change the first user's columns and cards |

Validation and robustness:

| Test | What it checks |
| --- | --- |
| test_changes_are_committed_before_the_response_is_sent | Calls the app directly and reads the database when the response starts; the change is already committed |
| test_blank_titles_rejected | Empty or whitespace-only column and card titles return 422 and change nothing |
| test_titles_are_trimmed_and_length_limited | Titles are trimmed; titles over 200 and details over 5000 characters return 422 |
| test_non_ascii_digit_in_id_is_not_found | Ids such as `card-²` return 404 instead of a server error |

### test_ai.py

The model is mocked, so these run without the network.

Request sent to the model:

| Test | What it checks |
| --- | --- |
| test_request_has_board_history_and_question | The model call uses `openai/gpt-oss-120b` and the structured output schema, with the board JSON in the system prompt, then the history, then the new question |
| test_board_in_prompt_is_current | A rename made just before the chat shows up in the prompt's board |

Applying operations:

| Test | What it checks |
| --- | --- |
| test_reply_only_leaves_board_unchanged | No operations returns the reply with `board: null` and no change |
| test_create_card | A create operation adds the card; the response board matches the database |
| test_edit_card | An edit operation updates title and details |
| test_move_card | A move operation puts the card at the given column and position |
| test_move_card_without_position_goes_to_end | A move without a position places the card at the end |
| test_delete_card | A delete operation removes the card |
| test_rename_column | A rename operation changes the column title |
| test_create_column / test_delete_column_removes_its_cards / test_move_column | Column operations are applied |
| test_column_operations_missing_fields_are_reported / test_column_operations_on_unknown_column_are_reported | Invalid column operations are skipped and reported |
| test_multiple_operations_in_one_response | Several operations of different types in one reply are all applied |

Invalid operations:

| Test | What it checks |
| --- | --- |
| test_unknown_ids_are_skipped_and_reported | Operations with unknown ids are skipped, valid ones still apply, and the reply says what could not be applied |
| test_missing_fields_are_skipped | An operation missing a required field is skipped and reported, and nothing changes |
| test_other_users_ids_are_rejected | Ids from another user's board cannot be changed through the AI |

Validation and limits:

| Test | What it checks |
| --- | --- |
| test_blank_title_operations_are_skipped_and_reported | Create, rename and edit operations with a blank title are skipped, reported, and change nothing |
| test_ai_titles_are_trimmed | A title from the model is trimmed before saving |
| test_missing_api_key_returns_502 | A missing `OPENROUTER_API_KEY` returns 502 with a clear message |
| test_client_has_a_timeout | The OpenRouter client is built with the configured timeout |
| test_oversized_chat_requests_rejected | A message over 4000 characters, more than 20 history messages, or a history message over 10000 characters returns 422 |

Failures and validation:

| Test | What it checks |
| --- | --- |
| test_malformed_model_output_returns_502 | Output that fails schema validation returns 502 with a clear message |
| test_empty_parsed_response_returns_502 | A response with no structured output returns 502 |
| test_provider_error_returns_502 | A provider error (OpenAI SDK exception) returns 502 |
| test_invalid_output_is_retried_once | Invalid output on the first try is retried once and the second answer is used |
| test_chat_requires_auth | `/api/chat` returns 401 without a cookie |
| test_invalid_history_role_rejected | A history message with a role other than user or assistant returns 422 |

Live (skipped when `OPENROUTER_API_KEY` is not set):

| Test | What it checks |
| --- | --- |
| test_live_question_changes_nothing | A real call answering "What is 2+2?" contains 4 and leaves the board unchanged |
| test_live_add_card | A real call asked to add a card to Review returns a changed board with the new card |

## Frontend unit (Vitest) - `frontend/src/`

### lib/kanban.test.ts (pure reorder logic)

| Test | What it checks |
| --- | --- |
| reorders cards in the same column | Dropping a card onto another card in the same column swaps their order |
| moves cards to another column | Dropping onto a card in another column inserts it there |
| drops cards to the end of a column | Dropping onto a column itself appends the card |
| returns columns unchanged for unknown ids | Unknown ids return the same columns object |
| returns columns unchanged when dropped on itself | Dropping a card on itself changes nothing |
| moves to an empty column | A card can be dropped into an empty column |
| moves to the end of the same column when dropped on it | Dropping a card on its own column moves it to the end |

### lib/api.test.ts (fetch wrappers, `fetch` mocked)

| Test | What it checks |
| --- | --- |
| getBoard fetches the board | `GET /api/board` and the returned data |
| renameColumn | `PUT /api/columns/{id}` with the title |
| createCard sends snake_case column_id and returns the card | `POST /api/cards` body uses `column_id`; the new card is returned |
| updateCard | `PUT /api/cards/{id}` with title and details |
| deleteCard | `DELETE /api/cards/{id}` |
| moveCard | `POST /api/cards/{id}/move` with column and position |
| throws on a failed response | A non-OK response raises an error |

### lib/kanban.test.ts (card field helpers)

`parseLabels`, `today`, `isOverdue`, `formatDueDate`, `matchesFilters` (search over title/details/labels, priority, exact label, overdue, combined), `allLabels`, `boardStats`. KanbanBoard tests cover the filter bar: summary, hiding, counts, clearing, editing a filtered card, and the label filter (disabled with an explanation when no card has labels, a selected label stays listed after its last card loses it). KanbanBoard tests also cover adding a card with fields, badges and editing/clearing fields.

### lib/download.test.ts

`fileSlug` produces safe file names; `downloadJson` creates, clicks and releases a temporary link. Workspace tests cover the export button and its error; KanbanBoard tests cover the column move buttons.

### components/Forms.test.tsx

New card and new column forms (cancel, reset, blank), drag preview, blank title edit is not saved.

### components/Dashboard.test.tsx / components/ActivityPanel.test.tsx

Dashboard tiles, per-column and priority bars, attention list, labels, checklist percentage, empty board. Activity list, empty state, error, unparseable timestamp. `dashboardStats` is covered in `lib/kanban.test.ts` (empty board, counts, overdue vs due within a week). KanbanBoard tests cover switching views and keeping filters.

### components/CardDetailModal.test.tsx (`@/lib/api` mocked)

Load and error, checklist add/toggle/remove with progress, comments add/delete, blank input, failure keeps text, text typed during a save is kept, close via button/Escape/backdrop. KanbanBoard tests cover opening the dialog and the badges.

### components/Workspace.test.tsx (`@/lib/api` mocked, board mocked)

Loading and retry, switching boards, create (with template) / rename / delete with confirmation and error handling, blank names ignored, delete disabled for the last board, username and log out, account panel toggle.

### components/AccountPanel.test.tsx (`@/lib/api` partly mocked)

Change password success and error messages, delete account needs the password, wrong password keeps the session, cancel.

### components/AuthGate.test.tsx (`fetch` mocked, workspace mocked; includes registration: success, mismatch, taken, validation message, offline)

| Test | What it checks |
| --- | --- |
| shows the login form when not authenticated | A 401 from `/api/me` shows the Sign in form and hides the board |
| shows the board when already authenticated | A 200 from `/api/me` shows the board |
| shows an error on bad credentials | A failed login shows an invalid credentials message |
| logs in and logs out | Logging in shows the board, logging out returns to the form |
| shows the login form when the server cannot be reached | A rejected `/api/me` request shows the Sign in form instead of a blank page |
| shows an error when login cannot reach the server | A rejected login request shows the error message |

### components/KanbanBoard.test.tsx (`@/lib/api` mocked)

| Test | What it checks |
| --- | --- |
| shows a loading state, then five columns from the API | Loading text first, then 5 columns; the board is fetched once |
| shows an error with retry when the board cannot load | A load failure shows an alert; Retry loads the board |
| calls onLogout from the log out button | The Log out button calls the prop |
| renames a column and saves on blur | Typing updates the input, the API is called only on blur |
| adds a card through the API | The add form calls `createCard` and shows the returned card |
| does not add a card with an empty title | A blank title adds nothing and makes no API call |
| deletes a card through the API | Remove removes the card and calls `deleteCard` |
| edits a card through the API | Edit then Save shows the new title and calls `updateCard` |
| cancels a card edit without calling the API | Cancel restores the card and makes no API call |
| reloads the board and shows an error when saving fails | A failed save shows an error and refetches the board, restoring the card |

### components/ChatSidebar.test.tsx (`@/lib/api` mocked)

| Test | What it checks |
| --- | --- |
| sends the message with history and shows the reply | The message and history go to `chat`; both messages show; the input clears; a second send includes the earlier exchange |
| shows a loading indicator while waiting | "Thinking..." shows and Send is disabled until the reply arrives |
| ignores an empty message | A blank message does not call the API |
| shows an error when the request fails | A failed request shows an error alert and keeps the user's message |
| passes an updated board to the parent | A reply with a board calls `onBoardUpdate` with it |
| sends only the most recent messages as history | After 12 exchanges, the request carries only the last 20 messages |
| collapses and expands | The collapse and expand buttons hide and show the chat |
| KanbanBoard with chat: refreshes the board when the chat returns one | In the full board, a chat reply with a changed board updates the columns without refetching |
| KanbanBoard with chat: opens the card editor with the values the chat just set | After the chat renames a card, Edit shows the new title, not the old one |

## End to end (Playwright) - `frontend/tests/`

Run against the container with the real backend. Tests that change data create uniquely named cards and clean up afterwards.

### card-fields.spec.ts

Priority, due date (overdue badge) and labels persist across reload; edit and clear them.

### accounts.spec.ts (hardening)

Five wrong passwords lock sign in with a clear message; an expired session returns to sign in with a notice.

### columns-export.spec.ts

Columns are reordered with the arrow buttons and the order persists; a board downloads as a JSON file with the expected contents.

Specs that reload the page use `reloadSettled` (waits for background saves) so they do not race the optimistic UI.

### dashboard-activity.spec.ts

Activity log shows created/deleted entries with the user's name; the dashboard shows totals, overdue list and labels, and the board returns.

### card-details.spec.ts

Checklist and comments persist, show as card badges, and can be removed; deleting a card removes its details.

### filters.spec.ts

Search, priority and label filters narrow the board, summary text updates, clear filters, reload resets; the label filter explains why it is disabled until a card has a label.

### accounts.spec.ts

Register and log back in; mismatched passwords and a taken username; change password; delete account.

### boards.spec.ts

Create, switch, rename and delete boards (cards stay on their board); new board columns survive reload; add and delete columns with confirmation; users cannot see each other's boards.

### auth.spec.ts

| Test | What it checks |
| --- | --- |
| unauthenticated visit shows the login form | A fresh visit shows the login form |
| bad credentials show an error | Wrong credentials show an error and no board |
| login shows the board and reload stays logged in | Good credentials show the board; reloading keeps the session |
| logout returns to the login form | Log out shows the login form again |

### kanban.spec.ts

| Test | What it checks |
| --- | --- |
| loads the kanban board | Heading and 5 columns are visible |
| a new card persists across reload | An added card is still there after reload |
| a deleted card stays deleted after reload | A removed card is gone after reload |
| an edited card persists across reload | An edited title is kept after reload |
| a renamed column persists across reload | A renamed column keeps its name after reload; the original name is always restored, even if the test fails |
| a moved card stays in its new column after reload | A card dragged to another column stays there after reload |
| long unbroken text stays inside the card | A 200 character word without spaces wraps inside the card instead of overflowing |

### chat.spec.ts (the `/api/chat` endpoint is mocked by route interception)

| Test | What it checks |
| --- | --- |
| chat shows the reply and updates the board without reload | The reply is shown and a board change from the response appears without a reload |
| chat shows an error when the endpoint fails | A 502 from the chat endpoint shows an error message |
| chat sidebar collapses | The sidebar can be hidden and shown again |
