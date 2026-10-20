import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveDatabasePath } from '../src/data-paths.mjs';
import { openStore } from '../src/store.mjs';

test('explicit database paths take priority and allow isolated in-memory stores', () => {
  assert.equal(resolveDatabasePath({ env: { TODO_DB_PATH: '/data/todo.sqlite', PLUGIN_DATA: 'invalid' }, platform: 'linux', home: '/home/example' }), '/data/todo.sqlite');
  assert.equal(resolveDatabasePath({ env: { TODO_DB_PATH: ':memory:', PLUGIN_DATA: '${PLUGIN_DATA}' }, platform: 'darwin', home: '/home/example' }), ':memory:');
  assert.equal(resolveDatabasePath({ databasePath: '/explicit/todo.sqlite', env: { TODO_DB_PATH: '/environment/todo.sqlite' }, platform: 'linux' }), '/explicit/todo.sqlite');
});

test('plugin data remains independent of the versioned installation path', () => {
  for (const root of ['/cache/codex-todo/0.2.4', '/elsewhere/codex-todo/1.0.0']) {
    assert.equal(resolveDatabasePath({ env: { PLUGIN_DATA: '/persistent/todo', PLUGIN_ROOT: root, CODEX_PLUGIN_ROOT: root }, platform: 'linux', home: '/home/example' }), '/persistent/todo/todo.sqlite');
    assert.equal(resolveDatabasePath({ env: { PLUGIN_ROOT: root, CODEX_PLUGIN_ROOT: root }, platform: 'darwin', home: '/home/example' }), '/home/example/Library/Application Support/codex-todo/todo.sqlite');
  }
  assert.equal(resolveDatabasePath({ env: { PLUGIN_DATA: 'C:\\Plugin Data\\todo' }, platform: 'win32', home: 'C:\\Users\\example' }), 'C:\\Plugin Data\\todo\\todo.sqlite');
});

test('platform defaults use the user data directory', () => {
  assert.equal(resolveDatabasePath({ env: {}, platform: 'darwin', home: '/Users/example' }), '/Users/example/Library/Application Support/codex-todo/todo.sqlite');
  assert.equal(resolveDatabasePath({ env: { LOCALAPPDATA: 'D:\\Local Data' }, platform: 'win32', home: 'C:\\Users\\example' }), 'D:\\Local Data\\codex-todo\\todo.sqlite');
  assert.equal(resolveDatabasePath({ env: {}, platform: 'win32', home: 'C:\\Users\\example' }), 'C:\\Users\\example\\AppData\\Local\\codex-todo\\todo.sqlite');
  assert.equal(resolveDatabasePath({ env: { XDG_DATA_HOME: '/var/user-data' }, platform: 'linux', home: '/home/example' }), '/var/user-data/codex-todo/todo.sqlite');
  assert.equal(resolveDatabasePath({ env: {}, platform: 'linux', home: '/home/example' }), '/home/example/.local/share/codex-todo/todo.sqlite');
});

test('explicit overrides reject invalid values while invalid XDG directories use the standard fallback', () => {
  for (const value of ['', 'data/todo.sqlite', '~/todo.sqlite', '/data/${PLUGIN_ROOT}/todo.sqlite', '/data/$HOME/todo.sqlite', '/data/%LOCALAPPDATA%/todo.sqlite', '/data/$(whoami)/todo.sqlite', '/data/\0todo.sqlite', null, 42]) {
    assert.throws(() => resolveDatabasePath({ env: { TODO_DB_PATH: value }, platform: 'linux', home: '/home/example' }), /TODO_DB_PATH must be an absolute path/u);
  }
  for (const value of ['data/todo', ':memory:', '/data/${PLUGIN_DATA}', '']) {
    assert.throws(() => resolveDatabasePath({ env: { PLUGIN_DATA: value }, platform: 'linux', home: '/home/example' }), /PLUGIN_DATA must be an absolute path/u);
  }
  for (const value of [undefined, '', 'relative/data', '~/data', '/data/${HOME}', '/data/$HOME', '/data/\0todo', null, 42]) {
    assert.equal(resolveDatabasePath({ env: { XDG_DATA_HOME: value }, platform: 'linux', home: '/home/example' }), '/home/example/.local/share/codex-todo/todo.sqlite');
  }
  for (const value of ['C:relative', '\\root-relative', '%LOCALAPPDATA%']) {
    assert.throws(() => resolveDatabasePath({ env: { LOCALAPPDATA: value }, platform: 'win32', home: 'C:\\Users\\example' }), /LOCALAPPDATA must be an absolute path/u);
  }
  assert.throws(() => resolveDatabasePath({ env: {}, platform: 'linux', home: 'relative/home' }), /Home directory must be an absolute path/u);
});

test('new stores start empty and existing projects and tasks survive reopening', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codex-todo-data-paths-'));
  const file = join(directory, 'nested', 'todo.sqlite');
  let store;
  try {
    store = openStore(file, { seed: true });
    assert.deepEqual(store.execute('todo_list').board, { projects: [], tasks: [], revision: 0 });
    const project = store.execute('todo_project_save', { name: 'Existing project', path: directory }).board.projects[0];
    const saved = store.execute('todo_capture', { text: 'Keep the existing task', projectId: project.id }).board;
    store.close();
    store = openStore(file, { seed: false });
    assert.deepEqual(store.execute('todo_list').board, saved);
  } finally {
    store?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
