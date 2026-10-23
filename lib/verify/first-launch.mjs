/**
 * Verifies a fresh plugin version comes up clean when everything that needs
 * its npm dependencies launches at once, as at session start: both MCP
 * launchers and the three SessionStart hooks, in a copy of the plugin's files
 * with no node_modules anywhere. Every plugin update is this case.
 *
 * Isolated: a fake home holds the settings, and the TTS URL points at a closed
 * port, so no real wiki or TTS server is touched.
 *
 * Needs npm and a registry or a warm npm cache. Takes about half a minute.
 */

import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { execFileSync, spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const { missingPackages } = await import(pathToFileURL(join(REPO, 'lib', 'ensure-deps.js')).href);

const tmp = mkdtempSync(join(tmpdir(), 'first-launch-'));
const fakeHome = join(tmp, 'home');
const workspace = join(tmp, 'workspace');
mkdirSync(join(fakeHome, '.claude'), { recursive: true });
mkdirSync(workspace);
writeFileSync(join(fakeHome, '.claude', 'settings.json'), JSON.stringify({
  pluginConfigs: { 'aela-voice@verify': { options: { ttsServerUrl: 'http://127.0.0.1:9' } } },
}), 'utf-8');

const env = {
  ...process.env,
  HOME: fakeHome,
  USERPROFILE: fakeHome,
  AELA_PLUGIN_HOME: fakeHome,
  WORKSPACE_ROOT: workspace,
};

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// What a plugin install holds: the repo's files, untracked ones included so an
// uncommitted change is what gets tested, and no node_modules.
function freshVersion(name) {
  const root = join(tmp, name);
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: REPO, encoding: 'utf-8' })
    .split('\n').filter(f => f && existsSync(join(REPO, f)));
  for (const file of files) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(REPO, file), join(root, file));
  }
  return root;
}

function launch(script, stdin) {
  return new Promise(resolve => {
    const child = spawn('node', [script], { cwd: workspace, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 90000);
    child.stdout.on('data', d => {
      stdout += d;
      // An MCP server runs until its client leaves; the tools/list reply is the end.
      if (stdin && /"id":2/.test(stdout)) child.kill();
    });
    child.stderr.on('data', d => { stderr += d; });
    child.stdin.on('error', () => { /* a server that crashed on import closed its stdin */ });
    child.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

const MCP_SESSION = [
  { jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'verify', version: '0' } } },
  { jsonrpc: '2.0', method: 'notifications/initialized' },
  { jsonrpc: '2.0', id: 2, method: 'tools/list' },
].map(m => JSON.stringify(m)).join('\n') + '\n';

function parsesAsJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

const ROUNDS = 2;
for (let round = 1; round <= ROUNDS; round++) {
  const root = freshVersion(`v${round}`);
  const label = `round ${round}/${ROUNDS}`;

  const [tts, wiki, start, orient, maint] = await Promise.all([
    launch(join(root, 'mcp-servers', 'tts', 'start.js'), MCP_SESSION),
    launch(join(root, 'mcp-servers', 'wiki', 'start.js'), MCP_SESSION),
    launch(join(root, 'hooks', 'session-start.js')),
    launch(join(root, 'hooks', 'session-orient.js')),
    launch(join(root, 'hooks', 'wiki-maintenance.js')),
  ]);

  check(`${label}: TTS server lists its tools`, /"name":"speak"/.test(tts.stdout), tts.stderr.trim().split('\n').pop());
  check(`${label}: wiki server lists its tools`, /"name":"wiki_read"/.test(wiki.stdout), wiki.stderr.trim().split('\n').pop());
  check(`${label}: session-start exits 0 with JSON`, start.code === 0 && parsesAsJson(start.stdout), `exit ${start.code} ${start.stderr.trim()}`);
  check(`${label}: session-orient exits 0 with JSON`, orient.code === 0 && parsesAsJson(orient.stdout), `exit ${orient.code} ${orient.stderr.trim()}`);
  check(`${label}: wiki-maintenance exits 0`, maint.code === 0, `exit ${maint.code} ${maint.stderr.trim()}`);

  for (const dir of ['hooks', join('mcp-servers', 'tts'), join('mcp-servers', 'wiki')]) {
    const missing = missingPackages(join(root, dir));
    check(`${label}: ${dir} node_modules is complete`, missing.length === 0, missing.slice(0, 3).join(', '));
    const staging = readdirSync(join(root, dir)).filter(n => n.startsWith('.deps-'));
    check(`${label}: ${dir} has no staging directories left`, staging.length === 0, staging.join(', '));
  }
}

rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
process.exit(failed > 0 ? 1 : 0);
