import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';

export function resolveDatabasePath({ databasePath, env = process.env, platform = process.platform, home = homedir() } = {}) {
  const paths = platform === 'win32' ? win32 : posix;

  function absolute(value, label, memory = false) {
    if (memory && value === ':memory:') return value;
    const windowsRoot = platform !== 'win32' || /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/]+[\\/][^\\/]+)/u.test(value);
    if (typeof value !== 'string' || !value || /\0|\r|\n|\$\{|\$\(|\$[A-Za-z_]|%[A-Za-z_][A-Za-z0-9_]*%/u.test(value) || !paths.isAbsolute(value) || !windowsRoot) {
      throw new Error(`${label} must be an absolute path${memory ? ' or :memory:' : ''} with expanded environment values.`);
    }
    return paths.normalize(value);
  }

  if (databasePath !== undefined) return absolute(databasePath, 'Database path', true);
  if (env.TODO_DB_PATH !== undefined) return absolute(env.TODO_DB_PATH, 'TODO_DB_PATH', true);
  if (env.PLUGIN_DATA !== undefined) return paths.join(absolute(env.PLUGIN_DATA, 'PLUGIN_DATA'), 'todo.sqlite');

  let dataDirectory;
  if (platform === 'darwin') {
    dataDirectory = paths.join(absolute(home, 'Home directory'), 'Library', 'Application Support');
  } else if (platform === 'win32') {
    dataDirectory = env.LOCALAPPDATA === undefined
      ? paths.join(absolute(home, 'Home directory'), 'AppData', 'Local')
      : absolute(env.LOCALAPPDATA, 'LOCALAPPDATA');
  } else {
    try {
      dataDirectory = absolute(env.XDG_DATA_HOME, 'XDG_DATA_HOME');
    } catch {
      dataDirectory = paths.join(absolute(home, 'Home directory'), '.local', 'share');
    }
  }
  return paths.join(dataDirectory, 'codex-todo', 'todo.sqlite');
}
