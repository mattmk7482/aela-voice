/**
 * Verifies plugin/lib/ensure-deps.js against real npm installs of the TTS
 * server's package.json + package-lock.json, in isolated temp directories.
 *
 * The oracle is the import the TTS server actually performs, run in a child
 * process: a tree that npm reported as installed but that cannot import the
 * MCP SDK is the failure being guarded against (2.1.2 shipped one).
 *
 * Needs npm and a registry or a warm npm cache. Takes about a minute.
 */

import {
  chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync,
  rmSync, statSync, utimesSync, writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawn, spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIB = join(__dirname, '..', 'ensure-deps.js');
const SOURCE = join(__dirname, '..', '..', 'mcp-servers', 'tts');
const { ensureDeps, missingPackages } = await import(pathToFileURL(LIB).href);

const tmp = mkdtempSync(join(tmpdir(), 'ensure-deps-'));

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

const PROBE = [
  "await import('@modelcontextprotocol/sdk/server/index.js');",
  "await import('@modelcontextprotocol/sdk/server/stdio.js');",
  "await import('@modelcontextprotocol/sdk/types.js');",
  "await import('yaml');",
].join('\n');

function fixture(name) {
  const dir = join(tmp, name);
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(SOURCE, 'package.json'), join(dir, 'package.json'));
  copyFileSync(join(SOURCE, 'package-lock.json'), join(dir, 'package-lock.json'));
  writeFileSync(join(dir, 'probe.mjs'), PROBE, 'utf-8');
  return dir;
}

function importsWork(dir) {
  const r = spawnSync('node', ['probe.mjs'], { cwd: dir, encoding: 'utf-8' });
  return { ok: r.status === 0, detail: (r.stderr || '').split('\n').find(l => l.includes('Error')) };
}

function leftovers(dir) {
  return readdirSync(dir).filter(n => n.startsWith('.deps-'));
}

