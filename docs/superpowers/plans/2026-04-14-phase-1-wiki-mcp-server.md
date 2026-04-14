# Phase 1 Implementation Plan — Wiki MCP Server Port

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port matt-head's wiki system to the aela-voice plugin as a standalone MCP server, applying four migration-level improvements: plugin-scoped storage paths, dual-wiki search, description-weighted scoring, and external federation mode.

**Architecture:** New MCP server at `plugin/mcp-servers/wiki/` following the existing TTS server layout. Single-file tool definitions + handlers in `server.js`, filesystem operations in `store.js`, `start.js` as the stdio entry point. Reuses the `yaml@^2.8.3` dep already present for personality parsing. Personal wiki resolves to `~/.claude/aela-plugin/wiki/` via `os.homedir()`; project wiki resolves to `<cwd>/.aela/wiki/project/` via `process.cwd()` at server start. Verification via ad-hoc `node --input-type=module` scripts under `mcp-servers/wiki/verify/` — matches matt-head's existing style, no new test framework introduced.

**Tech Stack:** Node 20+ ESM, `@modelcontextprotocol/sdk@^1.27.1`, `yaml@^2.8.3`. No build step.

**Scope boundary:** This phase delivers a working MCP server with seven tools. It does NOT ship the `wiki-update` skill, the hooks, or any init skills — those are Phases 2 and 3. At the end of Phase 1, the wiki can be created, read, searched, deleted, and reindexed via MCP tools; updates to existing pages are not yet possible until the `wiki-update` skill ships in Phase 3.

**Reference source:** The matt-head implementation being ported lives at:
- `C:/devworkspace/matt-head/src/wiki/store.js` (264 lines)
- `C:/devworkspace/matt-head/src/mcp-tools.js` (WIKI_TOOLS export, lines 5–129)
- `C:/devworkspace/matt-head/src/mcp-server.js` (wiki handlers, lines 42–70; switch cases, lines 100–107)

The port must match matt-head's semantics on the tools that are NOT changing, and implement the four migration-level changes explicitly below.

**The four migration-level changes:**

1. **Storage paths.** `VALID_WIKIS = ['personal', 'project']`. Personal wiki at `~/.claude/aela-plugin/wiki/` (use `os.homedir()`). Project wiki at `<process.cwd()>/.aela/wiki/project/`. All directory creation is lazy — created on first write, not at server start.
2. **`wiki_search` signature change.** Drop the `wiki` param. Search both wikis in one call. Results are tagged with which wiki each hit came from. Return format: a single rendered result string with section headers like `### personal:<page>` and `### project:<page>`.
3. **Description-weighted scoring.** Parse frontmatter on every search (the `yaml` dep is already loaded). Weights: title ×15, description ×8, body ×1 per term capped at 5. Matt-head's current scoring only uses title + body and ignores description entirely.
4. **External federation mode for `wiki_read`.** Optional `path` parameter. When `wiki: 'external'` and `path: '<abs>'` are supplied, read the page from `<abs>/<page>.md` instead of the managed wiki dirs. Matt-head already has this (store.js line 49–58); port verbatim.

---

## File Structure

```
plugin/mcp-servers/wiki/
├── package.json              # new; deps: @modelcontextprotocol/sdk, yaml
├── start.js                  # new; stdio entry point
├── server.js                 # new; tool defs + handlers + MCP wiring
├── store.js                  # new; filesystem ops (ported from matt-head)
└── verify/                   # new; ad-hoc verification scripts (run via node)
    ├── paths.mjs
    ├── create-read.mjs
    ├── list-index.mjs
    ├── search.mjs
    ├── external.mjs
    └── delete.mjs
```

`plugin/.mcp.json` gains one entry for the wiki server.

---

## Task 1: Scaffold the wiki server directory and package.json

**Files:**
- Create: `plugin/mcp-servers/wiki/package.json`

- [ ] **Step 1: Create the directory and write package.json**

Create `plugin/mcp-servers/wiki/package.json`:

```json
{
  "name": "aela-voice-wiki-mcp",
  "version": "0.1.0",
  "type": "module",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.1",
    "yaml": "^2.8.3"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from `plugin/mcp-servers/wiki/`:

```bash
cd plugin/mcp-servers/wiki && npm install
```

Expected: creates `node_modules/` and `package-lock.json`. Verify `node_modules/@modelcontextprotocol/sdk/` and `node_modules/yaml/` both exist.

- [ ] **Step 3: Commit**

```bash
git add plugin/mcp-servers/wiki/package.json plugin/mcp-servers/wiki/package-lock.json
git commit -m "feat(wiki-mcp): scaffold wiki MCP server package"
```

---

## Task 2: Port store.js path resolution and wiki validation

**Files:**
- Create: `plugin/mcp-servers/wiki/store.js`
- Create: `plugin/mcp-servers/wiki/verify/paths.mjs`

- [ ] **Step 1: Write the paths verification script**

Create `plugin/mcp-servers/wiki/verify/paths.mjs`:

```js
import { homedir } from 'os';
import { join } from 'path';
import { wikiDir, pagesDir, pagePath, VALID_WIKIS } from '../store.js';

