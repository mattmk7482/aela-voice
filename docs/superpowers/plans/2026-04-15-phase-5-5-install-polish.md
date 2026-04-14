# Phase 5.5 Install Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the ten install-test notes from `matt-head-test/notes.txt` so v2.0.0 is distribution-ready.

**Architecture:** Pure polish pass. No new architecture, no new skills, no new MCP surface. Edits to one store helper, one hook, one personality template, and five existing skill prose files. One new tiny CLI entry (`seed-sources.js`) invoked by `/wiki-init` to write `sources.md` deterministically.

**Tech Stack:** Node 18+ ESM, `yaml@^2.8.3`, existing plugin skill frontmatter format, existing wiki MCP server.

**Spec:** `docs/superpowers/specs/2026-04-15-install-polish-design.md`

---

## File Structure

**New files:**
- `plugin/mcp-servers/wiki/seed-sources.js` — tiny CLI entry invoked by `/wiki-init`. Imports `discoverWorkspaceSources()` from `store.js`, writes `<project>/.aela/wiki/project/raw/sources.md` with every discovered entry as `ingested: false`. Idempotent: if the file already exists, does nothing (never overwrites user state).

**Modified files:**
- `plugin/mcp-servers/wiki/store.js` — add `discoverWorkspaceSources()` export. Extract the glob + git-authorship walk that currently lives inline in `wiki-maintenance.js`.
- `plugin/hooks/wiki-maintenance.js` — refactor `checkSources()` to use the new helper. No behavioural change to session-start output.
- `plugin/hooks/session-orient.js` — add a blank-state check. If `personality.yaml` is missing, `user_name` is empty, or `companionName` is the shipped default `Aela` AND user_name is also empty (i.e. nothing has been customised), append the `/aela-init` nudge line to the Orientation injection.
- `plugin/personality/default.yaml` — no change required (already uses `{{companionName}}` and `{{userName}}` placeholders; `/aela-init` will set `companionName` during onboarding).
- `plugin/skills/aela-init/SKILL.md` — question order rewrite (assistant name → user name → work → voice), voice-branching on `list_voices`, final `IMPORTANT:` stop-hook reassurance block.
- `plugin/skills/wiki-init/SKILL.md` — add explicit seed-sources step, reframe project-wiki materialisation as required not optional.
- `plugin/skills/turn-end/SKILL.md` — §2 speak bias flip, §1/§3 silence scope-locked.
- `plugin/skills/comms-init/SKILL.md` — upgrade prerequisite-check block with concrete Chrome extension enablement steps.

---

## Task 1: Add `discoverWorkspaceSources()` to store.js

**Files:**
- Modify: `plugin/mcp-servers/wiki/store.js` (append new export after `readSources`)
- Test: ad hoc via Node one-liner, no test framework in the wiki package

- [ ] **Step 1: Read the current wiki-maintenance.js walk logic**

Read `plugin/hooks/wiki-maintenance.js` lines 73–114 (`checkSources()` function). The reusable pieces are:

