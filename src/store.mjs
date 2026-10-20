import sqlite from 'node:sqlite';
import { mkdirSync, statSync, chmodSync } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { definitions, outputSchema } from './contracts.mjs';
import { parseCapture } from './capture.js';
import { resolveDatabasePath } from './data-paths.mjs';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const Database = sqlite.Database ?? sqlite.DatabaseSync;

export function openStore(file) {
  file = resolveDatabasePath({ databasePath: file });
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file);
  if (file !== ':memory:') chmodSync(file, 0o600);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO metadata VALUES ('revision', '0');
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS codex_projects (
      sourceId TEXT PRIMARY KEY,
      projectId TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL,
      projectId TEXT REFERENCES projects(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('inbox', 'today', 'backlog', 'done')),
      previousStatus TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `);

  function board() {
    return {
      projects: db.prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE').all().map(row => ({ ...row })),
      tasks: db.prepare('SELECT * FROM tasks ORDER BY createdAt DESC, id DESC').all().map(row => ({ ...row })),
      revision: Number(db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get().value)
    };
  }

  function syncCodexProjects(projects, { preserveSourceIds = [] } = {}) {
    if (!Array.isArray(projects)) throw new Error('The Codex project catalog must be a complete list.');
    if (!Array.isArray(preserveSourceIds)) throw new Error('The Codex project catalog contains invalid preserved identifiers.');
    const sourceIds = new Set();
    for (const sourceId of preserveSourceIds) {
      if (typeof sourceId !== 'string' || !sourceId.trim() || sourceId.includes('\0') || sourceIds.has(sourceId.trim())) throw new Error('The Codex project catalog contains invalid preserved identifiers.');
      sourceIds.add(sourceId.trim());
    }
    const paths = new Set();
    const snapshot = projects.map(project => {
      if (!project || typeof project !== 'object' || typeof project.sourceId !== 'string' || !project.sourceId.trim() || project.sourceId.includes('\0') || typeof project.name !== 'string' || !project.name.trim() || typeof project.path !== 'string' || !isAbsolute(project.path) || project.path.includes('\0')) throw new Error('The Codex project catalog contains an invalid local project.');
      const entry = { sourceId: project.sourceId.trim(), name: project.name.trim(), path: resolve(project.path) };
      if (sourceIds.has(entry.sourceId)) throw new Error('The Codex project catalog contains duplicate project identifiers.');
      if (paths.has(entry.path)) throw new Error('The Codex project catalog contains duplicate project directories.');
      sourceIds.add(entry.sourceId);
      paths.add(entry.path);
      return entry;
    });
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT * FROM projects').all();
      const existingById = new Map(existing.map(project => [project.id, project]));
      const existingByPath = new Map();
      for (const project of existing) {
        const path = resolve(project.path);
        existingByPath.set(path, [...(existingByPath.get(path) || []), project]);
      }
      const mappings = db.prepare('SELECT * FROM codex_projects').all();
      const mappingBySource = new Map(mappings.map(mapping => [mapping.sourceId, mapping.projectId]));
      const sourceByProject = new Map(mappings.map(mapping => [mapping.projectId, mapping.sourceId]));
      const desiredIds = new Set();
      const desired = snapshot.map(entry => {
        let id = mappingBySource.get(entry.sourceId);
        if (!id) {
          const matches = existingByPath.get(entry.path) || [];
          if (matches.length > 1) throw new Error('Multiple Todo projects use a directory from the Codex catalog.');
          id = matches[0]?.id;
          const previousSource = sourceByProject.get(id);
          if (previousSource && sourceIds.has(previousSource)) throw new Error('A Codex project directory is already assigned to another project.');
        }
        id ||= randomUUID();
        if (desiredIds.has(id)) throw new Error('A Codex project directory is already assigned to another project.');
        desiredIds.add(id);
        return { ...entry, id };
      });
      let changed = false;
      for (const mapping of mappings) {
        if (sourceIds.has(mapping.sourceId)) continue;
        db.prepare('DELETE FROM codex_projects WHERE sourceId = ?').run(mapping.sourceId);
        if (!desiredIds.has(mapping.projectId)) {
          db.prepare('DELETE FROM projects WHERE id = ?').run(mapping.projectId);
          changed = true;
        }
      }
      for (const project of desired) {
        const previous = existingById.get(project.id);
        if (!previous) {
          db.prepare('INSERT INTO projects VALUES (?, ?, ?)').run(project.id, project.name, project.path);
          changed = true;
        } else if (previous.name !== project.name || previous.path !== project.path) {
          db.prepare('UPDATE projects SET name = ?, path = ? WHERE id = ?').run(project.name, project.path, project.id);
          changed = true;
        }
        if (!mappingBySource.has(project.sourceId)) db.prepare('INSERT INTO codex_projects VALUES (?, ?)').run(project.sourceId, project.id);
      }
      if (changed) db.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'").run();
      const output = outputSchema.parse({ board: board() });
      db.exec('COMMIT');
      return output;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function requireProject(id) {
    if (id !== null && !db.prepare('SELECT id FROM projects WHERE id = ?').get(id)) throw new Error('That project no longer exists. Choose another project.');
  }

  function execute(name, raw = {}) {
    const definition = definitions[name];
    if (!definition) throw new Error('Unknown Todo action.');
    let args = definition.input.parse(raw);
    db.exec(definition.readOnly ? 'BEGIN' : 'BEGIN IMMEDIATE');
    try {
      if (name === 'todo_capture') {
        const parsed = parseCapture(args.text, board().projects, { defaultStatus: args.status || 'backlog', projectId: args.projectId || null });
        if (parsed.projectMatch && !parsed.projectMatch.resolved) {
          const names = parsed.projectMatch.candidates.map(project => project.name).join(', ');
          throw new Error(names ? `Choose a project for #${parsed.projectMatch.query}: ${names}.` : `No project matches #${parsed.projectMatch.query}. Edit or remove that tag before adding the task.`);
        }
        if (!parsed.title.trim()) throw new Error('Add an idea before saving the task.');
        args = { title: parsed.title, notes: '', status: parsed.status, projectId: parsed.projectId };
      }
      if (name === 'todo_add' || name === 'todo_capture') {
        requireProject(args.projectId);
        const now = new Date().toISOString();
        db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), args.title, args.notes, args.projectId, args.status, args.status === 'done' ? 'inbox' : args.status, now, now);
      } else if (name === 'todo_update') {
        const previous = db.prepare('SELECT * FROM tasks WHERE id = ?').get(args.id);
        if (!previous) throw new Error('This task no longer exists. Refresh the board.');
        const task = { ...previous, ...args, updatedAt: new Date().toISOString() };
        requireProject(task.projectId);
        if (task.status === 'done' && previous.status !== 'done' && args.previousStatus === undefined) task.previousStatus = previous.status;
        if (task.status !== 'done') task.previousStatus = task.status;
        db.prepare('UPDATE tasks SET title = ?, notes = ?, projectId = ?, status = ?, previousStatus = ?, updatedAt = ? WHERE id = ?').run(task.title, task.notes, task.projectId, task.status, task.previousStatus, task.updatedAt, task.id);
      } else if (name === 'todo_delete') {
        if (!db.prepare('DELETE FROM tasks WHERE id = ?').run(args.id).changes) throw new Error('This task no longer exists. Refresh the board.');
      } else if (name === 'todo_project_save') {
        if (!isAbsolute(args.path)) throw new Error('Use an absolute directory path.');
        const path = normalize(args.path);
        if (!statSync(path, { throwIfNoEntry: false })?.isDirectory()) throw new Error('That directory does not exist on this computer.');
        const conflict = db.prepare('SELECT id FROM projects WHERE path = ?').get(path);
        if (conflict && conflict.id !== args.id) throw new Error('That directory is already saved as a project.');
        if (args.id) {
          if (!db.prepare('UPDATE projects SET name = ?, path = ? WHERE id = ?').run(args.name, path, args.id).changes) throw new Error('This project no longer exists.');
        } else db.prepare('INSERT INTO projects VALUES (?, ?, ?)').run(randomUUID(), args.name, path);
      } else if (name === 'todo_project_delete') {
        if (!db.prepare('DELETE FROM projects WHERE id = ?').run(args.id).changes) throw new Error('This project no longer exists.');
      }
      if (!definition.readOnly) db.prepare("UPDATE metadata SET value = CAST(value AS INTEGER) + 1 WHERE key = 'revision'").run();
      const output = outputSchema.parse({ board: board() });
      db.exec('COMMIT');
      return output;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  return { execute, syncCodexProjects, close: () => db.close() };
}