let failed = 0;
function check(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL ${label}\n  expected: ${expected}\n  actual:   ${actual}`);
    failed++;
  } else {
    console.log(`ok   ${label}`);
  }
}

check('VALID_WIKIS', JSON.stringify(VALID_WIKIS), JSON.stringify(['personal', 'project']));
check(
  'personal wikiDir',
  wikiDir('personal'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki')
);
check(
  'project wikiDir',
  wikiDir('project'),
  join(process.cwd(), '.aela', 'wiki', 'project')
);
check(
  'personal pagesDir',
  pagesDir('personal'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages')
);
check(
  'personal pagePath no ext',
  pagePath('personal', 'tasks-active'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages', 'tasks-active.md')
);
check(
  'personal pagePath with ext',
  pagePath('personal', 'tasks-active.md'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages', 'tasks-active.md')
);

try {
  wikiDir('bogus');
  console.error('FAIL validateWiki should throw on unknown wiki');
  failed++;
} catch (e) {
  if (/Unknown wiki/.test(e.message)) {
    console.log('ok   validateWiki throws on unknown wiki');
  } else {
    console.error(`FAIL validateWiki threw unexpected error: ${e.message}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the verification script to see it fail (store.js doesn't exist yet)**

Run from `plugin/mcp-servers/wiki/`:

```bash
node verify/paths.mjs
```

Expected: ERROR — cannot find module `'../store.js'`.

- [ ] **Step 3: Write the minimal store.js with paths + validation**

Create `plugin/mcp-servers/wiki/store.js`:

```js
/**
 * Wiki store — filesystem operations for the LLM Wiki pattern.
 *
 * Two wikis: "personal" (~/.claude/aela-plugin/wiki/) and "project"
 * (<cwd>/.aela/wiki/project/). The tools are plumbing — the LLM does
 * the thinking.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  unlinkSync,
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';

export const VALID_WIKIS = ['personal', 'project'];

function validateWiki(wiki) {
  if (!VALID_WIKIS.includes(wiki)) {
    throw new Error(`Unknown wiki: "${wiki}". Valid: ${VALID_WIKIS.join(', ')}`);
  }
}

export function wikiDir(wiki) {
  validateWiki(wiki);
  if (wiki === 'personal') {
    return join(homedir(), '.claude', 'aela-plugin', 'wiki');
  }
  // project
  return join(process.cwd(), '.aela', 'wiki', 'project');
}

export function pagesDir(wiki) {
  return join(wikiDir(wiki), 'pages');
}

export function pagePath(wiki, page) {
  const name = page.endsWith('.md') ? page : `${page}.md`;
  return join(pagesDir(wiki), name);
}
```

- [ ] **Step 4: Run the verification script to see it pass**

Run from `plugin/mcp-servers/wiki/`:

```bash
node verify/paths.mjs
```

Expected: all seven checks print `ok   ...` and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js plugin/mcp-servers/wiki/verify/paths.mjs
git commit -m "feat(wiki-mcp): path resolution for personal and project wikis"
```

---

## Task 3: Port wikiCreate and wikiRead (with external mode)

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js`
- Create: `plugin/mcp-servers/wiki/verify/create-read.mjs`

- [ ] **Step 1: Write the create-read verification script**

Create `plugin/mcp-servers/wiki/verify/create-read.mjs`:

```js
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// Route project wiki into an isolated temp dir by chdir'ing before import
const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiCreate, wikiRead } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// Create a project page
const msg = wikiCreate('project', 'test-page', {
  title: 'Test Page',
  category: 'reference',
  description: 'A test page for verification',
  body: 'Body content here.\n',
});
check('wikiCreate returns success message', /Created/.test(msg));
check('page file exists', existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'test-page.md')));

// Read it back
const content = wikiRead('project', 'test-page');
check('wikiRead returns content with frontmatter', /^---/.test(content));
check('wikiRead body present', /Body content here\./.test(content));
check('wikiRead description persisted', /A test page for verification/.test(content));

// Duplicate create should throw
try {
  wikiCreate('project', 'test-page', {
    title: 'X', category: 'y', description: 'z', body: 'w',
  });
  check('duplicate create throws', false, 'did not throw');
} catch (e) {
  check('duplicate create throws', /already exists/.test(e.message), e.message);
}

// Missing field should throw
try {
  wikiCreate('project', 'incomplete', { title: 'T' });
  check('missing-field create throws', false, 'did not throw');
} catch (e) {
  check('missing-field create throws', /missing required fields/.test(e.message), e.message);
}

// Read a missing page returns the not-found message (matches matt-head)
const missing = wikiRead('project', 'nope');
check('read missing page returns not-found string', /not found/.test(missing));

// External mode
const extDir = join(tmp, 'external-wiki');
mkdirSync(extDir, { recursive: true });
writeFileSync(join(extDir, 'ext-page.md'), '# External Content\n', 'utf-8');
const ext = wikiRead('external', 'ext-page', extDir);
check('external wikiRead returns external content', /External Content/.test(ext));

const extMissing = wikiRead('external', 'nope', extDir);
check('external wikiRead missing page returns not-found', /not found at external path/.test(extMissing));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the verification to see it fail**

Run from `plugin/mcp-servers/wiki/`:

```bash
node verify/create-read.mjs
```

Expected: ERROR — `wikiCreate` and `wikiRead` are not exported from store.js.

- [ ] **Step 3: Add wikiCreate and wikiRead to store.js**

Append to `plugin/mcp-servers/wiki/store.js`:

```js
// ── Read operations ─────────────────────────────────────────────────────────

export function wikiRead(wiki, page, externalPath) {
  if (externalPath || wiki === 'external') {
    const name = page.endsWith('.md') ? page : `${page}.md`;
    const p = join(externalPath, name);
    if (!existsSync(p)) {
      return `Page "${page}" not found at external path "${externalPath}".`;
    }
    return readFileSync(p, 'utf-8');
  }

  const p = pagePath(wiki, page);
  if (!existsSync(p)) {
    return `Page "${page}" not found in ${wiki} wiki.`;
  }
  return readFileSync(p, 'utf-8');
}

// ── Write operations ────────────────────────────────────────────────────────

export function wikiCreate(wiki, page, { title, category, description, body, logEntry, tags } = {}) {
  validateWiki(wiki);

  const missing = ['title', 'category', 'description', 'body'].filter(
    f => !{ title, category, description, body }[f]
  );
  if (missing.length > 0) {
    throw new Error(`wiki_create: missing required fields: ${missing.join(', ')}`);
  }

  const p = pagePath(wiki, page);
  if (existsSync(p)) {
    throw new Error(
      `wiki_create: page "${page}" already exists in ${wiki} wiki. Use the wiki-update skill to modify existing pages.`
    );
  }

  mkdirSync(pagesDir(wiki), { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = YAML.stringify({
    title,
    description,
    category,
    tags: tags && tags.length > 0 ? tags : [],
    created: today,
    updated: today,
  });

  const content = `---\n${frontmatter}---\n\n${body}`;
  writeFileSync(p, content, 'utf-8');

  const entry = logEntry || `create | ${page}`;
  appendLog(wiki, entry);

  // wikiUpdateIndex is defined in a later task; call it lazily via dynamic check
  if (typeof wikiUpdateIndex === 'function') {
    wikiUpdateIndex(wiki);
  }

  return `Created page "${page}" in ${wiki} wiki.`;
}

// ── Log ─────────────────────────────────────────────────────────────────────

function appendLog(wiki, entry) {
  const logPath = join(wikiDir(wiki), 'log.md');
  mkdirSync(wikiDir(wiki), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const line = `\n## [${date}] ${entry}\n`;

  if (existsSync(logPath)) {
    const existing = readFileSync(logPath, 'utf-8');
    writeFileSync(logPath, existing + line, 'utf-8');
  } else {
    writeFileSync(logPath, `# ${wiki} Wiki — Log\n${line}`, 'utf-8');
  }
}
```

**Note:** `wikiUpdateIndex` is called in `wikiCreate` but not yet defined. The `typeof` guard keeps this task runnable in isolation; Task 6 defines it properly and removes the guard.

- [ ] **Step 4: Run the verification to see it pass**

Run from `plugin/mcp-servers/wiki/`:

```bash
node verify/create-read.mjs
```

Expected: all nine checks print `ok   ...`.

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js plugin/mcp-servers/wiki/verify/create-read.mjs
git commit -m "feat(wiki-mcp): wikiCreate and wikiRead with external federation"
```

---

## Task 4: Port wikiList, wikiLog, and wikiDelete

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js`
- Create: `plugin/mcp-servers/wiki/verify/list-index.mjs`
- Create: `plugin/mcp-servers/wiki/verify/delete.mjs`

- [ ] **Step 1: Write the list verification script**

Create `plugin/mcp-servers/wiki/verify/list-index.mjs`:

```js
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiList, wikiLog, wikiCreate } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// Empty wiki list
const empty = wikiList('project');
check('empty wikiList returns placeholder', /empty/.test(empty));

// Empty log
const noLog = wikiLog('project');
check('empty wikiLog returns placeholder', /no log/.test(noLog));

// Create a page (appendLog should seed the log file)
wikiCreate('project', 'alpha', {
  title: 'Alpha', category: 'reference', description: 'Alpha desc', body: 'A',
});

// wikiLog should now show the create entry
const log = wikiLog('project');
check('log contains create entry', /create \| alpha/.test(log));

// wikiList still returns placeholder (no index.md yet — that's Task 6)
const afterCreate = wikiList('project');
check(
  'wikiList returns placeholder when index.md absent',
  /empty/.test(afterCreate)
);

// Manually write an index and verify wikiList returns it
mkdirSync(join(tmp, '.aela', 'wiki', 'project'), { recursive: true });
writeFileSync(
  join(tmp, '.aela', 'wiki', 'project', 'index.md'),
  '# Manual Index\n',
  'utf-8'
);
const idx = wikiList('project');
check('wikiList returns index.md content', /Manual Index/.test(idx));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to see it fail**

```bash
node verify/list-index.mjs
```

Expected: ERROR — `wikiList` / `wikiLog` not exported.

- [ ] **Step 3: Add wikiList and wikiLog to store.js**

Append to the "Read operations" section of `plugin/mcp-servers/wiki/store.js`:

```js
export function wikiList(wiki) {
  validateWiki(wiki);
  const indexPath = join(wikiDir(wiki), 'index.md');
  if (!existsSync(indexPath)) return '_(empty wiki)_';
  return readFileSync(indexPath, 'utf-8');
}

export function wikiLog(wiki, limit = 20) {
  validateWiki(wiki);
  const logPath = join(wikiDir(wiki), 'log.md');
  if (!existsSync(logPath)) return '_(no log)_';

  const content = readFileSync(logPath, 'utf-8');
  const entries = content.split(/^## /m).filter(e => e.trim());
  const header = entries.length > 0 && !entries[0].startsWith('[') ? entries.shift() : '';
  const recent = entries.slice(-limit);

  if (recent.length === 0) return '_(no log entries)_';
  return recent.map(e => `## ${e.trim()}`).join('\n\n');
}
```

- [ ] **Step 4: Run to see it pass**

```bash
node verify/list-index.mjs
```

Expected: all five checks pass.

- [ ] **Step 5: Write the delete verification script**

Create `plugin/mcp-servers/wiki/verify/delete.mjs`:

```js
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiCreate, wikiDelete, wikiLog } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

wikiCreate('project', 'doomed', {
  title: 'Doomed', category: 'reference', description: 'Will be deleted', body: 'bye',
});

const pagePath = join(tmp, '.aela', 'wiki', 'project', 'pages', 'doomed.md');
check('page exists before delete', existsSync(pagePath));

const msg = wikiDelete('project', 'doomed');
check('wikiDelete returns success message', /Deleted/.test(msg));
check('page removed from disk', !existsSync(pagePath));

const log = wikiLog('project');
check('log contains delete entry', /delete \| doomed/.test(log));

// Delete missing page is no-op (matches matt-head semantics)
const msg2 = wikiDelete('project', 'never-existed');
check('delete missing page does not throw', /Deleted/.test(msg2));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 6: Run to see it fail**

```bash
node verify/delete.mjs
```

Expected: ERROR — `wikiDelete` not exported.

- [ ] **Step 7: Add wikiDelete to store.js**

Append to the "Write operations" section of `plugin/mcp-servers/wiki/store.js`:

```js
export function wikiDelete(wiki, page) {
  validateWiki(wiki);
  const p = pagePath(wiki, page);

  if (existsSync(p)) {
    unlinkSync(p);
  }

  if (typeof wikiUpdateIndex === 'function') {
    wikiUpdateIndex(wiki);
  }
  appendLog(wiki, `delete | ${page}`);

  return `Deleted page "${page}" from ${wiki} wiki.`;
}
```

- [ ] **Step 8: Run to see it pass**

```bash
node verify/delete.mjs
```

Expected: all five checks pass.

- [ ] **Step 9: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js plugin/mcp-servers/wiki/verify/list-index.mjs plugin/mcp-servers/wiki/verify/delete.mjs
git commit -m "feat(wiki-mcp): wikiList, wikiLog, wikiDelete"
```

---

## Task 5: Port wikiUpdateIndex with YAML frontmatter parsing

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js`
- Modify: `plugin/mcp-servers/wiki/verify/list-index.mjs`

- [ ] **Step 1: Extend list-index.mjs to cover wikiUpdateIndex**

Replace the `// wikiList still returns placeholder ...` comment and its two related checks in `plugin/mcp-servers/wiki/verify/list-index.mjs` with:

```js
// wikiUpdateIndex should build a proper index.md from frontmatter
const { wikiUpdateIndex } = await import('../store.js');

wikiCreate('project', 'beta', {
  title: 'Beta Page', category: 'reference', description: 'Beta desc', body: 'B',
});
wikiCreate('project', 'gamma', {
  title: 'Gamma Page', category: 'context', description: 'Gamma desc with colons: multiple: parts', body: 'G',
});

const result = wikiUpdateIndex('project');
check('wikiUpdateIndex returns status message', /Updated/.test(result));

const idx = wikiList('project');
check('index has Project heading', /Project Wiki — Index/.test(idx));
check('index lists alpha with description', /\[\[alpha\]\] — Alpha desc/.test(idx));
check('index lists beta', /\[\[beta\]\] — Beta desc/.test(idx));
check('index lists gamma with colons in description', /Gamma desc with colons: multiple: parts/.test(idx));
check('reference category heading present', /## Reference/.test(idx));
check('context category heading present', /## Context/.test(idx));
```

**Remove** the earlier manual-index block (the `mkdirSync` + `writeFileSync` + the two `wikiList` checks after it). The new block supersedes it.

- [ ] **Step 2: Run to see it fail**

```bash
node verify/list-index.mjs
```

Expected: ERROR — `wikiUpdateIndex` not exported.

- [ ] **Step 3: Add wikiUpdateIndex to store.js**

Append to the "Write operations" section of `plugin/mcp-servers/wiki/store.js`:

```js
export function wikiUpdateIndex(wiki) {
  validateWiki(wiki);
  const dir = pagesDir(wiki);
  if (!existsSync(dir)) return 'No pages in wiki.';

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return 'No pages in wiki.';

  const pages = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf-8');
    const name = f.replace(/\.md$/, '');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const fm = match ? (YAML.parse(match[1]) || {}) : {};
    pages.push({
      name,
      title: fm.title || name,
      category: (fm.category || 'uncategorised').toLowerCase(),
      description: fm.description || fm.title || name,
    });
  }

  const groups = {};
  for (const p of pages) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }

  const wikiLabel = wiki.charAt(0).toUpperCase() + wiki.slice(1);
  const lines = [`# ${wikiLabel} Wiki — Index\n`];

  const cats = Object.keys(groups).sort((a, b) => {
    if (a === 'uncategorised') return 1;
    if (b === 'uncategorised') return -1;
    return a.localeCompare(b);
  });

  for (const cat of cats) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`## ${label}\n`);
    for (const p of groups[cat].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- [[${p.name}]] — ${p.description}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');
  const indexPath = join(wikiDir(wiki), 'index.md');
  writeFileSync(indexPath, content, 'utf-8');
  return `Updated ${wiki} wiki index (${pages.length} pages, ${cats.length} categories).`;
}
```

Also remove the `typeof wikiUpdateIndex === 'function'` guards in `wikiCreate` and `wikiDelete` — they can now call `wikiUpdateIndex` directly:

```js
// In wikiCreate, replace:
//   if (typeof wikiUpdateIndex === 'function') { wikiUpdateIndex(wiki); }
// with:
  wikiUpdateIndex(wiki);

// In wikiDelete, same replacement.
```

- [ ] **Step 4: Run to see it pass**

```bash
node verify/list-index.mjs
```

Expected: all eight checks pass, including the description-with-colons check that validates YAML parsing handles nested colons correctly (the bug matt-head had before commit `1b7f9e6`).

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js plugin/mcp-servers/wiki/verify/list-index.mjs
git commit -m "feat(wiki-mcp): wikiUpdateIndex with yaml-lib frontmatter parsing"
```

---

## Task 6: Port wikiSearch with dual-wiki search and description-weighted scoring

This is the biggest departure from matt-head's implementation. Two structural changes: the function takes only `query` (no `wiki` param) and searches both wikis, and scoring includes description from parsed frontmatter.

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js`
- Create: `plugin/mcp-servers/wiki/verify/search.mjs`

- [ ] **Step 1: Write the search verification script**

Create `plugin/mcp-servers/wiki/verify/search.mjs`:

```js
import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';

// Isolate the project wiki under a temp cwd.
const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

// Personal wiki resolves to homedir — we do NOT want to touch the real one.
// Solution: use HOME override via the `OS_HOMEDIR_OVERRIDE` env var the store
// respects when present. (See Step 3 of this task.)
const personalRoot = join(tmp, 'fake-home', '.claude', 'aela-plugin', 'wiki');
mkdirSync(personalRoot, { recursive: true });
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const { wikiCreate, wikiSearch } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// Seed personal wiki
wikiCreate('personal', 'matt-profile', {
  title: 'User Profile',
  category: 'person',
  description: 'Structural info about Matt — role, responsibilities, relationships',
  body: 'Some prose about working with the user.',
});

// Seed project wiki
wikiCreate('project', 'auth-flow', {
  title: 'Auth Flow',
  category: 'reference',
  description: 'Authentication flow across the backend and together-app',
  body: 'The auth flow uses token exchange between services.',
});
wikiCreate('project', 'unrelated', {
  title: 'Unrelated',
  category: 'reference',
  description: 'Something else entirely',
  body: 'This page has no auth content.',
});

// Search across both wikis in one call
const result = wikiSearch('auth');
check('result mentions project:auth-flow', /project:auth-flow/.test(result), result);
check('result tagged with wiki name', /project:/.test(result));

// Score should rank auth-flow (title + description + body match) above unrelated
const authIdx = result.indexOf('auth-flow');
const unrelatedIdx = result.indexOf('unrelated');
check(
  'auth-flow ranks above unrelated OR unrelated absent',
  authIdx >= 0 && (unrelatedIdx === -1 || authIdx < unrelatedIdx),
  `authIdx=${authIdx}, unrelatedIdx=${unrelatedIdx}`
);

// Search for a term only in personal wiki
const personalResult = wikiSearch('responsibilities');
check('personal wiki hit tagged personal:', /personal:matt-profile/.test(personalResult), personalResult);

// Description-weighted scoring — a page whose description contains the term
// but whose body doesn't should still rank
wikiCreate('project', 'token-spec', {
  title: 'Token Spec',
  category: 'reference',
  description: 'Describes token exchange format used by the auth flow',
  body: 'Content that does not contain the search term at all.',
});
const tokenSearch = wikiSearch('exchange');
check(
  'token-spec found via description match',
  /project:token-spec/.test(tokenSearch),
  tokenSearch
);

// Empty query
const empty = wikiSearch('');
check('empty query returns message', /Empty query/.test(empty));

// No results
const nothing = wikiSearch('xyzzyabsent');
check('no results returns message', /No results/.test(nothing));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run to see it fail**

```bash
node verify/search.mjs
```

Expected: ERROR — `wikiSearch` not exported, and/or the `AELA_PLUGIN_HOME` env var is not honoured yet.

- [ ] **Step 3: Teach `wikiDir` to honour the `AELA_PLUGIN_HOME` env var and add wikiSearch**

Two changes in `plugin/mcp-servers/wiki/store.js`:

First, update `wikiDir` to use the env override for the personal wiki when set (this is how tests isolate from the real home dir):

```js
export function wikiDir(wiki) {
  validateWiki(wiki);
  if (wiki === 'personal') {
    const base = process.env.AELA_PLUGIN_HOME || homedir();
    return join(base, '.claude', 'aela-plugin', 'wiki');
  }
  // project
  return join(process.cwd(), '.aela', 'wiki', 'project');
}
```

Then append to the "Read operations" section:

```js
export function wikiSearch(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 'Empty query.';

  const allResults = [];

  for (const wiki of VALID_WIKIS) {
    const dir = pagesDir(wiki);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;

    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const name = file.replace(/\.md$/, '');

      // Split frontmatter from body
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const fm = match ? (YAML.parse(match[1]) || {}) : {};
      const body = match ? match[2] : raw;

      const titleText = (fm.title || name).toLowerCase();
      const descriptionText = (fm.description || '').toLowerCase();
      const bodyLower = body.toLowerCase();

      // Score: Title ×15, Description ×8, Body ×1 per occurrence capped at 5
      let score = 0;
      for (const term of terms) {
        if (titleText.includes(term)) score += 15;
        if (descriptionText.includes(term)) score += 8;
        const bodyMatches = (bodyLower.match(new RegExp(escapeRegex(term), 'g')) || []).length;
        score += Math.min(bodyMatches, 5);
      }

      if (score > 0) {
        const firstTerm = terms.find(t => bodyLower.includes(t) || titleText.includes(t) || descriptionText.includes(t));
        let snippet = '';
        if (firstTerm) {
          const haystack = bodyLower.includes(firstTerm) ? body : (fm.description || fm.title || name);
          const lowerHaystack = haystack.toLowerCase();
          const idx = lowerHaystack.indexOf(firstTerm);
          if (idx >= 0) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(haystack.length, idx + 120);
            snippet = (start > 0 ? '...' : '') + haystack.slice(start, end).trim() + (end < haystack.length ? '...' : '');
          } else {
            snippet = (fm.description || '').slice(0, 200);
          }
        }

        allResults.push({ wiki, page: name, score, snippet });
      }
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  const top = allResults.slice(0, 10);

  if (top.length === 0) return `No results for "${query}".`;

  return top
    .map(r => `### ${r.wiki}:${r.page} (score: ${r.score})\n${r.snippet}`)
    .join('\n\n---\n\n');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

- [ ] **Step 4: Run to see it pass**

```bash
node verify/search.mjs
```

Expected: all eight checks pass.

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js plugin/mcp-servers/wiki/verify/search.mjs
git commit -m "feat(wiki-mcp): dual-wiki wikiSearch with description-weighted scoring"
```

---

## Task 7: Write the MCP server (server.js) with tool definitions and handlers

**Files:**
- Create: `plugin/mcp-servers/wiki/server.js`

- [ ] **Step 1: Create server.js with the seven tool definitions**

Create `plugin/mcp-servers/wiki/server.js`:

```js
#!/usr/bin/env node
/**
 * aela-voice wiki MCP server.
 *
 * Exposes seven wiki tools against two wikis:
 *   personal — ~/.claude/aela-plugin/wiki/
 *   project  — <cwd>/.aela/wiki/project/
 *
 * Updates to existing pages are deliberately NOT an MCP tool — they
 * happen via the wiki-update skill using Edit directly, which gives us
 * optimistic concurrency for free.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import {
  wikiRead,
  wikiList,
  wikiSearch,
  wikiLog,
  wikiCreate,
  wikiDelete,
  wikiUpdateIndex,
} from './store.js';

// ── Tool definitions ────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'wiki_search',
    description: 'Search wiki pages by keyword across BOTH personal and project wikis in one call. Returns matching pages with snippets, ranked by relevance. Results are tagged with which wiki each hit came from.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query — keywords to find in page titles, descriptions, and content.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'wiki_read',
    description: 'Read a specific wiki page. For standard wikis, supply wiki ("personal" or "project") and page. For external collaborator wikis, supply wiki: "external", page, and path (absolute path to the directory containing the external wiki pages).',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: {
          type: 'string',
          description: 'Which wiki: "personal", "project", or "external" (requires path param).',
        },
        page: { type: 'string', description: 'Page name (e.g. "tasks-active"). No .md extension needed.' },
        path: { type: 'string', description: 'For external wikis only: absolute path to the directory containing the page file.' },
      },
      required: ['wiki', 'page'],
    },
  },
  {
    name: 'wiki_create',
    description: 'Create a new wiki page. Errors if the page already exists — use the wiki-update skill to modify existing pages. All of title, category, description, and body are required. description must be a genuine one-line summary of what the page contains (not a restatement of the title) — it appears in the index and is how future sessions decide whether to drill in. created and updated are set to today automatically. The index regenerates after every create.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        page: { type: 'string', description: 'Page name slug (e.g. "tasks-active"). No .md extension needed. Use lowercase-hyphenated.' },
        title: { type: 'string', description: 'Human-readable page title.' },
        category: { type: 'string', description: 'Page category (e.g. "context", "project", "reference", "person", "preference").' },
        description: { type: 'string', description: 'One-line summary of page contents. Must describe what is IN the page, not restate the title. This is the text shown in the wiki index — write it so a future reader can decide whether to drill in without opening the page.' },
        body: { type: 'string', description: 'Page body in Markdown (everything after the frontmatter block).' },
        log_entry: { type: 'string', description: 'Optional custom log entry. Defaults to "create | page-name".' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags list. Defaults to empty.' },
      },
      required: ['wiki', 'page', 'title', 'category', 'description', 'body'],
    },
  },
  {
    name: 'wiki_delete',
    description: 'Delete a wiki page by name, remove it from the index, and append a delete entry to the log. No-op if the page does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        page: { type: 'string', description: 'Page name to delete. No .md extension needed.' },
      },
      required: ['wiki', 'page'],
    },
  },
  {
    name: 'wiki_list',
    description: 'List all pages in a wiki. Returns the index.md content — a categorised catalog of every page.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
      },
      required: ['wiki'],
    },
  },
  {
    name: 'wiki_update_index',
    description: 'Regenerate the wiki index.md from page frontmatter. Call after every wiki-update skill invocation. Also available for repair.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
      },
      required: ['wiki'],
    },
  },
  {
    name: 'wiki_log',
    description: 'Read recent log entries for a wiki. Shows chronological record of creates, deletes, and updates.',
    inputSchema: {
      type: 'object',
      properties: {
        wiki: { type: 'string', enum: ['personal', 'project'], description: 'Which wiki: "personal" or "project".' },
        limit: { type: 'number', description: 'Max entries to return (default 20).' },
      },
      required: ['wiki'],
    },
  },
];

// ── Handlers ────────────────────────────────────────────────────────────────

function handleWikiSearch({ query }) {
  return wikiSearch(query);
}

function handleWikiRead({ wiki, page, path }) {
  return wikiRead(wiki, page, path);
}

function handleWikiCreate({ wiki, page, title, category, description, body, log_entry, tags }) {
  return wikiCreate(wiki, page, { title, category, description, body, logEntry: log_entry, tags });
}

function handleWikiDelete({ wiki, page }) {
  return wikiDelete(wiki, page);
}

function handleWikiList({ wiki }) {
  return wikiList(wiki);
}

function handleWikiUpdateIndex({ wiki }) {
  return wikiUpdateIndex(wiki);
}

function handleWikiLog({ wiki, limit }) {
  return wikiLog(wiki, limit);
}

// ── Server wiring ───────────────────────────────────────────────────────────

const server = new Server(
  { name: 'aela-voice-wiki', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;
    switch (name) {
      case 'wiki_search':       result = handleWikiSearch(args); break;
      case 'wiki_read':         result = handleWikiRead(args); break;
      case 'wiki_create':       result = handleWikiCreate(args); break;
      case 'wiki_delete':       result = handleWikiDelete(args); break;
      case 'wiki_list':         result = handleWikiList(args); break;
      case 'wiki_update_index': result = handleWikiUpdateIndex(args); break;
      case 'wiki_log':          result = handleWikiLog(args); break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: result }] };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Verify server.js loads without syntax errors**

Run from `plugin/mcp-servers/wiki/`:

```bash
node --check server.js
```

Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add plugin/mcp-servers/wiki/server.js
git commit -m "feat(wiki-mcp): server.js with seven tool definitions and handlers"
```

---

## Task 8: Create start.js entry point and wire into plugin .mcp.json

**Files:**
- Create: `plugin/mcp-servers/wiki/start.js`
- Modify: `plugin/.mcp.json`

- [ ] **Step 1: Create start.js**

Create `plugin/mcp-servers/wiki/start.js`:

```js
#!/usr/bin/env node
import('./server.js');
```

This mirrors the TTS server's entry pattern — Claude Code invokes `start.js` via the `.mcp.json` config, and `start.js` delegates to `server.js` which handles the actual MCP protocol.

- [ ] **Step 2: Add the wiki server to .mcp.json**

Open `plugin/.mcp.json`. Add a `wiki` entry alongside the existing `tts` entry:

```json
{
  "tts": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-servers/tts/start.js"]
  },
  "wiki": {
    "command": "node",
    "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-servers/wiki/start.js"]
  }
}
```

- [ ] **Step 3: Sanity check the wiring by invoking server.js directly**

The real test is that Claude Code can spawn the server and list tools. We can smoke-test the stdio protocol by sending a ListTools request manually.

Run from `plugin/mcp-servers/wiki/`:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node server.js
```

Expected: a single JSON-RPC response line containing `"tools"` array with seven entries. The response should include `wiki_search`, `wiki_read`, `wiki_create`, `wiki_delete`, `wiki_list`, `wiki_update_index`, `wiki_log`.

- [ ] **Step 4: Commit**

```bash
git add plugin/mcp-servers/wiki/start.js plugin/.mcp.json
git commit -m "feat(wiki-mcp): start.js entry point and .mcp.json registration"
```

---

## Task 9: End-to-end verification harness

**Files:**
- Create: `plugin/mcp-servers/wiki/verify/end-to-end.mjs`

- [ ] **Step 1: Write the end-to-end verification script**

Create `plugin/mcp-servers/wiki/verify/end-to-end.mjs`:

```js
/**
 * End-to-end verification of the seven wiki MCP tools against an
 * isolated temp working directory. Exercises the full tool surface
 * via direct store imports (the MCP protocol layer is exercised
 * separately by the manual stdio check in Task 8 step 3).
 */

import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-e2e-'));
process.chdir(tmp);
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const {
  wikiCreate,
  wikiRead,
  wikiList,
  wikiSearch,
  wikiUpdateIndex,
  wikiLog,
  wikiDelete,
} = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// 1. Create a page in each wiki
wikiCreate('personal', 'working-preferences', {
  title: 'Working Preferences',
  category: 'preference',
  description: 'How the user wants to be worked with — tone, autonomy, banter',
  body: 'Direct, no padding, ask before touching prod.',
});
wikiCreate('project', 'architecture-overview', {
  title: 'Architecture Overview',
  category: 'context',
  description: 'The 30,000-ft view of how the system fits together',
  body: 'Three MCP servers, two wikis, one rich turn-end.',
});
check('personal page created', existsSync(join(tmp, 'fake-home', '.claude', 'aela-plugin', 'wiki', 'pages', 'working-preferences.md')));
check('project page created', existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'architecture-overview.md')));