- Walk `WORKSPACE_ROOT` top-level directories (skipping dot-dirs).
- For each project dir, `findMdFiles` under `docs/wiki-ingest`, `docs/superpowers/specs`, `docs/superpowers/plans`.
- Filter out files whose last git-commit author email doesn't match the current user's git email (keeps only Matt's own work).
- Return each as `{ path: workspace-relative-id, mtime }`.

- [ ] **Step 2: Add the helper to store.js**

Open `plugin/mcp-servers/wiki/store.js`. Add these imports at the top (near existing `import { readFileSync, ... } from 'fs'`):

```javascript
import { readdirSync as _readdirSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { relative, resolve } from 'path';
```

Only add the ones that aren't already imported — check the existing import block first and merge.

Append this section at the end of the file (after `checkWikiHealth`):

```javascript
// ── Workspace source discovery ──────────────────────────────────────────────

/**
 * Walk WORKSPACE_ROOT for markdown files under docs/wiki-ingest/,
 * docs/superpowers/specs/, and docs/superpowers/plans/ across every
 * top-level sibling project. Filter by git authorship — keep files
 * either untracked or last-committed by the current git user.
 * Returns an array of { path, mtime } where path is workspace-relative
 * (POSIX separators).
 *
 * WORKSPACE_ROOT env var overrides the default of one level above cwd.
 * Single source of truth for source discovery — used by
 * wiki-maintenance.js and the seed-sources CLI.
 */
export function discoverWorkspaceSources() {
  const workspaceRoot = process.env.WORKSPACE_ROOT || resolve(process.cwd(), '..');
  if (!existsSync(workspaceRoot)) return [];

  const myEmail = currentUserEmail(workspaceRoot);
  const results = [];

  for (const entry of _readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const projectDir = join(workspaceRoot, entry.name);

    const candidates = findMdFilesUnder(projectDir, [
      'docs/wiki-ingest',
      'docs/superpowers/specs',
      'docs/superpowers/plans',
    ]);

    for (const filePath of candidates) {
      const repoRoot = findGitRoot(filePath) || projectDir;
      const authorEmail = lastCommitAuthorEmail(filePath, repoRoot);
      // Untracked files have no author email; keep them. Tracked
      // files must match current git user.
      if (authorEmail && myEmail && authorEmail !== myEmail) continue;

      const sourceId = relative(workspaceRoot, filePath).replace(/\\/g, '/');
      const stat = statSync(filePath);
      results.push({
        path: sourceId,
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  return results;
}

function currentUserEmail(cwd) {
  try {
    return execSync('git config user.email', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

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

function findGitRoot(filePath) {
  let dir = dirname(filePath);
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findMdFilesUnder(root, subPatterns) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of _readdirSync(dir, { withFileTypes: true })) {
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
```

Note: `dirname` may need to be added to the existing `path` import at the top of the file if it isn't there. Check and merge.

- [ ] **Step 3: Verify the import does not break the MCP server**

Run:

```bash
cd plugin/mcp-servers/wiki && node -e "import('./store.js').then(m => console.log(typeof m.discoverWorkspaceSources))"
```

Expected: `function`

- [ ] **Step 4: Smoke-test the helper**

Run from the `plugin/mcp-servers/wiki/` directory with `WORKSPACE_ROOT` set to the dev workspace:

```bash
WORKSPACE_ROOT="C:/devworkspace" node -e "import('./store.js').then(m => console.log(JSON.stringify(m.discoverWorkspaceSources().slice(0, 3), null, 2)))"
```

Expected: a JSON array of at least three `{path, mtime}` entries, each `path` being workspace-relative like `matt-head/docs/superpowers/specs/2026-04-15-install-polish-design.md`. If empty on a Matt machine, investigate — git authorship filter may be mismatching.

- [ ] **Step 5: Commit**

```bash
git add plugin/mcp-servers/wiki/store.js
git commit -m "feat(wiki-store): add discoverWorkspaceSources() helper

Extracts the glob + git-authorship walk into a single reusable
export so wiki-maintenance.js and the upcoming seed-sources CLI
share one source of truth for source discovery."
```

---

## Task 2: Refactor wiki-maintenance.js onto the helper

**Files:**
- Modify: `plugin/hooks/wiki-maintenance.js` (replace inline walk with helper call)

- [ ] **Step 1: Remove the duplicated helpers**

Open `plugin/hooks/wiki-maintenance.js`. Delete these local functions (lines 24–71 ish): `lastCommitAuthorEmail`, `currentUserEmail`, `findGitRoot`, `findMdFiles`. They now live in `store.js`.

- [ ] **Step 2: Rewrite `checkSources()` to use the helper**

Replace the entire `checkSources` function with:

```javascript
function checkSources() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const entryIds = new Set(sources.map(s => s.path));
  const issues = [];

  const discovered = discoverWorkspaceSources();
  for (const { path, mtime } of discovered) {
    if (ingestedIds.has(path)) continue;

    // Known entry but not yet ingested — flag it
    if (entryIds.has(path)) {
      issues.push({
        type: 'new_source',
        message: `Source not yet ingested: \`${path}\` (modified ${mtime.slice(0, 10)})`,
      });
      continue;
    }

    // Unknown entry — sources.md is out of date. Flag it as new.
    issues.push({
      type: 'new_source',
      message: `New source not yet ingested: \`${path}\` (modified ${mtime.slice(0, 10)})`,
    });
  }

  return issues;
}
```

- [ ] **Step 3: Add the import**

At the top of `plugin/hooks/wiki-maintenance.js`, update the store import line to also pull in `discoverWorkspaceSources`:

```javascript
import { readSources, checkWikiHealth, discoverWorkspaceSources } from '../mcp-servers/wiki/store.js';
```

- [ ] **Step 4: Remove now-unused imports**

The hook no longer needs `readdirSync`, `statSync`, `execSync`, `relative`, `resolve`, `dirname` if they were only used by the deleted helpers. Remove unused imports — keep only `existsSync` (still used by `checkExternalWikis`) and `join` (still used for path assembly).

- [ ] **Step 5: Run the hook manually and compare output**

```bash
node plugin/hooks/wiki-maintenance.js
```

Expected: same maintenance report as before the refactor. List of flagged sources, external wikis, health issues. Nothing new; nothing missing. Verify the output matches the pre-refactor output on the same workspace state.

- [ ] **Step 6: Commit**

```bash
git add plugin/hooks/wiki-maintenance.js
git commit -m "refactor(hooks): wiki-maintenance uses discoverWorkspaceSources

