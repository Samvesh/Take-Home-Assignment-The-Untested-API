/**
 * Tests for the PATCH /tasks/:id/assign endpoint.
 *
 * Written FIRST (TDD) before the implementation.
 * This endpoint assigns a task to a user by storing an `assignee` string.
 *
 * Design decisions documented in NOTES.md:
 * - Reassignment is allowed (returns the updated task, not 409).
 * - Assignee is trimmed before storage and validated for length (max 100 chars).
 * - New tasks default to `assignee: null`.
 */

const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

// Reset the store before every test for isolation
beforeEach(() => {
  taskService._reset();
});

// Helper: create a task via the API
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
// PATCH /tasks/:id/assign
// ===========================================================================
describe('PATCH /tasks/:id/assign', () => {

  // --- Happy path ---

  test('assigns a task to a user and returns the updated task', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
    expect(res.body.id).toBe(task.id);
    // All other fields should be unchanged
    expect(res.body.title).toBe(task.title);
    expect(res.body.status).toBe(task.status);
    expect(res.body.priority).toBe(task.priority);
  });

  test('trims whitespace from the assignee name', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '  Bob  ' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  // --- Reassignment ---

  test('allows reassignment to a different user', async () => {
    const task = await createTaskViaAPI();

    // First assignment
    await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });

    // Reassignment
    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Bob' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Bob');
  });

  test('allows reassignment to the same user (idempotent)', async () => {
    const task = await createTaskViaAPI();

    await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Alice' });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe('Alice');
  });

  // --- 404 ---

  test('returns 404 for a nonexistent task id', async () => {
    const res = await request(app)
      .patch('/tasks/nonexistent-id/assign')
      .send({ assignee: 'Alice' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });

  // --- Validation: missing assignee ---

  test('returns 400 when assignee is missing from the body', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when body is empty', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send();

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // --- Validation: empty string ---

  test('returns 400 when assignee is an empty string', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // --- Validation: whitespace-only ---

  test('returns 400 when assignee is only whitespace', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // --- Validation: non-string types ---

  test('returns 400 when assignee is a number', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 12345 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when assignee is null', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: null });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when assignee is an array', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: ['Alice'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('returns 400 when assignee is an object', async () => {
    const task = await createTaskViaAPI();

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: { name: 'Alice' } });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  // --- Validation: too-long value ---

  test('returns 400 when assignee exceeds 100 characters', async () => {
    const task = await createTaskViaAPI();
    const longName = 'A'.repeat(101);

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: longName });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test('accepts assignee at exactly 100 characters', async () => {
    const task = await createTaskViaAPI();
    const maxName = 'A'.repeat(100);

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: maxName });

    expect(res.status).toBe(200);
    expect(res.body.assignee).toBe(maxName);
  });

  // --- Confirm other fields are unchanged ---

  test('does not modify any other task fields', async () => {
    const task = await createTaskViaAPI({
      title: 'Important Task',
      description: 'Details here',
      priority: 'high',
      status: 'in_progress',
      dueDate: '2099-12-31T23:59:59.000Z',
    });

    const res = await request(app)
      .patch(`/tasks/${task.id}/assign`)
      .send({ assignee: 'Charlie' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Important Task');
    expect(res.body.description).toBe('Details here');
    expect(res.body.priority).toBe('high');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.dueDate).toBe('2099-12-31T23:59:59.000Z');
    expect(res.body.createdAt).toBe(task.createdAt);
    expect(res.body.id).toBe(task.id);
  });

  // --- Default assignee on new tasks ---

  test('new tasks have assignee set to null by default', async () => {
    const task = await createTaskViaAPI();
    expect(task.assignee).toBeNull();
  });
});
