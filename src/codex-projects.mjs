import { spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { z } from 'zod';
import { VERSION } from './version.js';

const liveChildren = new Set();
const stopChildren = () => { for (const child of liveChildren) child.kill('SIGTERM'); };
const integer = z.number().int();
const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().refine(value => value.trim().length > 0),
  roots: z.array(z.object({ path: z.string().min(1) })),
  metadata: z.record(z.string(), z.string()),
  createdAt: integer,
  updatedAt: integer,
  position: integer,
  recencyAt: integer.nullable().optional()
});
const pageSchema = z.object({ data: z.array(projectSchema), nextCursor: z.string().nullable() });
const initializeSchema = z.object({ userAgent: z.string(), platformFamily: z.string(), platformOs: z.string(), codexHome: z.string() });

export class CodexProjectError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'CodexProjectError';
    this.code = code;
  }
}

export function codexProjectCandidates({ env = process.env, platform = process.platform, home = homedir() } = {}) {
  if (env.TODO_CODEX_CLI !== undefined) {
    if (typeof env.TODO_CODEX_CLI !== 'string' || !env.TODO_CODEX_CLI.trim() || /[\0\r\n]/u.test(env.TODO_CODEX_CLI)) {
      throw new CodexProjectError('unavailable', 'TODO_CODEX_CLI must name a Codex executable.');
    }
    return [{ command: env.TODO_CODEX_CLI, args: ['app-server'] }];
  }
  const candidates = [];
  if (platform === 'darwin') {
    for (const directory of ['/Applications', join(home, 'Applications')]) {
      for (const app of ['ChatGPT.app', 'Codex.app']) {
        candidates.push({ command: join(directory, app, 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'), args: ['app-server'] });
      }
    }
  }
  candidates.push({ command: 'codex', args: ['app-server'] });
  return candidates;
}

function registerChild(child) {
  if (!liveChildren.size) process.once('exit', stopChildren);
  liveChildren.add(child);
  child.once('close', () => {
    liveChildren.delete(child);
    if (!liveChildren.size) process.removeListener('exit', stopChildren);
  });
}

class ProjectRpcClient {
  constructor(candidate, { env, timeoutMs, maxMessageBytes, spawnProcess }) {
    this.pending = new Map();
    this.sequence = 0;
    this.timeoutMs = timeoutMs;
    this.failure = null;
    this.stopped = false;
    this.child = spawnProcess(candidate.command, candidate.args ?? ['app-server'], { env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const child = this.child;
    registerChild(child);
    child.unref();
    let buffer = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      if (this.failure || this.stopped) return;
      buffer += chunk;
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (Buffer.byteLength(line) > maxMessageBytes) {
          this.fail(new CodexProjectError('invalid-response', 'Codex returned an oversized project response.'));
          return;
        }
        if (!line.trim()) continue;
        try {
          this.receive(JSON.parse(line));
        } catch (error) {
          this.fail(error instanceof CodexProjectError ? error : new CodexProjectError('invalid-response', 'Codex returned an invalid project response.', { cause: error }));
          return;
        }
      }
      if (Buffer.byteLength(buffer) > maxMessageBytes) this.fail(new CodexProjectError('invalid-response', 'Codex returned an oversized project response.'));
    });
    child.stderr.on('data', () => {});
    child.stdin.on('error', error => this.fail(new CodexProjectError('unavailable', 'The Codex project connection closed.', { cause: error })));
    child.once('error', error => this.fail(new CodexProjectError('unavailable', 'A compatible Codex executable could not be started.', { cause: error })));
    child.once('exit', () => this.fail(new CodexProjectError('unavailable', 'The Codex project connection closed.')));
  }

  reference(active) {
    for (const stream of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      if (active) stream.ref?.();
      else stream.unref?.();
    }
  }

  receive(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new CodexProjectError('invalid-response', 'Codex returned an invalid project response.');
    if (typeof message.method === 'string') {
      if (Object.hasOwn(message, 'id')) this.send({ id: message.id, error: { code: -32601, message: 'Unsupported request' } });
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) throw new CodexProjectError('invalid-response', 'Codex returned an invalid project response.');
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) {
      if (typeof message.error !== 'object' || !Number.isInteger(message.error.code) || typeof message.error.message !== 'string') {
        pending.reject(new CodexProjectError('invalid-response', 'Codex returned an invalid project error.'));
        if (!this.pending.size) this.reference(false);
        return;
      }
      const unsupported = message.error.code === -32601 || /requires experimentalApi|unknown (?:method|variant)|method not found/iu.test(message.error.message ?? '');
      pending.reject(new CodexProjectError(unsupported ? 'unsupported' : 'unavailable', unsupported ? 'This Codex version does not support automatic project discovery.' : 'Codex could not read the project list.'));
    } else pending.resolve(message.result);
    if (!this.pending.size) this.reference(false);
  }

  send(message) {
    if (this.failure) throw this.failure;
    if (this.stopped) throw new CodexProjectError('closed', 'The Codex project source is closed.');
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  request(method, params, timeoutMs = this.timeoutMs) {
    if (this.failure) return Promise.reject(this.failure);
    if (this.stopped) return Promise.reject(new CodexProjectError('closed', 'The Codex project source is closed.'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      this.reference(true);
      const timer = setTimeout(() => this.fail(new CodexProjectError('timeout', 'Codex project discovery timed out.')), Math.max(1, timeoutMs));
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ id, method, params });
      } catch (error) {
        this.fail(error);
      }
    });
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.reference(false);
    this.child.kill('SIGTERM');
  }

  async initialize() {
    const response = await this.request('initialize', { clientInfo: { name: 'codex_todo_projects', title: 'Codex Todo', version: VERSION }, capabilities: { experimentalApi: true, requestAttestation: false } });
    const parsed = initializeSchema.safeParse(response);
    if (!parsed.success) throw new CodexProjectError('invalid-response', 'Codex returned an invalid initialization response.');
    this.send({ method: 'initialized', params: {} });
    this.version = /(?:^|\s)[^\s/]+(?:\s+[^\s/]+)?\/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)(?=\s|$)/u.exec(response.userAgent)?.[1] ?? response.userAgent;
  }

  async close() {
    if (this.stopped) return;
    this.stopped = true;
    this.fail(new CodexProjectError('closed', 'The Codex project source is closed.'));
    if (this.child.exitCode !== null || this.child.signalCode !== null || !this.child.pid) return;
    this.reference(true);
    await new Promise(resolve => {
      let finished = false;
      const complete = () => {
        if (finished) return;
        finished = true;
        clearTimeout(terminate);
        clearTimeout(abandon);
        this.child.removeListener('exit', complete);
        this.reference(false);
        resolve();
      };
      const terminate = setTimeout(() => this.child.kill('SIGKILL'), 300);
      const abandon = setTimeout(complete, 600);
      this.child.once('exit', complete);
      this.child.stdin.end();
      this.child.kill('SIGTERM');
    });
  }
}

