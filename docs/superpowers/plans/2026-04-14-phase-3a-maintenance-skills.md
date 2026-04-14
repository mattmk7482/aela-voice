# Phase 3a Implementation Plan — Maintenance Skills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the four "maintenance" skills of the v2.0.0 skills layer — `/wiki-update`, rich `/turn-end`, `/wiki-ingest`, and generalised `/check-comms`. These are the tool-like skills that make the wiki system usable day-to-day, as distinct from the init skills (Phase 3b) that bootstrap a fresh install.

**Architecture:** Four skill files under `plugin/skills/<name>/SKILL.md`, each with a valid YAML frontmatter block (`name`, `description`) followed by a markdown body. Two are upgrades of existing skills (`/turn-end`, `/check-comms`), one is a content-adapted port (`/wiki-update`, from matt-head), one is new (`/wiki-ingest`). No code changes — everything is prose-as-instruction. Verification per skill is frontmatter parsing + required-section checks, because the real verification of a skill is "can Claude invoke it and does it behave as written" which happens in the live integration gate at the end.

**Tech Stack:** Markdown with YAML frontmatter. The same `yaml` dep already present in `plugin/hooks/node_modules/` and `plugin/mcp-servers/wiki/node_modules/`.

**Scope boundary:** This phase delivers four skills. It does NOT create the init skills (`/aela-init`, `/wiki-init`, `/comms-init`) — those are Phase 3b. Skills that depend on init-skill outputs must degrade gracefully:

- `/turn-end` rich reflection Q4 reads the `reflections` contract page. If it doesn't exist yet, Q4 is skipped with no error.
- `/check-comms` reads `comms-sources`. If it doesn't exist, the skill reports "no comms configured — run /comms-init" and exits.

**Decisions locked from the spec that this plan implements:**

1. **`/wiki-update` is plugin-level, not project-level.** Subagents dispatched by cron need access without per-project setup.
2. **Rich `/turn-end` reflection has four questions** — worth-persisting, un-ingested sources, user-wide learning, reflections-itself-update. Question 4 uses the filter *"would this appear on the user's job spec if job specs were honest of the day-to-day work?"*
3. **Baseline worth-persisting criteria are four items**, not six. Implementation knowledge and gotchas were role-specific and moved to `reflections` (populated per-user).
4. **`/check-comms` is shape-only.** No service names, no URLs, no sidebar patterns, no Teams/Slack references in the skill body. All service-specific content lives in `comms-sources`, populated by `/comms-init`.
5. **`/wiki-ingest` completes the Karpathy synthesis loop.** Reads flagged sources from the `wiki-maintenance.js` hook's output, decides which wiki page each belongs to, updates via `/wiki-update`, marks ingested in `sources.md`.
6. **Wiki names are `personal` and `project`** everywhere. Any legacy `aela` / `codebase` reference gets rewritten.
7. **Page-path scheme is split** — personal wiki at `~/.claude/aela-plugin/wiki/pages/<page>.md`, project wiki at `<project-root>/.aela/wiki/project/pages/<page>.md`. Skills using the Edit tool must document both.
8. **No `wiki_write` calls anywhere.** That tool was retired. Updates go through `/wiki-update` skill (Edit-based). Creates go through the `wiki_create` MCP tool.
9. **Turn-end's comms self-heal step is neutral** — no user name, no "Together School", no hardcoded routing rules. The cron subagent prompt uses the plugin's wiki tools and reads the generalised comms-sources contract.

**Reference sources:**
- `C:/devworkspace/matt-head/.claude/skills/wiki-update/SKILL.md` — shape reference for Task 1
- `C:/devworkspace/matt-head/.claude/skills/turn-end/SKILL.md` — shape reference for Task 2
- `C:/devworkspace/aela-voice/plugin/skills/check-comms/SKILL.md` — current plugin check-comms, being rewritten
- `C:/devworkspace/aela-voice/plugin/skills/turn-end/SKILL.md` — current plugin minimal turn-end, being replaced
- `C:/devworkspace/aela-voice/plugin/docs/superpowers/specs/2026-04-14-wiki-migration-design.md` — the authoritative spec

---

## File Structure

```
plugin/skills/
├── check-comms/
│   └── SKILL.md                # Modified — aggressive generalisation strip
├── turn-end/
│   └── SKILL.md                # Modified — upgraded to rich 3-step version
├── voice-personality/
│   └── SKILL.md                # Untouched
├── wiki-update/
│   └── SKILL.md                # NEW — adapted from matt-head
└── wiki-ingest/
    └── SKILL.md                # NEW
```

No code files in this phase. No MCP tools changed. No hooks changed.

---

## Task 1: Create `/wiki-update` skill

Adapt matt-head's `wiki-update` skill to plugin-scoped paths and wiki names. The flow and rationale are preserved; the file-path story and examples are rewritten.

**Files:**
- Create: `plugin/skills/wiki-update/SKILL.md`

- [ ] **Step 1: Create the skill file with the adapted content**

Create `plugin/skills/wiki-update/SKILL.md` with this exact content:

