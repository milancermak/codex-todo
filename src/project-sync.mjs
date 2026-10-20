import { definitions, outputSchema } from './contracts.mjs';
import { createCodexProjectSource } from './codex-projects.mjs';

export function createProjectSync(store, { source, env = process.env, refreshMs = 15000, now = Date.now } = {}) {
  const disabled = env.TODO_PROJECT_SYNC === 'off';
  let provider = source;
  let closed = false;
  let inflight;
  let nextRefresh = 0;
  let state = { status: disabled ? 'disabled' : 'error', checkedAt: null, error: null, projectCount: 0, unmappedCount: 0 };

  async function refresh(force = false) {
    if (closed) throw new Error('Todo project discovery is closed.');
    if (disabled || (!force && now() < nextRefresh)) return { ...state };
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        provider ??= createCodexProjectSource({ env });
        const snapshot = await provider.listProjects();
        if (closed) throw new Error('Todo project discovery is closed.');
        store.syncCodexProjects(snapshot.projects, { preserveSourceIds: snapshot.unmappedProjectIds ?? [] });
        state = { status: 'ready', checkedAt: new Date(now()).toISOString(), error: null, projectCount: snapshot.projects.length, unmappedCount: snapshot.unmappedProjectIds?.length ?? 0, ...(snapshot.version ? { sourceVersion: snapshot.version } : {}) };
      } catch (error) {
        const explanation = error.code === 'unsupported'
          ? 'This Codex version cannot provide your projects. Update Codex, then try again.'
          : 'Couldn’t refresh your Codex projects. Your saved tasks and projects are still available.';
        state = { ...state, status: 'error', checkedAt: new Date(now()).toISOString(), error: explanation };
      } finally {
        nextRefresh = now() + refreshMs;
      }
      return { ...state };
    })().finally(() => { inflight = undefined; });
    return inflight;
  }

  return {
    async execute(name, raw = {}) {
      const definition = definitions[name];
      if (!definition) throw new Error('Unknown Todo action.');
      const args = definition.input.parse(raw);
      const projectSync = await refresh(name === 'todo_list' && args.refreshProjects === true);
      if (closed) throw new Error('Todo project discovery is closed.');
      return outputSchema.parse({ ...store.execute(name, args), projectSync });
    },
    refresh,
    async close() {
      if (closed) return;
      closed = true;
      await provider?.close();
      await inflight;
    }
  };
}
