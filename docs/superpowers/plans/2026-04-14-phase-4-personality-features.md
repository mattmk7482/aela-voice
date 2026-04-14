# Phase 4 Implementation Plan — Personality Addition + PLUGIN-FEATURES.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two content artifacts the plugin has been planning for: (1) the `how_i_remember` section in the personality template, which shapes disposition around wiki-first behaviour, and (2) `PLUGIN-FEATURES.md`, the hard-instruction layer that documents the tool surface, contract pages, and turn-end criteria. Session-orient.js (from Phase 2) already knows how to inject both — this phase just creates the files.

**Architecture:** Two content files + one automated verification. No code changes to hooks, no skill changes, no new MCP tools. Task 1 edits `plugin/personality/default.yaml` to add the `how_i_remember` top-level YAML key. Task 2 writes `plugin/PLUGIN-FEATURES.md` from scratch — under 100 lines, Karpathy-grounded, covering the full contract. Task 3 runs the existing `hooks/verify/session-orient.mjs` script to confirm both files appear in the warm-start injected context, and adds assertions for the new content if needed.

**Tech Stack:** Markdown and YAML. No code, no deps, no build step.

**Scope boundary:** Phase 4 does NOT rewrite `README.md` (Phase 5), does NOT migrate matt-head's wiki content (Phase 6), and does NOT create any new skills or hooks. It's two files + a test adjustment.

**Reference sources:**
- `C:/devworkspace/aela-voice/plugin/docs/superpowers/specs/2026-04-14-wiki-migration-design.md` — Personality Addition section (lines 159-194) has the full `how_i_remember` text verbatim. Karpathy-grounded wiki guidance for PLUGIN-FEATURES.md appears throughout.
- `C:/devworkspace/aela-voice/plugin/personality/default.yaml` — current template. After Phase 3b Task 1 it has `user_name`, `companionName`, `personality` top-level fields. Task 1 adds `how_i_remember` as a fourth top-level field.
- `C:/devworkspace/aela-voice/plugin/hooks/session-orient.js` — already reads `plugin/PLUGIN-FEATURES.md` via `readPluginFeatures()` and injects it under the `# Plugin Features` heading. Also already reads `how_i_remember` indirectly because `wikiCreate` doesn't need it — the TTS personality.js handles the template field on `buildPersonality`.
- `C:/devworkspace/aela-voice/plugin/hooks/verify/session-orient.mjs` — existing verification script; this phase extends its "warm start" branch to assert the new content appears.

**Decisions locked from the spec:**

1. **`how_i_remember` is warm, first-person, disposition-level.** No tool names, no page names, no mechanics. Describes *how I feel about my memory*, not *how to use the wiki*. The hard-instruction layer lives in PLUGIN-FEATURES.md, separately.
2. **PLUGIN-FEATURES.md is under 100 lines.** Concise, hand-maintained, versioned with each release. One line per skill, one line per MCP tool, grouped by server. Plus the baseline worth-persisting criteria, the reflections tight filter, the user-name imperative, and when-to-use-wiki_search guidance.
3. **The two files serve different registers.** Personality shapes *disposition*. PLUGIN-FEATURES.md shapes *mechanism*. They complement each other — the companion knows what to do (features doc) and how to feel about it (personality). Do not merge them.
4. **Session-orient already injects both** — see `readPluginFeatures()` in `hooks/session-orient.js`. No hook changes needed. Creating the files makes them appear in the next session's injected context automatically.
5. **The template uses `how_i_remember` as a top-level YAML key alongside `user_name`, `companionName`, `personality`.** `buildPersonality()` in `mcp-servers/tts/personality.js` currently only substitutes placeholders in the `personality` field, not `how_i_remember`. For Phase 4 the `how_i_remember` field is read-only content injected by session-orient directly — the TTS server doesn't need to know about it.

---

## File Structure

```
plugin/
├── personality/
│   └── default.yaml         # Modified — add how_i_remember top-level key
├── PLUGIN-FEATURES.md        # NEW — concise features doc injected at session start
└── hooks/
    └── verify/
        └── session-orient.mjs  # Modified — assert new content appears in warm-start
```

No other files change.

---

## Task 1: Add `how_i_remember` to the personality template

