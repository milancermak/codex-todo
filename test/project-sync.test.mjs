import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.mjs';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'codex-todo-project-sync-'));
  const database = join(directory, 'board.sqlite');
  let store = openStore(database);
  return {
    directory,
    get store() { return store; },
    reopen() { store.close(); store = openStore(database); },
    close() { store.close(); rmSync(directory, { recursive: true, force: true }); }
  };
}

function catalogProject(directory, sourceId, name = sourceId) {
  return { sourceId, name, path: join(directory, sourceId) };
}

test('Codex projects autoload with Unicode names, stable identifiers and no revision churn', () => {
  const state = fixture();
  try {
    const projects = [catalogProject(state.directory, 'first', 'Example App'), catalogProject(state.directory, 'second', 'Příběhy 🌙')];
    const initial = state.store.syncCodexProjects(projects).board;
    assert.equal(initial.projects.length, 2);
    assert.equal(initial.revision, 1);
    assert.deepEqual(new Set(initial.projects.map(project => project.name)), new Set(['Example App', 'Příběhy 🌙']));
    assert.deepEqual(state.store.syncCodexProjects([...projects].reverse()).board, initial);
    state.reopen();
    assert.deepEqual(state.store.syncCodexProjects(projects).board, initial);
    const renamed = state.store.syncCodexProjects([{ ...projects[0], name: 'A renamed app' }, projects[1]]).board;
    assert.equal(renamed.revision, initial.revision + 1);
    assert.equal(renamed.projects.find(project => project.name === 'A renamed app').id, initial.projects.find(project => project.name === 'Example App').id);
  } finally { state.close(); }
});

test('existing project mappings are adopted and source renames or moves preserve linked tasks', () => {
  const state = fixture();
  try {
    const existing = state.store.execute('todo_project_save', { name: 'Existing label', path: state.directory }).board.projects[0];
    const task = state.store.execute('todo_add', { title: 'Keep this task', projectId: existing.id }).board.tasks[0];
    const before = state.store.execute('todo_list').board;
    const source = { sourceId: 'codex-project', name: existing.name, path: join(state.directory, '.') };
    const adopted = state.store.syncCodexProjects([source]).board;
    assert.deepEqual(adopted, before);
    const moved = state.store.syncCodexProjects([{ ...source, name: 'New project label', path: join(state.directory, 'new location') }]).board;
    assert.equal(moved.projects[0].id, existing.id);
    assert.equal(moved.projects[0].name, 'New project label');
    assert.equal(moved.projects[0].path, join(state.directory, 'new location'));
    assert.deepEqual(moved.tasks[0], task);
    assert.equal(moved.revision, before.revision + 1);
    state.reopen();
    assert.deepEqual(state.store.syncCodexProjects([{ ...source, name: 'New project label', path: join(state.directory, 'new location') }]).board, moved);
  } finally { state.close(); }
});

test('catalog removal preserves tasks and leaves manually configured projects untouched', () => {
  const state = fixture();
  try {
    const manual = state.store.execute('todo_project_save', { name: 'Manual', path: state.directory }).board.projects[0];
    const manualTask = state.store.execute('todo_add', { title: 'Manual task', projectId: manual.id }).board.tasks[0];
    const source = catalogProject(state.directory, 'managed', 'Managed');
    const managed = state.store.syncCodexProjects([source]).board.projects.find(project => project.name === 'Managed');
    const managedTask = state.store.execute('todo_add', { title: 'Managed task', projectId: managed.id }).board.tasks.find(task => task.title === 'Managed task');
    const previous = state.store.execute('todo_list').board;
    const removed = state.store.syncCodexProjects([]).board;
    assert.deepEqual(removed.projects, [manual]);
    assert.deepEqual(removed.tasks.find(task => task.id === manualTask.id), manualTask);
    assert.deepEqual(removed.tasks.find(task => task.id === managedTask.id), { ...managedTask, projectId: null });
    assert.equal(removed.revision, previous.revision + 1);
    assert.deepEqual(state.store.syncCodexProjects([]).board, removed);
  } finally { state.close(); }
});

test('a Codex source identifier replacement adopts the existing directory without breaking task links', () => {
  const state = fixture();
  try {
    const source = catalogProject(state.directory, 'original', 'Example App');
    const project = state.store.syncCodexProjects([source]).board.projects[0];
    const task = state.store.execute('todo_add', { title: 'Keep assignment', projectId: project.id }).board.tasks[0];
    const before = state.store.execute('todo_list').board;
    assert.deepEqual(state.store.syncCodexProjects([{ ...source, sourceId: 'replacement' }]).board, before);
    state.reopen();
    const renamed = state.store.syncCodexProjects([{ ...source, sourceId: 'replacement', name: 'Renamed' }]).board;
    assert.equal(renamed.projects[0].id, project.id);
    assert.deepEqual(renamed.tasks[0], task);
    assert.equal(renamed.revision, before.revision + 1);
  } finally { state.close(); }
});

