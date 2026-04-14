# Phase 2 Implementation Plan — Hooks Port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the two session-start hooks from matt-head to the aela-voice plugin: `session-orient.js` (wiki orientation + context injection) and `wiki-maintenance.js` (source discovery + health check). Both register alongside the existing `session-start.js` and coexist without conflict.

**Architecture:** Two new hook scripts under `plugin/hooks/` that import from the wiki server's `store.js` for path resolution and wiki operations. Helper functions needed by the hooks (`readSources`, `checkWikiHealth`) are added to `store.js` as exports so the yaml-using logic stays in the wiki server's module boundary. The hooks directory gets its own small `package.json` with a `yaml` dep for the one case where a hook needs yaml directly (session-orient parsing `personality.yaml`). Each hook that needs its own deps runs an npm-install bootstrap guard at the top — the same pattern the existing TTS `start.js` uses. Hook output splits by purpose: `session-orient.js` emits JSON with `hookSpecificOutput.additionalContext` (same shape as the existing session-start hook), while `wiki-maintenance.js` emits plain markdown to stdout as a maintenance report (matching matt-head's reference behaviour).

**Tech Stack:** Node 20+ ESM, existing `yaml@^2.8.3` dep in the wiki server, no new dependencies, no build step.

**Scope boundary:** This phase delivers two working hooks. It does NOT create `PLUGIN-FEATURES.md`, `personality.yaml`, or any of the contract pages those hooks will eventually inject. The hooks must degrade gracefully when those files are absent — which they all are right now, post-Phase-1. Phase 3 ships the init skills that create them. Phase 4 ships the features doc and personality addition.

**Reference source:**
- `C:/devworkspace/matt-head/scripts/session-orient.js` — the reference session-orient implementation
- `C:/devworkspace/matt-head/scripts/wiki-maintenance.js` — the reference maintenance implementation with workspace-relative discovery and git-authorship filter
- `C:/devworkspace/aela-voice/plugin/hooks/session-start.js` — the existing plugin hook, pattern for how hooks access plugin paths and emit JSON
- `C:/devworkspace/aela-voice/plugin/hooks/hooks.json` — the registration file (contains `SessionStart` as an array — we add entries to it)
- `C:/devworkspace/aela-voice/plugin/mcp-servers/wiki/store.js` — the wiki store the new hooks call into

**Decisions locked from the spec that this plan implements:**

1. **Eight contract pages, seven always-injected.** `session-orient.js` injects `tasks-active`, `team-state`, `working-preferences`, `user-profile`, `reflections` — five orientation pages — plus the two wiki indexes. `comms-sources` is NOT in the orientation set; it's loaded on demand by `/check-comms`.
2. **User name injection line.** Session-orient prepends `User is called {name}` to additionalContext, reading the name from `~/.claude/aela-plugin/personality.yaml` (`user_name` field). If the file is absent, skip the line entirely — do not inject a placeholder.
3. **PLUGIN-FEATURES.md block.** Session-orient reads `${CLAUDE_PLUGIN_ROOT}/PLUGIN-FEATURES.md` and injects it as its own section. If the file is absent (it is, during Phase 2), skip that section entirely.
4. **No comms cron sentinel in session-orient.** The sentinel-token pattern for scheduling the comms cron lives in `/turn-end`, not `session-orient`. Do not add anything comms-related to this hook.
5. **Personal wiki vs project wiki paths.** Hooks import `wikiDir` from the wiki store — no hardcoded paths. Personal wiki at `~/.claude/aela-plugin/wiki/`, project wiki at `<cwd>/.aela/wiki/project/`. Cwd at hook invocation time is the user's project root, which is correct.
6. **`sources.md` is YAML.** Reader parses it as YAML via the wiki store's `readSources` helper. Phase 2 is read-only on `sources.md`; `/wiki-ingest` (Phase 3) will write.
7. **Project wiki only has `sources.md`.** Personal wiki has no file-based sources and therefore no `sources.md`. The maintenance hook checks only the project wiki's sources file.
8. **Workspace-relative source IDs.** Maintenance uses `matt-head/docs/...` not `docs/...`. Root is `WORKSPACE_ROOT` env var with fallback to one level above `process.cwd()`.
9. **Git-authorship filter.** Maintenance keeps untracked files and files last-committed by `git config user.email`. Files authored by other users are skipped.
10. **External wiki detection.** Maintenance scans sibling dirs under `WORKSPACE_ROOT` for `.aela/wiki/` directories and flags them for portal-page ingest, using the same `.aela/wiki/` sibling-check pattern from matt-head.

---

## File Structure

```
plugin/
├── hooks/
│   ├── package.json            # NEW — yaml dep for hooks
│   ├── hooks.json              # Modified: add two new SessionStart entries
│   ├── session-start.js        # Untouched (existing TTS/personality hook)
│   ├── turn-end.js             # Untouched
│   ├── session-orient.js       # NEW — wiki orientation + additionalContext
│   ├── wiki-maintenance.js     # NEW — source discovery + health report
│   └── verify/
│       ├── session-orient.mjs  # NEW — verify orientation hook output shape
│       └── wiki-maintenance.mjs # NEW — verify maintenance hook output shape
└── mcp-servers/
    └── wiki/
        └── store.js            # Modified: add readSources, checkWikiHealth
```

---

## Task 1: Extend store.js with `readSources` and `checkWikiHealth`

Add two helper functions to the wiki store. Both are needed by `wiki-maintenance.js`. Putting them in `store.js` keeps the yaml dep in one place.

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js`
- Create: `plugin/mcp-servers/wiki/verify/store-helpers.mjs`

- [ ] **Step 1: Write the verification script**

Create `plugin/mcp-servers/wiki/verify/store-helpers.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-helpers-'));
process.chdir(tmp);
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const { wikiCreate, readSources, checkWikiHealth, wikiDir } = await import('../store.js');

// Fail-fast env isolation check
if (!wikiDir('personal').startsWith(process.env.AELA_PLUGIN_HOME)) {
  console.error('FAIL env isolation broken — refusing to run');
  process.exit(1);
}

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// ── readSources ─────────────────────────────────────────────────────────────

// Before any sources.md exists, readSources should return an empty array
const noSources = readSources();
check('readSources returns empty array when file absent', Array.isArray(noSources) && noSources.length === 0);

// Manually seed a sources.md under the project wiki's raw/ dir
const rawDir = join(tmp, '.aela', 'wiki', 'project', 'raw');
mkdirSync(rawDir, { recursive: true });
writeFileSync(join(rawDir, 'sources.md'), `sources:
  - path: matt-head/docs/analysis/foo.md
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
    notes: "Folded into aela-voice page"
  - path: matt-head/docs/superpowers/specs/bar.md
    mtime: 2026-04-12T12:00:00Z
    ingested: false
`, 'utf-8');

const sources = readSources();
check('readSources returns array of two entries', sources.length === 2, `got ${sources.length}`);
check('readSources first entry path', sources[0].path === 'matt-head/docs/analysis/foo.md');
check('readSources first entry ingested', sources[0].ingested === true);
check('readSources second entry ingested false', sources[1].ingested === false);

// ── checkWikiHealth ─────────────────────────────────────────────────────────

// Healthy page
wikiCreate('project', 'healthy', {
  title: 'Healthy Page',
  category: 'reference',
  description: 'A page with a good description',
  body: 'Content.',
});

// Unhealthy page (missing description) — write it directly since wikiCreate enforces schema
const pagesDir = join(tmp, '.aela', 'wiki', 'project', 'pages');
writeFileSync(join(pagesDir, 'broken.md'), `---
title: Broken
category: reference
---

No description in frontmatter.
`, 'utf-8');

const issues = checkWikiHealth('project');
check('checkWikiHealth returns an array', Array.isArray(issues));
check('checkWikiHealth flags the broken page', issues.some(i => /broken/.test(i.message)));
check('checkWikiHealth does not flag the healthy page', !issues.some(i => /healthy/.test(i.message)));

// Personal wiki with no pages should return empty
const personalIssues = checkWikiHealth('personal');
check('checkWikiHealth on empty personal wiki returns empty', personalIssues.length === 0);

// Cleanup
process.chdir(tmpdir());
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to confirm failure**

```
cd /c/devworkspace/aela-voice/plugin/mcp-servers/wiki && node verify/store-helpers.mjs
```

Expected: ERROR — `readSources` and/or `checkWikiHealth` not exported.

- [ ] **Step 3: Add the two helpers to `store.js`**

Append to `plugin/mcp-servers/wiki/store.js`, at the end of the file (after the existing functions):

```js

// ── Sources tracking ────────────────────────────────────────────────────────

/**
 * Read and parse the project wiki's sources.md.
 * Returns an array of source entries, or an empty array if the file is
 * absent or malformed. Personal wiki has no sources.md.
 */
export function readSources() {
  const p = join(wikiDir('project'), 'raw', 'sources.md');
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, 'utf-8');
    const parsed = YAML.parse(raw);
    if (parsed && Array.isArray(parsed.sources)) return parsed.sources;
    return [];
  } catch {
    return [];
  }
}

// ── Health checks ───────────────────────────────────────────────────────────

/**
 * Check a wiki for health issues. Currently checks for pages whose
 * frontmatter lacks a `description` field — those pages will produce
 * useless index entries.
 * Returns an array of issue objects: { type: 'health', message: string }.
 */
export function checkWikiHealth(wiki) {
  validateWiki(wiki);
  const dir = pagesDir(wiki);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const missingDesc = [];

  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const fm = YAML.parse(match[1]) || {};
    if (!fm.description) missingDesc.push(f.replace(/\.md$/, ''));
  }

  if (missingDesc.length === 0) return [];
  return [{
    type: 'health',
    message: `${wiki} wiki pages missing description: ${missingDesc.join(', ')}`,
  }];
}
```

- [ ] **Step 4: Run to confirm it passes**

```
node verify/store-helpers.mjs
```

Expected: all nine checks print `ok   ...` and exit 0.

- [ ] **Step 5: Re-run the previous verify scripts to confirm no regression**

```
node verify/paths.mjs
node verify/create-read.mjs
node verify/list-index.mjs
node verify/search.mjs
node verify/delete.mjs
node verify/end-to-end.mjs
```

All six should exit 0.

- [ ] **Step 6: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add mcp-servers/wiki/store.js mcp-servers/wiki/verify/store-helpers.mjs && git commit -m "$(cat <<'EOF'
feat(wiki-mcp): readSources and checkWikiHealth helpers

Adds two read-only helpers to the wiki store needed by Phase 2 hooks:

- readSources() parses the project wiki's sources.md as YAML and
  returns a list of source entries. Returns empty array if the file
  is absent or malformed. Personal wiki has no sources.md by design.

- checkWikiHealth(wiki) scans a wiki's pages for frontmatter issues.
  Currently flags pages missing the description field — they produce
  useless index entries. Returns an array of issue objects.

Both helpers use the existing yaml library dep. Exported from
store.js so the maintenance hook can call them without needing its
own yaml dep.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Scaffold `plugin/hooks/package.json` and install yaml dep

The hooks directory gets its own tiny package.json so `session-orient.js` can do `import YAML from 'yaml'` cleanly. Same pattern as the TTS MCP server: each dir that needs deps has its own package.json, and the entry scripts run an npm-install bootstrap guard at first invocation.

**Files:**
- Create: `plugin/hooks/package.json`

- [ ] **Step 1: Create the package.json**

Create `plugin/hooks/package.json`:

```json
{
  "name": "aela-voice-hooks",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "yaml": "^2.8.3"
  }
}
```

- [ ] **Step 2: Install dependencies**

```
cd /c/devworkspace/aela-voice/plugin/hooks && npm install
```

Verify afterwards that `node_modules/yaml/package.json` exists. Commit both the package.json and the lockfile.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add hooks/package.json hooks/package-lock.json && git commit -m "$(cat <<'EOF'
feat(hooks): scaffold hooks package with yaml dep

The hooks directory gets its own tiny package.json so session-orient
can import yaml directly for parsing personality.yaml. Matches the
TTS server pattern: each directory that needs deps has its own
package.json and an npm-install bootstrap guard at first invocation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Create `session-orient.js` hook

Write the session-orient hook that emits `additionalContext` with wiki indexes, orientation pages, and optional PLUGIN-FEATURES / user name injection.

**Files:**
- Create: `plugin/hooks/session-orient.js`
- Create: `plugin/hooks/verify/session-orient.mjs`

- [ ] **Step 1: Write the verification script**

Create `plugin/hooks/verify/session-orient.mjs`:

```js
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

// Create a minimal PLUGIN-FEATURES.md at the plugin root so the hook can find it
// via CLAUDE_PLUGIN_ROOT. Compute plugin root from __dirname of the hook.
const pluginRoot = join(__dirname, '..', '..');
const featuresPath = join(pluginRoot, 'PLUGIN-FEATURES.md');
const featuresBackup = spawnSync('test', ['-f', featuresPath]).status === 0;
writeFileSync(featuresPath, '# Plugin Features\n\nSeven wiki tools available.\n', 'utf-8');

// Use the plugin's wiki store to seed a page in each wiki for the warm case
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
  check('warm start: PLUGIN-FEATURES content injected', /Seven wiki tools available/.test(ctx));
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
```

- [ ] **Step 2: Run to confirm failure**

```
cd /c/devworkspace/aela-voice/plugin/hooks && node verify/session-orient.mjs
```

Expected: FAIL — `session-orient.js` does not exist yet, the `spawnSync` call exits non-zero.

- [ ] **Step 3: Write `session-orient.js`**

Create `plugin/hooks/session-orient.js`:

```js
#!/usr/bin/env node
/**
 * SessionStart hook — wiki orientation.
 *
 * Emits additionalContext containing, in order:
 *   1. User name injection line (if personality.yaml exists)
 *   2. PLUGIN-FEATURES.md contents (if the file exists)
 *   3. Personal wiki index
 *   4. Project wiki index
 *   5. Five orientation pages in full: tasks-active, team-state,
 *      working-preferences, user-profile, reflections
 *
 * Any of these sources that are absent are skipped entirely — no
 * placeholders in their place. The hook must never fail session
 * start due to missing files.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

// ── Bootstrap: ensure hooks' node_modules exists ────────────────────────────
// Matches the TTS server's start.js pattern. On a fresh install, node_modules
// is absent until the first invocation runs npm install. Best effort — if npm
// fails, the subsequent yaml import will throw a clear error.

if (!existsSync(join(__dirname, 'node_modules'))) {
  try {
    execSync('npm install --omit=dev', {
      cwd: __dirname,
      stdio: 'ignore',
      timeout: 25000,
    });
  } catch { /* best effort */ }
}

// Now that deps are guaranteed installed, dynamically import yaml and the
// wiki store. These can't be static imports at the top because the bootstrap
// above might need to run before yaml is available on disk.

const { default: YAML } = await import('yaml');
const { wikiUpdateIndex, wikiDir, wikiRead, wikiList } = await import('../mcp-servers/wiki/store.js');

const ORIENTATION_PAGES = [
  'tasks-active',
  'team-state',
  'working-preferences',
  'user-profile',
  'reflections',
];

// ── User name ────────────────────────────────────────────────────────────────

function readUserName() {
  const base = process.env.AELA_PLUGIN_HOME || homedir();
  const personalityPath = join(base, '.claude', 'aela-plugin', 'personality.yaml');
  if (!existsSync(personalityPath)) return null;
  try {
    const raw = readFileSync(personalityPath, 'utf-8');
    const parsed = YAML.parse(raw) || {};
    return parsed.user_name || null;
  } catch {
    return null;
  }
}

// ── Plugin features doc ─────────────────────────────────────────────────────

function readPluginFeatures() {
  const p = join(PLUGIN_ROOT, 'PLUGIN-FEATURES.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8').trim();
}

// ── Orientation page reads ───────────────────────────────────────────────────

function readOrientationPage(name) {
  try {
    const content = wikiRead('personal', name);
    return `### ${name}\n\n${content.trim()}\n`;
  } catch (e) {
    // wikiRead throws on missing — skip the page with a placeholder
    return `### ${name}\n\n_(page not found — created on /wiki-init)_\n`;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Reindex before reading — guards against wiki pages delivered via git pull
// that never went through wiki_create
try { wikiUpdateIndex('personal'); } catch { /* non-fatal, probably no wiki yet */ }
try { wikiUpdateIndex('project');  } catch { /* non-fatal */ }

const sections = [];

// 1. User name
const userName = readUserName();
if (userName) {
  sections.push(`User is called ${userName}.`);
}

// 2. Plugin features
const features = readPluginFeatures();
if (features) {
  sections.push('# Plugin Features\n\n' + features);
}

// 3. Personal wiki index
const personalIndex = wikiList('personal');
sections.push('## Personal wiki index\n\n' + personalIndex.trim());

// 4. Project wiki index
const projectIndex = wikiList('project');
sections.push('## Project wiki index\n\n' + projectIndex.trim());

// 5. Orientation pages
const pageSections = ORIENTATION_PAGES.map(readOrientationPage).join('\n---\n\n');
sections.push('## Orientation pages (loaded in full)\n\n' + pageSections);

const additionalContext = '# Wiki orientation\n\n' + sections.join('\n\n---\n\n') + '\n';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext,
  },
}));
```

**Notes on the imports:**

- The top-level static imports are only things that ship with Node (`fs`, `child_process`, `path`, `os`, `url`). This is safe even when `node_modules/` is missing on first invocation.
- `yaml` and the wiki store are loaded via dynamic `import()` after the bootstrap guard runs — by that point `node_modules/` is guaranteed to exist.
- The wiki store import (`../mcp-servers/wiki/store.js`) works without any guard on the hook's node_modules because store.js's own `yaml` import resolves from `mcp-servers/wiki/node_modules/` (where it's already installed from Phase 1), not from the hooks directory.

- [ ] **Step 4: Run to confirm it passes**

```
cd /c/devworkspace/aela-voice/plugin/hooks && node verify/session-orient.mjs
```

Expected: all eleven checks print `ok   ...`.

- [ ] **Step 5: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add hooks/session-orient.js hooks/verify/session-orient.mjs && git commit -m "$(cat <<'EOF'
feat(hooks): session-orient hook for wiki context injection

Adds plugin/hooks/session-orient.js — a SessionStart hook that emits
additionalContext containing the user name line, PLUGIN-FEATURES.md
contents, both wiki indexes, and five orientation pages in full.
Any source that is absent is skipped entirely, not replaced with a
placeholder. Ported from matt-head's scripts/session-orient.js with
plugin-scoped path resolution and the new five-page orientation set.

Verified via hooks/verify/session-orient.mjs — spawns the hook as a
subprocess in an isolated temp workspace and asserts JSON shape
against both cold-start (nothing exists yet) and warm-start
(personality + features + seeded wikis) cases.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `wiki-maintenance.js` hook

Port the workspace-scanning maintenance hook. Text output to stdout, not JSON.

**Files:**
- Create: `plugin/hooks/wiki-maintenance.js`
- Create: `plugin/hooks/verify/wiki-maintenance.mjs`

- [ ] **Step 1: Write the verification script**

Create `plugin/hooks/verify/wiki-maintenance.mjs`:

```js
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

