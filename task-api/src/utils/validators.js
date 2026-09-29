const VALID_STATUSES = ['todo', 'in_progress', 'done'];
const VALID_PRIORITIES = ['low', 'medium', 'high'];

const validateCreateTask = (body) => {
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return 'title is required and must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

const validateUpdateTask = (body) => {
  if (body.title !== undefined && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return 'title must be a non-empty string';
  }
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return `status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  if (body.priority && !VALID_PRIORITIES.includes(body.priority)) {
    return `priority must be one of: ${VALID_PRIORITIES.join(', ')}`;
  }
  if (body.dueDate && isNaN(Date.parse(body.dueDate))) {
    return 'dueDate must be a valid ISO date string';
  }
  return null;
};

/**
 * Validates the body for PATCH /tasks/:id/assign.
 *
 * Requirements:
 * - `assignee` must be present, a string, and non-empty after trimming.
 * - Max length is 100 characters (after trimming) to prevent abuse.
 *   100 is generous enough for real names (longest known names are ~70 chars)
 *   but short enough to prevent storing huge blobs.
 *
 * @param {object} body - The request body
 * @returns {string|null} Error message, or null if valid
 */
const ASSIGNEE_MAX_LENGTH = 100;

const validateAssignTask = (body) => {
  if (!body || body.assignee === undefined || body.assignee === null) {
    return 'assignee is required';
  }
  if (typeof body.assignee !== 'string') {
    return 'assignee must be a string';
  }
  if (body.assignee.trim() === '') {
    return 'assignee must be a non-empty string';
  }
  if (body.assignee.trim().length > ASSIGNEE_MAX_LENGTH) {
    return `assignee must be at most ${ASSIGNEE_MAX_LENGTH} characters`;
  }
  return null;
};

module.exports = { validateCreateTask, validateUpdateTask, validateAssignTask };
