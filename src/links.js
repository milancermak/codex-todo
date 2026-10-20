export function buildCodexLink(task, project) {
  const params = new URLSearchParams();
  params.set('prompt', [task.title, task.notes].filter(Boolean).join('\n\n'));
  if (project?.path) params.set('path', project.path);
  return `codex://threads/new?${params}`;
}