// 2. wikiRead round-trip
const personalRead = wikiRead('personal', 'working-preferences');
check('personal wikiRead', /tone, autonomy, banter/.test(personalRead));
const projectRead = wikiRead('project', 'architecture-overview');
check('project wikiRead', /Three MCP servers/.test(projectRead));

// 3. wikiList shows the generated index
const personalIdx = wikiList('personal');
check('personal index lists the page', /\[\[working-preferences\]\]/.test(personalIdx));
const projectIdx = wikiList('project');
check('project index lists the page', /\[\[architecture-overview\]\]/.test(projectIdx));

// 4. wikiSearch finds the page across both wikis
const searchResult = wikiSearch('autonomy');
check('search finds personal hit', /personal:working-preferences/.test(searchResult));

const projSearch = wikiSearch('architecture');
check('search finds project hit', /project:architecture-overview/.test(projSearch));

// 5. Description-weighted scoring — term only in description matches
wikiCreate('project', 'payments', {
  title: 'Payments',
  category: 'reference',
  description: 'Stripe integration for the parent app, runs via webhook ingest pipeline',
  body: 'See the relevant service for details.',
});
const descSearch = wikiSearch('webhook');
check('description-only term matches', /project:payments/.test(descSearch), descSearch);

// 6. wikiLog shows create entries
const log = wikiLog('project');
check('log has architecture-overview create', /create \| architecture-overview/.test(log));
check('log has payments create', /create \| payments/.test(log));