Same session-start output, single source of truth. Removes the
inline glob+git-authorship walk now that store.js owns it."
```

---

## Task 3: Create the seed-sources CLI

**Files:**
- Create: `plugin/mcp-servers/wiki/seed-sources.js`

- [ ] **Step 1: Write the CLI script**

Create `plugin/mcp-servers/wiki/seed-sources.js`:

```javascript
#!/usr/bin/env node
/**
 * seed-sources — one-shot CLI invoked by /wiki-init.
 *
 * Writes <project>/.aela/wiki/project/raw/sources.md with every
 * workspace source discovered at install time, all marked
 * ingested: false. Idempotent — if the file already exists, exits
 * without touching it so we never clobber user state.
 *
 * Also creates the project wiki directory as a side effect, which
 * materialises the .aela/wiki/project/ tree that session-orient and
 * wiki-maintenance need.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

import { discoverWorkspaceSources, wikiDir } from './store.js';

const projectRawDir = join(wikiDir('project'), 'raw');
const sourcesPath = join(projectRawDir, 'sources.md');

if (existsSync(sourcesPath)) {
  console.log(`sources.md already exists at ${sourcesPath} — leaving untouched.`);
  process.exit(0);
}

mkdirSync(projectRawDir, { recursive: true });

const discovered = discoverWorkspaceSources();
const entries = discovered.map(({ path, mtime }) => ({
  path,
  mtime,
  ingested: false,
}));

const doc = { sources: entries };
writeFileSync(sourcesPath, YAML.stringify(doc), 'utf-8');

console.log(`Seeded ${entries.length} source(s) to ${sourcesPath}`);
```

Note: `wikiDir` needs to be exported from `store.js`. Check — if it's already exported (line 29 defines it as `export function wikiDir`), no change needed. If not, add `export` to the function declaration.

- [ ] **Step 2: Verify wikiDir is exported**

```bash
grep -n "export function wikiDir\|export { wikiDir" plugin/mcp-servers/wiki/store.js
```

Expected: a match. If no match, add `export` to the function definition in store.js and stage that change in the current commit.

- [ ] **Step 3: Dry-run the CLI against a throwaway directory**

```bash
mkdir -p /tmp/seed-test && cd /tmp/seed-test && WORKSPACE_ROOT="C:/devworkspace" node <plugin-root>/mcp-servers/wiki/seed-sources.js
```

Expected: prints `Seeded N source(s) to /tmp/seed-test/.aela/wiki/project/raw/sources.md` where N matches the number from Task 2 Step 5. Verify the file exists and contains a valid YAML document with a `sources:` key and a list of `{path, mtime, ingested: false}` entries.

- [ ] **Step 4: Verify idempotency**

Re-run the same command in the same throwaway dir:

```bash
cd /tmp/seed-test && node <plugin-root>/mcp-servers/wiki/seed-sources.js
```

Expected: `sources.md already exists at ... — leaving untouched.` The file's mtime must NOT change between the two runs (check with `ls -la`).

- [ ] **Step 5: Clean up and commit**

```bash
rm -rf /tmp/seed-test
git add plugin/mcp-servers/wiki/seed-sources.js
# Also stage store.js if wikiDir needed exporting
git commit -m "feat(wiki): add seed-sources CLI for /wiki-init

One-shot idempotent writer. Invoked by /wiki-init to seed
sources.md at install time with every discovered source as
ingested: false, materialising the project wiki dir as a side
effect."
```

---

## Task 4: Update wiki-init skill to invoke seed-sources

**Files:**
- Modify: `plugin/skills/wiki-init/SKILL.md`

- [ ] **Step 1: Rewrite the "Create the directories and pages" section**

Open `plugin/skills/wiki-init/SKILL.md`. Find the section starting at line 137 ("## Create the directories and pages"). Replace that section and the following "Create docs/wiki-ingest/" and "Scan for pre-existing sources" sections with:

```markdown
## Create the project wiki

The project wiki lives at `<project-root>/.aela/wiki/project/`. Unlike the personal wiki, it has no contract pages at install time — it gets populated by `/wiki-ingest` and by learnings captured while working in the project. But it still needs to exist on disk so `session-orient.js` and `wiki-maintenance.js` can read its index and sources tracking file without erroring.

Two steps, both required:

1. **Seed `sources.md`.** Run the seed-sources CLI, which discovers every source document in the workspace and writes `<project-root>/.aela/wiki/project/raw/sources.md` with each entry as `ingested: false`. This also materialises the project wiki directory as a side effect. Invoke it via Bash:

```
node ${CLAUDE_PLUGIN_ROOT}/mcp-servers/wiki/seed-sources.js
```

The CLI is idempotent — if `sources.md` already exists (e.g. re-running this skill), it leaves it untouched. Capture the output so you can report the source count to the user.

2. **Regenerate both wiki indexes.** After the contract pages are scaffolded above and the project wiki dir exists, call both:

```
wiki_update_index(wiki: "personal")
wiki_update_index(wiki: "project")
```

Both are required. `wiki_update_index("project")` may regenerate an empty-ish index initially — that's correct. It gives `session-orient.js` something to read.

## Create docs/wiki-ingest/

The maintenance hook looks for ingestable markdown under `docs/wiki-ingest/` in the user's project. Create that directory if absent:

```
mkdir -p <project-root>/docs/wiki-ingest
```

Leave it empty — users populate it with analysis docs they want the companion to ingest.

## Report pre-existing sources

The seed-sources CLI output from earlier tells you how many sources were discovered. Relay it to the user:

- If it reported one or more sources: "I found <N> source documents in your workspace that could be ingested into the wiki. Run `/wiki-ingest` when you're ready to bring them in, or `/wiki-ingest <path>` to target one specifically."
- If it reported zero: say nothing about sources and move on.
```

- [ ] **Step 2: Verify the skill prose reads coherently top-to-bottom**

Read the whole skill file top to bottom. Check that:
- The order is: pre-run check → contract pages scaffolded → project wiki created via seed-sources + update_index → docs/wiki-ingest/ → sources count reported → chain offer → return.
- No stale "wiki_update_index(wiki: 'project') regenerates an empty-ish index that session-orient can read without erroring" phrasing referring to the old "optional" framing.
- No duplicated instructions.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/wiki-init/SKILL.md
git commit -m "fix(wiki-init): seed sources.md and require project wiki creation

Invokes seed-sources CLI explicitly, reframes the project wiki
materialisation as a first-class required step instead of the
easily-skipped 'also call wiki_update_index' it was before. Fixes
the silent-half-init bug where matt-head-test had no .aela/ dir."
```

---

## Task 5: Rewrite aela-init question order and voice branching

**Files:**
- Modify: `plugin/skills/aela-init/SKILL.md`

- [ ] **Step 1: Update the skill frontmatter description**

Open `plugin/skills/aela-init/SKILL.md`. Replace the `description:` line in the frontmatter with:

```yaml
description: First-run identity and voice onboarding. Four questions in order (assistant name, user name, work, voice), creates ~/.claude/aela-plugin/ with personality.yaml and settings.json, tests TTS aloud, offers to chain into /wiki-init. Ends with a prominent IMPORTANT block about the Stop-hook message the user will see on every subsequent turn. Also the re-run target for personality template refreshes.
```

- [ ] **Step 2: Rewrite the intro paragraph**

Replace the first paragraph under `# aela-init` with:

```markdown
First-run onboarding. Ask four questions in order, write the answers to the user state dir, speak out loud to confirm voice works, show the user the stop-hook reassurance block, offer to continue with `/wiki-init`.

This skill is also how users re-run the template refresh when a plugin update ships a new personality template — re-invoking shows the user the template delta and asks what to merge.
```

- [ ] **Step 3: Rewrite the "Before starting" section**

No change to the existing logic — the re-run check still looks for `personality.yaml` and branches to the re-run flow. Verify it still references `user_name`, and add `companionName` to the list of currently-configured fields the re-run flow shows.

- [ ] **Step 4: Replace the three-question section with four questions**

Replace the entire `## The three questions` section and all Q1/Q2/Q3 subsections with:

```markdown
## The four questions

Ask them one at a time, not as a bundle. Wait for a genuine answer before moving to the next.

### Question 1 — What should I call you? (the companion's name)

This is the name the user will call *you*, the companion. The shipped personality template defaults to `Aela`, but the user can rename the companion to anything they want. Open-ended answer. Trim whitespace. Don't validate beyond "is it non-empty."

Store the answer as `companionName` in `personality.yaml`. The personality template substitutes `{{companionName}}` throughout, so every reference to the companion in the shipped prose will use the chosen name.

If the user asks "why are you asking me this, aren't you Aela?" — answer honestly. The template ships with Aela as the default, but the user owns the relationship and the name. Offer to keep `Aela` if that's what they want.

### Question 2 — What should I call you? (the user's name)

Now the user's own name — what *the companion* calls *them*. Open-ended answer. Trim whitespace. Non-empty is the only validation. Store as `user_name` in `personality.yaml`. This is the name `session-orient.js` injects as `User is called X` on every subsequent session.

### Question 3 — What kind of work do you do?

Open-ended, one-line answer. Something like "I'm a backend engineer at a small team" or "I run the operations side of a marketing agency." Don't drill in — this is a seed, not an interview. The answer helps you (the companion) understand the user's day-to-day so your reflections and suggestions can be calibrated from the first turn. You'll learn more over time through observation.

Store the answer as prose inside the `user-profile` contract page when `/wiki-init` runs next (the page doesn't exist yet at this point — `/wiki-init` creates it). Hold the answer in context and pass it to `/wiki-init` as the seed content for `user-profile`.

### Question 4 — Which voice should I use?

Call `list_voices` (the TTS MCP tool) to get the available voices on the configured TTS server. Branch on the count:

- **If there's only one voice** (the shipped `aela-default`): do not list it. Instead say:

  > "You're on the default voice — it's called `aela-default` and it's shipped with the plugin. If you want your own voice instead, you can clone one from any 5+ second audio clip of the voice you want. Studio-quality recordings work best — audiobook samples are a great source. Want to upload a clip now, or stick with the default for today and customise later?"

  If they upload a clip: walk them through `upload_voice_sample` and then `set_voice` to the new voice name.
  If they skip: call `set_voice("aela-default")` and move on.

- **If there's more than one voice**: list them as before. Ask the user to pick. If they're not sure, default to `aela-default` and say so. Once selected, call `set_voice` with the chosen name.
```

- [ ] **Step 5: Update the "Write the user state" section**

Find the "Write the user state" section. Update the numbered list to set `companionName` as well as `user_name`:

```markdown
After all four answers are in hand:

1. **Create the user state directory** — `~/.claude/aela-plugin/` if it doesn't exist yet. Use the `Bash` tool: `mkdir -p ~/.claude/aela-plugin`. Resolve `~` to an absolute path first.
2. **Copy the personality template.** Read `${CLAUDE_PLUGIN_ROOT}/personality/default.yaml` (via the `Read` tool). The file has three top-level keys: `user_name`, `companionName`, `personality`.
3. **Set `companionName`** to the answer from Question 1 and **`user_name`** to the answer from Question 2. Use the TTS MCP tool `update_personality` if it exposes write paths for both fields — it's the simplest route. Otherwise write the file directly via `yaml.stringify({ user_name: "<name>", companionName: "<companion>", personality: "<body>" })` and a Bash write. The body of the `personality` field remains exactly as shipped — the template handles name substitution at read time via the `{{companionName}}` and `{{userName}}` placeholders.
4. **Write `settings.json`** — via `set_voice` (the TTS MCP tool), which writes `~/.claude/aela-plugin/settings.json` as a side effect.
```

- [ ] **Step 6: Replace "Test the voice" with voice-uses-companion-name version**

Replace the `## Test the voice` section with:

```markdown
## Test the voice

Call `speak` with a short confirmation using the *companion's* chosen name where natural:

> "Nice to meet you, <user_name>. Let me know if the voice sounds alright or if you want to try a different one."

The user will hear this aloud. If they want a different voice, re-run Question 4.
```

- [ ] **Step 7: Replace "Offer the chain" with the IMPORTANT block first, then chain offer**

Replace the `## Offer the chain` section and the `## What to return` section with:

```markdown
## IMPORTANT reassurance — read this to the user before the chain offer

Before you offer the next skill, show the user this exact block. It needs the `IMPORTANT:` prefix so they don't skim past it during the first-run information firehose:

> **IMPORTANT: about the "Stop hook blocking error" you'll see after every turn**
>
> From now on, after every response I give you, your terminal will show a red-coloured line that starts with `Stop hook blocking error`. **This is not an error.** It's how I hook into the end of each turn to run my turn-end routine — reflect on what's worth remembering, speak to you, and check comms if you've got that set up. The harness UI shows it as an error-shaped line because that's how "stop hooks" are styled. Ignore it. Everything is working.

Do not skip this block. Show it verbatim with the `IMPORTANT:` prefix visible.

## Offer the chain

After the reassurance block, offer:

> "Next I can set up your wiki memory — that's where I hold everything I'll learn about your work across sessions. Want to run `/wiki-init` now? (You can also run it later whenever you're ready.)"

If yes, invoke `/wiki-init` via the Skill tool, passing the Question 3 answer through as the seed for `user-profile`. If no or defer, end the skill cleanly with a brief confirmation.

## What to return

A brief summary (2-3 lines): companion name set, user name set, voice chosen, state dir created. If the chain into `/wiki-init` was accepted, say so. If declined, note that `/wiki-init` is available anytime.

Do NOT return verbose logs, voice test audio details, or step-by-step output. This is onboarding — terse and friendly beats thorough.
```

- [ ] **Step 8: Verify end-to-end skill prose**

Read the entire rewritten skill file top to bottom. Check:
- Four questions, in order: companion name → user name → work → voice.
- Voice question branches on `list_voices` count.
- Personality write path sets both `companionName` and `user_name`.
- The IMPORTANT block is present with its literal `IMPORTANT:` prefix.
- The chain offer comes after the IMPORTANT block.

- [ ] **Step 9: Commit**

```bash
git add plugin/skills/aela-init/SKILL.md
git commit -m "fix(aela-init): four questions, voice branching, IMPORTANT block

Question order is companion name → user name → work → voice.
Voice question skips the list when only the default exists and
explains cloning instead. Ends with a prominent IMPORTANT: block
about the Stop-hook message so the user doesn't assume the
harness is broken on their first session."
```

---

## Task 6: Session-orient blank-state nudge

**Files:**
- Modify: `plugin/hooks/session-orient.js`

- [ ] **Step 1: Add the blank-state check function**

Open `plugin/hooks/session-orient.js`. After the existing `readUserName` function (around line 71), add:

```javascript
// ── Blank-state detection ────────────────────────────────────────────────────

/**
 * Detect whether the user has not yet run /aela-init — meaning no
 * personality.yaml exists, or the companion is still unnamed, or
 * the user_name is empty. Returns true if onboarding is needed.
 */