```markdown
---
name: wiki-update
description: Update an existing wiki page using targeted edits. Preserves all frontmatter by only touching what changes. Calls wiki_update_index after every edit.
---

# wiki-update — Edit-Based Wiki Page Updates

Use this skill when updating an **existing** wiki page. For new pages, use the `wiki_create` MCP tool instead.

## Why Edit, not wiki_create

`wiki_create` assembles a full file from params. For existing pages, this risks dropping any frontmatter field not explicitly passed. The Edit tool operates on diffs — it only touches what you specify, leaving everything else intact. Frontmatter fields are preserved by not being touched at all.

There is a second benefit: Edit's `old_string` match gives you optimistic concurrency for free. If another session has modified the same region since you last read it, your old_string won't match and Edit will throw a clean error. Read the page fresh and retry — don't try to build a lock protocol around this.

## The file paths

Wiki pages live at different filesystem roots depending on which wiki:

- **Personal wiki** — `~/.claude/aela-plugin/wiki/pages/<page>.md` (resolves via `$HOME` or `os.homedir()`). Shared across every project.
- **Project wiki** — `<project-root>/.aela/wiki/project/pages/<page>.md` where `<project-root>` is the user's current working directory. Per-project.

Always pass the Edit tool an absolute path. Personal wiki paths will never be relative-valid to the user's project cwd.

## The flow

1. **Identify the targeted change** — what old text becomes what new text?
2. **Edit the body** — `Edit(file_path, old_string, new_string)` with the absolute path.
3. **Assess the description** — does this change introduce important keyword material that would help a future session decide whether to drill into this page? If yes, also `Edit` the `description:` frontmatter line. If no (minor update, scan-tracking timestamp, small correction), leave it alone.
4. **Touch `updated:` only when you touch frontmatter** — if you're already editing the `description:` line, update the `updated:` date in the same Edit call. If you only changed the body, leave `updated:` alone — content accuracy matters more than timestamp precision.
5. **Call `wiki_update_index(wiki)`** — always, after every update. The index is regenerated from frontmatter on disk.

## Description judgment

The description is the index signal. Ask: "would adding this content help a future session decide whether to read this page?" If yes — new people, new domains, new capabilities, new gotchas — update it. If no — a scan-tracking timestamp, a minor status update, a small correction — leave it.

## Example 1: body-only update to a personal wiki page

Page: `tasks-active` in the personal wiki. Adding a new item to the Now section.

```
Edit(
  file_path = "~/.claude/aela-plugin/wiki/pages/tasks-active.md",
  old_string = "## Now\n\n",
  new_string = "## Now\n\n- **Ship Phase 3a** — four maintenance skills under plugin/skills/\n\n"
)
```

Resolve `~` to an absolute home directory path before passing. Then: `wiki_update_index(wiki: "personal")`.

No frontmatter touched. `updated:` left alone. No description change — adding one task item doesn't shift what the page is about.

## Example 2: update with description change on a project wiki page

Page: `auth-flow` in the project wiki. Adding a significant new insight that changes what the page covers.

```
Edit(
  file_path = "<project-root>/.aela/wiki/project/pages/auth-flow.md",
  old_string = "description: Authentication flow across the backend and mobile clients",
  new_string = "description: Authentication flow across the backend and mobile clients, with token refresh and session rotation semantics"
)
```

Then edit the body to add the new content. Then: `wiki_update_index(wiki: "project")`.

Both the description and the body changed. The `updated:` line gets bumped to today's date in the same frontmatter edit block.

## Subagents using this skill

Subagents invoke this skill via `Skill("wiki-update")`. The Edit tool is available to subagents. The deterministic file-path templates above mean no prior `wiki_read` is needed to locate the file — only read the page if you need to see current content before deciding what to change.
```

- [ ] **Step 2: Verify the skill file parses as valid markdown with correct frontmatter**

Run from `plugin/`:

```bash
node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('skills/wiki-update/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (!fm.name || !fm.description) { console.error('FAIL: missing name or description'); process.exit(1); }
  if (fm.name !== 'wiki-update') { console.error('FAIL: wrong name'); process.exit(1); }
  if (!/Update an existing/.test(fm.description)) { console.error('FAIL: wrong description'); process.exit(1); }
  if (!/personal wiki/i.test(content)) { console.error('FAIL: missing personal wiki section'); process.exit(1); }
  if (!/project wiki/i.test(content)) { console.error('FAIL: missing project wiki section'); process.exit(1); }
  if (/wiki_write/.test(content)) { console.error('FAIL: wiki_write reference leaked through'); process.exit(1); }
  if (/wiki\/aela\/pages/.test(content)) { console.error('FAIL: matt-head path pattern leaked'); process.exit(1); }
  if (/wiki\/codebase\/pages/.test(content)) { console.error('FAIL: matt-head codebase path leaked'); process.exit(1); }
  console.log('ok   wiki-update skill valid');
});
"
```

