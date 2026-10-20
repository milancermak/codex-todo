import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { CallToolResultSchema, ListResourcesResultSchema, ListToolsResultSchema, ReadResourceResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { McpUiResourceMetaSchema, McpUiToolMetaSchema, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const serverPath = fileURLToPath(new URL('../src/server.mjs', import.meta.url));
const jsonSchema = new AjvJsonSchemaValidator();

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'codex-todo-mcp-')));
  const sessions = [];
  t.after(async () => {
    try {
      for (const session of sessions) await session.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  async function connect({ entrypoint = serverPath, cwd = projectRoot } = {}) {
    const errors = [];
    let stderr = '';
    let closed = false;
    const client = new Client({ name: 'codex-todo-contract-tests', version: '1.0.0' }, {
      capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
      jsonSchemaValidator: jsonSchema
    });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [entrypoint],
      cwd,
      env: { TODO_DB_PATH: join(directory, 'todo.sqlite'), TODO_PROJECT_SYNC: 'off' },
      stderr: 'pipe'
    });
    client.onerror = error => errors.push(error.message);
    transport.stderr.on('data', chunk => { stderr += chunk; });
    const session = {
      client,
      async close() {
        if (closed) return;
        closed = true;
        await client.close();
        assert.deepEqual(errors, [], `The stdio consumer received protocol errors. Server stderr: ${stderr}`);
      }
    };
    sessions.push(session);
    try {
      await client.connect(transport, { timeout: 10000 });
    } catch (error) {
      throw new Error(`Could not initialize the Todo server. ${stderr}`, { cause: error });
    }
    const listed = ListToolsResultSchema.parse(await client.listTools());
    const tools = new Map(listed.tools.map(tool => [tool.name, tool]));
    const validators = new Map(listed.tools.map(tool => {
      assert.ok(tool.outputSchema, `${tool.name} must publish its structured output contract`);
      return [tool.name, jsonSchema.getValidator(tool.outputSchema)];
    }));
    session.tools = tools;
    session.call = async (name, args = {}, { error = false } = {}) => {
      const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout: 10000 }));
      if (error) {
        assert.equal(result.isError, true, `${name} must mark a failed action as a tool error`);
        assert.ok(result.content.some(item => item.type === 'text' && item.text.trim().length > 0));
        return result;
      }
      assert.notEqual(result.isError, true, JSON.stringify(result.content));
      const validation = validators.get(name)(result.structuredContent);
      assert.equal(validation.valid, true, validation.errorMessage);
      return result.structuredContent;
    };
    return session;
  }

  return { directory, connect };
}

test('stdio discovery exposes callable sidebar entrypoints and a valid HTML resource', { timeout: 20000 }, async t => {
  const { connect } = await fixture(t);
  const session = await connect();
  const { client, tools } = session;
  assert.deepEqual([...tools.keys()].sort(), ['todo_add', 'todo_capture', 'todo_delete', 'todo_list', 'todo_project_delete', 'todo_project_save', 'todo_update']);

  const entrypoint = tools.get('todo_list');
  assert.deepEqual(entrypoint._meta['openai/ui'].entrypoints, [{ type: 'global' }, { type: 'thread' }]);
  assert.equal(jsonSchema.getValidator(entrypoint.inputSchema)({}).valid, true);
  assert.equal(entrypoint.annotations.readOnlyHint, true);
  const ui = McpUiToolMetaSchema.parse(entrypoint._meta.ui);
  assert.ok(ui.resourceUri.startsWith('ui://'));
  assert.ok(ui.visibility.includes('app'));
  for (const tool of tools.values()) {
    assert.equal(McpUiToolMetaSchema.parse(tool._meta.ui).resourceUri, ui.resourceUri);
    assert.equal(tool.annotations.openWorldHint, false);
  }
  assert.equal(tools.get('todo_delete').annotations.destructiveHint, true);
  assert.equal(tools.get('todo_project_delete').annotations.destructiveHint, true);

  const first = await session.call('todo_list');
  assert.deepEqual(first.board, { projects: [], tasks: [], revision: 0 });
  assert.deepEqual(await session.call('todo_list'), first);
  const resources = ListResourcesResultSchema.parse(await client.listResources());
  assert.ok(resources.resources.some(resource => resource.uri === ui.resourceUri && resource.mimeType === RESOURCE_MIME_TYPE));
  const resource = ReadResourceResultSchema.parse(await client.readResource({ uri: ui.resourceUri }));
  assert.equal(resource.contents.length, 1);
  const content = resource.contents[0];
  assert.equal(content.uri, ui.resourceUri);
  assert.equal(content.mimeType, RESOURCE_MIME_TYPE);
  assert.match(content.text, /<!doctype html>/i);
  assert.match(content.text, /<script\b/i);
  assert.equal(McpUiResourceMetaSchema.parse(content._meta.ui).prefersBorder, false);
  assert.deepEqual(content._meta['openai/ui'].availableDisplayModes, ['inline', 'fullscreen']);
  assert.equal(content._meta['openai/ui'].preferredDisplayMode, 'fullscreen');
  for (const legacyUri of ['ui://codex-todo/board-v1.html', 'ui://codex-todo/board-v2.html', 'ui://codex-todo/board-v3.html', 'ui://codex-todo/board-v4.html', 'ui://codex-todo/board-v5.html']) {
    const legacy = ReadResourceResultSchema.parse(await client.readResource({ uri: legacyUri }));
    assert.equal(legacy.contents[0].uri, legacyUri);
    assert.equal(legacy.contents[0].text, content.text);
  }
});