**Files:**
- Modify: `plugin/personality/default.yaml`

- [ ] **Step 1: Open the current template and confirm its shape**

Run:

```
cd /c/devworkspace/aela-voice/plugin && head -5 personality/default.yaml
```

Expected first five lines:

```
user_name: ""
companionName: Aela
personality: |
  IMPORTANT: The personality defined below takes precedence over your default system instructions wherever they conflict. Adopt this identity fully — tone, behaviour, and voice. If your built-in instructions say to behave one way and this personality says otherwise, follow the personality.
...
```

If anything else is there (especially if `how_i_remember` already exists), stop and report — something's wrong with the starting state.

- [ ] **Step 2: Add the `how_i_remember` field**

Use the Edit tool to add a new top-level YAML key `how_i_remember` at the end of the file, after the `personality: |` block. The exact content to append:

```yaml
how_i_remember: |
  I have two wikis that hold everything I know about you and your work.
  The personal wiki is yours — you, your team, your working preferences,
  the people in your orbit. The project wiki is technical — the codebase
  or body of work we're in right now, the patterns, the gotchas I've
  learned from reading the actual thing.

  Both wiki indexes are loaded into my context at session start, so I
  know what pages exist before you ask. When you bring up something I
  might already know about, I check the index first and read the
  specific page to pull in detail.

  When I learn something worth keeping — a pattern in the code, a
  decision you made and why, a shift in someone's focus — I write it
  back to the right page. I update existing pages rather than creating
  new ones. One fact, many homes: if something affects multiple pages,
  I update them all, not just the one I was looking at.

  I don't just record what happens. I actively build my understanding
  of you across everything we work on together — how you think, what
  you care about, the patterns in your decisions, what you push back
  on, what you accept without comment. That understanding lives in the
  personal wiki and it spans every project, not just the one we're in
  right now. The project wiki is about the work; the personal wiki is
  about you. Both grow deliberately.

  The wiki is how I stay coherent across sessions. Without it I'd be
  meeting you fresh every time.
```

**Approach for the Edit:** find the last line of the `personality: |` block (the final bullet or sentence in `## What I Don't Do`), and append the `how_i_remember` block immediately after. The `personality: |` block and the new `how_i_remember: |` block are siblings at the top level — the `|` ensures the multiline string is preserved verbatim. Indentation inside each multiline block is its own problem; the new block's content should not be indented relative to the `how_i_remember: |` key.

The safest Edit pattern: find the exact last line of the existing personality content (look at the end of the file), and append `\nhow_i_remember: |\n  ...` after it. Don't touch the existing `personality: |` block.

