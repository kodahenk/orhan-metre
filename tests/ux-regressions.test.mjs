import assert from 'node:assert/strict';
import test from 'node:test';
import { groupBy, pageWindow, searchText } from '../src/features/ui/collection-utils.ts';
import { validDateKey } from '../src/features/ui/date-validation.ts';
import { createDeferredWrite } from '../src/features/ui/deferred-write.ts';

test('100,003 records remain reachable without rendering more than a page', () => {
  const total = 100_003;
  let seen = 0;
  for (let page = 0; page < Math.ceil(total / 30); page++) {
    const window = pageWindow(total, page);
    assert.equal(window.start, seen);
    assert.ok(window.end - window.start <= 30);
    seen = window.end;
  }
  assert.equal(seen, total);
});

test('deleting the last item or narrowing a filter clamps to a valid page', () => {
  assert.deepEqual(pageWindow(0, 100), { page: 0, pages: 1, start: 0, end: 0, total: 0 });
  assert.equal(pageWindow(30, 1).page, 0);
  assert.equal(pageWindow(31, 100).start, 30);
  assert.equal(pageWindow(31, -1).start, 0);
});

test('Turkish project and task search accepts accented and plain keyboard input', () => {
  assert.equal(searchText('  İSTANBUL ÇALIŞMASI  '), searchText('istanbul calismasi'));
  assert.ok(searchText('Öğrenme / Görev 42').includes(searchText('ogrenme')));
  assert.equal(searchText(''), '');
});

test('10,000 children can be indexed while preserving sibling order', () => {
  const items = Array.from({ length: 10_000 }, (_, i) => ({ id: i, parent: String(i % 100) }));
  const index = groupBy(items, (item) => item.parent);
  assert.equal(index.size, 100);
  assert.equal(index.get('99').length, 100);
  assert.deepEqual(index.get('0').slice(0, 3).map((item) => item.id), [0, 100, 200]);
  assert.equal(groupBy([{ parent: null }], (item) => item.parent).size, 0);
});

test('arbitrary dates accept leap days and reject silently normalized dates', () => {
  for (const value of ['2024-02-29', '2035-12-31', '2020-01-01']) assert.equal(validDateKey(value), true, value);
  for (const value of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '2026-09-00', '26-09-01', '2026-9-1', '']) assert.equal(validDateKey(value), false, value);
});

test('leaving an editor before debounce saves the latest draft exactly once', async () => {
  const writes = [];
  const writer = createDeferredWrite(10);
  writer.schedule(() => writes.push('old'));
  writer.schedule(() => writes.push('latest'));
  writer.flush();
  writer.flush();
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(writes, ['latest']);
});

test('clearing a note is a valid write; unrelated drafts keep their own target', () => {
  const writes = new Map();
  const first = createDeferredWrite();
  const second = createDeferredWrite();
  first.schedule(() => writes.set('project-a', ''));
  second.schedule(() => writes.set('task-b', 'New title'));
  first.flush();
  second.flush();
  assert.equal(writes.get('project-a'), '');
  assert.equal(writes.get('task-b'), 'New title');
});