// 7. wikiUpdateIndex can be re-run idempotently
const idxMsg = wikiUpdateIndex('project');
check('wikiUpdateIndex returns count', /Updated project wiki index/.test(idxMsg));

// 8. wikiDelete removes the page and the log has the delete
wikiDelete('project', 'payments');
check('deleted page removed', !existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'payments.md')));
const log2 = wikiLog('project');
check('log shows delete entry', /delete \| payments/.test(log2));

// 9. Index no longer contains deleted page
const finalIdx = wikiList('project');
check('index does not list deleted page', !/payments/.test(finalIdx));

// 10. External wiki read
const extDir = join(tmp, 'ext');
const { mkdirSync, writeFileSync } = await import('fs');
mkdirSync(extDir, { recursive: true });
writeFileSync(join(extDir, 'their-page.md'), '# Their Page\nSome content.\n', 'utf-8');
const ext = wikiRead('external', 'their-page', extDir);
check('external wiki read works', /Their Page/.test(ext));

rmSync(tmp, { recursive: true, force: true });

console.log(failed > 0 ? `\n${failed} check(s) failed.` : '\nAll end-to-end checks passed.');
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **Step 2: Run the end-to-end verification**

```bash
node verify/end-to-end.mjs
```

Expected: all fifteen checks print `ok   ...` and exit code 0. If any fail, the failure is a real regression — fix it in `store.js` before proceeding.