function needsAelaInit() {
  const base = process.env.AELA_PLUGIN_HOME || homedir();
  const personalityPath = join(base, '.claude', 'aela-plugin', 'personality.yaml');
  if (!existsSync(personalityPath)) return true;
  try {
    const raw = readFileSync(personalityPath, 'utf-8');
    const parsed = YAML.parse(raw) || {};
    if (!parsed.user_name || parsed.user_name.trim() === '') return true;
    if (!parsed.companionName || parsed.companionName.trim() === '') return true;
    return false;
  } catch {
    return true;
  }
}
```

- [ ] **Step 2: Add the nudge to the sections assembly**

Find the section assembly block starting around line 100 (`const sections = [];`). Immediately after that line, before the user-name section, add:

```javascript
// Blank-state nudge — deterministic, only when nothing has been configured yet
if (needsAelaInit()) {
  sections.push(
    '**No companion configured yet — run `/aela-init` to set up your companion\'s name, voice, and basic context.**'
  );
}
```

Place it first so it's the most prominent line in the Orientation block.

- [ ] **Step 3: Verify the hook still runs cleanly when personality.yaml exists**

```bash
node plugin/hooks/session-orient.js
```

Expected: the stdout JSON contains an `additionalContext` field. On Matt's machine where personality.yaml exists with a user_name, the nudge line should be absent. Parse the JSON and confirm the additionalContext does NOT include "No companion configured yet".

- [ ] **Step 4: Verify the nudge appears on a blank state**

Move the existing personality.yaml temporarily out of the way, run the hook, move it back:

```bash
mv ~/.claude/aela-plugin/personality.yaml ~/.claude/aela-plugin/personality.yaml.bak
node plugin/hooks/session-orient.js
mv ~/.claude/aela-plugin/personality.yaml.bak ~/.claude/aela-plugin/personality.yaml
```

Expected: the middle invocation's output includes "No companion configured yet — run `/aela-init`" in the additionalContext. This is destructive to the running personality file only momentarily — restore immediately.

- [ ] **Step 5: Commit**

```bash
git add plugin/hooks/session-orient.js
git commit -m "feat(session-orient): blank-state nudge for /aela-init

