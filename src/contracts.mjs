import { z } from 'zod';

export const statusSchema = z.enum(['inbox', 'today', 'backlog', 'done']);
const idSchema = z.string().uuid();
const titleSchema = z.string().trim().min(1).max(20000);
const notesSchema = z.string().max(12000);
const projectSchema = z.object({ id: idSchema, name: z.string(), path: z.string() });
const taskSchema = z.object({
  id: idSchema,
  title: z.string(),
  notes: z.string(),
  projectId: idSchema.nullable(),
  status: statusSchema,
  previousStatus: statusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const boardSchema = z.object({
  tasks: z.array(taskSchema),
  projects: z.array(projectSchema),
  revision: z.number().int().nonnegative()
});

export const projectSyncSchema = z.object({ status: z.enum(['ready', 'error', 'disabled']), checkedAt: z.string().datetime().nullable(), error: z.string().nullable(), projectCount: z.number().int().nonnegative(), unmappedCount: z.number().int().nonnegative(), sourceVersion: z.string().optional() });

export const outputSchema = z.object({ board: boardSchema, projectSync: projectSyncSchema.optional() });

export const definitions = {
  todo_list: {
    title: 'Todo',
    description: 'Open the Todo board or list saved tasks and automatically discovered local Codex projects. Set refreshProjects to true to retry project discovery immediately.',
    input: z.object({ refreshProjects: z.boolean().optional() }).strict(),
    readOnly: true
  },
  todo_add: {
    title: 'Add a todo',
    description: 'Save an idea to the local Todo board. Saving never starts a Codex chat.',
    input: z.object({ title: titleSchema, notes: notesSchema.default(''), projectId: idSchema.nullable().default(null), status: statusSchema.default('backlog') }).strict()
  },
  todo_capture: {
    title: 'Capture a todo',
    description: 'Save one idea to Today or Backlog. Accepts /today, /todo or /backlog prefixes and a project tag anywhere in the idea, including names with spaces such as #example app. Exact tags match automatically; uncertain project matches require explicit selection before saving. Never starts work.',
    input: z.object({ text: z.string().trim().min(1).max(20000), status: z.enum(['today', 'backlog']).optional(), projectId: idSchema.nullable().optional() }).strict()
  },
  todo_update: {
    title: 'Update a todo',
    description: 'Edit one idea, move it between Today and Backlog, or mark it complete. previousStatus controls the list of a completed task.',
    input: z.object({ id: idSchema, title: titleSchema.optional(), notes: notesSchema.optional(), projectId: idSchema.nullable().optional(), status: statusSchema.optional(), previousStatus: z.enum(['today', 'backlog']).optional() }).strict()
  },
  todo_delete: {
    title: 'Delete a todo',
    description: 'Permanently delete one task when the user has asked to remove it.',
    input: z.object({ id: idSchema }).strict(),
    destructive: true
  },
  todo_project_save: {
    title: 'Save a project',
    description: 'Save a project label and an existing absolute local directory for opening Codex chat drafts.',
    input: z.object({ id: idSchema.optional(), name: z.string().trim().min(1).max(100), path: z.string().trim().min(1).max(4096) }).strict()
  },
  todo_project_delete: {
    title: 'Remove a project',
    description: 'Remove a project from Todo and leave its tasks unassigned. Does not delete files or the Codex project.',
    input: z.object({ id: idSchema }).strict(),
    destructive: true
  }
};