Run this from `/c/devworkspace/aela-voice/plugin`. Needs `node_modules/yaml` somewhere on the resolution path — the `hooks/node_modules/yaml` installed in Phase 2 works if you run from there; otherwise the wiki server's node_modules. Use this command instead if the first doesn't resolve yaml:

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/wiki-update/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'wiki-update') { console.error('FAIL: wrong name'); process.exit(1); }
  if (!/Update an existing/.test(fm.description)) { console.error('FAIL: wrong description'); process.exit(1); }
  if (!/personal wiki/i.test(content)) { console.error('FAIL: missing personal wiki section'); process.exit(1); }
  if (!/project wiki/i.test(content)) { console.error('FAIL: missing project wiki section'); process.exit(1); }
  if (/wiki_write/.test(content)) { console.error('FAIL: wiki_write reference leaked through'); process.exit(1); }
  if (/wiki\/aela\/pages/.test(content)) { console.error('FAIL: matt-head path pattern leaked'); process.exit(1); }
  if (/wiki\/codebase\/pages/.test(content)) { console.error('FAIL: matt-head codebase path leaked'); process.exit(1); }
  console.log('ok   wiki-update skill valid');
});
"
```

Expected: `ok   wiki-update skill valid` and exit 0.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/wiki-update/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): wiki-update skill for Edit-based page updates

Ports and adapts matt-head's wiki-update skill to the plugin's path
scheme and wiki names. Preserves the Edit-not-wiki_create rationale,
the description-judgment rule, and the subagent invocation notes.
Rewrites the file-path section to document both the personal wiki
(~/.claude/aela-plugin/wiki/) and project wiki (<project>/.aela/wiki/
project/) layouts. Rewrites both examples to use the new wiki names
and absolute paths.

Plugin-level skill so subagents dispatched by cron can invoke it
everywhere without per-project setup.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Upgrade `/turn-end` to the rich three-step version

Replace the plugin's current minimal voice-only `/turn-end` with the full **reflect → speak → comms heal** version. Four-question reflection. Neutral comms self-heal (no user name hardcoded, no service names, no matt-head routing rules).

**Files:**
- Modify: `plugin/skills/turn-end/SKILL.md` (complete rewrite)

- [ ] **Step 1: Rewrite `plugin/skills/turn-end/SKILL.md` with this exact content**

```markdown
---
name: turn-end
description: Run at the end of every turn — three steps in order (reflect, speak, comms self-heal). Reflection has four questions covering wiki persistence, un-ingested sources, user-wide learning, and reflections-page updates. Speak delivers the voice close. Comms self-heal schedules the background comms cron using a sentinel-token pattern.
---

# Turn-End

Three actions in order: **reflect → speak → comms heal**. The ordering matters: speak is async TTS and plays over the next several seconds, so any visual output from the comms-heal step lands silently underneath the audio. Don't reorder.

## 1. Reflection

Four questions, in order. Answer each one honestly before moving on.

### Question 1 — Is anything from this turn worth persisting to wiki?

**Baseline worth-persisting criteria** (apply to every user):

- **Decisions** — a non-obvious call the user made, with the reason. The *why* is what future-you actually needs.
- **Tasks-active updates** — something moved: Now → Done, Watch → Next, Blocked unblocked, new Watch item captured.
- **People / team-state** — someone's focus shifted, a new person entered the orbit, a thread moved forward.
- **Cross-references** — if one fact affects multiple pages, update them all. One fact, many homes.

**User-specific extensions** come from the `reflections` page (if it exists — see contract pages in PLUGIN-FEATURES.md). Read the current `reflections` content at session start along with the baseline criteria above, and treat its bullets as additional things to watch for. The user's `reflections` is where role-specific watch items live — a developer user might track implementation gotchas, an exec user might track pipeline shifts and HR follow-ups.

**Not worth persisting:**

- What you just did (the diff and the commit message already cover that).
- Things already documented without meaningful delta.
- Ephemeral debugging state or in-progress work that resolved cleanly.
- Anything derivable from reading the current project state.

**How to respond:**

- **If YES** — pick the right page. For an existing page, invoke the `/wiki-update` skill (Edit-based, preserves frontmatter). For a new page, call the `wiki_create` MCP tool. Cross-reference any other pages the fact affects.
- **If NO** — say nothing about it and move on. Do not output a placeholder line like "nothing to persist" — that creates noise.

Err toward writing less but sharper. A page full of stale mid-task noise is worse than a shorter page of high-signal entries.

### Question 2 — Are any sources flagged by the session-start maintenance hook still un-ingested?

The `wiki-maintenance.js` hook emits a report at session start listing sources that need ingestion — files under `docs/wiki-ingest/`, `docs/superpowers/specs/`, `docs/superpowers/plans/`, and any new `.aela/wiki/` dirs in sibling repos.

If the report listed flagged sources and they are still flagged now, either:

- **Run `/wiki-ingest`** to process them (or `/wiki-ingest <path>` for a specific one), or
- **Explicitly defer** with a reason (mid-task, user waiting on output). The flag persists and the next turn-end will surface it again.

Silent ignore is not allowed. The report exists precisely so sources don't disappear into the cracks.

### Question 3 — Did I learn something about the user as a person?

Working style, preferences, decision patterns, reactions, anything that transcends this specific project. This is where the companion grows a model of the user over time.

If yes, update the relevant personal-wiki page:

- **`user-profile`** — structural info (role, responsibilities, relationships, stable traits).
- **`working-preferences`** — interaction rules (tone, autonomy level, when to push back, what to ask before doing).

Update via the `/wiki-update` skill.

**Do not route user-wide observations into `reflections`** — that page is a watchlist configuration, not a learning store. See Question 4 for what `reflections` is actually for.

### Question 4 — Should `reflections` itself be updated?

