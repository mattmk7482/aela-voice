/**
 * Verifies plugin/hooks/wiki-maintenance.js by spawning it as a subprocess
 * in an isolated temp workspace and asserting the text output.
 */

import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOK = join(__dirname, '..', 'wiki-maintenance.js');

const tmp = mkdtempSync(join(tmpdir(), 'hook-maint-'));
const fakeHome = join(tmp, 'fake-home');

// Lay out a small workspace: two projects, each with docs and some files.
// One project has a .aela/wiki/ dir to trigger external wiki detection.
const workspaceRoot = join(tmp, 'workspace');
const projA = join(workspaceRoot, 'proj-a');
const projB = join(workspaceRoot, 'proj-b');
mkdirSync(join(projA, 'docs', 'superpowers', 'specs'), { recursive: true });
mkdirSync(join(projB, '.aela', 'wiki'), { recursive: true });
writeFileSync(join(projA, 'docs', 'superpowers', 'specs', 'thing.md'), '# A spec\n', 'utf-8');
writeFileSync(join(projB, '.aela', 'wiki', 'index.md'), '# Proj B Wiki\n', 'utf-8');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

function runHook(env = {}) {
  return spawnSync('node', [HOOK], {
    cwd: projA,
    env: {
      ...process.env,
      AELA_PLUGIN_HOME: fakeHome,
      WORKSPACE_ROOT: workspaceRoot,
      ...env,
    },
    encoding: 'utf-8',
  });
}

// ── Cold start: nothing ingested, one un-ingested spec, one external wiki ───

const result = runHook();
check('hook exits 0', result.status === 0, `stderr: ${result.stderr}`);
check('hook output mentions un-ingested spec', /thing\.md/.test(result.stdout), result.stdout);
check('hook output flags external wiki', /proj-b\/\.aela\/wiki/.test(result.stdout), result.stdout);

// ── After seeding sources.md, the spec should no longer be flagged ──────────

const sourcesDir = join(projA, '.aela', 'wiki', 'project', 'raw');
mkdirSync(sourcesDir, { recursive: true });
writeFileSync(join(sourcesDir, 'sources.md'), `sources:
  - path: proj-a/docs/superpowers/specs/thing.md
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
  - path: proj-b/.aela/wiki
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
`, 'utf-8');

const result2 = runHook();
check('after ingest: spec no longer flagged', !/thing\.md/.test(result2.stdout));
check('after ingest: external wiki no longer flagged', !/proj-b\/\.aela\/wiki/.test(result2.stdout));

// ── Health check: seed a wiki page missing a description ────────────────────

const pagesDir = join(projA, '.aela', 'wiki', 'project', 'pages');
mkdirSync(pagesDir, { recursive: true });
writeFileSync(join(pagesDir, 'broken.md'), `---
title: Broken
category: reference
---

No description.
`, 'utf-8');

const result3 = runHook();
check('health: flags missing-description page', /broken/.test(result3.stdout), result3.stdout);

// ── Cleanup ─────────────────────────────────────────────────────────────────

process.chdir(tmpdir());
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(failed > 0 ? 1 : 0);
