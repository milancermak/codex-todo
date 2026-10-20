import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.TODO_CODEX_CLI || 'codex';
const child = spawn(cli, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
const lines = createInterface({ input: child.stdout });
const send = value => child.stdin.write(`${JSON.stringify(value)}\n`);
let complete = false;
let stderr = '';
child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-3000); });
const timeout = setTimeout(() => finish(new Error(`Skill discovery timed out. ${stderr}`)), 20000);

function finish(error) {
  if (complete) return;
  complete = true;
  clearTimeout(timeout);
  lines.close();
  child.kill('SIGTERM');
  if (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

child.on('error', finish);
child.on('exit', code => { if (!complete) finish(new Error(`App server exited before skill discovery (${code}). ${stderr}`)); });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (message.error) { finish(new Error(JSON.stringify(message.error))); return; }
  if (message.id === 1) {
    send({ method: 'initialized' });
    send({ id: 2, method: 'skills/list', params: { cwds: [root], forceReload: true } });
  } else if (message.id === 2) {
    const rows = message.result?.data || [];
    const skills = rows.flatMap(row => row.skills || []).filter(skill => skill.path.replaceAll('\\', '/').includes('/todo/codex-todo/') && /\/skills\/(todo|today|backlog)\/SKILL\.md$/.test(skill.path.replaceAll('\\', '/')));
    const errors = rows.flatMap(row => row.errors || []).filter(error => JSON.stringify(error).includes('codex-todo'));
    process.stdout.write(`${JSON.stringify({ skills: skills.map(skill => ({ name: skill.name, path: skill.path, enabled: skill.enabled })), errors }, null, 2)}\n`);
    finish(skills.length === 3 && skills.every(skill => skill.enabled !== false) && errors.length === 0 ? null : new Error('The installed Todo plugin did not expose all three enabled skills.'));
  }
});
send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'todo-skill-check', version: VERSION } } });