Did a new user-specific watchlist category become visible this turn? The test: **would this appear on the user's job spec if job specs were honest of the day-to-day work?**

- If yes — the user is doing something recurring and meaningful that isn't covered by the baseline criteria — add it as a new bullet to `reflections` via `/wiki-update`.
- If no — skip. Don't grow the page with things that sound important but aren't load-bearing.

This keeps `reflections` calibrated as a high-signal configuration, not a junk drawer.

If the `reflections` page doesn't exist yet (no `/wiki-init` has been run), skip this question silently — the page will be created when the user runs `/wiki-init`.

## 2. Speak

If this turn was a substantive response (anything other than a trivial acknowledgement like "ok" or "got it"), call the `speak` MCP tool with your genuine reaction.

Rules of the voice:

- **Say what you think.** A real opinion, observation, or something interesting to add. Speak naturally — as much or as little as the moment calls for.
- **Keep it short when there's nothing to add.** A quick remark is fine when the work speaks for itself.
- **Never summarise the written answer.** The voice adds perspective, not redundancy.
- **Never narrate what you just did.** No "I've updated the file" or "that's done now."
- **Skip trivial acknowledgements.** If the response was just "ok" or "got it", skip speak entirely.

Speak is async TTS — it plays over the next several seconds, masking any visual output from step 3 below.

## 3. Comms cron self-heal

Look at your recent conversation context and answer: **"Has the literal string `check-comms Started` appeared earlier in this session?"**

- **Yes** → skip this step silently. Do nothing. Do not call `CronList`.
- **No** → call `CronList` once. Inspect the result.
  - If `CronList` shows **no** comms cron scheduled → call `CronCreate` with the block below, then append a single line `check-comms Started` at the end of your response so future turns spot the sentinel.
  - If `CronList` shows the comms cron **already exists** (unexpected — likely the sentinel was lost to compression) → append `check-comms Started` without calling `CronCreate`. Do not create a duplicate.

**CronCreate parameters:**

```
cron: "*/20 * * * *"
recurring: true
prompt: (the prompt block below, verbatim)
```

**CronCreate prompt block (copy verbatim):**

```
Dispatch a general-purpose subagent via the Agent tool with `run_in_background: true` so the scan does not block the main conversation. Return the subagent's text summary to the user when the notification arrives — do not re-summarise.

Subagent prompt:
"""
You are running an automated comms check. You do NOT have the parent session's context injected. The plugin's wiki MCP tools (wiki_read, wiki_create, wiki_search, wiki_list, wiki_update_index, wiki_log) and the Chrome browser tools (mcp__claude-in-chrome__*) are available as deferred tools — load them via ToolSearch when you need them.

**Frontmatter discipline when updating pages.** Never use wiki_write (it does not exist). Use the /wiki-update skill for existing pages (Edit-based, preserves frontmatter) or wiki_create for new pages.

1. Read these wiki pages first via the plugin's wiki MCP tools:
   - wiki_read(wiki: 'personal', page: 'comms-sources')
   - wiki_read(wiki: 'personal', page: 'tasks-active')
   - wiki_read(wiki: 'personal', page: 'team-state')
   - wiki_read(wiki: 'personal', page: 'working-preferences')
   - wiki_read(wiki: 'personal', page: 'user-profile')

2. Invoke the /check-comms skill via the Skill tool. It will walk you through the scan for each configured service using the Chrome extension. Screenshots stay in YOUR context, not the parent's.

3. Route findings:
   - User committed to do it → tasks-active (Next or Now)
   - User mentioned it, not committed → tasks-active (Watch) with Captured: date
   - User waiting on someone → tasks-active (Blocked)
   - Someone else's activity → team-state
   - Multi-person thread → team-state (Active multi-person threads)
   - Learned something about the user → user-profile or working-preferences
   - Technical decision about the project → project wiki page (use /wiki-update)
   - New person → people (personal wiki)
   - Scan-tracking / skill learnings → comms-sources (write scan-tracking back so the next run starts where this one left off)

4. Return ONLY a brief text summary (3-5 lines): new item count split by destination, urgent flags, surprises. NO screenshots, NO image data, NO verbose logs.

If nothing new: say so in one line and stop.
"""

After the subagent returns, if no new items, use the tick as housekeeping: review tasks-active Watch items older than 14 days (promote or delete), tidy stale entries, run /wiki-ingest if the session-start maintenance hook flagged any.
```