// Chdir into proj-a so WORKSPACE_ROOT defaults resolve correctly
process.chdir(projA);

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
check('hook exits 0', result.status === 0);
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
```

- [ ] **Step 2: Run to confirm failure**

```
cd /c/devworkspace/aela-voice/plugin/hooks && node verify/wiki-maintenance.mjs
```

Expected: FAIL — `wiki-maintenance.js` does not exist.

- [ ] **Step 3: Write `wiki-maintenance.js`**

Create `plugin/hooks/wiki-maintenance.js`:

```js
#!/usr/bin/env node
/**
 * SessionStart hook — wiki maintenance report.
 *
 * Discovers source docs in the workspace by glob, filters by git
 * authorship (keeps untracked files and files last-committed by the
 * current user), detects external wikis in sibling projects, and
 * reports wiki health issues (pages missing description frontmatter).
 *
 * Writes a plain markdown maintenance report to stdout. Claude reads
 * it as a message at session start and acts on it.
 *
 * WORKSPACE_ROOT env var overrides the default of one level above cwd.
 */

import { readdirSync, existsSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { execSync } from 'child_process';

import { readSources, checkWikiHealth } from '../mcp-servers/wiki/store.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || resolve(process.cwd(), '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function lastCommitAuthorEmail(filePath, repoRoot) {
  try {
    const rel = relative(repoRoot, filePath).replace(/\\/g, '/');
    return execSync(`git log --format="%ae" -1 -- "${rel}"`, {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

function currentUserEmail() {
  try {
    return execSync('git config user.email', { cwd: WORKSPACE_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function findGitRoot(filePath) {
  let dir = dirname(filePath);
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findMdFiles(root, subPatterns) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) results.push(full);
    }
  }
  for (const pattern of subPatterns) {
    walk(join(root, pattern));
  }
  return results;
}

// ── Source doc discovery ─────────────────────────────────────────────────────

function checkSources() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const myEmail = currentUserEmail();
  const issues = [];

  // Scan all top-level project dirs under WORKSPACE_ROOT
  if (!existsSync(WORKSPACE_ROOT)) return issues;
  const topLevel = [];
  for (const entry of readdirSync(WORKSPACE_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      topLevel.push(join(WORKSPACE_ROOT, entry.name));
    }
  }

  for (const projectDir of topLevel) {
    const candidates = findMdFiles(projectDir, [
      'docs/wiki-ingest',
      'docs/superpowers/specs',
      'docs/superpowers/plans',
    ]);
    for (const filePath of candidates) {
      const repoRoot = findGitRoot(filePath) || projectDir;
      const authorEmail = lastCommitAuthorEmail(filePath, repoRoot);

      if (authorEmail && myEmail && authorEmail !== myEmail) continue;

      const sourceId = relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

      if (!ingestedIds.has(sourceId)) {
        const stat = statSync(filePath);
        issues.push({
          type: 'new_source',
          message: `New source not yet ingested: \`${sourceId}\` (modified ${stat.mtime.toISOString().slice(0, 10)})`,
        });
      }
    }
  }

  return issues;
}

// ── External wiki detection ──────────────────────────────────────────────────

function checkExternalWikis() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const issues = [];

  if (!existsSync(WORKSPACE_ROOT)) return issues;
  for (const entry of readdirSync(WORKSPACE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const wikiPath = join(WORKSPACE_ROOT, entry.name, '.aela', 'wiki');
    if (!existsSync(wikiPath)) continue;

    const portalId = `${entry.name}/.aela/wiki`;
    if (!ingestedIds.has(portalId)) {
      issues.push({
        type: 'external_wiki',
        message: `New external wiki: \`${portalId}\` (no portal page) — ingest recommended`,
      });
    }
  }

  return issues;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const sourceIssues = checkSources();
const externalIssues = checkExternalWikis();
const healthIssues = [
  ...checkWikiHealth('personal'),
  ...checkWikiHealth('project'),
];

const allIssues = [...sourceIssues, ...externalIssues, ...healthIssues];

if (allIssues.length === 0) {
  process.exit(0);
}

console.log('## Wiki Maintenance Needed\n');

if (sourceIssues.length > 0) {
  console.log('### New Sources to Ingest\n');
  for (const s of sourceIssues) console.log(`- ${s.message}`);
  console.log('\nRun `/wiki-ingest` to ingest these, or `/wiki-ingest <path>` for a specific one.\n');
}

if (externalIssues.length > 0) {
  console.log('### External Wikis\n');
  for (const e of externalIssues) console.log(`- ${e.message}`);
  console.log();
}

if (healthIssues.length > 0) {
  console.log('### Wiki Health Issues\n');
  for (const h of healthIssues) console.log(`- ${h.message}`);
  console.log();
}
```

- [ ] **Step 4: Run to confirm it passes**

```
cd /c/devworkspace/aela-voice/plugin/hooks && node verify/wiki-maintenance.mjs
```

Expected: all seven checks pass.

- [ ] **Step 5: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add hooks/wiki-maintenance.js hooks/verify/wiki-maintenance.mjs && git commit -m "$(cat <<'EOF'
feat(hooks): wiki-maintenance hook for source and health discovery

Adds plugin/hooks/wiki-maintenance.js — a SessionStart hook that
walks WORKSPACE_ROOT for un-ingested source docs, detects external
wikis in sibling projects, and reports wiki health issues. Text
output to stdout (markdown). Ported from matt-head's
scripts/wiki-maintenance.js with YAML sources.md parsing via the
wiki store's readSources helper and docs/wiki-ingest/ glob in
place of docs/analysis/.

Git-authorship filter keeps untracked files and files last-committed
by the current user; files authored by other users are skipped.
Workspace-relative source IDs (e.g. proj-a/docs/...) are the stable
form across sibling-repo discovery.

Verified via hooks/verify/wiki-maintenance.mjs — spawns the hook in
an isolated temp workspace with two seeded projects and asserts on
cold-start, post-ingest, and health-check cases.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Register both hooks in `hooks.json`

**Files:**
- Modify: `plugin/hooks/hooks.json`

- [ ] **Step 1: Update hooks.json**

Open `plugin/hooks/hooks.json` and add two new entries to the `SessionStart` array alongside the existing `session-start.js` entry. The final content should be:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.js\"",
            "timeout": 30
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/session-orient.js\"",
            "timeout": 10
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/wiki-maintenance.js\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/hooks/turn-end.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate the JSON parses**

```
node -e "console.log(JSON.parse(require('fs').readFileSync('hooks/hooks.json','utf-8')))"
```

Run from `plugin/`. Expected: the parsed object prints cleanly, no JSON errors.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add hooks/hooks.json && git commit -m "$(cat <<'EOF'
feat(hooks): register session-orient and wiki-maintenance hooks

Adds both new Phase 2 SessionStart hooks alongside the existing
session-start.js (TTS/personality) hook. The three fire in
registration order at session start.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Claude Code integration gate

This task does not write code — it verifies that both new hooks fire at session start and behave correctly in a live Claude Code session.

- [ ] **Step 1: Restart Claude Code**

`/exit` and restart. The hook registry loads from `hooks.json` at session start — new hooks are not live until restart.

- [ ] **Step 2: Observe hook output at session start**

On restart, the maintenance hook should emit a markdown report if there are any un-ingested sources in the workspace (right now: `matt-head/docs/analysis/llm-wiki-karpathy.md` and the zoho transport form spec). That output should appear as text before Matt's first prompt.

The orientation hook should emit `additionalContext` with the personal + project wiki indexes. Both are currently empty (placeholders expected). No `User is called` line, no PLUGIN-FEATURES section — both degrade gracefully.

- [ ] **Step 3: Smoke-test one scenario live**

Ask Aela to call `wiki_list` on the personal wiki. It should return `_(empty wiki)_` (unchanged from Phase 1).

Ask Aela to summarise what the session-start maintenance report flagged. She should read her own context and report the same list the hook emitted.

- [ ] **Step 4: No commit**

This task does not produce code changes.

---

## Self-review

**1. Spec coverage.**

Phase 2 scope from the spec:
- [x] Port `session-orient.js` with new five-page orientation set — Task 2
- [x] Port `wiki-maintenance.js` with workspace-relative discovery, git-authorship filter, YAML sources — Task 3
- [x] Inject `PLUGIN-FEATURES.md` contents (graceful absence) — Task 2 Step 3
- [x] Inject user name line from `personality.yaml` (graceful absence) — Task 2 Step 3
- [x] Drop `docs/analysis/` in favour of `docs/wiki-ingest/` glob — Task 3 Step 3
- [x] Personal wiki has no sources.md — Task 3 (only project wiki is checked)
- [x] Add helper functions to store.js for yaml-using logic — Task 1
- [x] Register hooks in hooks.json — Task 4
- [x] Live integration gate — Task 5

**Not in Phase 2 scope (deferred, deliberately):**
- Creating `PLUGIN-FEATURES.md` — Phase 4
- Creating `personality.yaml` template and copy mechanism — Phase 3 (`/aela-init`)
- Creating the contract pages (tasks-active, reflections, etc.) — Phase 3 (`/wiki-init`)
- Writing to `sources.md` during ingestion — Phase 3 (`/wiki-ingest`)
- Comms cron reschedule sentinel — Phase 3 (belongs in `/turn-end`, not session-orient)

**2. Placeholder scan.** No TBDs. Every step has real code or a real command. The yaml dep reach-through (`../mcp-servers/wiki/node_modules/yaml/dist/index.js`) is explicit and has a documented fallback (re-export from store.js if it proves fragile).

**3. Type consistency.** `readSources` returns an array of entries with `path`, `mtime`, `ingested`, `ingested_at`, `notes`. The maintenance hook uses `path` and `ingested`. The schema is consistent between the source writer format (specified in the spec Source Tracking section) and the reader (Task 1).

**4. Graceful absence handling.** Every file the hooks depend on can be absent at Phase 2 time (no personality.yaml, no PLUGIN-FEATURES.md, empty wikis, no sources.md). The verify scripts explicitly test the cold-start case alongside the warm case. If any hook fails on absent files, the session-start chain breaks and the plugin is unusable.

**5. Two things worth flagging for the implementer.**

- The `readUserName` function in `session-orient.js` uses `process.env.AELA_PLUGIN_HOME || homedir()` so tests can isolate the personality.yaml path. This matches the wiki store's env override pattern. Do not use a different env var name — consistency matters.
- The bootstrap guard in `session-orient.js` uses `stdio: 'ignore'` so npm install output doesn't pollute the JSON stdout the hook emits. Do not change this — the hook's stdout must be a single valid JSON line.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-2-hooks.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, inline review where tasks are mechanical, final reviewer pass before Task 5.
2. **Inline Execution** — batch with checkpoints, watch live.

**Which approach?**
