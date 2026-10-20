import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.mjs';
import { buildCodexLink } from '../src/links.js';

test('saved tasks survive reopening, completion restores destination, deleting projects keeps tasks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-todo-store-'));
  const file = join(dir, 'board.sqlite');
  let store = openStore(file, { seed: false });
  try {
    const project = store.execute('todo_project_save', { name: 'Test', path: dir }).board.projects[0];
    const saved = store.execute('todo_add', { title: 'A persistent idea', notes: 'Some detail', status: 'backlog', projectId: project.id }).board.tasks[0];
    store.close();
    store = openStore(file, { seed: false });
    assert.equal(store.execute('todo_list').board.tasks[0].id, saved.id);
    let task = store.execute('todo_update', { id: saved.id, status: 'done' }).board.tasks[0];
    assert.equal(task.previousStatus, 'backlog');
    task = store.execute('todo_update', { id: saved.id, status: task.previousStatus }).board.tasks[0];
    assert.equal(task.status, 'backlog');
    const board = store.execute('todo_project_delete', { id: project.id }).board;
    assert.equal(board.tasks.length, 1);
    assert.equal(board.tasks[0].projectId, null);
    assert.equal(board.projects.length, 0);
  } finally { store.close(); rmSync(dir, { recursive: true }); }
});

test('rejected updates roll back and multiple connections share a consistent revision', () => {
  const dir = mkdtempSync(join(tmpdir(), 'codex-todo-concurrent-'));
  const file = join(dir, 'board.sqlite');
  const first = openStore(file, { seed: false });
  const second = openStore(file, { seed: false });
  try {
    first.execute('todo_add', { title: 'One' });
    second.execute('todo_add', { title: 'Two' });
    const board = first.execute('todo_list').board;
    assert.equal(board.tasks.length, 2);
    assert.equal(board.revision, 2);
    assert.throws(() => second.execute('todo_update', { id: board.tasks[0].id, title: 'Changed', projectId: '0a3e5d39-4e4d-4baa-9a30-728fe0351d56' }), /no longer exists/);
    assert.deepEqual(first.execute('todo_list').board, board);
    assert.throws(() => first.execute('todo_add', { title: '  ' }));
    assert.throws(() => first.execute('todo_project_save', { name: 'Bad', path: 'relative/path' }), /absolute/);
  } finally { first.close(); second.close(); rmSync(dir, { recursive: true }); }
});

test('native chat links round-trip punctuation, newlines, Unicode and project paths', () => {
  const title = 'Fix #1? & café + 😀';
  const notes = 'Keep `literal` text.\nSecond line: x=y & z=2';
  const project = { path: '/Users/example/Project with spaces' };
  const link = new URL(buildCodexLink({ title, notes }, project));
  assert.equal(link.protocol, 'codex:');
  assert.equal(link.host, 'threads');
  assert.equal(link.pathname, '/new');
  assert.equal(link.searchParams.get('path'), project.path);
  assert.equal(link.searchParams.get('prompt'), `${title}\n\n${notes}`);
  assert.equal(new URL(buildCodexLink({ title: 'No project' })).searchParams.has('path'), false);
});