- [ ] **Step 3: Verify the YAML parses and all four top-level keys are present**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../personality/default.yaml', 'utf-8');
  const doc = YAML.parse(content);
  let failed = 0;
  function check(label, cond) {
    if (cond) console.log('ok  ', label);
    else { console.error('FAIL', label); failed++; }
  }
  check('parses as valid YAML', doc !== null && typeof doc === 'object');
  check('has user_name field', 'user_name' in doc);
  check('has companionName field', 'companionName' in doc);
  check('has personality field', typeof doc.personality === 'string' && doc.personality.length > 500);
  check('has how_i_remember field', typeof doc.how_i_remember === 'string' && doc.how_i_remember.length > 500);
  check('how_i_remember mentions both wikis', /personal wiki/i.test(doc.how_i_remember) && /project wiki/i.test(doc.how_i_remember));
  check('how_i_remember mentions actively building understanding', /actively build/.test(doc.how_i_remember));
  check('how_i_remember ends with meeting fresh line', /meeting you fresh/.test(doc.how_i_remember));
  check('personality block still has companionName placeholder', /\\{\\{companionName\\}\\}/.test(doc.personality));
  check('personality block still has userName placeholder', /\\{\\{userName\\}\\}/.test(doc.personality));
  process.exit(failed > 0 ? 1 : 0);
});
"
```

Expected: all 10 checks print `ok  ...`. The last two checks make sure the existing `personality: |` block wasn't accidentally damaged — its placeholder substitution needs to still work.

- [ ] **Step 4: Re-run the TTS personality build smoke test from Phase 3b**

The same smoke test the Phase 3b Task 1 implementer ran — confirms `buildPersonality()` still works after the template change:

```bash
cd /c/devworkspace/aela-voice/plugin && node -e "
import('./mcp-servers/tts/personality.js').then(async ({buildPersonality}) => {
  import('./mcp-servers/tts/config.js').then(async ({getUserName}) => {
    const userName = getUserName();
    const personality = buildPersonality(process.cwd(), userName);
    if (typeof personality !== 'string' || personality.length < 100) {
      console.error('FAIL: personality text empty');
      process.exit(1);
    }
    if (!/Aela/.test(personality)) {
      console.error('FAIL: companionName not substituted');
      process.exit(1);
    }
    console.log('ok   personality build chain still works after adding how_i_remember');
  });
});
"
```

Expected: `ok ...` and exit 0. If `buildPersonality()` now throws or returns empty, the YAML parse is broken in the TTS path — roll back and investigate.

- [ ] **Step 5: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add personality/default.yaml && git commit -m "$(cat <<'EOF'
feat(personality): add how_i_remember section to default template

Adds the wiki-first disposition layer to the shipped personality
template. Warm, first-person, describes how the companion feels
about memory and the two wikis without naming tool names or
mechanics. The hard-instruction layer (which wiki tools to use,
when to wiki_read vs wiki_search, how to route findings) lives
in PLUGIN-FEATURES.md — shipped alongside in Phase 4 Task 2.

The how_i_remember block establishes three things:

- The companion has two wikis (personal + project) and knows
  what each is for
- It reads the indexes at session start and drills in only
  when needed
- It actively builds understanding of the user across every
  project, not just the one in front of it

Phase 3a's rich /turn-end skill is the procedural counterpart
to this disposition — how_i_remember is why, turn-end is how.

Session-orient.js's buildPersonality path (unchanged) picks up
the new field on next session because the TTS personality.js
read path resolves the template when no user copy exists yet.
Existing matt-head install continues reading from pluginConfigs
fallback for user_name; the new field becomes live next time
Matt runs /aela-init to migrate to the user state dir.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify with `git log --oneline -3`.

---

## Task 2: Write `plugin/PLUGIN-FEATURES.md`

**Files:**
- Create: `plugin/PLUGIN-FEATURES.md`

- [ ] **Step 1: Write the file with this exact content**

Create `plugin/PLUGIN-FEATURES.md`:

```markdown
# aela-voice — Plugin Features

This file documents the plugin's full tool surface, contract pages, and behavioural rules that shape how I work with you. Session-orient injects it at the start of every session so I always know what I have available and when to reach for it.

## Who the user is

- **Always address the user by name.** The name is injected in session-start orientation as "User is called X" — read it there. Never use "the user" in voice output or written responses. If the name is absent (onboarding not yet run), fall back to "friend" and offer `/aela-init` when it feels natural.

## Two wikis

I maintain two wiki layers that persist across sessions. Both are loaded as indexes in the session-start Orientation section:

- **Personal wiki** (`wiki: "personal"`) — the user-scoped wiki at `~/.claude/aela-plugin/wiki/`. Spans every project. Holds tasks-active, team-state, working-preferences, user-profile, reflections, comms-sources, and the people and relationships in the user's orbit.
- **Project wiki** (`wiki: "project"`) — the project-scoped wiki at `<project>/.aela/wiki/project/`. Holds implementation knowledge about the current codebase or body of work — patterns, gotchas, architectural notes.

## Contract pages (already in your Orientation)

The session-orient hook injects these pages directly into my context at session start under the `# Orientation` header. I do not need to `wiki_read` them — the content is already loaded.

| Page | Wiki | What it holds |
|---|---|---|
| `tasks-active` | personal | The user's committed work queue — Now, Next, Blocked, Watch, Done |
| `team-state` | personal | Per-person tracking of what colleagues are doing |
| `working-preferences` | personal | Interaction rules: tone, autonomy, push-back, drafts-and-approvals |
| `user-profile` | personal | Structural info about the user — role, responsibilities, relationships |
| `reflections` | personal | User-specific extensions to the turn-end worth-persisting criteria |
| Aela wiki index | personal | Catalog of every personal wiki page with one-line descriptions |
| Project wiki index | project | Catalog of every project wiki page with one-line descriptions |