test('malformed or ambiguous snapshots fail before changing projects, tasks or synchronization mappings', () => {
  const state = fixture();
  try {
    const first = catalogProject(state.directory, 'first');
    const second = catalogProject(state.directory, 'second');
    state.store.syncCodexProjects([first, second]);
    const project = state.store.execute('todo_list').board.projects[0];
    state.store.execute('todo_add', { title: 'Unchanged', projectId: project.id });
    const before = state.store.execute('todo_list').board;
    const invalid = [
      null,
      {},
      [null],
      [{ ...first, sourceId: '' }],
      [{ ...first, name: ' ' }],
      [{ ...first, path: 'relative/project' }],
      [first, { ...second, sourceId: first.sourceId }],
      [first, { ...second, path: join(first.path, '.') }],
      [{ ...first, path: second.path }, { ...second, path: first.path }],
      [first, second, { sourceId: 'third', name: 'Third', path: first.path }]
    ];
    for (const snapshot of invalid) {
      assert.throws(() => state.store.syncCodexProjects(snapshot));
      assert.deepEqual(state.store.execute('todo_list').board, before);
    }
    assert.deepEqual(state.store.syncCodexProjects([first, second]).board, before);
  } finally { state.close(); }
});

test('conflicts with a manual directory roll back catalog deletions and keep mappings usable', () => {
  const state = fixture();
  try {
    const manualDirectory = join(state.directory, 'manual');
    mkdirSync(manualDirectory);
    state.store.execute('todo_project_save', { name: 'Manual', path: manualDirectory });
    const first = catalogProject(state.directory, 'first');
    const second = catalogProject(state.directory, 'second');
    const loaded = state.store.syncCodexProjects([first, second]).board;
    const taskProject = loaded.projects.find(project => project.name === 'second');
    state.store.execute('todo_add', { title: 'Keep even after rollback', projectId: taskProject.id });
    const before = state.store.execute('todo_list').board;
    assert.throws(() => state.store.syncCodexProjects([{ ...first, path: manualDirectory }]));
    assert.deepEqual(state.store.execute('todo_list').board, before);
    assert.deepEqual(state.store.syncCodexProjects([first, second]).board, before);
    const corrected = state.store.syncCodexProjects([{ ...first, name: 'First renamed' }, second]).board;
    assert.equal(corrected.projects.find(project => project.name === 'First renamed').id, before.projects.find(project => project.name === 'first').id);
  } finally { state.close(); }
});

test('projects still present in Codex retain their mappings while their local root is unavailable', () => {
  const state = fixture();
  try {
    const first = catalogProject(state.directory, 'first');
    const second = catalogProject(state.directory, 'second');
    state.store.syncCodexProjects([first, second]);
    const before = state.store.execute('todo_list').board;
    assert.deepEqual(state.store.syncCodexProjects([first], { preserveSourceIds: ['second'] }).board, before);
    state.reopen();
    assert.deepEqual(state.store.syncCodexProjects([], { preserveSourceIds: ['first', 'second'] }).board, before);
    for (const preserveSourceIds of [null, [''], [4], ['first', 'first'], ['second']]) {
      assert.throws(() => state.store.syncCodexProjects([second], { preserveSourceIds }));
      assert.deepEqual(state.store.execute('todo_list').board, before);
    }
    assert.deepEqual(state.store.syncCodexProjects([first, second]).board, before);
  } finally { state.close(); }
});

test('manual deletion of a managed project clears its mapping and a later sync can reload it', () => {
  const state = fixture();
  try {
    const source = catalogProject(state.directory, 'managed');
    const project = state.store.syncCodexProjects([source]).board.projects[0];
    const task = state.store.execute('todo_add', { title: 'Keep task', projectId: project.id }).board.tasks[0];
    state.store.execute('todo_project_delete', { id: project.id });
    const reloaded = state.store.syncCodexProjects([source]).board;
    assert.equal(reloaded.projects.length, 1);
    assert.notEqual(reloaded.projects[0].id, project.id);
    assert.deepEqual(reloaded.tasks[0], { ...task, projectId: null });
  } finally { state.close(); }
});
