/**
 * Verifies plugin/hooks/session-orient.js by spawning it as a subprocess
 * in an isolated temp workspace and asserting the JSON shape of its output.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'session-orient.js');

const tmp = mkdtempSync(join(tmpdir(), 'hook-orient-'));
const fakeHome = join(tmp, 'fake-home');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

function runHook(env = {}) {
  const result = spawnSync('node', [HOOK], {
    cwd: tmp,
    env: { ...process.env, AELA_PLUGIN_HOME: fakeHome, ...env },
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    console.error('Hook exited non-zero. stdout:', result.stdout, 'stderr:', result.stderr);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (e) {
    console.error('Hook stdout was not valid JSON:', result.stdout);
    return null;
  }
}

// ── Cold start: no wiki content, no personality, no PLUGIN-FEATURES ─────────

const coldResult = runHook();
check('cold start hook exits 0 and emits JSON', coldResult !== null);
if (coldResult) {
  check('cold start: hookEventName is SessionStart', coldResult.hookSpecificOutput?.hookEventName === 'SessionStart');
  check('cold start: additionalContext is a string', typeof coldResult.hookSpecificOutput?.additionalContext === 'string');
  const ctx = coldResult.hookSpecificOutput?.additionalContext || '';
  check('cold start: personal wiki index placeholder present', /Personal Wiki/i.test(ctx) || /empty/.test(ctx));
  check('cold start: no User is called line (personality absent)', !/User is called/.test(ctx));
  check('cold start: no PLUGIN-FEATURES section (file absent)', !/PLUGIN-FEATURES/.test(ctx));
}

// ── Warm start: seed personality, features doc, some wiki content ───────────

mkdirSync(join(fakeHome, '.claude', 'aela-plugin'), { recursive: true });
writeFileSync(
  join(fakeHome, '.claude', 'aela-plugin', 'personality.yaml'),
  'user_name: Kevin\nhow_i_talk: "warm"\n',
  'utf-8'
);

const pluginRoot = join(__dirname, '..', '..');
const featuresPath = join(pluginRoot, 'PLUGIN-FEATURES.md');
const featuresBackup = spawnSync('test', ['-f', featuresPath]).status === 0;
if (!featuresBackup) {
  writeFileSync(featuresPath, '# Plugin Features\n\nSeven wiki tools available.\n', 'utf-8');
}

// Use the wiki store directly to seed pages — the store reads AELA_PLUGIN_HOME
// from process.env when we export it here as a side effect, but since the store
// was imported at module load time in the PARENT test process and hasn't re-read
// the env, we need to use a subprocess or set the env before a dynamic import.
// Simplest: dynamic-import the store here with env already set.
process.env.AELA_PLUGIN_HOME = fakeHome;
process.chdir(tmp);
const { wikiCreate } = await import('../../mcp-servers/wiki/store.js');
wikiCreate('personal', 'working-preferences', {
  title: 'Working Preferences',
  category: 'preference',
  description: 'How Kevin wants to be worked with',
  body: 'Direct, brief.',
});
wikiCreate('project', 'auth-flow', {
  title: 'Auth Flow',
  category: 'reference',
  description: 'Authentication flow',
  body: 'Token exchange.',
});

const warmResult = runHook();
check('warm start hook exits 0', warmResult !== null);
if (warmResult) {
  const ctx = warmResult.hookSpecificOutput?.additionalContext || '';
  check('warm start: User is called Kevin line present', /User is called Kevin/.test(ctx));
  check('warm start: PLUGIN-FEATURES content injected',
    /Seven wiki tools available/.test(ctx) || /plugin's full tool surface/i.test(ctx) || /wiki_search/.test(ctx));
  check('warm start: personal index lists working-preferences', /\[\[working-preferences\]\]/.test(ctx));
  check('warm start: project index lists auth-flow', /\[\[auth-flow\]\]/.test(ctx));
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

if (!featuresBackup) {
  rmSync(featuresPath, { force: true });
}
process.chdir(tmpdir());
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(failed > 0 ? 1 : 0);