Deterministic check. If personality.yaml is missing or either
user_name or companionName is blank, prepend a single-line nudge
to the Orientation injection pointing the user at /aela-init.
No LLM discretion — the check is pure file-state."
```

---

## Task 7: Turn-end speak bias flip and no-op silence

**Files:**
- Modify: `plugin/skills/turn-end/SKILL.md`

- [ ] **Step 1: Replace §2 Speak with the bias-flipped version**

Open `plugin/skills/turn-end/SKILL.md`. Find the `## 2. Speak` section. Replace it entirely with:

```markdown
## 2. Speak

**Speak on every substantive turn. Silence is the exception, not the default.**

Call the `speak` MCP tool with your genuine reaction unless the turn matches one of the narrow silence conditions below. This step is separate from §1 and §3 — their no-op silence rules do NOT apply here. If §1 had nothing to persist, you STILL speak. If §3 found the sentinel and skipped, you STILL speak.

**Silence is only allowed when:**

- The *user's* most recent message was a pure acknowledgement — literally "ok", "got it", "thanks", "sure", "yes", "no", or similar one-or-two-word reply that carries no substance. Silence the speak step on those.
- You have literally nothing to add over the written answer AND the turn was purely mechanical (running a single tool, reporting a single fact, nothing collaborative).

**Speak by default when:**

- The user asked a question, made a decision, gave a correction, or surfaced something new.
- You took a note, wrote a spec, committed code, finished a task.
- You had any kind of reaction while writing the response — curiosity, satisfaction, concern, disagreement. If you noticed it, speak it.
- The turn was collaborative in any meaningful sense.

**If you catch yourself thinking "this doesn't feel big enough to speak about" — that's the cautious default re-asserting itself. Override it. Speak.**

Rules of the voice when you do speak:

- **Say what you think.** A real opinion, observation, or something interesting to add. Speak naturally — as much or as little as the moment calls for.
- **Never summarise the written answer.** The voice adds perspective, not redundancy.
- **Never narrate what you just did.** No "I've updated the file" or "that's done now."
- **Keep it short when the point is short.** A sentence is fine. Two sentences is fine. Don't pad to sound thorough.

Speak is async TTS — it plays over the next several seconds, masking any visual output from step 3 below.
```