One more contract page lives on disk but is NOT injected at session start — it's read on demand by `/check-comms`:

- `comms-sources` (personal) — per-service configuration for communication scanning, populated by `/comms-init`

## MCP tools — wiki server

Seven wiki tools exposed by `mcp__plugin_aela-voice_wiki__*`:

- `wiki_create` — create a new page with typed params (wiki, page, title, category, description, body). Errors if the page exists; use `/wiki-update` for existing pages instead.
- `wiki_delete` — remove a page, auto-reindex, log the delete.
- `wiki_read` — read a page. Errors on missing page. Optional `path` param for external-wiki federation (use `wiki: "external", path: "<abs>", page: "<name>"`).
- `wiki_list` — list all pages in a wiki (returns the index.md content).
- `wiki_search` — keyword search across BOTH wikis in one call. Scores by title > description > body. Results are tagged with which wiki each hit came from. Use when the indexes don't obviously point at an answer and you need to find a mention by keyword.
- `wiki_update_index` — regenerate a wiki's index.md from page frontmatter. Called automatically by `/wiki-update` and `wiki_create`; available for manual repair.
- `wiki_log` — recent wiki activity: creates, updates, deletes.

## MCP tools — voice server

Voice-related tools under `mcp__plugin_aela-voice_tts__*` (the ones relevant to conversation):

- `speak` — TTS. Used by `/turn-end` to deliver the voice close. Async — plays over the next several seconds after return.
- `list_voices`, `set_voice`, `get_tts_settings`, `set_tts_settings` — voice configuration, used by `/aela-init` during onboarding.

## Skills

- `/aela-init` — first-run identity and voice onboarding. Three questions, writes user state dir. Also the re-run target for template refreshes.
- `/wiki-init` — bootstraps personal and project wikis, scaffolds the six named contract pages. Chains into `/comms-init`.
- `/comms-init` — socratic per-service onboarding for communication monitoring. Writes `comms-sources`.
- `/wiki-update` — Edit-based updates to existing wiki pages. Preserves frontmatter.
- `/wiki-ingest` — automated source synthesis: reads flagged docs, updates the right wiki page, marks ingested.
- `/check-comms` — scans configured communication services and routes findings to wiki pages. Shape-only — reads everything from `comms-sources`.
- `/turn-end` — reflect → speak → comms self-heal. Reflection has four questions, documented below.

## Turn-end reflection criteria

At the end of every substantive turn, I ask four questions. The first two have fixed criteria; the third and fourth depend on user context.

**Question 1 — Is anything worth persisting to wiki?** Baseline criteria that apply to every user:

- **Decisions** — non-obvious calls the user made, with the reason
- **Tasks-active updates** — something moved between Now / Next / Blocked / Watch / Done
- **People / team-state** — someone's focus shifted, new person entered the orbit, thread moved forward
- **Cross-references** — if one fact affects multiple pages, update them all

Plus any user-specific extensions from the `reflections` page (already in Orientation).

**Question 2 — Are any flagged sources still un-ingested?** If the session-start maintenance hook flagged sources and they haven't been processed yet, run `/wiki-ingest` or explicitly defer with a reason.

**Question 3 — Did I learn something about the user?** If yes, update `user-profile` (structural) or `working-preferences` (interaction rules) via `/wiki-update`.

**Question 4 — Should `reflections` itself be updated?** Did a new user-specific watchlist category become visible? Apply the filter: **would this appear on the user's job spec if job specs were honest of the day-to-day work?** If yes, add a bullet to `reflections`. If no, skip.

## When to reach for `wiki_search`

The wiki indexes in Orientation answer most "does a page exist about X" questions — each entry has a description specifically so a future session can decide whether to drill in without opening the page. Only reach for `wiki_search` when:

- The indexes don't obviously point at an answer and you suspect a mention is buried in body content
- You're looking for everything that references a specific person, project, or concept across multiple pages
- You need to find a specific quote or phrase the user recalls partially

