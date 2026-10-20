import assert from 'node:assert/strict';
import test from 'node:test';
import { openStore } from '../src/store.mjs';
import { createProjectSync } from '../src/project-sync.mjs';

function fixture(t, options = {}) {
  const store = openStore(':memory:');
  let clock = 1700000000000;
  let calls = 0;
  let snapshot = { projects: [{ sourceId: 'host-project', name: 'Example App', path: '/example/app' }], unmappedProjectIds: [], version: 'test' };
  let failure;
  const source = {
    async listProjects() { calls++; if (failure) throw failure; return snapshot; },
    async close() {}
  };
  const sync = createProjectSync(store, { source, env: {}, now: () => clock, ...options });
  t.after(async () => { await sync.close(); store.close(); });
  return {
    store, sync,
    get calls() { return calls; },
    advance(ms) { clock += ms; },
    setSnapshot(value) { snapshot = value; },
    fail(error) { failure = error; }
  };
}

test('the first list autoloads projects and captures tagged ideas without manual setup', async t => {
  const f = fixture(t);
  const first = await f.sync.execute('todo_list');
  assert.equal(first.projectSync.status, 'ready');
  assert.equal(first.board.projects[0].name, 'Example App');
  for (const command of ['/todo', '/backlog', '$codex-todo:backlog']) {
    const added = await f.sync.execute('todo_capture', { text: command + ' Keep an idea #example-app' });
    assert.equal(added.board.tasks[0].projectId, first.board.projects[0].id);
    assert.equal(added.board.tasks[0].status, 'backlog');
  }
  assert.equal(f.calls, 1);
});

test('visible polling refreshes the catalog after its TTL and Retry bypasses the cache', async t => {
  const f = fixture(t);
  const first = await f.sync.execute('todo_list');
  f.setSnapshot({ projects: [{ sourceId: 'host-project', name: 'Renamed App', path: '/example/renamed' }], unmappedProjectIds: [] });
  f.advance(14999);
  assert.deepEqual((await f.sync.execute('todo_list')).board, first.board);
  assert.equal(f.calls, 1);
  f.advance(1);
  const refreshed = await f.sync.execute('todo_list');
  assert.equal(refreshed.board.projects[0].name, 'Renamed App');
  assert.equal(refreshed.board.projects[0].id, first.board.projects[0].id);
  assert.equal(f.calls, 2);
  await f.sync.execute('todo_list', { refreshProjects: true });
  assert.equal(f.calls, 3);
});

test('discovery and reconciliation failures preserve the last good projects and remain recoverable', async t => {
  const f = fixture(t);
  const first = await f.sync.execute('todo_list');
  await f.sync.execute('todo_capture', { text: 'Keep existing work #Example App' });
  f.fail(Object.assign(new Error('Private diagnostic not shown'), { code: 'unsupported' }));
  const failed = await f.sync.execute('todo_list', { refreshProjects: true });
  assert.equal(failed.projectSync.status, 'error');
  assert.match(failed.projectSync.error, /Update Codex/u);
  assert.doesNotMatch(failed.projectSync.error, /Private diagnostic/u);
  assert.deepEqual(failed.board.projects, first.board.projects);
  assert.equal(failed.board.tasks.length, 1);
  f.fail(undefined);
  f.setSnapshot({ projects: [{ sourceId: 'host-project', name: '', path: '/example/app' }], unmappedProjectIds: [] });
  const malformed = await f.sync.execute('todo_list', { refreshProjects: true });
  assert.equal(malformed.projectSync.status, 'error');
  assert.deepEqual(malformed.board, failed.board);
  f.setSnapshot({ projects: [{ sourceId: 'host-project', name: 'Example App', path: '/example/app' }], unmappedProjectIds: [] });
  const recovered = await f.sync.execute('todo_list', { refreshProjects: true });
  assert.equal(recovered.projectSync.status, 'ready');
  assert.equal(recovered.projectSync.error, null);
  assert.deepEqual(recovered.board, failed.board);
});

test('a valid empty catalog removes managed assignments while retaining task text', async t => {
  const f = fixture(t);
  await f.sync.execute('todo_capture', { text: 'Retain my idea #Example App' });
  f.setSnapshot({ projects: [], unmappedProjectIds: [] });
  const result = await f.sync.execute('todo_list', { refreshProjects: true });
  assert.equal(result.projectSync.status, 'ready');
  assert.deepEqual(result.board.projects, []);
  assert.equal(result.board.tasks[0].title, 'Retain my idea');
  assert.equal(result.board.tasks[0].projectId, null);
});

test('concurrent consumers share discovery and invalid tool inputs do not trigger it', async t => {
  let release;
  let calls = 0;
  const pending = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { source: { async listProjects() { calls++; await pending; return { projects: [], unmappedProjectIds: [] }; }, async close() { release(); } } });
  await assert.rejects(f.sync.execute('todo_list', { refreshProjects: 'yes' }));
  assert.equal(calls, 0);
  const first = f.sync.execute('todo_list');
  const second = f.sync.execute('todo_list', { refreshProjects: true });
  release();
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
});

test('explicitly disabled discovery never starts the source and keeps standalone capture working', async t => {
  const f = fixture(t, { env: { TODO_PROJECT_SYNC: 'off' } });
  const result = await f.sync.execute('todo_capture', { text: '/backlog Isolated capture' });
  assert.equal(result.projectSync.status, 'disabled');
  assert.equal(result.board.tasks[0].title, 'Isolated capture');
  assert.equal(f.calls, 0);
});
