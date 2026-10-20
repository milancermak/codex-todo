import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Ajv from 'ajv';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { codexProjectCandidates, createCodexProjectSource } from '../src/codex-projects.mjs';

const fixtureCode = `import { appendFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
const mode = process.argv[2];
const pages = JSON.parse(process.env.TODO_TEST_PAGES);
const send = value => process.stdout.write(JSON.stringify(value) + '\\n');
const input = createInterface({input: process.stdin});
input.on('line', line => {
  const message = JSON.parse(line);
  appendFileSync(process.env.TODO_TEST_TRACE, JSON.stringify({pid: process.pid, mode, ...message}) + '\\n');
  if (message.method === 'initialize') {
    send({id: message.id, result: mode === 'bad-initialize' ? {} : {userAgent:process.env.TODO_TEST_USER_AGENT ?? 'codex-cli/0.163.0-alpha.10.2 test', platformFamily:'unix', platformOs:'linux', codexHome:process.env.TODO_TEST_HOME}});
  } else if (message.method === 'project/list') {
    if (mode === 'unsupported') send({id:message.id, error:{code:-32601,message:'Method not found'}});
    else if (mode === 'error') send({id:message.id, error:{code:-32603,message:'Private path and internal error'}});
    else if (mode === 'timeout') return;
    else if (mode === 'exit') process.exit(3);
    else if (mode === 'invalid-json') process.stdout.write('not json\\n');
    else if (mode === 'oversized') process.stdout.write('x'.repeat(20000));
    else send({id:message.id, result:pages[message.params.cursor ?? 'first']});
  }
});
`;

function project(id, directory, extra = {}) {
  return { id, name: `Project ${id}`, roots: [{ path: directory }], metadata: {}, createdAt: 100, updatedAt: 100, position: 0, recencyAt: null, ...extra };
}

async function fixture(t, { mode = 'success', pages, candidates, env: extraEnv = {}, ...options } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'codex-todo-projects-'));
  const executable = join(directory, 'app server fixture.mjs');
  const trace = join(directory, 'trace.jsonl');
  await writeFile(executable, fixtureCode);
  const defaultPages = { first: { data: [project('a', directory)], nextCursor: null } };
  const env = { ...process.env, ...extraEnv, TODO_TEST_PAGES: JSON.stringify(pages ?? defaultPages), TODO_TEST_TRACE: trace, TODO_TEST_HOME: directory };
  const candidate = selectedMode => ({ command: process.execPath, args: [executable, selectedMode] });
  const source = createCodexProjectSource({ env, platform: 'linux', candidates: candidates?.(candidate) ?? [candidate(mode)], timeoutMs: 1000, ...options });
  t.after(async () => {
    await source.close();
    await rm(directory, { recursive: true, force: true });
  });
  return { source, directory, async messages() { return (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); } };
}

test('official generated schemas accept project fixtures and the complete RPC handshake', async t => {
  const f = await fixture(t);
  const result = await f.source.listProjects();
  assert.deepEqual(result, { projects: [{ sourceId: 'a', name: 'Project a', path: f.directory }], catalogProjectIds: ['a'], unmappedProjectIds: [], source: 'codex-app-server', version: '0.163.0-alpha.10.2' });
  const ajv = new Ajv({ strict: false, allErrors: true });
  ajv.addFormat('uint32', { type: 'number', validate: value => Number.isInteger(value) && value >= 0 && value <= 4294967295 });
  ajv.addFormat('int64', { type: 'number', validate: value => Number.isSafeInteger(value) });
  const jsonSchema = new AjvJsonSchemaValidator(ajv);
  const schemas = {};
  for (const name of ['InitializeParams', 'InitializeResponse', 'ProjectListParams', 'ProjectListResponse']) {
    schemas[name] = JSON.parse(await readFile(new URL(`fixtures/codex-project-schema/${name}.json`, import.meta.url), 'utf8'));
  }
  const messages = await f.messages();
  assert.deepEqual(messages.map(message => message.method), ['initialize', 'initialized', 'project/list']);
  for (const [name, data] of [
    ['InitializeParams', messages[0].params],
    ['InitializeResponse', { userAgent: 'codex-cli/0.163.0-alpha.10.2 test', platformFamily: 'unix', platformOs: 'linux', codexHome: f.directory }],
    ['ProjectListParams', messages[2].params],
    ['ProjectListResponse', { data: [project('a', f.directory)], nextCursor: null }]
  ]) {
    const valid = jsonSchema.getValidator(schemas[name])(data);
    assert.equal(valid.valid, true, `${name}: ${valid.errorMessage}`);
  }
  assert.equal(jsonSchema.getValidator(schemas.ProjectListParams)({ limit: 4294967296 }).valid, false);
  assert.deepEqual(messages[0].params.capabilities, { experimentalApi: true, requestAttestation: false });
  assert.deepEqual(messages[2].params, { limit: 100, sortKey: 'position', sortDirection: 'asc' });
});

test('all pages are loaded, rootless IDs are preserved, and the first root stays stable even if absent', async t => {
  const f = await fixture(t, { pages: {
    first: { data: [project('a', '/missing/local/root', { roots: [{ path: '/missing/local/root' }, { path: '/another/root' }] })], nextCursor: 'second' },
    second: { data: [project('b', '/unused', { roots: [] })], nextCursor: null }
  } });
  const result = await f.source.listProjects();
  assert.deepEqual(result.projects, [{ sourceId: 'a', name: 'Project a', path: '/missing/local/root' }]);
  assert.deepEqual(result.catalogProjectIds, ['a', 'b']);
  assert.deepEqual(result.unmappedProjectIds, ['b']);
  assert.deepEqual((await f.messages()).filter(message => message.method === 'project/list').map(message => message.params.cursor), [undefined, 'second']);
});

