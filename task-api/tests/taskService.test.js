/**
 * Unit tests for taskService.js
 *
 * These tests call the service layer directly (no HTTP, no Express).
 * We use the _reset() helper exported by taskService to clear the in-memory
 * store between tests, ensuring each test runs in isolation.
 *
 * Tests that expose REAL BUGS in the codebase are marked with `test.failing`.
 * A failing test means: "the test asserts the CORRECT behavior, but the code
 * does the wrong thing." These are documented in BUGS.md.
 */

const taskService = require('../src/services/taskService');

// ---------------------------------------------------------------------------
// Helper: reset the in-memory store before each test for isolation.
// taskService exports `_reset()` specifically for this purpose — it empties
// the `tasks` array so each test starts with a clean slate.
// ---------------------------------------------------------------------------
beforeEach(() => {
  taskService._reset();
});

// ---------------------------------------------------------------------------
// Helper: creates a task with sensible defaults, merging in any overrides.
// Keeps the test code DRY and makes the intent of each test clearer.
// ---------------------------------------------------------------------------
function createTestTask(overrides = {}) {
  return taskService.create({
    title: 'Test Task',
    description: 'A test task',
    priority: 'medium',
    ...overrides,
  });
}

// ===========================================================================
// create()
// ===========================================================================
describe('taskService.create', () => {
  test('creates a task with all default fields', () => {
    const task = taskService.create({ title: 'My Task' });

    expect(task).toMatchObject({
      title: 'My Task',
      description: '',      // default
      status: 'todo',       // default
      priority: 'medium',   // default
      dueDate: null,        // default
      completedAt: null,     // default
    });
    // Auto-generated fields
    expect(task.id).toBeDefined();
    expect(task.createdAt).toBeDefined();
    // createdAt should be a valid ISO string
    expect(new Date(task.createdAt).toISOString()).toBe(task.createdAt);
  });

  test('creates a task with all fields provided', () => {
    const task = taskService.create({
      title: 'Full Task',
      description: 'With everything',
      status: 'in_progress',
      priority: 'high',
      dueDate: '2099-12-31T23:59:59.000Z',
    });

    expect(task.title).toBe('Full Task');
    expect(task.description).toBe('With everything');
    expect(task.status).toBe('in_progress');
    expect(task.priority).toBe('high');
    expect(task.dueDate).toBe('2099-12-31T23:59:59.000Z');
  });

  test('each created task has a unique id', () => {
    const t1 = createTestTask({ title: 'Task 1' });
    const t2 = createTestTask({ title: 'Task 2' });
    expect(t1.id).not.toBe(t2.id);
  });

  test('created task appears in getAll()', () => {
    const task = createTestTask();
    const all = taskService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(task.id);
  });
});

// ===========================================================================
// getAll()
// ===========================================================================
describe('taskService.getAll', () => {
  test('returns empty array when store is empty', () => {
    expect(taskService.getAll()).toEqual([]);
  });

  test('returns all created tasks', () => {
    createTestTask({ title: 'A' });
    createTestTask({ title: 'B' });
    createTestTask({ title: 'C' });
    expect(taskService.getAll()).toHaveLength(3);
  });

  test('returns a copy of the array (mutations do not affect the store)', () => {
    createTestTask();
    const result = taskService.getAll();
    result.push({ fake: true });
    // The store should still have only 1 task
    expect(taskService.getAll()).toHaveLength(1);
  });
});

// ===========================================================================
// findById()
// ===========================================================================
describe('taskService.findById', () => {
  test('finds an existing task by id', () => {
    const task = createTestTask();
    const found = taskService.findById(task.id);
    expect(found).toBeDefined();
    expect(found.id).toBe(task.id);
  });

  test('returns undefined for a nonexistent id', () => {
    expect(taskService.findById('nonexistent-id')).toBeUndefined();
  });

  test('returns undefined when store is empty', () => {
    expect(taskService.findById('any-id')).toBeUndefined();
  });
});

