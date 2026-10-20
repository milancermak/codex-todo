import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { CallToolResultSchema, ListResourcesResultSchema, ListToolsResultSchema, ReadResourceResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const jsonSchema = new AjvJsonSchemaValidator();

async function inventory(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = posix.join(prefix, entry.name);
    assert.notEqual(entry.name, 'node_modules', 'The distributed package must be dependency-free.');
    assert.equal(entry.isSymbolicLink(), false, `Unexpected package symlink: ${relative}`);
    if (entry.isDirectory()) files.push(...await inventory(join(directory, entry.name), relative));
    else files.push(relative);
  }
  return files.sort();
}

test('portable package runs without dependencies and retains external plugin data after relocation', { timeout: 30000 }, async t => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'codex todo package ')));
  const firstInstallation = join(directory, 'installed packages with spaces', 'first version');
  const secondInstallation = join(directory, 'relocated packages with spaces', 'next version');
  const pluginData = join(directory, 'persistent plugin data');
  const projectDirectory = join(directory, 'temporary project');
  const sessions = [];
  t.after(async () => {
    try {
      for (const session of sessions) await session.close();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  await cp(join(projectRoot, 'plugin'), firstInstallation, { recursive: true });
  await mkdir(projectDirectory);
  assert.match(firstInstallation, / /u);
  assert.match(secondInstallation, / /u);
  assert.equal(pluginData.startsWith(firstInstallation), false);

  const files = await inventory(firstInstallation);
  for (const required of ['dist/server.mjs', 'dist/index.html', 'assets/icon.svg', 'plugin.json', 'mcp.json', '.codex-plugin/plugin.json', '.mcp.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'skills/backlog/SKILL.md', 'skills/todo/SKILL.md', 'skills/today/SKILL.md']) {
    assert.ok(files.includes(required), `Missing distributed file: ${required}`);
  }
  assert.deepEqual(files.filter(file => file.startsWith('skills/') && file.endsWith('/SKILL.md')), ['skills/backlog/SKILL.md', 'skills/today/SKILL.md', 'skills/todo/SKILL.md']);
  assert.equal(files.some(file => /(?:^|\/)(?:projects\.json|seed[^/]*|data)(?:\/|$)|\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$/iu.test(file)), false, 'The package must not carry seeded projects or a database.');
  for (const file of files) {
    const text = await readFile(join(firstInstallation, file), 'utf8');
    assert.equal(text.includes(projectRoot), false, `Developer checkout path embedded in ${file}`);
  }
  assert.match(await readFile(join(firstInstallation, 'LICENSE'), 'utf8'), /MIT License/u);
  const notices = await readFile(join(firstInstallation, 'THIRD_PARTY_NOTICES.md'), 'utf8');
  assert.match(notices, /@modelcontextprotocol\/sdk/u);
  assert.match(notices, /@modelcontextprotocol\/ext-apps/u);
  for (const skill of ['backlog', 'todo', 'today']) {
    assert.match(await readFile(join(firstInstallation, 'skills', skill, 'SKILL.md'), 'utf8'), new RegExp(`^---\\r?\\nname: ${skill}\\r?\\n`));
  }

  const portable = JSON.parse(await readFile(join(firstInstallation, 'mcp.json'), 'utf8'));
  const legacy = JSON.parse(await readFile(join(firstInstallation, '.mcp.json'), 'utf8'));
  assert.deepEqual(portable.mcpServers, { todo: { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/dist/server.mjs'], cwd: '${PLUGIN_ROOT}' } });
  assert.deepEqual(legacy.mcpServers, { todo: { command: 'node', args: ['${CODEX_PLUGIN_ROOT}/dist/server.mjs'], cwd: '${CODEX_PLUGIN_ROOT}' } });
  const manifest = JSON.parse(await readFile(join(firstInstallation, 'plugin.json'), 'utf8'));
  const compatibilityManifest = JSON.parse(await readFile(join(firstInstallation, '.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(compatibilityManifest.name, manifest.name);
  assert.equal(compatibilityManifest.version, manifest.version);
  assert.equal(manifest.license, 'MIT');
  assert.equal(compatibilityManifest.skills, './skills/');

  async function connect(installation) {
    const config = JSON.parse(await readFile(join(installation, 'mcp.json'), 'utf8')).mcpServers.todo;
    const expand = value => value.replaceAll('${PLUGIN_ROOT}', installation).replaceAll('${PLUGIN_DATA}', pluginData);
    const env = { ...getDefaultEnvironment(), PLUGIN_ROOT: installation, PLUGIN_DATA: pluginData, TODO_PROJECT_SYNC: 'off' };
    assert.equal(Object.hasOwn(env, 'TODO_DB_PATH'), false, 'The package consumer must exercise PLUGIN_DATA without a database override.');
    const errors = [];
    let stderr = '';
    let closed = false;
    const client = new Client({ name: 'codex-todo-portable-package-test', version: '1.0.0' }, {
      capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: [RESOURCE_MIME_TYPE] } } },
      jsonSchemaValidator: jsonSchema
    });
    const transport = new StdioClientTransport({ command: config.command, args: config.args.map(expand), cwd: expand(config.cwd), env, stderr: 'pipe' });
    client.onerror = error => errors.push(error.message);
    transport.stderr.on('data', chunk => { stderr += chunk; });
    const session = {
      client,
      async close() {
        if (closed) return;
        closed = true;
        await client.close();
        assert.deepEqual(errors, [], `Package consumer protocol errors. Server stderr: ${stderr}`);
      }
    };
    sessions.push(session);
    try {
      await client.connect(transport, { timeout: 10000 });
    } catch (error) {
      throw new Error(`Could not initialize the relocated package. Server stderr: ${stderr}`, { cause: error });
    }
    assert.equal(client.getServerVersion().name, manifest.name);
    assert.equal(client.getServerVersion().version, manifest.version);
    const listed = ListToolsResultSchema.parse(await client.listTools());
    const tools = new Map(listed.tools.map(tool => [tool.name, tool]));
    session.call = async (name, args = {}) => {
      const tool = tools.get(name);
      assert.ok(tool?.outputSchema, `${name} must expose its output contract.`);
      const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }, CallToolResultSchema, { timeout: 10000 }));
      assert.notEqual(result.isError, true, JSON.stringify(result.content));
      const validation = jsonSchema.getValidator(tool.outputSchema)(result.structuredContent);
      assert.equal(validation.valid, true, validation.errorMessage);
      return result.structuredContent;
    };
    const uri = tools.get('todo_list')._meta.ui.resourceUri;
    const resources = ListResourcesResultSchema.parse(await client.listResources());
    assert.ok(resources.resources.some(resource => resource.uri === uri));
    const resource = ReadResourceResultSchema.parse(await client.readResource({ uri }));
    assert.equal(resource.contents[0].mimeType, RESOURCE_MIME_TYPE);
    assert.match(resource.contents[0].text, /<!doctype html>/iu);
    assert.match(resource.contents[0].text, /<script\b/iu);
    session.html = resource.contents[0].text;
    return session;
  }

  const first = await connect(firstInstallation);
  assert.deepEqual((await first.call('todo_list')).board, { projects: [], tasks: [], revision: 0 });
  const projectBoard = (await first.call('todo_project_save', { name: 'Portable package project', path: projectDirectory })).board;
  assert.equal(projectBoard.projects.length, 1);
  const project = projectBoard.projects[0];
  const saved = (await first.call('todo_capture', { text: '/today Verify portable storage #Portable package project' })).board;
  assert.equal(saved.tasks.length, 1);
  assert.equal(saved.tasks[0].title, 'Verify portable storage');
  assert.equal(saved.tasks[0].status, 'today');
  assert.equal(saved.tasks[0].projectId, project.id);
  await first.close();
  assert.equal((await stat(join(pluginData, 'todo.sqlite'))).isFile(), true);
  assert.deepEqual(await inventory(firstInstallation), files, 'Running the package must not add data to its installation directory.');

  await cp(firstInstallation, secondInstallation, { recursive: true });
  await rm(firstInstallation, { recursive: true });
  await assert.rejects(stat(firstInstallation), { code: 'ENOENT' });
  assert.deepEqual(await inventory(secondInstallation), files);
  const second = await connect(secondInstallation);
  assert.deepEqual((await second.call('todo_list')).board, saved);
  assert.equal(second.html, first.html);
  await second.close();
});