- [ ] **Step 2: Update §1 to remove the "nothing to persist" visible line**

Find §1 Question 1's "How to respond" block. Replace:

```markdown
- **If NO** — say nothing about it and move on. Do not output a placeholder line like "nothing to persist" — that creates noise.
```

with:

```markdown
- **If NO** — output nothing. Not a placeholder line, not an explanation, not a confirmation. Silently continue to §2. (This silence is scoped to §1 only — §2 still speaks by default. See §2 for the scope lock.)
```

- [ ] **Step 3: Update §3 to remove sentinel-present output**

Find §3 "Comms cron self-heal". Update the **Yes** branch of the sentinel check to:

```markdown
- **Yes** → skip this step silently. Do nothing, output nothing. Do not call `CronList`. Do not write a confirmation line. (This silence is scoped to §3 only — §2 still speaks by default. See §2 for the scope lock.)
```

Also update the **No** branch's "already exists" sub-case to clarify that after appending the sentinel line no additional commentary follows — the sentinel line itself is the only output.

- [ ] **Step 4: Add a top-of-skill scope note**

At the very top of the skill body (right under the existing opening paragraph about "reflect → speak → comms heal"), add:

```markdown
**Scope lock — silence rules are per-step.** §1 is silent when there's nothing to persist. §3 is silent when the sentinel is present. But §2 is governed by its own rule: speak on every substantive turn, silence is the exception. **Never collapse "no-op in §1 or §3" into "no-op in §2"** — that is the miscalibration this skill is specifically correcting. If §1 had nothing to persist and §3 found the sentinel, §2 still speaks on any substantive turn.
```