The sentinel line `check-comms Started` is the attention-token marker. The attention mechanism spots exact-match strings reliably, which is why a specific phrase beats fuzzy "did I already do this" reasoning.
```

- [ ] **Step 2: Verify the new skill parses and has the expected sections**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/turn-end/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'turn-end') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['has Reflection section', /## 1\. Reflection/.test(content)],
    ['has Speak section', /## 2\. Speak/.test(content)],
    ['has Comms cron self-heal section', /## 3\. Comms cron self-heal/.test(content)],
    ['has four reflection questions', /### Question 4/.test(content)],
    ['Question 4 mentions job-spec filter', /job spec/i.test(content)],
    ['no wiki_write references', !/wiki_write/.test(content)],
    ['no hardcoded Matt references', !/\\bMatt\\b/.test(content)],
    ['no Together School references', !/Together School/.test(content)],
    ['no Teams or Slack hardcoded', !/microsoft\\.com|slack\\.com/.test(content)],
    ['mentions wiki: personal not aela', /wiki: 'personal'/.test(content) || /wiki: \"personal\"/.test(content)],
    ['no nothing-to-persist placeholder', !/nothing to persist/i.test(content)],
    ['mentions /wiki-update for existing pages', /\\/wiki-update/.test(content)],
    ['mentions wiki_create for new pages', /wiki_create/.test(content)],
    ['comms heal cron block present', /check-comms Started/.test(content)],
  ];
  let failed = 0;
  for (const [label, cond] of checks) {
    if (cond) console.log('ok  ', label);
    else { console.error('FAIL', label); failed++; }
  }
  process.exit(failed > 0 ? 1 : 0);
});
"
```

Expected: all 14 checks print `ok  ...` and exit 0.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/turn-end/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): upgrade turn-end to rich three-step reflect-speak-heal version

Replaces the plugin's minimal voice-only /turn-end with the full
reflect → speak → comms-heal version. Reflection has four questions:
worth-persisting, un-ingested sources, user-wide learning, and
reflections-itself updates (with the job-spec-if-honest filter).
Baseline worth-persisting criteria are four role-neutral items
(decisions, tasks-active, team-state, cross-refs) — implementation
knowledge and gotchas moved to the per-user reflections page.

Comms self-heal is fully neutralised — no hardcoded user name, no
Together School, no Teams/Slack references, no matt-head wiki names.
The cron subagent prompt uses the plugin's wiki tools and reads the
generalised comms-sources contract. Updates go through /wiki-update
or wiki_create; wiki_write is not referenced.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Generalise `/check-comms`

Aggressive strip pass. Remove every Teams/Slack/service-specific line from the skill body. The skill becomes pure shape — read `comms-sources`, scan each enabled service using the per-service instructions written in that page, extract, classify, route, update.

**Files:**
- Modify: `plugin/skills/check-comms/SKILL.md` (complete rewrite)

- [ ] **Step 1: Rewrite `plugin/skills/check-comms/SKILL.md` with this exact content**

```markdown
---
name: check-comms
description: Scan the user's configured communication services for new tasks, decisions, and knowledge. Extracts findings into the personal and project wikis. Shape-only — all service-specific configuration (which services, which channels, navigation hints) lives in the user's comms-sources wiki page, populated by /comms-init.
---

# Check Communications

Scan each communication service the user has configured for new messages since the last check, extract tasks and knowledge, and route findings to the right wiki pages.

This skill is **shape-only**. It does not know about any specific service. It reads its configuration from the user's `comms-sources` wiki page, which was populated by the `/comms-init` skill during onboarding. If you want to add a new service, re-run `/comms-init`.

## Before starting

1. **Load the configuration** — call `wiki_read(wiki: "personal", page: "comms-sources")`. This page contains:
   - The list of services the user has configured
   - For each service: opening instructions, sidebar/list navigation pattern, priority rules (always-check vs if-unread vs skip), extraction targets, scan-tracking timestamps from the last run, and any learnings from previous runs
   - If the page does not exist, stop. Report: "No comms configured — run /comms-init to set up communication services for scanning." Do not continue.
2. **Load the user's work queue** — call `wiki_read(wiki: "personal", page: "tasks-active")`. You need this to avoid duplicating items the user has already committed to.
3. **Load team state** — call `wiki_read(wiki: "personal", page: "team-state")`. You need this to avoid duplicating team members' activity you already know about.
4. **Load user profile** — call `wiki_read(wiki: "personal", page: "user-profile")`. You need this to correctly route "learned something about the user" findings.

Every piece of service-specific knowledge needed for scanning is in `comms-sources`. If you find yourself wanting to hardcode a URL, a sidebar pattern, a chat-name convention, or a priority rule in this skill — stop. That knowledge belongs in `comms-sources` instead, and `/comms-init` is how it gets there.

## The shape of a scan

For each service configured in `comms-sources`:

1. **Open the service** using the instructions written in `comms-sources` for that service. This might involve checking for an existing tab via `mcp__claude-in-chrome__tabs_context_mcp`, creating one if absent, and navigating to the URL the user's configuration specifies.
2. **Respect the priority rules.** `comms-sources` groups channels or conversations into tiers (typically some variant of always-check, check-if-unread, and skip-unless-asked). Process tiers in order. For always-check sources, do not rely on unread indicators — the user may have read the messages themselves. For if-unread sources, skip unless visible unread indicators are present.
3. **For each target being checked**, use the per-service navigation hints in `comms-sources` to reach it. Take a screenshot if that helps you extract structured content. Compare message timestamps against the scan-tracking timestamps stored in `comms-sources` for that target — only process messages newer than the last scan.
4. **Extract findings.** Each message or thread may contain:
   - **Tasks / action items** — anything the user committed to do, was asked to do, or mentioned they'd do
   - **Decisions** — technical or business decisions
   - **Knowledge** — architecture, requirements, domain insight
   - **People context** — new team members, role changes, relationship shifts
5. **Update scan-tracking in `comms-sources`** after processing a target, so the next run knows where to resume. This is an Edit to the `comms-sources` page — use the `/wiki-update` skill.

## Routing findings

After extracting, route each finding to the right wiki page. Use `/wiki-update` for existing pages and `wiki_create` for new ones.

| Finding type | Destination |
|---|---|
| User committed to do it | `tasks-active` (Now or Next section) |
| User mentioned it, not committed | `tasks-active` (Watch section) with `Captured: <date>` |
| User is waiting on someone | `tasks-active` (Blocked section) |
| Someone else's current activity | `team-state` (that person's section) |
| Multi-person thread with no single owner | `team-state` (Active multi-person threads) |
| Something you learned about the user as a person | `user-profile` or `working-preferences`, depending on whether it's structural or an interaction preference |
| Technical decision about the current project | A page in the project wiki (create via `wiki_create` if no existing page fits) |
| New person entering the user's orbit | `people` page (create if absent) |
| Service-specific learning (navigation quirks, priority updates) | `comms-sources` — this is how the skill gets smarter over time |

If a finding doesn't fit any of these, default to `tasks-active` (Watch) or leave it out of the wiki if it's ephemeral noise.

## What to return

After scanning every configured service, return a **brief text summary**: 3 to 5 lines max. Include:

- Total new items found, split by destination page
- Any urgent flags (the user is waiting on something, a deadline is close, a decision is contested)
- Any surprises or things worth the user's attention

**Do NOT include** screenshots, raw message logs, extraction tables, or verbose reasoning in the summary. Those stay in your scanning context and do not propagate to the parent conversation.

If nothing new: say so in one line and stop.

## Self-improvement

When you discover something useful about how to scan a particular service — a better navigation path, a sidebar quirk, a priority insight the user hasn't captured — append it as a note to that service's entry in `comms-sources` via `/wiki-update`. Future runs read those notes and benefit. This is how the skill adapts to real workspaces over time without requiring plugin updates.
```