// ===========================================================================
// getByStatus()
// ===========================================================================
describe('taskService.getByStatus', () => {
  test('filters tasks by exact status', () => {
    createTestTask({ title: 'Todo', status: 'todo' });
    createTestTask({ title: 'Done', status: 'done' });

    const todoTasks = taskService.getByStatus('todo');
    // Should only match 'todo', not 'done' (which does NOT contain 'todo')
    // But 'todo' does not contain 'done' either, so this specific case
    // happens to work even with the .includes() bug.
    expect(todoTasks).toHaveLength(1);
    expect(todoTasks[0].title).toBe('Todo');
  });

  test('returns empty array when no tasks match', () => {
    createTestTask({ status: 'todo' });
    expect(taskService.getByStatus('in_progress')).toEqual([]);
  });

  /**
   * BUG: getByStatus uses String.prototype.includes() instead of strict
   * equality (===). This means partial/substring matches succeed.
   * For example, filtering by "do" matches both "todo" and "done"
   * because both strings contain the substring "do".
   *
   * Expected: filtering by a partial string like "do" should return no
   * results (or the API should reject it as an invalid status).
   * Actual: it returns tasks with status "todo" AND "done".
   */
  test.failing('does not match partial/substring status values (BUG: uses .includes())', () => {
    createTestTask({ title: 'Todo Task', status: 'todo' });
    createTestTask({ title: 'Done Task', status: 'done' });

    // "do" is a substring of both "todo" and "done"
    const result = taskService.getByStatus('do');
    // Correct behavior: should return empty (no status is exactly "do")
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getPaginated()
// ===========================================================================
describe('taskService.getPaginated', () => {
  // Seed 15 tasks for pagination tests
  beforeEach(() => {
    for (let i = 1; i <= 15; i++) {
      createTestTask({ title: `Task ${i}` });
    }
  });

  /**
   * FIXED: Pagination offset is now correctly `(page - 1) * limit`.
   * Page 1 returns the first page of results.
   */
  test('page 1 returns the first page of results (FIXED: was off-by-one)', () => {
    const result = taskService.getPaginated(1, 5);
    expect(result).toHaveLength(5);
    // Page 1 should return the very first tasks
    expect(result[0].title).toBe('Task 1');
  });

  test('page 2 returns the second page of results', () => {
    const result = taskService.getPaginated(2, 5);
    expect(result).toHaveLength(5);
    expect(result[0].title).toBe('Task 6');
  });

  test('returns limited number of results', () => {
    const result = taskService.getPaginated(1, 5);
    expect(result).toHaveLength(5);
  });

  test('returns empty array when page is beyond available data', () => {
    const result = taskService.getPaginated(100, 5);
    expect(result).toEqual([]);
  });

  test('returns remaining items when last page is partial', () => {
    // With 15 tasks and limit=10, page 2 should have 5 items
    const result = taskService.getPaginated(2, 10);
    expect(result).toHaveLength(5);
  });

  test('returns empty array when store is empty', () => {
    taskService._reset();
    const result = taskService.getPaginated(1, 10);
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getStats()
// ===========================================================================
describe('taskService.getStats', () => {
  test('returns zero counts for an empty store', () => {
    const stats = taskService.getStats();
    expect(stats).toEqual({
      todo: 0,
      in_progress: 0,
      done: 0,
      overdue: 0,
    });
  });

  test('counts tasks by status correctly', () => {
    createTestTask({ status: 'todo' });
    createTestTask({ status: 'todo' });
    createTestTask({ status: 'in_progress' });
    createTestTask({ status: 'done' });

    const stats = taskService.getStats();
    expect(stats.todo).toBe(2);
    expect(stats.in_progress).toBe(1);
    expect(stats.done).toBe(1);
  });

  test('counts overdue tasks (past dueDate + not done)', () => {
    // Overdue: past due date, status is not 'done'
    createTestTask({
      status: 'todo',
      dueDate: '2000-01-01T00:00:00.000Z', // well in the past
    });
    // Not overdue: past due date but status is 'done'
    createTestTask({
      status: 'done',
      dueDate: '2000-01-01T00:00:00.000Z',
    });
    // Not overdue: future due date
    createTestTask({
      status: 'todo',
      dueDate: '2099-12-31T23:59:59.000Z',
    });
    // Not overdue: no due date
    createTestTask({
      status: 'todo',
      dueDate: null,
    });

    const stats = taskService.getStats();
    expect(stats.overdue).toBe(1); // only the first task
  });

  test('completed tasks with past dueDate are NOT counted as overdue', () => {
    createTestTask({
      status: 'done',
      dueDate: '2000-01-01T00:00:00.000Z',
    });

    const stats = taskService.getStats();
    expect(stats.overdue).toBe(0);
  });

  test('tasks with null dueDate are never overdue', () => {
    createTestTask({ status: 'todo', dueDate: null });
    createTestTask({ status: 'in_progress', dueDate: null });

    const stats = taskService.getStats();
    expect(stats.overdue).toBe(0);
  });

  test('in_progress tasks with past dueDate are counted as overdue', () => {
    createTestTask({
      status: 'in_progress',
      dueDate: '2000-01-01T00:00:00.000Z',
    });

    const stats = taskService.getStats();
    expect(stats.in_progress).toBe(1);
    expect(stats.overdue).toBe(1);
  });

  test('future dueDate tasks are not overdue', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    createTestTask({ status: 'todo', dueDate: futureDate });
    createTestTask({ status: 'in_progress', dueDate: futureDate });

    const stats = taskService.getStats();
    expect(stats.overdue).toBe(0);
  });

  test('correctly evaluates overdue status across timezone offsets', () => {
    // Past date with timezone offset (+05:30)
    createTestTask({ status: 'todo', dueDate: '2000-06-15T12:00:00+05:30' });
    // Future date with timezone offset (-08:00)
    createTestTask({ status: 'todo', dueDate: '2099-06-15T12:00:00-08:00' });

    const stats = taskService.getStats();
    expect(stats.overdue).toBe(1);
  });
});

// ===========================================================================
// update()
// ===========================================================================
describe('taskService.update', () => {
  test('updates specified fields on an existing task', () => {
    const task = createTestTask({ title: 'Original' });
    const updated = taskService.update(task.id, { title: 'Updated' });

    expect(updated.title).toBe('Updated');
    expect(updated.id).toBe(task.id); // id unchanged
  });

  test('returns null for a nonexistent id', () => {
    expect(taskService.update('nonexistent', { title: 'X' })).toBeNull();
  });

  test('preserves fields not included in the update', () => {
    const task = createTestTask({
      title: 'Original',
      description: 'Keep me',
      priority: 'high',
    });

    const updated = taskService.update(task.id, { title: 'Changed' });
    expect(updated.description).toBe('Keep me');
    expect(updated.priority).toBe('high');
  });

  /**
   * BUG: update() uses a naive spread merge `{ ...task, ...fields }` which
   * allows the caller to overwrite protected fields like `id` and `createdAt`.
   * This can corrupt the data store — e.g. changing a task's id means
   * findById(originalId) will no longer find it.
   *
   * Expected: id and createdAt should be immutable; update should strip them.
   * Actual: they get overwritten.
   */
  test.failing('should NOT allow overwriting the task id (BUG: no field protection)', () => {
    const task = createTestTask();
    const originalId = task.id;

    taskService.update(originalId, { id: 'hacked-id' });

    // The task should still be findable by its original id
    const found = taskService.findById(originalId);
    expect(found).toBeDefined();
    expect(found.id).toBe(originalId);
  });

  test.failing('should NOT allow overwriting createdAt (BUG: no field protection)', () => {
    const task = createTestTask();
    const originalCreatedAt = task.createdAt;

    taskService.update(task.id, { createdAt: '1999-01-01T00:00:00.000Z' });

    const found = taskService.findById(task.id);
    expect(found.createdAt).toBe(originalCreatedAt);
  });
});

// ===========================================================================
// remove()
// ===========================================================================
describe('taskService.remove', () => {
  test('removes an existing task and returns true', () => {
    const task = createTestTask();
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.getAll()).toHaveLength(0);
  });

  test('returns false for a nonexistent id', () => {
    expect(taskService.remove('nonexistent')).toBe(false);
  });

  test('removing a task does not affect other tasks', () => {
    const t1 = createTestTask({ title: 'Keep' });
    const t2 = createTestTask({ title: 'Remove' });

    taskService.remove(t2.id);

    const all = taskService.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe(t1.id);
  });

  test('removing the same task twice returns false the second time', () => {
    const task = createTestTask();
    expect(taskService.remove(task.id)).toBe(true);
    expect(taskService.remove(task.id)).toBe(false);
  });
});

// ===========================================================================
// completeTask()
// ===========================================================================
describe('taskService.completeTask', () => {
  test('marks a task as done and sets completedAt', () => {
    const task = createTestTask({ status: 'todo' });
    const completed = taskService.completeTask(task.id);

    expect(completed.status).toBe('done');
    expect(completed.completedAt).toBeDefined();
    // completedAt should be a valid ISO string
    expect(new Date(completed.completedAt).toISOString()).toBe(completed.completedAt);
  });

  test('returns null for a nonexistent id', () => {
    expect(taskService.completeTask('nonexistent')).toBeNull();
  });

  /**
   * BUG: completeTask() unconditionally sets priority to 'medium'.
   * A high-priority task loses its priority when completed.
   *
   * Expected: completing a task should not change its priority.
   * Actual: priority is always reset to 'medium'.
   */
  test.failing('should preserve the original priority (BUG: resets to medium)', () => {
    const task = createTestTask({ priority: 'high' });
    const completed = taskService.completeTask(task.id);

    // Priority should remain 'high' after completion
    expect(completed.priority).toBe('high');
  });

  test('completing an already-completed task overwrites completedAt', () => {
    // This documents the current behavior — no guard against double completion.
    // Whether this is a bug depends on the spec, but we document it.
    const task = createTestTask();
    const first = taskService.completeTask(task.id);
    const firstCompletedAt = first.completedAt;

    // Small delay to ensure different timestamps
    // (In practice, the test runs fast enough that they might be the same,
    // so we just verify the call doesn't throw and returns a task.)
    const second = taskService.completeTask(task.id);
    expect(second).toBeDefined();
    expect(second.status).toBe('done');
    expect(second.completedAt).toBeDefined();
  });
});

// ===========================================================================
// _reset()
// ===========================================================================
describe('taskService._reset', () => {
  test('empties the task store', () => {
    createTestTask();
    createTestTask();
    expect(taskService.getAll()).toHaveLength(2);

    taskService._reset();
    expect(taskService.getAll()).toHaveLength(0);
  });
});
