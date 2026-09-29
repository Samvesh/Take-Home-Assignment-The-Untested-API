/**
 * Integration tests for the Task API routes.
 *
 * These tests use Supertest to make real HTTP requests against the Express app
 * WITHOUT starting a listening server (Supertest handles that internally).
 *
 * We import `app` from src/app.js and reset the in-memory store before each
 * test to ensure isolation.
 *
 * Tests that expose REAL BUGS are marked with `test.failing` — they assert
 * the CORRECT expected behavior, and the failure proves the bug exists.
 * See BUGS.md for full documentation.
 */

const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Reset the store before every test for isolation
beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// Helper: creates a task via the API and returns the response body.
// Keeps test setup concise while going through the real HTTP layer.
// ---------------------------------------------------------------------------
async function createTaskViaAPI(overrides = {}) {
  const body = {
    title: 'Test Task',
    description: 'A test task',
    priority: 'medium',
    ...overrides,
  };
  const res = await request(app).post('/tasks').send(body);
  return res.body;
}

// ===========================================================================
// POST /tasks
// ===========================================================================
describe('POST /tasks', () => {
  test('creates a task and returns 201 with the task object', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'New Task', description: 'Details', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      title: 'New Task',
      description: 'Details',
      priority: 'high',
      status: 'todo',
      completedAt: null,
    });
    expect(res.body.id).toBeDefined();
    expect(res.body.createdAt).toBeDefined();
  });

  test('creates a task with only a title (defaults for other fields)', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Minimal' });

    expect(res.status).toBe(201);
    expect(res.body.description).toBe('');
    expect(res.body.status).toBe('todo');
    expect(res.body.priority).toBe('medium');
    expect(res.body.dueDate).toBeNull();
  });

  test('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ description: 'No title' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when title is an empty string', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when title is only whitespace', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 for an invalid status value', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Task', status: 'invalid' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('status');
  });

  test('returns 400 for an invalid priority value', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Task', priority: 'urgent' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('priority');
  });

  test('returns 400 for an invalid dueDate', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Task', dueDate: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('dueDate');
  });

  test('accepts a valid dueDate', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 'Task', dueDate: '2099-12-31T23:59:59.000Z' });

    expect(res.status).toBe(201);
    expect(res.body.dueDate).toBe('2099-12-31T23:59:59.000Z');
  });
});

