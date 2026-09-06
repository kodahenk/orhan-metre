import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateTaskChecklists, taskPathLabel } from '../src/features/projects/task-model.ts';

const projectIds = new Set(['p', 'other']);
const task = (id, parentTaskId = null, extra = {}) => ({ id, parentTaskId, projectId: 'p', title: id, note: '', done: false, dueDate: null, orderIndex: 0, ...extra });

test('deep subtasks become one flat checklist while retaining notes, dates and completion', () => {
  const result = migrateTaskChecklists([
    task('root'), task('child', 'root', { note: 'Original note', dueDate: '2026-09-30', done: true, orderIndex: 1 }),
    task('grandchild', 'child', { orderIndex: 2 }),
  ], projectIds);
  assert.equal(result.length, 1);
  assert.equal('parentTaskId' in result[0], false);
  assert.deepEqual(result[0].checklist.map((i) => i.id), ['child', 'grandchild']);
  assert.equal(result[0].checklist[0].done, true);
  assert.equal(result[0].checklist[0].note, 'Original note');
  assert.equal(result[0].checklist[0].dueDate, '2026-09-30');
  assert.equal(result[0].done, false, 'checklist completion does not change parent completion');
});

test('migration is idempotent; new edits do not resurrect old subtasks', () => {
  const migrated = migrateTaskChecklists([task('root'), task('child', 'root')], projectIds);
  assert.deepEqual(migrateTaskChecklists(migrated, projectIds), migrated);
  migrated[0].checklist = [];
  const reloaded = migrateTaskChecklists(migrated, projectIds);
  assert.deepEqual(reloaded[0].checklist, []);
  assert.equal(taskPathLabel(reloaded, 'child'), 'root', 'history still belongs to the task after deleting a migrated item');
});

test('old session IDs continue to resolve without changing session totals', () => {
  const result = migrateTaskChecklists([task('root'), task('child', 'root'), task('deep', 'child')], projectIds);
  assert.equal(taskPathLabel(result, 'deep'), 'root · deep');
  const ids = new Set([result[0].id, ...result[0].legacyTaskIds]);
  const sessions = [{ taskId: 'root', workSeconds: 60 }, { taskId: 'child', workSeconds: 120 }, { taskId: 'deep', workSeconds: 180 }];
  assert.equal(sessions.filter((s) => ids.has(s.taskId)).reduce((n, s) => n + s.workSeconds, 0), 360);
});

test('orphaned and cross-project parents preserve tasks as independent records', () => {
  const result = migrateTaskChecklists([task('orphan', 'missing'), task('a'), task('b', 'a', { projectId: 'other' })], projectIds);
  assert.deepEqual(result.map((t) => t.id), ['orphan', 'a', 'b']);
});

test('a corrupt parent cycle terminates and preserves every item exactly once', () => {
  const result = migrateTaskChecklists([task('a', 'b'), task('b', 'a'), task('c', 'b')], projectIds);
  assert.equal(result.length, 1);
  assert.deepEqual([result[0].id, ...result[0].checklist.map((i) => i.id)].sort(), ['a', 'b', 'c']);
  assert.deepEqual(migrateTaskChecklists(result, projectIds), result);
});

test('10,000 levels do not use recursive stack traversal', () => {
  const input = Array.from({ length: 10_000 }, (_, i) => task(String(i), i ? String(i - 1) : null, { orderIndex: i }));
  const result = migrateTaskChecklists(input, projectIds);
  assert.equal(result.length, 1);
  assert.equal(result[0].checklist.length, 9999);
  assert.equal(new Set(result[0].legacyTaskIds).size, 9999);
});