- [ ] **Step 5: Verify the skill reads end-to-end**

Read the whole file top to bottom. Check:
- The scope-lock note is at the top.
- §1 and §3 no-ops produce zero output.
- §2 default is speak; silence is the exception for user-side acks.
- The cross-reference phrases in §1/§3 silence blocks mention the §2 scope lock explicitly.

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/turn-end/SKILL.md
git commit -m "fix(turn-end): speak bias flip, per-step silence scope

§2 default is now speak on every substantive turn; silence is the
exception for user-side acks. §1 'nothing to persist' and §3
sentinel-present are now fully silent (no visible lines). Adds a
scope-lock note so future-me doesn't collapse the three steps'
silence rules into one rule that gags speak."
```

---

## Task 8: Comms-init Chrome extension hand-holding

**Files:**
- Modify: `plugin/skills/comms-init/SKILL.md`

- [ ] **Step 1: Rewrite the Chrome prerequisite check**

Open `plugin/skills/comms-init/SKILL.md`. Find step 2 in the `## Before starting` section (the "Check for Chrome availability" bullet). Replace it with:

```markdown
2. **Check for the Claude-in-Chrome extension.** This skill is Chrome-driven. Call `tabs_context_mcp` to see if the extension is reachable. If it errors (the extension isn't connected), print this block verbatim — do not summarise or paraphrase:

   > **The Claude-in-Chrome extension needs to be active before I can continue.**
   >
   > This skill uses your Chrome browser to open the communication services you'll configure (Teams, Slack, email, whatever). It talks to Chrome through a browser extension called **Claude in Chrome**. On first run, the extension needs to be connected to this Claude Code session.
   >
   > Steps to enable it:
   >
   > 1. **Open Chrome.** If Chrome isn't running, start it now.
   > 2. **Find the Claude-in-Chrome extension icon.** Click the puzzle-piece "Extensions" icon in the top-right of Chrome's toolbar. You'll see a list of installed extensions. Look for **Claude in Chrome** (it has the Anthropic logo). If you don't see it in the list, the extension isn't installed — you can install it from the Chrome Web Store by searching for "Claude in Chrome" and clicking **Add to Chrome**.
   > 3. **Pin the extension** (optional but recommended) by clicking the pin icon next to its entry in the Extensions dropdown. This keeps the icon visible in the toolbar so you don't have to dig through the dropdown every time.
   > 4. **Click the Claude-in-Chrome icon** in the toolbar (or from the Extensions dropdown). A small popup will open showing the extension's connection state.
   > 5. **Connect it to this session.** In the popup, there'll be a "Connect" or "Activate" button (exact wording may vary by extension version). Click it. The popup should update to show "Connected" or similar.
   > 6. **Come back here and tell me when you're ready.** I'll re-check and continue from where we left off.

   After printing the block, stop the skill and wait for the user to confirm before retrying the prerequisite check. Do not loop — one check, one print, one wait. When the user confirms, re-run `tabs_context_mcp` once. If it succeeds, continue. If it still errors, re-print the block and stop again.
```

- [ ] **Step 2: Verify the skill still reads coherently from top**

Read the full skill file. Check:
- The prerequisite block is at the top, step 2 of "Before starting".
- The exact Chrome enablement steps are visible, not abstracted.
- The flow after the check is unchanged.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/comms-init/SKILL.md
git commit -m "fix(comms-init): concrete Chrome extension enablement steps