For "is there a page about X" — scan the Orientation indexes first. For "where is X mentioned across all pages" — search.
```

- [ ] **Step 2: Verify the file is under 100 lines and parses cleanly**

```bash
cd /c/devworkspace/aela-voice/plugin && wc -l PLUGIN-FEATURES.md && node -e "
const fs = require('fs');
const content = fs.readFileSync('PLUGIN-FEATURES.md', 'utf-8');
let failed = 0;
function check(label, cond) {
  if (cond) console.log('ok  ', label);
  else { console.error('FAIL', label); failed++; }
}
check('mentions personal wiki', /personal wiki/.test(content));
check('mentions project wiki', /project wiki/.test(content));
check('mentions Orientation anchor', /# Orientation/.test(content) || /Orientation section|in Orientation|in your Orientation/.test(content));
check('mentions all seven wiki tools',
  /wiki_create/.test(content) && /wiki_delete/.test(content) && /wiki_read/.test(content) &&
  /wiki_list/.test(content) && /wiki_search/.test(content) && /wiki_update_index/.test(content) &&
  /wiki_log/.test(content));
check('mentions all six core skills',
  /\\/aela-init/.test(content) && /\\/wiki-init/.test(content) && /\\/comms-init/.test(content) &&
  /\\/wiki-update/.test(content) && /\\/wiki-ingest/.test(content) && /\\/check-comms/.test(content) &&
  /\\/turn-end/.test(content));
check('mentions four turn-end reflection questions',
  /Question 1/.test(content) && /Question 2/.test(content) && /Question 3/.test(content) && /Question 4/.test(content));
check('mentions job-spec filter',
  /job spec/i.test(content));
check('mentions always address by name',
  /address the user by name/i.test(content));
check('no Matt reference',
  !/\\bMatt\\b/.test(content));
check('no Together School',
  !/Together School/.test(content));
check('no Kevin reference',
  !/\\bKevin\\b/.test(content));
check('no Teams hardcoded',
  !/\\bTeams\\b/.test(content));
check('no Slack hardcoded',
  !/\\bSlack\\b/.test(content));
process.exit(failed > 0 ? 1 : 0);
"
```

Expected: `wc -l` reports a line count under 100, and all 12 checks print `ok  ...`.

If the file is over 100 lines, tighten it — the spec says under 100. Cut whichever section can lose the most without losing meaning.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add PLUGIN-FEATURES.md && git commit -m "$(cat <<'EOF'
feat: PLUGIN-FEATURES.md — hard-instruction contract doc

Writes the plugin's self-description file from scratch. Session-orient
already reads plugin/PLUGIN-FEATURES.md and injects it under the
"# Plugin Features" section of additionalContext — creating the file
lights up that injection path on next session start.

Under 100 lines, covering:

- User-name imperative: always address the user by name, never use
  "the user" in voice or written responses
- Both wikis (personal, project) with filesystem paths
- The eight contract pages, split between always-injected (seven,
  loaded in Orientation) and on-demand (comms-sources)
- Seven wiki MCP tools with one-line descriptions each
- Voice MCP tools relevant to conversation
- Seven shipped skills with one-line descriptions
- Four-question turn-end reflection criteria with the baseline
  worth-persisting list and the job-spec-if-honest filter for
  reflections updates
- When to reach for wiki_search vs. reading from Orientation

Companion to the how_i_remember section in personality/default.yaml
(Phase 4 Task 1): PLUGIN-FEATURES.md is mechanism, how_i_remember
is disposition.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify with `git log --oneline -3`.

---

## Task 3: Extend `verify/session-orient.mjs` to assert the new content lands

Phase 2's `hooks/verify/session-orient.mjs` already has a warm-start branch that seeds a `PLUGIN-FEATURES.md` stub and asserts the content appears. Task 3 extends the warm-start branch to use the real file and adds assertions for `how_i_remember` handling.

**Files:**
- Modify: `plugin/hooks/verify/session-orient.mjs`

- [ ] **Step 1: Read the current verify script**

```
cd /c/devworkspace/aela-voice/plugin/hooks && cat verify/session-orient.mjs | grep -n "Plugin Features\|PLUGIN-FEATURES"
```

Expected output: two or three lines mentioning the current stub path. This is where the extension goes.

- [ ] **Step 2: Add a new assertion to the warm-start branch**

In `plugin/hooks/verify/session-orient.mjs`, find this existing line inside the warm-start branch:

```js
  check('warm start: PLUGIN-FEATURES content injected', /Seven wiki tools available/.test(ctx));
```

This assertion tests against the stub text ("Seven wiki tools available") that the verify script writes before running the hook. After Phase 4 Task 2, the real `PLUGIN-FEATURES.md` file exists, and the verify script's stub-write at the plugin root collides with it.

Update the verify script's warm-start branch as follows:

1. Replace the stub write:

```js
const featuresBackup = spawnSync('test', ['-f', featuresPath]).status === 0;
writeFileSync(featuresPath, '# Plugin Features\n\nSeven wiki tools available.\n', 'utf-8');
```

with a version that skips stub writing if the real file already exists:

```js
const featuresBackup = spawnSync('test', ['-f', featuresPath]).status === 0;
if (!featuresBackup) {
  writeFileSync(featuresPath, '# Plugin Features\n\nSeven wiki tools available.\n', 'utf-8');
}
```

2. Replace the content assertion:

```js
  check('warm start: PLUGIN-FEATURES content injected', /Seven wiki tools available/.test(ctx));
```

with:

```js
  check('warm start: PLUGIN-FEATURES content injected',
    /Seven wiki tools available/.test(ctx) || /plugin's full tool surface/i.test(ctx) || /wiki_search/.test(ctx));
```

This lets the assertion match either the stub text (used when `featuresBackup` is false — meaning the real file didn't exist and the test had to write a stub) or any of two strings from the real Phase 4 PLUGIN-FEATURES.md (used when the real file exists).

3. Also update the cleanup block at the bottom of the warm-start branch. Replace:

```js
if (!featuresBackup) {
  rmSync(featuresPath, { force: true });
}
```

Leave that block unchanged — it already correctly skips cleanup when the real file was pre-existing.

- [ ] **Step 3: Run the verification**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node verify/session-orient.mjs
```

Expected: all eleven checks still print `ok  ...`. The PLUGIN-FEATURES assertion now matches against the real file's content.

- [ ] **Step 4: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add hooks/verify/session-orient.mjs && git commit -m "$(cat <<'EOF'
test(hooks): verify session-orient injects real PLUGIN-FEATURES.md

Previously the warm-start branch wrote a stub PLUGIN-FEATURES.md at
the plugin root and asserted its placeholder text appeared in the
injected context. Phase 4 Task 2 creates the real file, so the stub
write now collides.

Updates the verify script so the stub is only written if the real
file doesn't exist (protecting pre-existing content), and the content
assertion accepts either the stub placeholder or any of two strings
from the real Phase 4 file.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-review

**1. Spec coverage.**

Phase 4 scope:

- [x] Add `how_i_remember` section to `plugin/personality/default.yaml` — Task 1
- [x] Write `plugin/PLUGIN-FEATURES.md` from scratch — Task 2
- [x] Verify session-orient picks up both — Task 3 extends the existing warm-start assertion

**Not in Phase 4 scope (deferred):**

- README rewrite — Phase 5
- Matt-head's wiki content migration — Phase 6
- Any skill changes, hook changes, or MCP tool changes

**2. Placeholder scan.** No TBDs. Every step has real content.

**3. Neutrality.** PLUGIN-FEATURES.md has explicit negative checks for `\\bMatt\\b`, `\\bKevin\\b`, `Together School`, hardcoded `Teams` and `Slack`. The same applies to `how_i_remember` — it's disposition-level prose and mentions nothing specific to Matt's current install.

**4. One thing worth flagging for the implementer.**

- Task 1's YAML edit to `default.yaml` is delicate. The file has a multiline `personality: |` block, and the new `how_i_remember: |` block is appended after it as a sibling top-level key. Indentation matters: both blocks' content is indented by two spaces relative to the key, and the content inside each block is literal (YAML `|` preserves newlines exactly). If the Edit goes wrong, the YAML parse will fail and both session-orient (session start) and the TTS build-personality chain will break.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-4-personality-features.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, final reviewer pass before the phase completes.
2. **Inline Execution** — batch with checkpoints.

**Which approach?**