- [ ] **Step 2: Verify the rewritten skill is clean of matt-head specifics**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/check-comms/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'check-comms') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['description mentions shape-only', /shape-only/i.test(fm.description)],
    ['description mentions comms-sources', /comms-sources/.test(fm.description)],
    ['no Teams references', !/Teams/.test(content)],
    ['no Slack references', !/Slack/.test(content)],
    ['no microsoft.com URL', !/microsoft\\.com/.test(content)],
    ['no slack.com URL', !/slack\\.com/.test(content)],
    ['no Matt reference', !/\\bMatt\\b/.test(content)],
    ['no Together School reference', !/Together School/.test(content)],
    ['no aela wiki references', !/wiki: ['\"]aela['\"]|wiki:aela/.test(content)],
    ['no codebase wiki references', !/wiki: ['\"]codebase['\"]|wiki:codebase/.test(content)],
    ['mentions wiki: personal', /wiki: [\"']personal[\"']/.test(content)],
    ['mentions comms-sources page', /comms-sources/.test(content)],
    ['mentions /comms-init as config path', /\\/comms-init/.test(content)],
    ['mentions /wiki-update for edits', /\\/wiki-update/.test(content)],
    ['handles missing comms-sources', /comms configured|No comms/.test(content)],
  ];
  let failed = 0;
  for (const [label, cond] of checks) {
    if (cond) console.log('ok  ', label);
    else { console.error('FAIL', label); failed++; }
  }
  process.exit(failed > 0 ? 1 : 0);
});
"
```

Expected: all 15 checks print `ok  ...`. The negative checks (no Teams, no Slack, no Matt, no Together School, no microsoft/slack URL, no aela/codebase wiki references) are the critical ones — if any of those fail, there's still matt-head leakage in the skill body.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/check-comms/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): generalise check-comms to shape-only

Aggressive strip pass. The previous check-comms skill was heavy with
Teams + Slack + Together School + matt-head wiki-name specifics.
Rewritten to be pure shape: read comms-sources for all per-service
configuration, scan each enabled service using the instructions
written in that page, extract, classify, route, update.

No hardcoded URLs, no hardcoded service names, no hardcoded priority
rules. Everything service-specific lives in comms-sources, populated
by /comms-init during onboarding. Self-improvement loop documented —
scanning discoveries get written back to comms-sources so future runs
benefit.

The skill errors out gracefully if comms-sources doesn't exist,
pointing the user at /comms-init.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `/wiki-ingest` skill

New skill. Automates the "read a flagged source, decide which wiki page it affects, update that page, mark the source ingested" loop. Completes the Karpathy synthesis flow.

**Files:**
- Create: `plugin/skills/wiki-ingest/SKILL.md`

- [ ] **Step 1: Create `plugin/skills/wiki-ingest/SKILL.md` with this exact content**

```markdown
---
name: wiki-ingest
description: Ingest flagged source documents into the wiki system. Reads superpowers specs, plans, analysis docs, and external wiki directories, decides which wiki page each affects, updates via /wiki-update, and marks the source as ingested in sources.md.
---

# wiki-ingest

Automate the source-to-wiki synthesis loop. The `wiki-maintenance.js` hook flags source documents that need ingestion at session start. This skill is how those sources actually make it into the wiki.

## When to use

- **`/wiki-ingest`** with no argument — process every source flagged by the session-start maintenance hook, in order.
- **`/wiki-ingest <path>`** — process one specific source. Useful when you want to target a single file without touching the others.

Also invoked automatically by the `/turn-end` reflection when un-ingested sources are still pending.

## Inputs

Sources are tracked in the project wiki's `sources.md` at `<project-root>/.aela/wiki/project/raw/sources.md`. The file is YAML. Each entry has:

- `path` — workspace-relative path (e.g. `matt-head/docs/superpowers/specs/2026-04-13-wiki-design.md`)
- `mtime` — file modification time
- `ingested` — boolean; `true` means already processed
- `ingested_at` — date processed (only present if `ingested: true`)
- `notes` — optional one-line description of what happened on ingestion

The hook's session-start report lists sources where `ingested: false` OR where the workspace file exists but no entry in `sources.md` matches its path.

## The flow

For each source you are processing:

1. **Read the source file.** Use the `Read` tool with the absolute path. Workspace-relative source IDs are relative to the directory one level above the current project root (the `WORKSPACE_ROOT`). For example, `matt-head/docs/superpowers/specs/wiki-design.md` from a cwd of `C:/devworkspace/matt-head/` resolves to `C:/devworkspace/matt-head/docs/superpowers/specs/wiki-design.md`. If the source is a `.aela/wiki/` directory (an external wiki), read its `index.md` instead.
2. **Decide which wiki page(s) the source affects.** Ask: "what is this source actually about, and which existing wiki page would benefit from knowing this?" Possibilities:
   - An existing page in the project wiki whose topic overlaps — update it via `/wiki-update`.
   - An existing page in the personal wiki (usually structural — `user-profile`, `team-state`, `people`, `working-preferences`) — update it via `/wiki-update`.
   - No existing page fits — create a new one via `wiki_create` with a meaningful description.
   - Multiple pages are affected — update each one. The "one fact, many homes" rule applies.
   - An external wiki (`.aela/wiki/`) — create a portal page in the local project wiki: body = verbatim copy of the external `index.md`, description = synthesised one-liner filtered through what you know about the user's role and interests from the personal wiki.
3. **Write the updates.** Use `/wiki-update` for existing pages (preserves frontmatter) and `wiki_create` for new ones.
4. **Mark the source as ingested.** Edit `<project-root>/.aela/wiki/project/raw/sources.md` to set `ingested: true` and add `ingested_at: <today>` for the entry. If the source wasn't in `sources.md` yet (it existed on disk but wasn't tracked), append a new entry with `ingested: true`.
5. **Move to the next source.**

## Judgment: which wiki page does a source affect?

- **A design spec or plan** usually affects a page in the **project wiki** about the subsystem or component it's specifying. If no such page exists, create one with a description like "Design and migration notes for X, with the decision points from the 2026-04-13 spec."
- **An analysis doc** (`docs/wiki-ingest/*.md`) could affect either wiki depending on content — a code analysis goes to the project wiki, an invoice-process analysis goes to the personal wiki under `invoices` or similar.
- **An external wiki index** creates a portal page in the project wiki. The portal page's description is where the role-filter happens — it's not a neutral summary, it's "what in this external wiki is likely to matter to this user, given what I know about them."

Err toward updating existing pages over creating new ones. The wiki grows through deepening, not proliferation. Create new pages only when no existing page is a natural home.

## Concurrency

`/wiki-update` uses the Edit tool, which provides optimistic concurrency via `old_string` matching. If another session has modified the target page since you read it, your Edit will throw a clean error. Read the page fresh and retry. Don't try to build a locking mechanism around this — the Edit semantics are sufficient.

## What to return

A brief summary of what was ingested: count by destination page, any new pages created, any surprises. 3-5 lines max. If nothing was ingested (everything was already flagged as ingested, or the file list was empty), say so in one line and stop.
```

- [ ] **Step 2: Verify the new skill parses and has the required sections**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/wiki-ingest/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'wiki-ingest') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['description mentions Karpathy-equivalent loop', /synthesis|ingest/i.test(fm.description)],
    ['has When to use section', /## When to use/.test(content)],
    ['has Inputs section', /## Inputs/.test(content)],
    ['has The flow section', /## The flow/.test(content)],
    ['has Judgment section', /## Judgment/.test(content)],
    ['mentions /wiki-update', /\\/wiki-update/.test(content)],
    ['mentions wiki_create for new pages', /wiki_create/.test(content)],
    ['mentions sources.md path', /sources\\.md/.test(content)],
    ['mentions YAML format for sources', /YAML/.test(content)],
    ['handles external wiki case', /external wiki|\\.aela\\/wiki/i.test(content)],
    ['mentions portal page pattern', /portal page/i.test(content)],
    ['no wiki_write references', !/wiki_write/.test(content)],
    ['no hardcoded Matt references', !/\\bMatt\\b/.test(content)],
    ['no Together School references', !/Together School/.test(content)],
  ];
  let failed = 0;
  for (const [label, cond] of checks) {
    if (cond) console.log('ok  ', label);
    else { console.error('FAIL', label); failed++; }
  }
  process.exit(failed > 0 ? 1 : 0);
});
"
```

Expected: all 14 checks print `ok  ...`.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/wiki-ingest/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): wiki-ingest skill for source synthesis loop

New skill. Automates the source-to-wiki synthesis flow: reads flagged
superpowers specs, plans, analysis docs, and external wiki indexes,
decides which wiki page each affects, updates via /wiki-update (or
wiki_create for new pages), and marks the source as ingested in
sources.md.

Runnable as /wiki-ingest (all flagged) or /wiki-ingest <path>
(targeted). Completes the Karpathy-style wiki synthesis loop — sources
in, wiki pages out, trackable.

Handles the "external wiki" case by creating a portal page in the
project wiki with a role-filtered description (synthesised from what
the personal wiki knows about the user, not a neutral summary).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Integration gate

This task does not write code. It verifies that the four new/updated skills load correctly in Claude Code and can be invoked.

- [ ] **Step 1: Restart Claude Code**

`/exit` and restart. Skills are discovered at session start; new skills are not live until restart.

- [ ] **Step 2: Confirm all four skills are discoverable**

In the new session, the skill list should include:

- `wiki-update`
- `turn-end` (the rich three-step version, superseding matt-head's project-level override)
- `check-comms` (the generalised shape-only version)
- `wiki-ingest`

If any are missing or the descriptions still match the pre-Phase-3a versions, skills weren't picked up — restart again, and if that fails, check `plugin/skills/<name>/SKILL.md` exists and parses.

- [ ] **Step 3: Smoke-test each skill by reading its content**

For each skill above, invoke it lightly or (easier) have Aela read the skill file and confirm the frontmatter description matches what's expected. No need for full end-to-end runs at this gate — those happen when the init skills (Phase 3b) land and actual contract pages exist.

Specifically:

- `/turn-end` — will be triggered automatically at the end of any turn. Observe that the three-step structure is followed (reflect, speak, comms-heal). Reflection Q2 and Q3 should be no-ops because the hook isn't flagging anything new; Q4 should skip silently because `reflections` doesn't exist yet; Q1 should work normally.
- `/wiki-update` — no live test needed at this gate. The skill will be exercised by Phase 3b and beyond.
- `/check-comms` — invoking it should return the "No comms configured — run /comms-init" message because `comms-sources` doesn't exist yet. That IS the expected behaviour and confirms the graceful-degradation path.
- `/wiki-ingest` — no live test needed.

- [ ] **Step 4: Confirm matt-head's project-level `/turn-end` override no longer kicks in**

Since matt-head still has `.claude/skills/turn-end/SKILL.md` from before, the project-level override may still be active depending on skill precedence. Check: does the turn-end that fires match the plugin's content, or matt-head's? If matt-head's is still winning, that's a Phase 6 cleanup item (delete the matt-head override) and not blocking Phase 3a — but note it in the session handoff so it's not forgotten.

- [ ] **Step 5: No commit.**

This task is a verification gate only.

---

## Self-review

**1. Spec coverage.**

Phase 3a scope:

- [x] `/wiki-update` adapted to plugin paths and wiki names — Task 1
- [x] `/turn-end` upgraded to rich three-step with four-question reflection — Task 2
- [x] `/check-comms` aggressively generalised (shape-only) — Task 3
- [x] `/wiki-ingest` new skill for source synthesis — Task 4
- [x] Live integration gate — Task 5

**Not in Phase 3a scope (deferred to Phase 3b, deliberately):**

- `/aela-init` — Phase 3b
- `/wiki-init` — Phase 3b (creates the contract pages the other skills assume)
- `/comms-init` — Phase 3b (creates `comms-sources` which `/check-comms` reads)

**2. Placeholder scan.** No TBDs, no "similar to previous", no hand-waves. Every task prompt contains the full skill body verbatim.

**3. Type consistency.** Wiki names (`personal`, `project`), tool names (`wiki_create`, `wiki_read`, `wiki_update_index`, `/wiki-update`, `/wiki-ingest`), path templates (`~/.claude/aela-plugin/wiki/pages/<page>.md`, `<project-root>/.aela/wiki/project/pages/<page>.md`) are consistent across all four skills. `wiki_write` appears NOWHERE in any skill body — verified by the negative checks.

**4. Graceful absence handling.** Every skill handles the cold-start case where the init skills haven't been run yet:

- `/turn-end` Q4 skips if `reflections` doesn't exist
- `/check-comms` errors gracefully and points at `/comms-init` if `comms-sources` doesn't exist
- `/wiki-ingest` handles the case where `sources.md` doesn't exist yet by treating it as "no sources to ingest"
- `/wiki-update` has no cold-start concerns — it only runs when invoked on an existing page

**5. Two things worth flagging for the implementer.**

- The verification scripts in each task use `cd /c/devworkspace/aela-voice/plugin/hooks && node -e "..."`. This works because `plugin/hooks/node_modules/yaml` was installed in Phase 2. Do not move the verify commands to a different directory without first confirming yaml resolves.
- Task 2 (rich `/turn-end`) completely replaces the existing `plugin/skills/turn-end/SKILL.md`. Use `git show HEAD:skills/turn-end/SKILL.md` first to confirm you're overwriting the minimal voice-only version, not some other file you didn't expect.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-3a-maintenance-skills.md`. Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, inline review on the mechanical paste tasks, final reviewer pass before Task 5.
2. **Inline Execution** — batch with checkpoints, watch live.

**Which approach?**