// ===========================================================================
// GET /tasks
// ===========================================================================
describe('GET /tasks', () => {
  test('returns an empty array when no tasks exist', async () => {
    const res = await request(app).get('/tasks');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns all tasks', async () => {
    await createTaskViaAPI({ title: 'Task 1' });
    await createTaskViaAPI({ title: 'Task 2' });

    const res = await request(app).get('/tasks');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  // --- Status filter ---

  test('filters tasks by status', async () => {
    await createTaskViaAPI({ title: 'Todo', status: 'todo' });
    await createTaskViaAPI({ title: 'Done', status: 'done' });

    const res = await request(app).get('/tasks?status=todo');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe('Todo');
  });

  test('returns empty array when no tasks match the status filter', async () => {
    await createTaskViaAPI({ status: 'todo' });

    const res = await request(app).get('/tasks?status=in_progress');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  /**
   * BUG: The status filter uses String.prototype.includes() (substring match)
   * instead of strict equality. "do" matches both "todo" and "done".
   *
   * Expected: invalid/partial status returns empty array (no exact match).
   * Actual: returns tasks whose status contains the substring.
   */
  test.failing('rejects partial status matches (BUG: substring matching)', async () => {
    await createTaskViaAPI({ title: 'Todo', status: 'todo' });
    await createTaskViaAPI({ title: 'Done', status: 'done' });

    const res = await request(app).get('/tasks?status=do');
    // "do" is not a valid status — should match nothing
    expect(res.body).toEqual([]);
  });

  // --- Pagination ---

  /**
   * FIXED: Pagination offset is now `(page - 1) * limit`.
   * Page 1 correctly returns the first page of results.
   */
  test('pagination page 1 returns the first page (FIXED: was off-by-one)', async () => {
    for (let i = 1; i <= 10; i++) {
      await createTaskViaAPI({ title: `Task ${i}` });
    }

    const res = await request(app).get('/tasks?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    // First page should start with the first task created
    expect(res.body[0].title).toBe('Task 1');
  });

  test('pagination page 2 returns the second page', async () => {
    for (let i = 1; i <= 10; i++) {
      await createTaskViaAPI({ title: `Task ${i}` });
    }

    const res = await request(app).get('/tasks?page=2&limit=5');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(5);
    expect(res.body[0].title).toBe('Task 6');
  });

  test('pagination with non-numeric page defaults to 1', async () => {
    for (let i = 1; i <= 5; i++) {
      await createTaskViaAPI({ title: `Task ${i}` });
    }

    const res = await request(app).get('/tasks?page=abc&limit=5');
    expect(res.status).toBe(200);
    // parseInt('abc') → NaN → fallback to 1 → returns first page
    expect(res.body).toHaveLength(5);
    expect(res.body[0].title).toBe('Task 1');
  });

  test('pagination with limit=0 falls back to default limit of 10', async () => {
    await createTaskViaAPI({ title: 'Task' });

    const res = await request(app).get('/tasks?page=1&limit=0');
    expect(res.status).toBe(200);
    // limit=0 → parseInt returns 0, which is falsy → falls back to 10
    // page=1 → offset=0 → returns 1 task (only 1 exists, limit 10)
    expect(res.body).toHaveLength(1);
  });

  test('pagination returns empty when page is beyond available data', async () => {
    await createTaskViaAPI({ title: 'Only Task' });

    const res = await request(app).get('/tasks?page=999&limit=10');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ===========================================================================
// PUT /tasks/:id
// ===========================================================================
describe('PUT /tasks/:id', () => {
  test('updates a task and returns the updated object', async () => {
    const task = await createTaskViaAPI({ title: 'Original' });

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'Updated' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated');
    expect(res.body.id).toBe(task.id);
  });

  test('returns 404 for a nonexistent task id', async () => {
    const res = await request(app)
      .put('/tasks/nonexistent-id')
      .send({ title: 'Does not matter' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 for invalid status in update', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ status: 'invalid_status' });

    expect(res.status).toBe(400);
  });

  test('returns 400 for empty title in update', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });

  /**
   * BUG: update() allows overwriting the task's `id` field via the request
   * body, because it does a naive spread merge with no field protection.
   *
   * Expected: sending `{ id: "new-id" }` should be ignored or rejected.
   * Actual: the task's id is changed, making it unretrievable by original id.
   */
  test.failing('should not allow overwriting the task id (BUG: no field protection)', async () => {
    const task = await createTaskViaAPI();
    const originalId = task.id;

    await request(app)
      .put(`/tasks/${originalId}`)
      .send({ id: 'hacked-id', title: 'Hacked' });

    // Try to GET the task via the original route — should still exist
    // We verify by getting all tasks and checking the id
    const allRes = await request(app).get('/tasks');
    const found = allRes.body.find((t) => t.id === originalId);
    expect(found).toBeDefined();
  });

  test('preserves fields not included in the update body', async () => {
    const task = await createTaskViaAPI({
      title: 'Original',
      description: 'Keep me',
      priority: 'high',
    });

    const res = await request(app)
      .put(`/tasks/${task.id}`)
      .send({ title: 'Changed Only Title' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Keep me');
    expect(res.body.priority).toBe('high');
  });
});

// ===========================================================================
// DELETE /tasks/:id
// ===========================================================================
describe('DELETE /tasks/:id', () => {
  test('deletes a task and returns 204', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app).delete(`/tasks/${task.id}`);
    expect(res.status).toBe(204);

    // Verify it's gone
    const allRes = await request(app).get('/tasks');
    expect(allRes.body).toHaveLength(0);
  });

  test('returns 404 for a nonexistent task id', async () => {
    const res = await request(app).delete('/tasks/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  test('deleting the same task twice returns 404 the second time', async () => {
    const task = await createTaskViaAPI();

    const first = await request(app).delete(`/tasks/${task.id}`);
    expect(first.status).toBe(204);

    const second = await request(app).delete(`/tasks/${task.id}`);
    expect(second.status).toBe(404);
  });

  test('deleting one task does not affect other tasks', async () => {
    const t1 = await createTaskViaAPI({ title: 'Keep' });
    const t2 = await createTaskViaAPI({ title: 'Remove' });

    await request(app).delete(`/tasks/${t2.id}`);

    const allRes = await request(app).get('/tasks');
    expect(allRes.body).toHaveLength(1);
    expect(allRes.body[0].id).toBe(t1.id);
  });
});

// ===========================================================================
// PATCH /tasks/:id/complete
// ===========================================================================
describe('PATCH /tasks/:id/complete', () => {
  test('marks a task as done and sets completedAt', async () => {
    const task = await createTaskViaAPI({ status: 'todo' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.completedAt).toBeDefined();
    // completedAt should be a valid ISO date
    expect(new Date(res.body.completedAt).toISOString()).toBe(res.body.completedAt);
  });

  test('returns 404 for a nonexistent task', async () => {
    const res = await request(app).patch('/tasks/nonexistent/complete');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  /**
   * BUG: completeTask() unconditionally sets `priority: 'medium'`,
   * destroying the original priority of the task.
   *
   * Expected: priority is preserved when completing a task.
   * Actual: priority is always reset to 'medium'.
   */
  test.failing('preserves task priority when completing (BUG: resets to medium)', async () => {
    const task = await createTaskViaAPI({ priority: 'high' });

    const res = await request(app).patch(`/tasks/${task.id}/complete`);

    expect(res.status).toBe(200);
    expect(res.body.priority).toBe('high');
  });

  test('completing an already-completed task does not error', async () => {
    // Documents current behavior: double-completion is allowed and
    // overwrites completedAt. No guard exists.
    const task = await createTaskViaAPI();
    await request(app).patch(`/tasks/${task.id}/complete`);

    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
  });

  test('completedAt is set to a recent timestamp', async () => {
    const before = new Date();
    const task = await createTaskViaAPI();
    const res = await request(app).patch(`/tasks/${task.id}/complete`);
    const after = new Date();

    const completedAt = new Date(res.body.completedAt);
    expect(completedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(completedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ===========================================================================
// GET /tasks/stats
// ===========================================================================
describe('GET /tasks/stats', () => {
  test('returns zero counts when store is empty', async () => {
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      todo: 0,
      in_progress: 0,
      done: 0,
      overdue: 0,
    });
  });

  test('counts tasks by status correctly', async () => {
    await createTaskViaAPI({ status: 'todo' });
    await createTaskViaAPI({ status: 'todo' });
    await createTaskViaAPI({ status: 'in_progress' });
    await createTaskViaAPI({ status: 'done' });

    const res = await request(app).get('/tasks/stats');

    expect(res.body.todo).toBe(2);
    expect(res.body.in_progress).toBe(1);
    expect(res.body.done).toBe(1);
  });

  test('counts overdue tasks correctly', async () => {
    // Overdue: past due, not done
    await createTaskViaAPI({
      status: 'todo',
      dueDate: '2000-01-01T00:00:00.000Z',
    });
    // NOT overdue: past due but done
    await createTaskViaAPI({
      status: 'done',
      dueDate: '2000-01-01T00:00:00.000Z',
    });
    // NOT overdue: future due
    await createTaskViaAPI({
      status: 'todo',
      dueDate: '2099-12-31T23:59:59.000Z',
    });

    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(1);
  });

  test('tasks with null dueDate are not counted as overdue', async () => {
    await createTaskViaAPI({ status: 'todo', dueDate: null });

    const res = await request(app).get('/tasks/stats');
    expect(res.body.overdue).toBe(0);
  });
});

// ===========================================================================
// Route ordering: /tasks/stats is NOT shadowed by /tasks/:id
// ===========================================================================
describe('Route ordering', () => {
  test('GET /tasks/stats is not captured by /:id route', async () => {
    // If /stats were defined after /:id, Express would treat "stats" as an id
    // and try to find a task with id="stats", returning 404 or an error.
    const res = await request(app).get('/tasks/stats');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todo');
    expect(res.body).toHaveProperty('overdue');
  });
});

// ===========================================================================
// Error handling edge cases
// ===========================================================================
describe('Error handling', () => {
  /**
   * BUG: Malformed JSON bodies hit the global error handler in app.js,
   * which always returns 500. Express's body-parser throws a SyntaxError
   * with a `status` property of 400, but the error handler ignores it
   * and hardcodes 500.
   *
   * Expected: 400 (client sent invalid JSON — that's a client error).
   * Actual: 500 (server treats it as an internal error).
   */
  test.failing('malformed JSON body returns 400 (BUG: error handler returns 500)', async () => {
    const res = await request(app)
      .post('/tasks')
      .set('Content-Type', 'application/json')
      .send('{ invalid json }');

    expect(res.status).toBe(400);
  });

  test('POST with title as a number returns 400', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: 12345 });

    expect(res.status).toBe(400);
  });

  test('POST with title as null returns 400', async () => {
    const res = await request(app)
      .post('/tasks')
      .send({ title: null });

    expect(res.status).toBe(400);
  });
});