// Each installer is its own process, as the hooks and MCP servers are.
function ensureInChild(dir, env = {}) {
  return new Promise(resolve => {
    const child = spawn('node', [
      '--input-type=module', '-e',
      'const { ensureDeps } = await import(process.argv[1]);' +
      'process.exit(ensureDeps(process.argv[2]) ? 0 : 1);',
      pathToFileURL(LIB).href, dir,
    ], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d; });
    child.stderr.on('data', d => { stderr += d; });
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

// ── Concurrent installers into one fresh directory ──────────────────────────
// At session start the TTS server and the session-start hook both install
// mcp-servers/tts, and three processes need mcp-servers/wiki. Staggered starts
// reproduce the 2.1.2 race: two plain `npm install`s 300 ms apart left the SDK
// unimportable in two rounds out of three.

const ROUNDS = 3;
for (let round = 1; round <= ROUNDS; round++) {
  const dir = fixture(`race-${round}`);
  const results = await Promise.all([0, 150, 300].map(async ms => {
    await delay(ms);
    return ensureInChild(dir);
  }));
  const label = `race ${round}/${ROUNDS}`;
  check(`${label}: every installer reports success`, results.every(r => r.code === 0),
    results.map(r => `exit ${r.code} ${r.stderr.trim()}`).join(' | '));
  check(`${label}: installers write nothing to stdout`, results.every(r => r.stdout === ''));
  const probe = importsWork(dir);
  check(`${label}: the SDK and yaml import`, probe.ok, probe.detail);
  check(`${label}: no lockfile package is missing`, missingPackages(dir).length === 0,
    missingPackages(dir).slice(0, 3).join(', '));
  check(`${label}: no staging directories left behind`, leftovers(dir).length === 0, leftovers(dir).join(', '));
}

// ── An incomplete tree is detected and replaced ─────────────────────────────
// The 2.1.2 cache held a node_modules with every package directory present but
// most files gone, the SDK's package.json and dist/esm among them. Existence
// of node_modules was the old guard, so it was trusted forever.

{
  const dir = join(tmp, 'race-1');
  const sdk = join(dir, 'node_modules', '@modelcontextprotocol', 'sdk');
  rmSync(join(sdk, 'package.json'));
  rmSync(join(sdk, 'dist'), { recursive: true, force: true });

  check('incomplete tree: missingPackages names the SDK',
    missingPackages(dir).includes('node_modules/@modelcontextprotocol/sdk'), missingPackages(dir).join(', '));
  check('incomplete tree: the SDK does not import before repair', !importsWork(dir).ok);

  const result = await ensureInChild(dir);
  check('incomplete tree: ensureDeps reports success', result.code === 0, result.stderr.trim());
  const probe = importsWork(dir);
  check('incomplete tree: the SDK imports after repair', probe.ok, probe.detail);
  check('incomplete tree: no staging directories left behind', leftovers(dir).length === 0, leftovers(dir).join(', '));
}

// ── A complete tree is left alone ───────────────────────────────────────────

{
  const dir = join(tmp, 'race-2');
  const nm = join(dir, 'node_modules');
  const before = statSync(nm, { bigint: true }).ino;
  const started = Date.now();
  const ok = ensureDeps(dir);
  const elapsed = Date.now() - started;
  check('complete tree: ensureDeps reports success', ok === true);
  check('complete tree: node_modules is the same directory, not a reinstall',
    statSync(nm, { bigint: true }).ino === before);
  check('complete tree: the check is cheap', elapsed < 500, `${elapsed} ms`);
}

// ── A failed install is reported, not thrown, and cleans up after itself ───
// Hooks treat dependencies as best effort: a throw would fail session start
// where a missing import only costs that one feature. Staging directories a
// killed installer left behind are swept once they are old enough that no
// live install can own them.

{
  const dir = fixture('broken-manifest');
  writeFileSync(join(dir, 'package.json'), '{ not json', 'utf-8');
  const stale = join(dir, '.deps-stale');
  const live = join(dir, '.deps-live');
  mkdirSync(stale);
  mkdirSync(live);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  utimesSync(stale, hourAgo, hourAgo);

  const result = await ensureInChild(dir);
  check('failed install: ensureDeps reports failure', result.code === 1, `exit ${result.code}`);
  check('failed install: the failure is explained on stderr',
    /^aela-voice: dependencies in .* are not installed: npm install exited/m.test(result.stderr), result.stderr.trim());
  check('failed install: nothing on stdout', result.stdout === '');
  check('failed install: no node_modules appears', !existsSync(join(dir, 'node_modules')));
  check('failed install: an hour-old staging directory is swept', !existsSync(stale));
  check('failed install: a recent staging directory is left for its owner', existsSync(live));
  check('failed install: its own staging directory is removed',
    leftovers(dir).every(n => n === '.deps-live'), leftovers(dir).join(', '));
}

// ── npm exiting 0 over a damaged tree is not trusted ────────────────────────
// What 2.1.2's installs did: npm logged TAR_ENTRY_ERROR as a warning, exited
// 0, and left files missing. A stand-in npm, first on PATH, lays down a
// complete tree and then misbehaves in one of the two ways npm can.

{
  const bin = join(tmp, 'fake-bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'fake-npm.mjs'), [
    "import { cpSync, rmSync } from 'fs';",
    "import { join } from 'path';",
    "cpSync(process.env.FAKE_NPM_TREE, join(process.cwd(), 'node_modules'), { recursive: true });",
    "if (process.env.FAKE_NPM === 'tar-warning') {",
    "  process.stderr.write(\"npm warn tar TAR_ENTRY_ERROR ENOENT: no such file or directory, open 'x'\\n\");",
    "}",
    "if (process.env.FAKE_NPM === 'missing-package') {",
    "  rmSync(join(process.cwd(), 'node_modules', 'yaml', 'package.json'));",
    "}",
  ].join('\n'), 'utf-8');
  writeFileSync(join(bin, 'npm.cmd'), '@node "%~dp0fake-npm.mjs" %*\r\n', 'utf-8');
  writeFileSync(join(bin, 'npm'), '#!/bin/sh\nexec node "$(dirname "$0")/fake-npm.mjs" "$@"\n', 'utf-8');
  chmodSync(join(bin, 'npm'), 0o755);

  const pathKey = Object.keys(process.env).find(k => k.toUpperCase() === 'PATH') ?? 'PATH';
  const fakeEnv = mode => ({
    [pathKey]: `${bin}${process.platform === 'win32' ? ';' : ':'}${process.env[pathKey]}`,
    FAKE_NPM: mode,
    FAKE_NPM_TREE: join(tmp, 'race-2', 'node_modules'),
  });

  for (const [mode, explains] of [
    ['tar-warning', /TAR_ENTRY_ERROR/],
    ['missing-package', /packages are missing, e\.g\. node_modules\/yaml/],
  ]) {
    const dir = fixture(`fake-${mode}`);
    const result = await ensureInChild(dir, fakeEnv(mode));
    check(`npm ${mode}: ensureDeps reports failure`, result.code === 1, `exit ${result.code} ${result.stderr.trim()}`);
    check(`npm ${mode}: stderr says why`, explains.test(result.stderr), result.stderr.trim());
    check(`npm ${mode}: the damaged tree is not published`, !existsSync(join(dir, 'node_modules')));
    check(`npm ${mode}: no staging directories left behind`, leftovers(dir).length === 0, leftovers(dir).join(', '));
  }
}

rmSync(tmp, { recursive: true, force: true, maxRetries: 3 });
process.exit(failed > 0 ? 1 : 0);