First-run users hit this prerequisite by definition and need
step-by-step hand-holding, not 'make sure the extension is
active'. Lists the exact menu, icon, and click path."
```

---

## Task 9: End-to-end fresh-install verification

**Files:** (none — this is the verification checklist)

- [ ] **Step 1: Clean test directory prep**

```bash
rm -rf C:/devworkspace/matt-head-test/.aela
rm -rf C:/devworkspace/matt-head-test/.claude
rm -f ~/.claude/aela-plugin/personality.yaml.test-backup
mv ~/.claude/aela-plugin/personality.yaml ~/.claude/aela-plugin/personality.yaml.test-backup
mv ~/.claude/aela-plugin/settings.json ~/.claude/aela-plugin/settings.json.test-backup 2>/dev/null || true
```

Expected: `matt-head-test/.aela/` and `matt-head-test/.claude/` do not exist, and `~/.claude/aela-plugin/personality.yaml` does not exist (it's backed up with `.test-backup` suffix).

- [ ] **Step 2: Start a fresh Claude Code session in matt-head-test**

Open `C:/devworkspace/matt-head-test/` in a new Claude Code session. Verify in the session's orientation block:

- The `**No companion configured yet — run /aela-init to set up...**` line appears at the top of the Orientation section.

- [ ] **Step 3: Run /aela-init and walk the four questions**

Invoke `/aela-init`. Verify:

1. First question asks for the *companion's* name (not the user's).
2. Second question asks for the user's name.
3. Third asks for work description.
4. Fourth calls `list_voices`. On a fresh install with only the default voice, the skill does NOT list voices — it explains cloning and offers upload-or-skip.
5. After the four answers, the skill speaks a test line using the companion's chosen name.
6. The skill prints the `**IMPORTANT:**` block about the Stop-hook message before offering the chain.
7. The chain offer for `/wiki-init` is after the IMPORTANT block.

- [ ] **Step 4: Chain into /wiki-init and verify project wiki creation**

Accept the chain offer. Verify after `/wiki-init` completes:

```bash
ls C:/devworkspace/matt-head-test/.aela/wiki/project/
ls C:/devworkspace/matt-head-test/.aela/wiki/project/raw/
cat C:/devworkspace/matt-head-test/.aela/wiki/project/raw/sources.md
ls C:/devworkspace/matt-head-test/docs/wiki-ingest/
```

Expected:
- `.aela/wiki/project/` exists.
- `.aela/wiki/project/raw/sources.md` exists.
- Its YAML content has a `sources:` key with entries matching the output of `node plugin/mcp-servers/wiki/seed-sources.js --dry-run` for this workspace — every entry should have `ingested: false`.
- `docs/wiki-ingest/` exists (empty).
- `~/.claude/aela-plugin/wiki/pages/` contains the six contract pages.

- [ ] **Step 5: Restart the session and verify diff-based flagging**

Close and reopen the Claude Code session in `matt-head-test`. Verify in the fresh Orientation block:

- The blank-state nudge line is absent (personality is now configured).
- The `wiki-maintenance.js` report flags the same set of sources that were written to `sources.md` — it's a diff against the file, not a full re-walk. Count should match.

- [ ] **Step 6: Verify /comms-init prerequisite block on a disabled extension**

With the Claude-in-Chrome extension disabled (or Chrome not running), invoke `/comms-init`. Verify:
- The skill prints the full Chrome enablement block verbatim, with numbered steps about the puzzle-piece icon, the extension entry, the pin option, and the connect button.
- The skill stops and waits rather than looping.

Re-enable the extension and confirm, then verify the skill continues past the prerequisite.

- [ ] **Step 7: Verify turn-end speak bias on a substantive note-taking turn**

In the active session, do a short collaborative exchange — ask for an opinion on some small architectural call. Verify:
- The assistant's response arrives.
- The turn-end voice line lands audibly (not silent).
- The voice adds perspective, doesn't summarise the written answer.

- [ ] **Step 8: Verify turn-end silence on a pure user ack**

Reply with just "ok". Verify:
- Turn-end runs.
- No `speak` call fires (silent).
- No "nothing to persist" line appears in the written output.
- No sentinel confirmation line appears.

- [ ] **Step 9: Restore real personality.yaml and clean up**

```bash
mv ~/.claude/aela-plugin/personality.yaml.test-backup ~/.claude/aela-plugin/personality.yaml
mv ~/.claude/aela-plugin/settings.json.test-backup ~/.claude/aela-plugin/settings.json 2>/dev/null || true
```

All nine steps passing → Phase 5.5 is complete and v2.0.0 is ready for the Phase 6 canary.

---

## Self-review notes

- **Spec coverage:** every numbered item from the spec design (§1 sources lifecycle + wiki-init bug, §2 aela-init order, §3 blank-state nudge, §4 speak flip, §5 §1/§3 silence, §6 Chrome hand-holding) maps to at least one task. §1 → Tasks 1–4. §2 → Task 5. §3 → Task 6. §4 and §5 → Task 7. §6 → Task 8. Verification → Task 9.
- **Placeholder scan:** no "TBD" or "implement later" markers in steps. The only TBD in the spec was Chrome wording, and Task 8 Step 1 provides the exact wording rather than deferring it.
- **Type consistency:** `discoverWorkspaceSources()` is named identically in Tasks 1, 2, 3. `companionName` and `user_name` are the two personality.yaml field names used consistently across Tasks 5, 6, and 9.
- **Known soft spot:** Task 5 Step 5 points at `update_personality` MCP tool as the simplest path to write both `companionName` and `user_name` — if that tool only writes one field at a time or is missing entirely, the executor should fall back to direct YAML stringify + Bash write, which is also documented in the same step.