test('concurrent reads share one request and later reads reuse the initialized connection', async t => {
  const f = await fixture(t);
  const first = f.source.listProjects();
  const concurrent = f.source.listProjects();
  assert.equal(first, concurrent);
  assert.deepEqual(await first, await concurrent);
  await f.source.listProjects();
  const messages = await f.messages();
  assert.equal(new Set(messages.map(message => message.pid)).size, 1);
  assert.deepEqual(messages.map(message => message.method), ['initialize', 'initialized', 'project/list', 'project/list']);
  await f.source.close();
  await assert.rejects(f.source.listProjects(), { code: 'closed' });
  assert.throws(() => process.kill(messages[0].pid, 0), { code: 'ESRCH' });
});

test('candidate selection prefers portable desktop locations and honors the explicit executable', () => {
  const candidates = codexProjectCandidates({ env: {}, platform: 'darwin', home: '/home/example' });
  assert.equal(candidates[0].command, '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex');
  assert.equal(candidates.at(-1).command, 'codex');
  assert.ok(candidates.some(candidate => candidate.command.startsWith('/home/example/Applications/')));
  assert.deepEqual(codexProjectCandidates({ env: {}, platform: 'linux', home: '/home/example' }), [{ command: 'codex', args: ['app-server'] }]);
  assert.deepEqual(codexProjectCandidates({ env: { TODO_CODEX_CLI: '/custom executable/codex' }, platform: 'darwin' }), [{ command: '/custom executable/codex', args: ['app-server'] }]);
  assert.throws(() => codexProjectCandidates({ env: { TODO_CODEX_CLI: '' } }), { code: 'unavailable' });
});

test('missing and unsupported executables fall back to a compatible candidate without model calls', async t => {
  const f = await fixture(t, { candidates: candidate => [{ command: '/nonexistent/codex', args: ['app-server'] }, candidate('unsupported'), candidate('success')] });
  assert.equal((await f.source.listProjects()).projects.length, 1);
  assert.ok((await f.messages()).every(message => ['initialize', 'initialized', 'project/list'].includes(message.method)));
  const initial = await f.messages();
  const supportedPid = initial.at(-1).pid;
  await f.source.listProjects();
  const later = await f.messages();
  assert.equal(later.at(-1).pid, supportedPid);
  assert.equal(later.length, initial.length + 1);
});

test('a valid empty catalog is distinguishable from an unsupported API', async t => {
  const empty = await fixture(t, { pages: { first: { data: [], nextCursor: null } } });
  assert.deepEqual((await empty.source.listProjects()).projects, []);
  const unsupported = await fixture(t, { mode: 'unsupported' });
  await assert.rejects(unsupported.source.listProjects(), { code: 'unsupported' });
});

test('malformed or incomplete catalogs never return a successful partial list', async t => {
  const invalidPages = [
    { first: {} },
    { first: { data: [] } },
    { first: { data: [project('a', '')], nextCursor: null } },
    { first: { data: [{ id: 'a', name: 'Missing fields', roots: [] }], nextCursor: null } },
    { first: { data: [project('a', 'relative/path')], nextCursor: null } },
    { first: { data: [project('a', '/absolute')], nextCursor: 'second' }, second: { data: [project('a', '/absolute')], nextCursor: null } },
    { first: { data: [project('a', '/absolute')], nextCursor: 'again' }, again: { data: [], nextCursor: 'again' } },
    { first: { data: [project('a', '/absolute')], nextCursor: '' } },
    { first: { data: [], nextCursor: 42 } }
  ];
  for (const pages of invalidPages) {
    const f = await fixture(t, { pages });
    await assert.rejects(f.source.listProjects(), { code: 'invalid-response' });
    await f.source.close();
  }
  for (const mode of ['invalid-json', 'bad-initialize', 'oversized']) {
    const f = await fixture(t, { mode, maxMessageBytes: 4096 });
    await assert.rejects(f.source.listProjects(), { code: 'invalid-response' });
    await f.source.close();
  }
});

test('process failures and timeouts remain errors and stop the child', async t => {
  for (const [mode, code] of [['exit', 'unavailable'], ['error', 'unavailable'], ['timeout', 'timeout']]) {
    const f = await fixture(t, { mode, timeoutMs: 300 });
    await assert.rejects(f.source.listProjects(), error => error.code === code && !error.message.includes('Private path'));
    const messages = await f.messages();
    assert.throws(() => process.kill(messages[0].pid, 0), { code: 'ESRCH' });
  }
});


test('excessive pagination is rejected as incomplete without returning its earlier pages', async t => {
  const pages = {};
  for (let index = 0; index < 100; index++) pages[index ? String(index) : 'first'] = { data: [], nextCursor: String(index + 1) };
  const f = await fixture(t, { pages });
  await assert.rejects(f.source.listProjects(), error => error.code === 'invalid-response' && /too many project pages/u.test(error.message));
});


test('version metadata supports the app-server client prefix instead of a fixed Codex product name', async t => {
  const f = await fixture(t, { env: { ...process.env, TODO_TEST_USER_AGENT: 'codex_todo_projects/0.163.0-alpha.10.2 (Mac OS 15.7.4; arm64) dumb' } });
  const result = await f.source.listProjects();
  assert.equal(result.version, '0.163.0-alpha.10.2');
});
