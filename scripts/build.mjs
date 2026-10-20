import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile, cp, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, relative, resolve } from 'node:path';
import { VERSION } from '../src/version.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
if (metadata.version !== VERSION) throw new Error('Package and runtime versions must match.');
const result = await build({ entryPoints: [resolve(root, 'ui/app.js')], absWorkingDir: root, bundle: true, minify: true, format: 'iife', platform: 'browser', target: 'es2022', write: false, metafile: true, legalComments: 'none' });
const template = await readFile(resolve(root, 'ui/index.html'), 'utf8');
const css = await readFile(resolve(root, 'ui/styles.css'), 'utf8');
const script = result.outputFiles[0].text.replaceAll('</script', '<\\/script');
const html = template.replace(/<link\b[^>]*href=["']\.\/styles\.css["'][^>]*>/, () => '<style>' + css + '</style>').replace(/<script\b[^>]*src=["']\.\/app\.js["'][^>]*><\/script>/, () => '<script>' + script + '</script>');
if (html === template || html.includes('src="./app.js"')) throw new Error('Could not embed the Todo UI assets.');
await mkdir(resolve(root, 'dist'), { recursive: true });
await writeFile(resolve(root, 'dist/index.html'), html);
const server = await build({
  entryPoints: [resolve(root, 'src/server.mjs')],
  absWorkingDir: root,
  outfile: resolve(root, 'dist/server.mjs'),
  bundle: true,
  minify: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  metafile: true,
  legalComments: 'none',
  banner: { js: "import { createRequire as todoCreateRequire } from 'node:module'; const require = todoCreateRequire(import.meta.url);" }
});
const packages = new Map();
for (const input of [...Object.keys(result.metafile.inputs), ...Object.keys(server.metafile.inputs)]) {
  if (!input.replaceAll('\\', '/').includes('node_modules/')) continue;
  let directory = dirname(resolve(root, input));
  while (directory !== dirname(directory)) {
    let info;
    try { info = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8')); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (info?.name && info?.version) {
      packages.set(info.name + '@' + info.version, { directory, info });
      break;
    }
    directory = dirname(directory);
  }
}
let notices = '# Third-party notices\n\nThe prebuilt Todo bundles include the following packages. Their original license and notice texts are reproduced below.\n';
for (const [name, { directory, info }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
  const files = (await readdir(directory)).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.-].*)?$/i.test(file)).sort();
  if (!files.length) throw new Error('Missing bundled dependency license: ' + name);
  notices += '\n## ' + name + '\n\nLicense: ' + (typeof info.license === 'string' ? info.license : JSON.stringify(info.license || info.licenses || 'See text below')) + '\n';
  for (const file of files) notices += '\n### ' + basename(file) + '\n\n' + '\x60\x60\x60text\n' + (await readFile(resolve(directory, file), 'utf8')).trim() + '\n\x60\x60\x60\n';
}
if (!packages.size) throw new Error('The build did not identify bundled dependency licenses.');
await writeFile(resolve(root, 'THIRD_PARTY_NOTICES.md'), notices);
const pluginRoot = resolve(root, 'plugin');
await rm(pluginRoot, { recursive: true, force: true });
for (const dir of ['dist', 'assets', '.codex-plugin']) await mkdir(resolve(pluginRoot, dir), { recursive: true });
for (const file of ['dist/server.mjs', 'dist/index.html', 'assets/icon.svg', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) await copyFile(resolve(root, file), resolve(pluginRoot, file));
await cp(resolve(root, 'skills'), resolve(pluginRoot, 'skills'), { recursive: true });
const presentation = {
  displayName: 'Todo',
  shortDescription: 'Capture ideas and open project chats',
  longDescription: 'A local Todo board with Today and Backlog. Capture ideas with optional project tags, use the bundled capture skills, and open a prepared Codex chat in the selected project.',
  developerName: 'Codex Todo contributors',
  category: 'Productivity',
  capabilities: ['Interactive'],
  logo: './assets/icon.svg',
  composerIcon: './assets/icon.svg',
  defaultPrompt: ['Open my Todo board.', 'Add an idea to my backlog.']
};
const portableMcp = { $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json', mcpServers: { todo: { type: 'stdio', command: 'node', args: ['\x24{PLUGIN_ROOT}/dist/server.mjs'], cwd: '\x24{PLUGIN_ROOT}' } } };
const legacyMcp = { mcpServers: { todo: { command: 'node', args: ['\x24{CODEX_PLUGIN_ROOT}/dist/server.mjs'], cwd: '\x24{CODEX_PLUGIN_ROOT}' } } };
const manifest = { $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json', name: 'codex-todo', version: VERSION, description: 'A local Todo sidebar for Codex.', license: 'MIT', author: { name: 'Codex Todo contributors' }, extensions: { 'com.openai': { interface: presentation } } };
const legacy = { name: 'codex-todo', version: VERSION, description: manifest.description, author: manifest.author, license: manifest.license, skills: './skills/', mcpServers: './.mcp.json', interface: presentation };
for (const [file, value] of [['plugin.json', manifest], ['mcp.json', portableMcp], ['.mcp.json', legacyMcp], ['.codex-plugin/plugin.json', legacy]]) await writeFile(resolve(pluginRoot, file), JSON.stringify(value, null, 2) + '\n');
await mkdir(resolve(root, '.agents/plugins'), { recursive: true });
await writeFile(resolve(root, '.agents/plugins/marketplace.json'), JSON.stringify({ name: 'todo', interface: { displayName: 'Codex Todo' }, plugins: [{ name: 'codex-todo', source: { source: 'local', path: './plugin' }, policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }] }, null, 2) + '\n');
process.stdout.write('Built Todo ' + VERSION + ': ' + Math.round(Buffer.byteLength(html) / 1024) + ' kB UI, ' + packages.size + ' bundled dependency notices, portable plugin at ' + relative(root, pluginRoot) + '\n');