- [ ] **Step 3: Commit**

```bash
git add plugin/mcp-servers/wiki/verify/end-to-end.mjs
git commit -m "test(wiki-mcp): end-to-end verification covering all seven tools"
```

---

## Task 10: Verify the Claude Code integration lands cleanly

This task does not write code — it verifies that Claude Code picks up the new MCP server from `.mcp.json` after a fresh session start.

- [ ] **Step 1: Restart the Claude Code session**

Run `/exit` and restart Claude Code. The MCP tool cache is populated on session start — new tools in `.mcp.json` are not live until restart.

- [ ] **Step 2: Verify the wiki tools appear in the MCP tool list**

In the new session, check that the deferred tool list includes the seven wiki tools. They should appear as:

- `mcp__plugin_aela-voice_wiki__wiki_search`
- `mcp__plugin_aela-voice_wiki__wiki_read`
- `mcp__plugin_aela-voice_wiki__wiki_create`
- `mcp__plugin_aela-voice_wiki__wiki_delete`
- `mcp__plugin_aela-voice_wiki__wiki_list`
- `mcp__plugin_aela-voice_wiki__wiki_update_index`
- `mcp__plugin_aela-voice_wiki__wiki_log`

(Exact namespace may vary slightly based on Claude Code's MCP server ID conventions.)

- [ ] **Step 3: Smoke-test one tool live in the session**

Call `wiki_list` with `wiki: 'personal'`. Expected response: the empty-wiki placeholder (no personal wiki content exists yet — that comes when Phase 3 ships `/wiki-init`).

If the tool call succeeds and returns the placeholder, Phase 1 is complete and the MCP server is live.

- [ ] **Step 4: No commit**

This task does not produce code changes — it's a verification gate.

---

## Self-review

**1. Spec coverage.**

Phase 1 scope from the spec:
- [x] Create `plugin/mcp-servers/wiki/` with its own `package.json` reusing `yaml@^2.8.3` — Task 1
- [x] Port `store.js`, `mcp-tools.js` (tool definitions merged into server.js per plugin convention), `mcp-server.js` → `server.js` — Tasks 2–7
- [x] Personal and project wiki paths via `os.homedir()` and `process.cwd()` — Task 2
- [x] Dual-wiki `wiki_search` (no `wiki` param, results tagged) — Task 6
- [x] Description-weighted scoring (title ×15, description ×8, body ×1 cap 5) — Task 6
- [x] External mode for `wiki_read` — Task 3
- [x] Wire into `plugin/.mcp.json` — Task 8
- [x] Verify the seven-tool surface end-to-end — Task 9
- [x] Verify Claude Code picks up the server — Task 10

**Not in Phase 1 scope (deliberate, shipping in later phases):**
- `/wiki-update` skill — Phase 3
- Hooks (session-orient, wiki-maintenance) — Phase 2
- Init skills — Phase 3
- `wiki_update_index` frontmatter health check / lint — Phase 2 maintenance hook

**2. Placeholder scan.** No TBDs, no "implement error handling", no "similar to previous task" hand-waves. Every step has the actual code or command.

**3. Type consistency.** Function names match across tasks: `wikiCreate`, `wikiRead`, `wikiList`, `wikiLog`, `wikiSearch`, `wikiUpdateIndex`, `wikiDelete`. Parameter names (`wiki`, `page`, `title`, `category`, `description`, `body`, `logEntry`, `tags`) are consistent between store functions and server handlers. The `wikiSearch` signature change (no `wiki` param) is noted explicitly in Tasks 6 and 7.

**4. One architectural detail worth flagging for the implementer.** The `AELA_PLUGIN_HOME` env var introduced in Task 6 Step 3 is a testing hook, not a production feature. It lets verification scripts isolate the personal wiki under a temp dir without touching the real `~/.claude/aela-plugin/`. It is safe to leave in because if the env var is unset, `homedir()` is used — the production path is the default. Don't add a comment to the source noting it's "for testing" — the env var name itself is self-documenting, and the test code is the only place it gets set.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-1-wiki-mcp-server.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Good for a plan this size because each task is self-contained and the verification scripts make regression-catching automatic.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Better if you want to watch the work happen in real time and course-correct as each task lands.

**Which approach?**
