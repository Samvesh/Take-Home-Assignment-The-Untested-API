# Submission Notes

## 1. What I'd test next if I had more time

- **Concurrency edge cases**: What happens if two requests try to complete/update/delete the same task simultaneously? The in-memory store has no locking, so race conditions are possible under load.
- **Input sanitization**: Test for XSS payloads in title/description/assignee. The API returns JSON (not HTML), so it's lower risk, but stored XSS is still a concern if any consumer renders these values in a browser.
- **Large payloads**: What's the request body size limit? Express's default `json()` middleware caps at 100KB, but I didn't test what happens when that limit is hit.
- **Unicode and special characters**: Names like `José`, `O'Brien`, emoji in titles, or RTL text in descriptions. The current code doesn't normalize or restrict these.
- **Performance/load testing**: With thousands of tasks, `getAll()` returns everything. No pagination is enforced by default, and the status filter iterates the full array. This would get slow.
- **E2E with the server actually listening**: My integration tests use Supertest's in-process mode. Testing with a real `app.listen()` would catch issues with port binding, startup order, and environment variables.

## 2. What surprised me in the codebase

- **The `priority: 'medium'` in `completeTask()`** was the most surprising bug. It's clearly a copy-paste from `create()`'s defaults, and it silently corrupts data. I only caught it because I wrote a test that checked every field after completion.
- **The `.includes()` bug in `getByStatus()`** — using `String.prototype.includes()` instead of `===` is an easy mistake that passes a quick manual test (typing `?status=todo` works fine), but breaks with any substring. It's the kind of bug that only shows up through systematic edge-case testing.
- **The pagination off-by-one** — `page * limit` instead of `(page - 1) * limit`. This must have never been tested with real data, because page 1 literally returns nothing for small datasets.
- The codebase already had a `_reset()` helper exposed for testing, which was thoughtful.

## 3. Questions I'd ask before shipping to production

1. **Persistence**: The in-memory store loses all data on restart. Is there a plan for a database (PostgreSQL, MongoDB)? This affects the entire architecture.
2. **Authentication and authorization**: Who can create, update, delete, assign tasks? Is there a user system? Should tasks be scoped per user/team?
3. **Status enum source of truth**: The README says `pending | in-progress | completed`, but the code uses `todo | in_progress | done`. Which is canonical? This needs to be resolved before any frontend or integration work.
4. **Pagination defaults and limits**: Is there a maximum `limit` value? Right now a client can request `?limit=999999` and get the entire store. Should we cap it (e.g., max 100)?
5. **Validation rules**: Should `title` have a max length? What about `description`? Currently there's no limit.
6. **Rate limiting**: No rate limiting exists. A single client could spam the API.
7. **Logging and monitoring**: The only logging is `console.error` in the global error handler. No request logging, no structured logs, no correlation IDs.
8. **API versioning**: Is this v1? If the status enum or task shape changes, how do we handle backwards compatibility?
9. **Concurrency**: In a multi-process (cluster) or multi-instance deployment, the in-memory store is not shared. Tasks created on one instance are invisible to others.

## 4. Design decisions for /assign

### Validation
- **Required, non-empty string**: `assignee` must be a string that's non-empty after trimming. This prevents storing empty or whitespace-only names.
- **Max 100 characters**: 100 is generous for real names (the longest known personal names are around 70 characters) but short enough to prevent abuse. I chose 100 rather than 50 because some cultures have longer naming conventions.
- **Trimming**: Whitespace is trimmed before storage to normalize input. `"  Alice  "` becomes `"Alice"`. This prevents invisible duplicates (e.g., `"Alice"` vs `"Alice "`).
- **Type checking**: Non-string values (numbers, arrays, objects, null) are rejected with 400. This catches common mistakes like sending `{ "assignee": null }` to "unassign" (which isn't supported — that would need a separate endpoint or a deliberate design decision).

### Reassignment behavior
I chose to **allow reassignment** (return 200 with the updated task) rather than returning 409 Conflict. My reasoning:

- Reassignment is a normal workflow action, not an error. Tasks get reassigned all the time.
- Returning 409 would force the client to first check the current assignee, then decide whether to proceed — adding complexity for no real benefit.
- If a team wanted "assign-once" behavior, that would be a business rule enforced at a higher level (e.g., workflow engine), not at the API level.
- The API is idempotent for the same assignee: assigning "Alice" twice returns the same result.

### Where logic lives
- **Validation** in `validators.js` (`validateAssignTask`) — consistent with existing pattern.
- **Business logic** in `taskService.js` (`assignTask`) — just the data mutation.
- **Route handler** in `routes/tasks.js` — thin, does validation → trim → service call → response.
- **Default value**: New tasks have `assignee: null` so the field always appears in the task shape. This prevents consumers from having to check `"assignee" in task` vs `task.assignee === null`.

## 5. Tradeoffs and things I deliberately did not do

- **I only fixed one bug** (the pagination off-by-one), as instructed. The other 5 bugs are documented in BUGS.md with exact root causes and suggested fixes. I chose the pagination bug because it has the highest impact (every paginated request returns wrong data) and the cleanest one-line fix.
- **I didn't add an "unassign" endpoint** (e.g., `DELETE /tasks/:id/assign` or allowing `assignee: null`). The spec didn't ask for it, and adding it would require a design decision about how to represent "no assignee" vs "never assigned".
- **I didn't add input validation for page/limit** (rejecting page=0, negative values, etc.). I documented it as a design concern. The route handler uses `parseInt || defaultValue` which "works" but is loose.
- **I didn't fix the README status values** to match the code. That's a documentation task that should involve the team agreeing on the canonical values first.
- **I didn't add a GET /tasks/:id endpoint**. It's a missing feature, not a bug in existing code.
- **Tests use `test.failing`** for known bugs rather than skipping them. This way the bugs are continuously documented and will automatically start passing when someone fixes them — no manual test maintenance needed.