export function createCodexProjectSource(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const candidates = options.candidates ?? codexProjectCandidates({ env, platform, home: options.home ?? homedir() });
  const timeoutMs = options.timeoutMs ?? 5000;
  const catalogTimeoutMs = options.catalogTimeoutMs ?? 15000;
  const paths = platform === 'win32' ? win32 : posix;
  let active = null;
  let activeCandidate = null;
  let inflight = null;
  let closed = false;

  async function readCatalog(client) {
    const projects = [];
    const catalogProjectIds = [];
    const unmappedProjectIds = [];
    const ids = new Set();
    const cursors = new Set();
    const deadline = Date.now() + catalogTimeoutMs;
    let cursor;
    for (let pageNumber = 0; pageNumber < 100; pageNumber++) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new CodexProjectError('timeout', 'Codex project discovery timed out.');
      const response = await client.request('project/list', { limit: 100, sortKey: 'position', sortDirection: 'asc', ...(cursor === undefined ? {} : { cursor }) }, Math.min(timeoutMs, remaining));
      const parsed = pageSchema.safeParse(response);
      if (!parsed.success) throw new CodexProjectError('invalid-response', 'Codex returned an invalid project list.');
      for (const project of parsed.data.data) {
        if (ids.has(project.id)) throw new CodexProjectError('invalid-response', 'Codex returned an inconsistent project list.');
        ids.add(project.id);
        if (ids.size > 10000) throw new CodexProjectError('invalid-response', 'Codex returned too many projects.');
        catalogProjectIds.push(project.id);
        for (const root of project.roots) {
          if (!paths.isAbsolute(root.path) || /[\0\r\n]/u.test(root.path) || (platform === 'win32' && !/^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/u.test(root.path))) {
            throw new CodexProjectError('invalid-response', 'Codex returned a project with an invalid folder path.');
          }
        }
        if (project.roots.length) projects.push({ sourceId: project.id, name: project.name, path: project.roots[0].path });
        else unmappedProjectIds.push(project.id);
      }
      cursor = parsed.data.nextCursor;
      if (cursor === null || cursor === undefined) return { projects, catalogProjectIds, unmappedProjectIds, source: 'codex-app-server', version: client.version };
      if (!cursor || cursors.has(cursor)) throw new CodexProjectError('invalid-response', 'Codex returned an inconsistent project cursor.');
      cursors.add(cursor);
    }
    throw new CodexProjectError('invalid-response', 'Codex returned too many project pages.');
  }

  async function load() {
    let lastError = new CodexProjectError('unavailable', 'A compatible Codex executable could not be found.');
    const ordered = activeCandidate ? [activeCandidate, ...candidates.filter(candidate => candidate !== activeCandidate)] : candidates;
    for (const candidate of ordered) {
      if (closed) throw new CodexProjectError('closed', 'The Codex project source is closed.');
      let client = active;
      try {
        if (!client) {
          client = new ProjectRpcClient(candidate, { env, timeoutMs, maxMessageBytes: options.maxMessageBytes ?? 2 * 1024 * 1024, spawnProcess: options.spawnProcess ?? spawn });
          active = client;
          activeCandidate = candidate;
          await client.initialize();
        }
        return await readCatalog(client);
      } catch (error) {
        await client?.close();
        active = null;
        activeCandidate = null;
        lastError = error instanceof CodexProjectError ? error : new CodexProjectError('unavailable', 'Codex project discovery is unavailable.', { cause: error });
        if (!['unsupported', 'unavailable'].includes(lastError.code)) throw lastError;
      }
    }
    throw lastError;
  }

  return {
    listProjects() {
      if (closed) return Promise.reject(new CodexProjectError('closed', 'The Codex project source is closed.'));
      if (!inflight) inflight = load().finally(() => { inflight = null; });
      return inflight;
    },
    async close() {
      if (closed) return;
      closed = true;
      await active?.close();
      active = null;
    }
  };
}
