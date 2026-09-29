# Bug Report

> **Note on `test.failing`:**
> Tests marked `test.failing` assert the CORRECT behavior and currently fail on purpose.
> They document known unfixed bugs. When a bug is fixed, convert its `test.failing` to a normal test.

Bugs discovered through automated testing of the Task Manager API.
Each bug is backed by at least one `test.failing` test in the test suite.

---

## Bug 1: Pagination Off-by-One Error — ✅ FIXED

- **Title:** Pagination skips the first page of results
- **Location:** `src/services/taskService.js` → `getPaginated()` → line 12
- **Expected behavior:** `GET /tasks?page=1&limit=10` should return the first 10 tasks (offset 0).
- **Actual behavior:** Page 1 returns tasks starting at offset `limit` (e.g., offset 10), effectively skipping the entire first page. Page 0 (which shouldn't be valid) accidentally returns the correct first page.
- **How discovered:** Unit test `"page 1 returns the first page of results"` and integration test `"pagination page 1 returns the first page"` — both marked `test.failing`.
- **Root cause:** The offset formula is `page * limit` instead of `(page - 1) * limit`. For page=1 and limit=10: `1 * 10 = 10` (wrong), should be `(1 - 1) * 10 = 0`.
  ```js
  // CURRENT (buggy)
  const offset = page * limit;
  // CORRECT
  const offset = (page - 1) * limit;
  ```
- **Suggested fix:** Change line 12 to `const offset = (page - 1) * limit;`
- **Severity:** 🔴 **High** — Every paginated API consumer gets the wrong data. Page 1 returns nothing for small datasets.
- **Status:** ✅ **FIXED** — Changed `page * limit` to `(page - 1) * limit` in `taskService.js` line 12. Updated pagination tests (both unit and integration) to verify correct behavior. See commit `fix: pagination off-by-one`.

---

## Bug 2: Status Filter Uses Substring Matching

- **Title:** `getByStatus()` uses `.includes()` instead of strict equality
- **Location:** `src/services/taskService.js` → `getByStatus()` → line 9
- **Expected behavior:** `GET /tasks?status=do` should return no results (there is no status value `"do"`).
- **Actual behavior:** Returns tasks with status `"todo"` AND `"done"`, because both contain the substring `"do"`.
- **How discovered:** Unit test `"does not match partial/substring status values"` and integration test `"rejects partial status matches"` — both marked `test.failing`.
- **Root cause:** The filter uses `t.status.includes(status)`, which is `String.prototype.includes()` (substring match), not `Array.prototype.includes()` or strict `===`.
  ```js
  // CURRENT (buggy) — substring match on the status string
  const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
  // CORRECT — exact match
  const getByStatus = (status) => tasks.filter((t) => t.status === status);
  ```
- **Suggested fix:** Change `.includes(status)` to `=== status`.
- **Severity:** 🔴 **High** — Returns incorrect data for any status substring query. Even with exact status values it's fragile (e.g., searching for `"in"` would match `"in_progress"`).

---

## Bug 3: `completeTask()` Resets Priority to `'medium'`

- **Title:** Completing a task silently overwrites its priority
- **Location:** `src/services/taskService.js` → `completeTask()` → line 69
- **Expected behavior:** `PATCH /tasks/:id/complete` should mark the task as `"done"` and set `completedAt`, without changing the priority.
- **Actual behavior:** Priority is unconditionally set to `'medium'`, destroying the original value. A `high`-priority task silently becomes `medium`.
- **How discovered:** Unit test `"should preserve the original priority"` and integration test `"preserves task priority when completing"` — both marked `test.failing`.
- **Root cause:** The spread object in `completeTask()` includes `priority: 'medium'` as a hardcoded property, likely a copy-paste from the `create()` defaults:
  ```js
  // CURRENT (buggy)
  const updated = {
    ...task,
    priority: 'medium',    // ← this line should not exist
    status: 'done',
    completedAt: new Date().toISOString(),
  };
  ```
- **Suggested fix:** Remove the `priority: 'medium'` line from the spread object.
- **Severity:** 🟡 **Medium** — Silently corrupts data. Users lose important priority information when completing tasks, which could affect reporting and dashboards.

---

## Bug 4: `update()` Allows Overwriting Protected Fields (`id`, `createdAt`)

- **Title:** PUT endpoint allows clients to corrupt task identity and metadata
- **Location:** `src/services/taskService.js` → `update()` → line 50
- **Expected behavior:** `PUT /tasks/:id` should not allow overwriting system-managed fields like `id`, `createdAt`, or `completedAt`.
- **Actual behavior:** Any field in the request body is merged into the task via spread: `{ ...tasks[index], ...fields }`. Sending `{ "id": "new-id" }` changes the task's id, making it unretrievable by its original id. Sending `{ "createdAt": "..." }` rewrites creation history.
- **How discovered:** Unit tests `"should NOT allow overwriting the task id"` and `"should NOT allow overwriting createdAt"`, plus integration test `"should not allow overwriting the task id"` — all marked `test.failing`.
- **Root cause:** `update()` performs a naive spread merge with no field protection:
  ```js
  // CURRENT (buggy)
  const updated = { ...tasks[index], ...fields };
  // CORRECT — strip protected fields before merging
  const { id, createdAt, completedAt, ...safeFields } = fields;
  const updated = { ...tasks[index], ...safeFields };
  ```
- **Suggested fix:** Destructure and discard `id`, `createdAt`, and `completedAt` from the incoming fields before merging.
- **Severity:** 🟡 **Medium** — Can corrupt the data store, but requires a malicious or careless client. In production with untrusted clients, this is high severity.

---

## Bug 5: Malformed JSON Returns 500 Instead of 400

- **Title:** JSON parse errors produce a 500 Internal Server Error instead of 400
- **Location:** `src/app.js` → global error handler → lines 9-12
- **Expected behavior:** Sending malformed JSON (e.g., `{ invalid json }`) should return `400 Bad Request` because it's a client error.
- **Actual behavior:** Returns `500 Internal Server Error`. The error handler catches the SyntaxError thrown by `express.json()` but always responds with 500.
- **How discovered:** Integration test `"malformed JSON body returns 400"` — marked `test.failing`.
- **Root cause:** The global error handler ignores the `err.status` property that Express's body-parser sets on SyntaxErrors (it sets `err.status = 400`). Instead, it hardcodes `res.status(500)`:
  ```js
  // CURRENT (buggy)
  app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
  });
  // CORRECT — use the error's status if available
  app.use((err, req, res, next) => {
    console.error(err.stack);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
  });
  ```
- **Suggested fix:** Use `err.status || 500` instead of hardcoding 500.
- **Severity:** 🟡 **Medium** — Confuses API clients (they see 500 and think the server is broken, rather than realizing they sent bad JSON). In production, this generates false alerts in monitoring systems.

---

## Bug 6: No Guard Against Double Task Completion

- **Title:** Completing an already-completed task silently overwrites `completedAt`
- **Location:** `src/services/taskService.js` → `completeTask()` → lines 63-77
- **Expected behavior:** `PATCH /tasks/:id/complete` on an already-completed task should either be idempotent (return the task unchanged) or return an error/warning.
- **Actual behavior:** It overwrites `completedAt` with a new timestamp and resets priority to `'medium'` again (see Bug 3). No check is performed.
- **How discovered:** Unit test `"completing an already-completed task overwrites completedAt"` and integration test `"completing an already-completed task does not error"`.
- **Root cause:** No conditional check for `task.status === 'done'` before applying the completion:
  ```js
  // No guard like:
  if (task.status === 'done') return task; // already completed, no-op
  ```
- **Suggested fix:** Add a guard at the top of `completeTask()` that returns the existing task if `status === 'done'`.
- **Severity:** 🟢 **Low** — The API doesn't crash, but the original completion timestamp is lost. Combined with Bug 3 (priority reset), the impact is worse.

---

## Design Concerns (not strictly bugs)

These are issues that are not clearly broken behavior, but would cause problems at scale or in production.

### 1. README/ASSIGNMENT Status Value Mismatch
- **README.md** says `pending | in-progress | completed`
- **ASSIGNMENT.md** says `todo | in_progress | done`
- **Code** uses `todo | in_progress | done`
- The README is wrong. Anyone following the README's sample curl commands (e.g., `?status=pending`) will get unexpected results.

### 2. PUT Endpoint Has PATCH Semantics
- `PUT /tasks/:id` does a merge (`{ ...existing, ...fields }`) instead of a full replacement. PUT semantics per HTTP spec require replacing the entire resource. Missing fields should reset to defaults, not be preserved from the old state.
- This is a design choice, but the README calls it "Full update of a task".

### 3. Mutable Reference Leaking
- `findById()` returns a direct reference to the internal task object. Callers can mutate it in place, bypassing `update()`.
- `create()` returns the same object stored in the array.
- In practice this hasn't caused bugs in the current code, but it's a safety concern.

### 4. No `GET /tasks/:id` Endpoint
- There's no way to fetch a single task by id via HTTP. You have to GET all tasks and filter client-side.

### 5. No Pagination Input Validation
- `page=0`, `page=-1`, `limit=0`, `limit=-1`, and non-numeric values are not validated. They either produce empty results or undefined behavior (e.g., `page=-1` with `slice()` gives unexpected results from the end of the array).
