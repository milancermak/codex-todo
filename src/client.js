import { App, applyDocumentTheme, applyHostStyleVariables, applyHostFonts } from '@modelcontextprotocol/ext-apps';
import { buildCodexLink } from './links.js';
import { VERSION } from './version.js';

let hostApp;
let ready;
let currentBoard;
let currentProjectSync;
let refreshTimer;
let stopped = false;
const listeners = new Set();

function acceptBoard(board, projectSync) {
  if (!board || !Array.isArray(board.tasks) || !Array.isArray(board.projects)) throw new Error('Todo received an invalid board response.');
  const changed = !currentBoard || board.revision > currentBoard.revision;
  if (changed) currentBoard = board;
  const newerSync = projectSync && (!currentProjectSync || !currentProjectSync.checkedAt || (projectSync.checkedAt && projectSync.checkedAt >= currentProjectSync.checkedAt));
  const syncChanged = newerSync && JSON.stringify(projectSync) !== JSON.stringify(currentProjectSync);
  if (syncChanged) currentProjectSync = projectSync;
  if (changed || syncChanged) for (const listener of listeners) listener(currentBoard, currentProjectSync);
  return currentBoard;
}

function applyContext(context) {
  if (context?.theme) applyDocumentTheme(context.theme);
  if (context?.styles?.variables) applyHostStyleVariables(context.styles.variables);
  if (context?.styles?.css?.fonts) applyHostFonts(context.styles.css.fonts);
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function callTool(name, args = {}) {
  let output;
  if (hostApp) {
    const result = await hostApp.callServerTool({ name, arguments: args });
    if (result.isError) throw new Error(result.content?.filter(item => item.type === 'text').map(item => item.text).join('\n') || 'Could not save the change.');
    output = result.structuredContent;
  } else {
    const response = await fetch('/api/tool', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Todo-Client': '1' }, body: JSON.stringify({ name, arguments: args }) });
    output = await response.json();
    if (!response.ok) throw new Error(output.error || 'Could not connect to Todo.');
  }
  return { ...output, board: acceptBoard(output?.board, output?.projectSync), projectSync: currentProjectSync };
}

async function connect() {
  if (window.parent !== window) {
    hostApp = new App({ name: 'codex-todo', version: VERSION }, { availableDisplayModes: ['inline', 'fullscreen'] }, { autoResize: true });
    hostApp.ontoolresult = result => {
      if (result.structuredContent?.board) acceptBoard(result.structuredContent.board, result.structuredContent.projectSync);
    };
    hostApp.ontoolcancelled = () => {};
    hostApp.onhostcontextchanged = applyContext;
    hostApp.onteardown = async () => { stopped = true; clearTimeout(refreshTimer); return {}; };
    await hostApp.connect();
    applyContext(hostApp.getHostContext());
    if (!hostApp.getHostCapabilities()?.serverTools) throw new Error('This host does not provide Todo tool access.');
  }
  const { board } = await callTool('todo_list');
  async function refresh() {
    if (stopped) return;
    try { if (!document.hidden) await callTool('todo_list'); } catch {}
    if (!stopped) refreshTimer = setTimeout(refresh, 7000);
  }
  refreshTimer = setTimeout(refresh, 7000);
  window.addEventListener('pagehide', () => { stopped = true; clearTimeout(refreshTimer); }, { once: true });
  return board;
}

export function initialize() {
  if (!ready) ready = connect().catch(error => { ready = undefined; throw error; });
  return ready.then(() => currentBoard);
}

export async function openCodex(task, project) {
  const url = buildCodexLink(task, project);
  if (hostApp) {
    try {
      if (!hostApp.getHostCapabilities()?.openLinks) throw new Error('This host does not allow opening links.');
      const result = await hostApp.openLink({ url });
      if (result.isError) throw new Error('The host declined this Codex link.');
      return;
    } catch {
      await showLinkFallback(url);
      return { fallback: true };
    }
  }
  window.location.href = url;
}

async function showLinkFallback(url) {
  const dialog = document.createElement('dialog');
  dialog.className = 'link-fallback';
  const heading = document.createElement('h2');
  heading.textContent = 'Open this task in Codex';
  const explanation = document.createElement('p');
  explanation.textContent = 'The host could not open the link directly. Copy it and open it in your browser’s address bar. Codex will prepare the chat for you.';
  const field = document.createElement('textarea');
  field.readOnly = true;
  field.value = url;
  field.setAttribute('aria-label', 'Codex chat link');
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'button button-primary';
  copy.textContent = 'Copy link';
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(url); copy.textContent = 'Copied'; }
    catch { field.focus(); field.select(); copy.textContent = 'Select and copy the link'; }
  };
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'button';
  close.textContent = 'Close';
  close.onclick = () => dialog.close();
  dialog.append(heading, explanation, field, copy, close);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}

export async function exportBoard() {
  const { board } = await callTool('todo_list');
  const url = URL.createObjectURL(new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `todo-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
