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
// Only docs/wiki-ingest/ is a discovery channel; a superpowers spec is seeded
// too, to prove it is NOT discovered.
const workspaceRoot = join(tmp, 'workspace');
const projA = join(workspaceRoot, 'proj-a');
const projB = join(workspaceRoot, 'proj-b');
mkdirSync(join(projA, 'docs', 'wiki-ingest'), { recursive: true });
mkdirSync(join(projA, 'docs', 'superpowers', 'specs'), { recursive: true });
mkdirSync(join(projB, '.aela', 'wiki'), { recursive: true });
writeFileSync(join(projA, 'docs', 'wiki-ingest', 'thing.md'), '# An analysis\n', 'utf-8');
writeFileSync(join(projA, 'docs', 'superpowers', 'specs', 'spec.md'), '# A spec\n', 'utf-8');
writeFileSync(join(projB, '.aela', 'wiki', 'index.md'), '# Proj B Wiki\n', 'utf-8');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

function runHook(env = {}, cwd = projA) {
  return spawnSync('node', [HOOK], {
    cwd,
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
check('hook output mentions un-ingested wiki-ingest source', /thing\.md/.test(result.stdout), result.stdout);
check('hook output does not discover superpowers specs', !/spec\.md/.test(result.stdout), result.stdout);
check('hook output flags external wiki', /proj-b\/\.aela\/wiki/.test(result.stdout), result.stdout);

// ── Current project's own .aela/wiki is not flagged as external ─────────────
// Seeding proj-a's own wiki dir then re-running the hook with cwd: proj-a
// must NOT flag proj-a/.aela/wiki — that's the project wiki for the session,
// not external to it.

mkdirSync(join(projA, '.aela', 'wiki', 'project', 'pages'), { recursive: true });
const resultSelf = runHook();
check('hook does not flag current project as external wiki', !/proj-a\/\.aela\/wiki/.test(resultSelf.stdout), resultSelf.stdout);
check('hook still flags sibling external wiki', /proj-b\/\.aela\/wiki/.test(resultSelf.stdout), resultSelf.stdout);

// ── A git worktree of the current project is not an external wiki ───────────
// Its .aela/wiki is the same wiki on another branch. Neither side may flag the
// other, while the unrelated sibling proj-b is still flagged from both.

const projAWorktree = join(workspaceRoot, 'proj-a-wt');
const git = (cwd, ...args) => spawnSync('git', ['-c', 'user.name=verify', '-c', 'user.email=verify@example.com', ...args], { cwd, encoding: 'utf-8' });
git(projA, 'init', '-q');
git(projA, 'commit', '-q', '--allow-empty', '-m', 'init');
const added = git(projA, 'worktree', 'add', '-q', projAWorktree);
check('setup: worktree created', added.status === 0, added.stderr);
mkdirSync(join(projAWorktree, '.aela', 'wiki'), { recursive: true });

const fromMain = runHook();
check('worktree: not flagged from the main checkout', !/proj-a-wt\/\.aela\/wiki/.test(fromMain.stdout), fromMain.stdout);
check('worktree: sibling still flagged from the main checkout', /proj-b\/\.aela\/wiki/.test(fromMain.stdout), fromMain.stdout);

const fromWorktree = runHook({}, projAWorktree);
check('worktree: main checkout not flagged from the worktree', !/proj-a\/\.aela\/wiki/.test(fromWorktree.stdout), fromWorktree.stdout);
check('worktree: sibling still flagged from the worktree', /proj-b\/\.aela\/wiki/.test(fromWorktree.stdout), fromWorktree.stdout);

// ── After seeding sources.md, the source should no longer be flagged ────────

const sourcesDir = join(projA, '.aela', 'wiki', 'project', 'raw');
mkdirSync(sourcesDir, { recursive: true });
writeFileSync(join(sourcesDir, 'sources.md'), `sources:
  - path: proj-a/docs/wiki-ingest/thing.md
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
  - path: proj-b/.aela/wiki
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
`, 'utf-8');

const result2 = runHook();
check('after ingest: source no longer flagged', !/thing\.md/.test(result2.stdout));
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