test('a running installed server serves its UI after an update removes its cache directory', { timeout: 20000 }, async t => {
  const { directory, connect } = await fixture(t);
  const installation = join(directory, 'installed-version');
  await mkdir(installation);
  await cp(join(projectRoot, 'dist'), join(installation, 'dist'), { recursive: true });
  await cp(join(projectRoot, 'assets'), join(installation, 'assets'), { recursive: true });
  const session = await connect({ entrypoint: join(installation, 'dist/server.mjs'), cwd: installation });
  const uri = session.tools.get('todo_list')._meta.ui.resourceUri;
  const before = ReadResourceResultSchema.parse(await session.client.readResource({ uri }));
  await rm(installation, { recursive: true });
  const after = ReadResourceResultSchema.parse(await session.client.readResource({ uri }));
  assert.deepEqual(after, before);
  assert.match(after.contents[0].text, /<!doctype html>/i);
  const legacy = ReadResourceResultSchema.parse(await session.client.readResource({ uri: 'ui://codex-todo/board-v1.html' }));
  assert.equal(legacy.contents[0].text, after.contents[0].text);
  assert.deepEqual((await session.call('todo_list')).board.tasks, []);
});

test('official stdio client validates CRUD, tool errors, and persistence across server processes', { timeout: 30000 }, async t => {
  const { directory, connect } = await fixture(t);
  let session = await connect();
  const saved = await session.call('todo_project_save', { name: 'Contract project', path: directory });
  const project = saved.board.projects.find(item => item.name === 'Contract project');
  assert.ok(project);
  assert.equal(project.path, directory);

  const title = 'Review café notes <script>alert("todo")</script>';
  const added = await session.call('todo_add', { title, notes: 'Capture now; begin later.', projectId: project.id, status: 'today' });
  const task = added.board.tasks.find(item => item.title === title);
  assert.ok(task);
  assert.equal(task.projectId, project.id);
  assert.equal(task.status, 'today');
  const updated = await session.call('todo_update', { id: task.id, notes: 'Continue when there is capacity.', status: 'backlog' });
  assert.equal(updated.board.tasks[0].notes, 'Continue when there is capacity.');
  assert.equal(updated.board.tasks[0].status, 'backlog');
  assert.ok(updated.board.revision > added.board.revision);

  await session.call('todo_add', { title: '' }, { error: true });
  await session.call('todo_update', { id: randomUUID(), title: 'Missing task' }, { error: true });
  await session.call('todo_project_save', { name: 'Duplicate path', path: directory }, { error: true });
  assert.deepEqual(await session.call('todo_list'), updated);

  await session.close();
  session = await connect();
  assert.deepEqual(await session.call('todo_list'), updated);
  const renamed = await session.call('todo_project_save', { id: project.id, name: 'Renamed project', path: directory });
  assert.equal(renamed.board.projects.find(item => item.id === project.id).name, 'Renamed project');
  const completed = await session.call('todo_update', { id: task.id, status: 'done' });
  assert.equal(completed.board.tasks.find(item => item.id === task.id).status, 'done');
  const unassigned = await session.call('todo_project_delete', { id: project.id });
  assert.deepEqual(unassigned.board.projects, []);
  assert.equal(unassigned.board.tasks.find(item => item.id === task.id).projectId, null);
  const deleted = await session.call('todo_delete', { id: task.id });
  assert.deepEqual(deleted.board.tasks, []);
  await session.call('todo_delete', { id: task.id }, { error: true });
  assert.deepEqual(await session.call('todo_list'), deleted);
});

test('capture resolves a multiword project tag and rejects uncertain assignments before writing', { timeout: 20000 }, async t => {
  const { directory, connect } = await fixture(t);
  const session = await connect();
  const { board: projects } = await session.call('todo_project_save', { name: 'example app', path: directory });
  const project = projects.projects[0];
  const saved = await session.call('todo_capture', { text: '/today build iphone animation #example app' });
  const task = saved.board.tasks[0];
  assert.equal(task.title, 'build iphone animation');
  assert.equal(task.notes, '');
  assert.equal(task.status, 'today');
  assert.equal(task.projectId, project.id);
  await session.call('todo_capture', { text: 'Explore native animations #exmple app' }, { error: true });
  assert.deepEqual(await session.call('todo_list'), saved);
  const confirmed = await session.call('todo_capture', { text: 'Explore native animations #exmple app', projectId: project.id });
  assert.equal(confirmed.board.tasks.length, 2);
  assert.equal(confirmed.board.tasks.find(item => item.title === 'Explore native animations').projectId, project.id);
  const completed = await session.call('todo_update', { id: task.id, status: 'done' });
  assert.equal(completed.board.tasks.find(item => item.id === task.id).previousStatus, 'today');
  const moved = await session.call('todo_update', { id: task.id, status: 'done', previousStatus: 'backlog' });
  const done = moved.board.tasks.find(item => item.id === task.id);
  assert.equal(done.status, 'done');
  assert.equal(done.previousStatus, 'backlog');
  for (const [text, title, status] of [
    ['/today #example app Polish the transition', 'Polish the transition', 'today'],
    ['$codex-todo:backlog Review #example-app keyboard shortcuts', 'Review keyboard shortcuts', 'backlog'],
    ['Compare #"example app" with the current layout', 'Compare with the current layout', 'backlog']
  ]) {
    const captured = await session.call('todo_capture', { text });
    const entry = captured.board.tasks.find(item => item.title === title);
    assert.ok(entry, 'Surrounding idea text survives the MCP capture contract.');
    assert.equal(entry.projectId, project.id);
    assert.equal(entry.status, status);
  }
});
