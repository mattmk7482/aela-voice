# Phase 3b Implementation Plan — Init Skills + TTS Storage Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three init skills that bootstrap a fresh install — `/aela-init`, `/wiki-init`, `/comms-init` — and the TTS storage migration they depend on. After this phase, running the three skills in order on a clean install produces a working companion with voice, memory, and comms monitoring.

**Architecture:** Five tasks. Task 1 migrates TTS personality and settings storage from the plugin directory to the user state dir (`~/.claude/aela-plugin/`) so `/aela-init` has somewhere meaningful to write. Tasks 2, 3, and 4 are the three init skills as prose files with YAML frontmatter. Task 5 is the live integration gate — the one place in Phase 3b where behaviour is actually tested end-to-end.

**Tech Stack:** Node 20+ ESM, existing `yaml` dep, Chrome browser tools (`mcp__claude-in-chrome__*`), the wiki MCP server from Phase 1, the hooks from Phase 2, the skills from Phase 3a.

**Scope boundary:** Phase 3b does NOT ship `PLUGIN-FEATURES.md` (Phase 4) or rewrite `README.md` (Phase 5). It does NOT migrate matt-head's existing wiki content into the new layout — that's the Phase 6 canary. What it does ship: a working end-to-end onboarding chain on any fresh install, plus the TTS plumbing changes that make it meaningful.

**Reference sources:**
- `C:/devworkspace/aela-voice/plugin/docs/superpowers/specs/2026-04-14-wiki-migration-design.md` — spec; read Storage Architecture, Skills Shipped with the Plugin, and What This Unblocks (the Kevin's-Monday paragraph is the target experience)
- `C:/devworkspace/aela-voice/plugin/mcp-servers/tts/personality.js` — current personality reader, gets refactored in Task 1
- `C:/devworkspace/aela-voice/plugin/mcp-servers/tts/config.js` — current voice/name reader, gets refactored in Task 1
- `C:/devworkspace/aela-voice/plugin/personality/default.yaml` — current template (singular `personality/`, not `personalities/`), gets a `user_name` field added
- `C:/devworkspace/aela-voice/plugin/hooks/session-orient.js` — already reads `~/.claude/aela-plugin/personality.yaml` for the `user_name` field
- `C:/devworkspace/aela-voice/plugin/mcp-servers/wiki/store.js` — `/wiki-init` calls `wikiCreate` here to scaffold contract pages
- `C:/devworkspace/aela-voice/plugin/skills/` — Phase 3a skills for reference on skill file structure

**Decisions locked from the spec:**

1. **Personality template stays at `plugin/personality/default.yaml`** (singular, already correct). The spec was wrong about `personalities/` — fixed in commit `be02223`.
2. **User copy at `~/.claude/aela-plugin/personality.yaml`.** TTS server reads user copy first, template as fallback.
3. **Settings at `~/.claude/aela-plugin/settings.json`.** TTS voice and related settings move here from `plugin/personality/voice.txt` and `~/.claude/settings.json` pluginConfigs.
4. **`user_name` is a field in `personality.yaml`.** Single source of truth — both session-orient.js (Phase 2) and the TTS server (this phase) read it from there.
5. **Three-question onboarding.** `/aela-init` asks only: name, voice, one-line work description. Everything else is learned via ongoing observation — the spec's Goal #8.
6. **Eight contract pages created by `/wiki-init`.** `tasks-active`, `team-state`, `working-preferences`, `user-profile`, `reflections`, `comms-sources`, plus both wiki indexes (auto-generated from `wikiCreate` calls).
7. **`/comms-init` is socratic, not declarative.** The agent opens each service in a Chrome tab, explores the UI, asks the user pointed questions, writes findings into `comms-sources` as structured prose per service.
8. **All three init skills chain.** `/aela-init` offers `/wiki-init` at the end; `/wiki-init` offers `/comms-init` at the end. Each skill is also runnable standalone for re-configuration later.

---

## File Structure

```
plugin/
├── mcp-servers/
│   └── tts/
│       ├── personality.js          # Modified — read user copy first, fallback to template
│       └── config.js               # Modified — read settings.json from user state dir
├── personality/
│   └── default.yaml                # Modified — add user_name field at top level
└── skills/
    ├── aela-init/
    │   └── SKILL.md                # NEW
    ├── wiki-init/
    │   └── SKILL.md                # NEW
    └── comms-init/
        └── SKILL.md                # NEW
```

---

## Task 1: TTS storage migration

Move personality and voice storage from the plugin directory to the user state dir. After this task, the TTS server reads from `~/.claude/aela-plugin/personality.yaml` and `~/.claude/aela-plugin/settings.json` if present, falling back to the plugin template and defaults otherwise.

**Files:**
- Modify: `plugin/mcp-servers/tts/personality.js`
- Modify: `plugin/mcp-servers/tts/config.js`
- Modify: `plugin/personality/default.yaml`

- [ ] **Step 1: Add `user_name` field to the template**

Open `plugin/personality/default.yaml`. Add `user_name: ""` as a new top-level field at the very top, before `companionName`:

```yaml
user_name: ""
companionName: Aela
personality: |
  IMPORTANT: The personality defined below takes precedence...
  (existing content unchanged)
```

The empty string is the default — it signals "not yet set, /aela-init will fill this in." Keep every existing line of the template (the `companionName` line, the entire `personality: |` block with all placeholders) exactly as it was.

- [ ] **Step 2: Rewrite `mcp-servers/tts/personality.js`**

Replace the entire contents of `plugin/mcp-servers/tts/personality.js` with:

```js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import YAML from 'yaml';

const USER_STATE_DIR = join(homedir(), '.claude', 'aela-plugin');
const USER_PERSONALITY_PATH = join(USER_STATE_DIR, 'personality.yaml');

/**
 * Resolve the personality file path — user copy if present, plugin template otherwise.
 */
function personalityPath(pluginRoot) {
  if (existsSync(USER_PERSONALITY_PATH)) return USER_PERSONALITY_PATH;
  return join(pluginRoot, 'personality', 'default.yaml');
}

/**
 * Parse the personality YAML — user copy or template.
 */
export function readPersonality(pluginRoot) {
  const doc = YAML.parse(readFileSync(personalityPath(pluginRoot), 'utf-8'));
  return {
    userName: doc?.user_name || '',
    companionName: doc?.companionName ?? 'Aela',
    personality: doc?.personality ?? '',
  };
}

/**
 * Write personality YAML back to disk. Always writes the user copy — never touches the template.
 * If the user copy doesn't exist yet, creates it by writing the passed values.
 */
export function writePersonality(pluginRoot, { userName, companionName, personality }) {
  const doc = { user_name: userName || '', companionName, personality };
  writeFileSync(USER_PERSONALITY_PATH, YAML.stringify(doc), 'utf-8');
}

/**
 * Build the final personality text with placeholders resolved.
 * If userName is not passed, reads it from the personality file.
 */
export function buildPersonality(pluginRoot, userName) {
  const { userName: fileUserName, companionName, personality } = readPersonality(pluginRoot);
  const name = userName || fileUserName || 'friend';
  return personality
    .replace(/\{\{companionName\}\}/g, companionName)
    .replace(/\{\{userName\}\}/g, name);
}
```

Three changes from the current version:
1. `personalityPath` resolver picks user copy if present, template otherwise
2. `readPersonality` returns `userName` alongside `companionName` and `personality`
3. `writePersonality` always writes to the user copy (creates it if absent), never touches the shipped template

- [ ] **Step 3: Update `mcp-servers/tts/config.js`**

Replace the entire contents of `plugin/mcp-servers/tts/config.js` with:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const DEFAULT_VOICE = 'aela-default';
const USER_STATE_DIR = join(homedir(), '.claude', 'aela-plugin');
const USER_SETTINGS_PATH = join(USER_STATE_DIR, 'settings.json');
const USER_PERSONALITY_PATH = join(USER_STATE_DIR, 'personality.yaml');

/**
 * Read the user's settings.json from the user state dir.
 * Returns an empty object if the file doesn't exist.
 */
function readSettings() {
  if (!existsSync(USER_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(USER_SETTINGS_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Write settings.json to the user state dir. Creates the dir if absent.
 */
function writeSettings(settings) {
  mkdirSync(USER_STATE_DIR, { recursive: true });
  writeFileSync(USER_SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
}

/**
 * Read plugin config from Claude Code's settings.json for legacy fallback.
 * Searches pluginConfigs for any key matching "aela-voice@*".
 */
function loadLegacyPluginConfig() {
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const configs = settings.pluginConfigs ?? {};
    const key = Object.keys(configs).find(k => k.startsWith('aela-voice@'));
    return key ? (configs[key].options ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * Get TTS server URL.
 * Priority: user settings.json → env var → legacy pluginConfig → default.
 */
export function getTtsUrl() {
  const userSettings = readSettings();
  if (userSettings.ttsServerUrl) return userSettings.ttsServerUrl;
  if (process.env.AELA_TTS_URL) return process.env.AELA_TTS_URL;
  const legacy = loadLegacyPluginConfig();
  return legacy.ttsServerUrl ?? 'http://localhost:8020';
}

/**
 * Get the user's name.
 * Priority: personality.yaml user_name → legacy pluginConfig → 'friend'.
 */
export function getUserName() {
  if (existsSync(USER_PERSONALITY_PATH)) {
    try {
      const content = readFileSync(USER_PERSONALITY_PATH, 'utf-8');
      const match = content.match(/^user_name:\s*["']?([^"'\n]*?)["']?\s*$/m);
      if (match && match[1]) return match[1];
    } catch { /* fall through */ }
  }
  const legacy = loadLegacyPluginConfig();
  return legacy.userName ?? 'friend';
}

/**
 * Get the active voice.
 * Priority: user settings.json → legacy plugin/personality/voice.txt → default.
 */
export function getVoice(pluginRoot) {
  const userSettings = readSettings();
  if (userSettings.voice) return userSettings.voice;
  try {
    return readFileSync(join(pluginRoot, 'personality', 'voice.txt'), 'utf-8').trim() || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

/**
 * Set the active voice in user settings.json.
 */
export function setVoice(pluginRoot, voice) {
  const settings = readSettings();
  settings.voice = voice;
  writeSettings(settings);
}
```

Three behavioural changes from the current version:
1. `getUserName` reads from `personality.yaml` first, with the legacy `pluginConfigs` fallback preserved so existing installs keep working
2. `getVoice` reads from `settings.json` first, with the legacy `plugin/personality/voice.txt` fallback preserved
3. `setVoice` now always writes to `settings.json` in the user state dir (no more `voice.txt` writes)

Legacy reads are preserved so existing Matt's install keeps working until Phase 6 migration. Writes always go to the new location.

- [ ] **Step 4: Smoke-test the TTS server still loads**

```bash
cd /c/devworkspace/aela-voice/plugin/mcp-servers/tts && node --check server.js && node --check personality.js && node --check config.js && echo "syntax ok"
```

Expected: `syntax ok` and exit 0.

Also verify the session-start hook's personality-build chain still works by simulating it:

```bash
cd /c/devworkspace/aela-voice/plugin && node -e "
import('./mcp-servers/tts/personality.js').then(async ({buildPersonality}) => {
  import('./mcp-servers/tts/config.js').then(async ({getUserName}) => {
    const personality = buildPersonality(process.cwd(), getUserName());
    if (!personality || personality.length < 100) {
      console.error('FAIL: personality text empty or too short');
      process.exit(1);
    }
    if (!/Aela/.test(personality)) {
      console.error('FAIL: companionName not resolved');
      process.exit(1);
    }
    console.log('ok   personality build chain works');
  });
});
"
```

Expected: `ok   personality build chain works`. This confirms:
- Template is readable
- `readPersonality` returns the parsed doc
- `buildPersonality` substitutes placeholders
- `getUserName` falls back correctly when `~/.claude/aela-plugin/personality.yaml` doesn't exist (which it doesn't yet on Matt's install)

- [ ] **Step 5: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add mcp-servers/tts/personality.js mcp-servers/tts/config.js personality/default.yaml && git commit -m "$(cat <<'EOF'
feat(tts): migrate personality and settings to user state dir

Shifts the source of truth for personality and TTS settings from
the plugin directory to ~/.claude/aela-plugin/. The template at
plugin/personality/default.yaml remains as the shipped default;
/aela-init (Phase 3b Task 2) will copy it to the user state dir
on first run.

Three code changes:

1. personality.js — readPersonality now resolves user copy first
   (~/.claude/aela-plugin/personality.yaml), falls back to the
   plugin template. writePersonality always writes to the user
   copy, never touches the template. buildPersonality exposes
   userName from the personality file directly, falling back to
   the passed arg or 'friend'.

2. config.js — getUserName reads user_name from personality.yaml
   first, with the legacy pluginConfigs fallback preserved.
   getVoice reads from user settings.json first, with the legacy
   personality/voice.txt fallback preserved. setVoice writes
   only to settings.json going forward.

3. personality/default.yaml — adds user_name: "" at the top so
   the template and user copy share the same schema.

Legacy read paths kept so Matt's existing install keeps working
until Phase 6 migration. Writes go to the new location.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `/aela-init` skill

Three-question onboarding. Creates the user state dir, copies the personality template with `user_name` filled in, writes `settings.json` with voice selection, tests TTS aloud, offers to chain into `/wiki-init`.

**Files:**
- Create: `plugin/skills/aela-init/SKILL.md`

- [ ] **Step 1: Create `plugin/skills/aela-init/SKILL.md` with this exact content**

```markdown
---
name: aela-init
description: First-run identity and voice onboarding. Three questions (name, voice, work), creates ~/.claude/aela-plugin/ with personality.yaml and settings.json, tests TTS aloud, offers to chain into /wiki-init. Also the re-run target for personality template refreshes.
---

# aela-init

First-run onboarding. Ask three questions, write them to the user state dir, speak out loud to confirm voice works, offer to continue with `/wiki-init`.

This skill is also how users re-run the template refresh when a plugin update ships a new personality template — re-invoking shows the user the template delta and asks what to merge.

## Before starting

Check whether `~/.claude/aela-plugin/personality.yaml` already exists:

- **If it doesn't exist** — this is a first run. Proceed with the three-question flow below.
- **If it exists** — this is a re-run. Show the user a summary of what's currently configured (user_name, voice, any other fields) and ask whether they want to update one of the fields, refresh against the shipped template, or cancel. Re-running should never silently overwrite anything.

## The three questions

Ask them one at a time, not as a bundle. Wait for a genuine answer before moving to the next.

### Question 1 — What should I call you?

Open-ended. The user types a name. Trim whitespace. Don't validate beyond "is it non-empty." The name gets stored as the `user_name` field in `personality.yaml` and is what the session-orient hook injects as "User is called X" on subsequent sessions.

### Question 2 — Which voice should I use?

Call `list_voices` (the TTS MCP tool) to get the available voices on the configured TTS server. Present them to the user as a list. Ask them to pick one. If they're not sure, default to `aela-default` (the shipped voice) and say so.

Once selected, call `set_voice` with the chosen voice name. This writes to `~/.claude/aela-plugin/settings.json` via the updated TTS config.

### Question 3 — What kind of work do you do?

Open-ended, one-line answer. Something like "I'm a backend engineer at a small team" or "I run the operations side of a marketing agency." Don't drill in — this is a seed, not an interview. The answer helps you (the companion) understand the user's day-to-day so your reflections and suggestions can be calibrated from the first turn. You'll learn more over time through observation.

Store the answer as prose inside the `user-profile` contract page when `/wiki-init` runs next (the user-profile page doesn't exist yet at this point — `/wiki-init` creates it). Hold the answer in context and pass it to `/wiki-init` as the seed content for `user-profile`.

## Write the user state

After all three answers are in hand:

1. **Create the user state directory** — `~/.claude/aela-plugin/` if it doesn't exist yet. Use the `Bash` tool: `mkdir -p ~/.claude/aela-plugin`. Resolve `~` to an absolute path first.
2. **Copy the personality template.** Read `<plugin-root>/personality/default.yaml` (via the `Read` tool). The plugin root is available as `${CLAUDE_PLUGIN_ROOT}` in the environment. The file has three top-level keys: `user_name`, `companionName`, `personality`.
3. **Set `user_name`** to the answer from Question 1 using the Edit tool on the in-memory copy before writing. Or equivalently: call the TTS MCP tool `update_personality` if it exposes a user_name write path. The simplest path is: use the Bash tool to run a small Node one-liner that uses the TTS personality.js `writePersonality` export to write the file with the new user_name field. If that feels too indirect, write the file directly: `yaml.stringify({ user_name: "<name>", companionName: "Aela", personality: "<body>" })` and write the string with Bash.
4. **Write `settings.json`** — either via `setVoice` (the TTS MCP tool `set_voice` calls this) or by writing `~/.claude/aela-plugin/settings.json` directly with `{ "voice": "<selected-voice>" }`.

## Test the voice

Call `speak` with a short confirmation: "Nice to meet you, <name>. Let me know if the voice is alright or if you want to try a different one." The user will hear this aloud. If they want a different voice, re-run Question 2.

## Offer the chain

After the voice test lands, tell the user:

> "Next I can set up your wiki memory — that's where I hold everything I'll learn about your work across sessions. Want to run `/wiki-init` now? (You can also run it later whenever you're ready.)"

If they say yes, invoke `/wiki-init` via the Skill tool. If they say no or defer, end the skill cleanly with a brief confirmation.

## What to return

A brief summary (2-3 lines): user_name set, voice chosen, state dir created. If the chain into `/wiki-init` was accepted, say so. If declined, note that `/wiki-init` is available anytime.

Do NOT return verbose logs, voice test audio details, or step-by-step output. This is onboarding — terse and friendly beats thorough.
```

- [ ] **Step 2: Verify the skill file**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/aela-init/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'aela-init') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['description mentions three questions', /three/i.test(fm.description)],
    ['has re-run branch', /re-run/i.test(content)],
    ['has Question 1 name', /### Question 1/.test(content)],
    ['has Question 2 voice', /### Question 2/.test(content)],
    ['has Question 3 work', /### Question 3/.test(content)],
    ['mentions list_voices', /list_voices/.test(content)],
    ['mentions set_voice', /set_voice/.test(content)],
    ['mentions user_name field', /user_name/.test(content)],
    ['mentions personality.yaml path', /personality\\.yaml/.test(content)],
    ['mentions settings.json path', /settings\\.json/.test(content)],
    ['mentions /wiki-init chain', /\\/wiki-init/.test(content)],
    ['no Matt reference', !/\\bMatt\\b/.test(content)],
    ['no Together School', !/Together School/.test(content)],
    ['no Kevin reference', !/\\bKevin\\b/.test(content)],
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
cd /c/devworkspace/aela-voice/plugin && git add skills/aela-init/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): aela-init first-run onboarding skill

Three-question identity and voice setup. Asks the user's name, voice
preference, and a one-line work description. Writes user_name to
~/.claude/aela-plugin/personality.yaml (copying from the plugin's
shipped template) and the selected voice to settings.json. Tests
the voice aloud via speak. Offers to chain into /wiki-init.

Also serves as the re-run target for personality template refreshes
in future plugin versions — never silently overwrites existing state.

The "what kind of work" answer is held in context and passed to
/wiki-init as the seed content for the user-profile contract page,
which /wiki-init creates in the next step of the chain.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `/wiki-init` skill

Wiki bootstrap. Creates the directory structure, scaffolds the eight contract pages, regenerates both indexes, scans for ingestable sources, offers to chain into `/comms-init`.

**Files:**
- Create: `plugin/skills/wiki-init/SKILL.md`

- [ ] **Step 1: Create `plugin/skills/wiki-init/SKILL.md` with this exact content**

```markdown
---
name: wiki-init
description: Wiki bootstrap for first-run installs. Creates personal and project wiki directories, scaffolds the six named contract pages via wiki_create, regenerates both indexes, scans the project for ingestable sources, and offers to chain into /comms-init.
---

# wiki-init

Bootstrap the wiki memory layer. Run this on a fresh install (or when a project doesn't have a wiki yet) to create the directory structure and scaffold the contract pages other skills assume exist.

## Before starting

Check whether either wiki already exists:

- **Personal wiki** — `~/.claude/aela-plugin/wiki/`. If the directory exists and has pages, this is a re-run or partial install. Don't recreate — preserve what's there.
- **Project wiki** — `<project-root>/.aela/wiki/project/`. Same check: if it exists, don't recreate.

If both already exist, this is a re-run. Show the user a summary of what's configured (count of pages in each wiki, which contract pages exist, which are missing) and ask whether they want to repair missing contract pages, add a new project to the personal wiki's knowledge, or cancel.

## Contract pages

The plugin's hooks and skills depend on six named contract pages in the personal wiki, plus the two auto-generated indexes. Your job is to create all six via `wiki_create` with meaningful starter content — empty-enough to not pollute but structured-enough to guide what goes where.

All six live in the personal wiki (`wiki: "personal"`):

1. **`tasks-active`** — the user's committed work queue. Sections: Now, Next, Blocked, Watch, Done. Category: `project`.
2. **`team-state`** — per-person tracking of what colleagues are currently working on. One section per person (populated over time), plus an "Active multi-person threads" section. Category: `context`.
3. **`working-preferences`** — how the user wants to be worked with. Tone, autonomy level, when to push back, when to ask before doing. Category: `preference`.
4. **`user-profile`** — structural info about the user: role, responsibilities, relationships, stable traits. This is where the work-description seed from `/aela-init` goes. Category: `person`.
5. **`reflections`** — user-specific extensions to the turn-end worth-persisting criteria. What to watch for beyond the baseline, calibrated to the user's day-to-day work. Category: `preference`.
6. **`comms-sources`** — per-service configuration for `/check-comms`. Left empty or as a placeholder with a "configured by /comms-init" note. Category: `context`.

For each page, call `wiki_create` with:
- `wiki: "personal"`
- `page: "<name>"` (the name above, lowercase-hyphenated)
- `title: "<Title Case Name>"`
- `category: "<category above>"`
- `description: "<one-sentence summary — see below>"`
- `body: "<starter content — see below>"`

### Starter descriptions

These are the description fields that will appear in the personal wiki index. Write them so a future session can decide whether to drill in without opening the page:

- `tasks-active` — "The user's committed work queue with Now/Next/Blocked/Watch/Done sections — session-orient injects this in full, so check it first before asking what the user is working on."
- `team-state` — "Per-person tracking of what people in the user's orbit are currently doing, plus active multi-person threads — session-orient injects this in full."
- `working-preferences` — "How the user wants to be worked with — tone, autonomy level, when to push back. Read at turn-end Question 3 when deciding whether an interaction preference update is warranted."
- `user-profile` — "Structural info about the user — role, responsibilities, stable traits. Slow-changing. Updated only when something load-bearing shifts."
- `reflections` — "User-specific extensions to the turn-end worth-persisting criteria. Read at turn-end Question 1 alongside the baseline, and grown by turn-end Question 4 when a new recurring category becomes visible."
- `comms-sources` — "Per-service configuration for /check-comms — which services, which channels, priority rules, navigation hints, scan-tracking timestamps. Populated by /comms-init, grown by /check-comms as it learns."

### Starter bodies

Keep them short. Each page gets section headers with a one-line "this section is for X" comment beneath, no actual entries.

**`tasks-active`** body:
```
## Now

_(tasks the user is actively working on right now)_

## Next

_(tasks queued for after the current focus)_

## Blocked

_(tasks waiting on someone or something — include who/what we're waiting on)_

## Watch

_(things the user mentioned but didn't commit to — kept here to see if they surface again)_

## Done

_(recently completed tasks — kept briefly so cross-references have context, then aged out)_
```

**`team-state`** body:
```
## Active multi-person threads

_(conversations involving several people that are worth tracking as a thread rather than per-person)_

## People

_(one section per person — added as people enter the user's orbit)_
```

**`working-preferences`** body:
```
## Tone

_(how the user wants me to respond — directness, brevity, formality)_

## Autonomy

_(when to proceed without asking vs when to ask first)_

## Push-back

_(what kinds of disagreement the user welcomes vs what kinds feel like obstruction)_

## Drafts and approvals

_(what requires a draft-then-approve flow vs what can just be done)_
```

**`user-profile`** body — seed this with the answer from `/aela-init`'s Question 3 if provided:
```
## Role

_(the user's one-line work description — seeded from /aela-init)_

<insert Question 3 answer here if /aela-init passed it>

## Responsibilities

_(the major areas of work the user owns, filled in over time)_

## Relationships

_(how the user relates to their team, their org, their customers — learned through observation)_
```

**`reflections`** body:
```
## Watch list

_(user-specific categories to check at turn-end Question 1, beyond the role-neutral baseline. Grown by turn-end Question 4 when a new recurring category becomes visible. Filter: would this appear on the user's job spec if job specs were honest?)_
```

**`comms-sources`** body:
```
_(This page is populated by /comms-init. Run /comms-init to configure which communication services to scan and how.)_
```

## Create the directories and pages

After scaffolding the contract pages above, also call `wiki_update_index` on both wikis:

```
wiki_update_index(wiki: "personal")
wiki_update_index(wiki: "project")
```

The project wiki has no contract pages yet — `wiki_update_index("project")` regenerates an empty-ish index that session-orient can read without erroring.

## Create docs/wiki-ingest/

The maintenance hook looks for ingestable markdown under `docs/wiki-ingest/` in the user's project. Create that directory if absent:

```
mkdir -p <project-root>/docs/wiki-ingest
```

Leave it empty — users populate it with analysis docs they want the companion to ingest.

## Scan for pre-existing sources

Run the maintenance hook discovery once to see if the user already has superpowers specs/plans or analysis docs in the workspace. The hook's script is at `${CLAUDE_PLUGIN_ROOT}/hooks/wiki-maintenance.js`. Run it via Bash and capture the output:

```
node ${CLAUDE_PLUGIN_ROOT}/hooks/wiki-maintenance.js
```

If it reports flagged sources, tell the user: "I found <N> source documents in your workspace that could be ingested into the wiki. Run `/wiki-ingest` when you're ready to bring them in, or `/wiki-ingest <path>` to target one specifically."

If it reports nothing, say so and move on.

## Offer the chain

After the wiki is set up, offer:

> "Next I can set up comms monitoring — I'll walk through whichever services you use (Teams, Slack, email, whatever) and configure the scan. Want to run `/comms-init` now? (You can also run it later whenever you're ready.)"

If yes, invoke `/comms-init` via the Skill tool. If no, end the skill cleanly.

## What to return

A brief summary (3-4 lines): personal wiki created at its path, project wiki created at its path, contract pages scaffolded (list them briefly), sources flagged (count or "none"), chain offered.
```

- [ ] **Step 2: Verify the skill file**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/wiki-init/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'wiki-init') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['mentions all six contract pages',
      /tasks-active/.test(content) && /team-state/.test(content) && /working-preferences/.test(content) &&
      /user-profile/.test(content) && /reflections/.test(content) && /comms-sources/.test(content)],
    ['mentions wiki_create', /wiki_create/.test(content)],
    ['mentions wiki_update_index', /wiki_update_index/.test(content)],
    ['mentions docs/wiki-ingest', /docs\\/wiki-ingest/.test(content)],
    ['mentions /wiki-ingest chain option', /\\/wiki-ingest/.test(content)],
    ['mentions /comms-init chain', /\\/comms-init/.test(content)],
    ['mentions personal wiki path', /~\\/\\.claude\\/aela-plugin\\/wiki|personal wiki/i.test(content)],
    ['mentions project wiki path', /project\\/\\.aela\\/wiki\\/project|project wiki/i.test(content)],
    ['has re-run branch', /re-run/i.test(content)],
    ['no Matt reference', !/\\bMatt\\b/.test(content)],
    ['no Together School', !/Together School/.test(content)],
    ['no Kevin reference', !/\\bKevin\\b/.test(content)],
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

Expected: all 12 checks pass.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/wiki-init/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): wiki-init bootstrap skill for fresh installs

Creates the personal and project wiki directories, scaffolds the six
named contract pages (tasks-active, team-state, working-preferences,
user-profile, reflections, comms-sources) via wiki_create with
starter descriptions and section-header-only bodies, regenerates
both indexes, creates docs/wiki-ingest/ in the project, scans for
pre-existing ingestable sources, and offers to chain into /comms-init.

Honours a seed user-profile Role section from /aela-init's Question 3
answer if passed. Re-runnable without destroying existing state.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `/comms-init` skill

Socratic comms onboarding. Walk through each service the user uses, explore each one via Chrome tools, ask pointed questions, write everything to `comms-sources`.

**Files:**
- Create: `plugin/skills/comms-init/SKILL.md`

- [ ] **Step 1: Create `plugin/skills/comms-init/SKILL.md` with this exact content**

```markdown
---
name: comms-init
description: Socratic comms onboarding. Walks through every communication service the user uses, opens each in a Chrome tab, explores the UI visually, asks pointed questions about priorities and navigation, and writes everything to the user's comms-sources wiki page as structured per-service prose. Re-run to add a new service later.
---

# comms-init

Configure comms monitoring by having an actual conversation with the user about what they use and what matters. No templates, no static service adapters — this skill is where the per-user, per-service knowledge gets captured, one pointed question at a time.

The output lives in `comms-sources` in the personal wiki. Future `/check-comms` runs read that page and scan accordingly. As `/check-comms` learns more about each service, it writes learnings back to the same page — so `comms-sources` grows smarter over time and this skill is only needed for the initial configuration and for adding new services.

## Before starting

1. **Check prerequisites.** `/wiki-init` must have run already — `comms-sources` needs to exist as a page (created empty by `/wiki-init`). If it doesn't exist, tell the user: "I need to run `/wiki-init` first to set up the wiki layer. Want me to do that now?" and invoke `/wiki-init` on yes, or stop on no.
2. **Check for Chrome availability.** This skill is Chrome-driven. Call `tabs_context_mcp` to see if the extension is reachable. If it errors, tell the user: "I need the Chrome extension active for this skill — can you start Chrome and check that the extension is installed?" and stop until they confirm.
3. **Re-run detection.** Read `comms-sources` via `wiki_read(wiki: "personal", page: "comms-sources")`. If it already has service sections configured, show the user what's there and ask whether they want to add a new service, update an existing one, or cancel. Re-running should never silently blow away prior configuration.

## The socratic flow

Ask open-ended questions one at a time. Write as you go — don't batch everything into a single wiki_update at the end. Each service's configuration is its own section in `comms-sources`, added incrementally.

### Opening question

> "What communication services do you use for work? It can be anything — corporate chat like Teams or Slack, email, project management tools like Linear or Jira, or anything else I can open in a browser and scan visually. List them all and we'll walk through each one."

Take the list. For each service in turn, do the per-service walk below.

### Per-service walk

For each service the user named:

**Step A — Open it.** Call `tabs_create_mcp` with the service's URL. If the user didn't give a URL, ask ("What URL do you use for <service>?"). Wait for the page to load. If the user needs to log in, tell them: "I'll pause here while you log in — let me know when you're ready."

**Step B — Explore the UI.** Once logged in, take a screenshot via `browser_take_screenshot` (or the equivalent tool). Read the page visually. Identify the sidebar, the main content area, the navigation pattern. Don't guess — actually look at what's there.

**Step C — Ask what matters.** Pointed questions, one at a time:

- "Which <channels / chats / inboxes / lists> do you actually care about on this service? Walk me through them briefly." — Get the user to name the targets that matter.
- For each target: "Is this one I should always check, or only check when you've got unread messages?" — priority tier.
- "What am I looking for when I scan this one?" — the extraction target. Tasks? Decisions? Pipeline signal? Questions from someone specific?
- "Is there anything about the UI or how this service works that would trip me up if I didn't know about it?" — user hands you the gotchas.
- "Anything here you explicitly don't want me scanning?" — exclusions.

Don't read from a form. Read from the actual page you're looking at. If you see something you don't understand, ask.

**Step D — Write the section.** Once you have enough to write the per-service configuration, Edit the `comms-sources` page via `/wiki-update` to add a new section for this service. The section structure:

```
## <Service Name>

**Opening:** <URL or instructions for opening the service in a Chrome tab>

**Navigation:** <what the sidebar looks like, how to reach each target type, any quirks the user flagged>

**Priority tiers:**

- **Always check:** <targets the user named as always-check, with one-line reason for each>
- **Check if unread:** <targets the user named as conditional>
- **Skip unless asked:** <anything the user explicitly doesn't want scanned>

**Extraction targets:** <what to look for when scanning — tasks, decisions, specific people's activity, whatever>

**Scan tracking:** <placeholder for per-target timestamps, filled in by /check-comms>

**Learnings:** <empty placeholder — /check-comms writes discoveries here over time>
```

Use `/wiki-update` to append the new section to the page. Preserve any existing sections from other services — the page grows by accumulation.

**Step E — Move on.** Say "OK, <service> is configured. Moving on to the next one." Proceed to the next service in the list.

## After all services

Once every service the user listed has its own section in `comms-sources`, re-read the page and confirm it parses cleanly (sections have the expected structure, no duplicates). Show the user a terse summary: "Configured: <list of services>. You can run `/check-comms` now and it'll scan each one using what I just learned. Re-run `/comms-init` anytime to add a new service."

## What to return

3-5 lines: list of configured services, any notable gotchas the user flagged, whether the user wants to run `/check-comms` immediately.

Do NOT return screenshots, raw page text, or verbose exploration logs. The visual context stays in your scanning turn — only the distilled configuration makes it to `comms-sources`.

## Adding a new service later

Re-running `/comms-init` on an already-configured install is the expected way to add a new service. The skill detects the existing configuration and asks which service to add, then walks through just that one service without touching the others.
```

- [ ] **Step 2: Verify the skill file**

```bash
cd /c/devworkspace/aela-voice/plugin/hooks && node -e "
import('yaml').then(async ({default: YAML}) => {
  const fs = await import('fs');
  const content = fs.readFileSync('../skills/comms-init/SKILL.md', 'utf-8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) { console.error('FAIL: no frontmatter'); process.exit(1); }
  const fm = YAML.parse(match[1]);
  if (fm.name !== 'comms-init') { console.error('FAIL: wrong name'); process.exit(1); }
  const checks = [
    ['description mentions socratic', /socratic/i.test(fm.description)],
    ['has opening question section', /## The socratic flow|Opening question/.test(content)],
    ['has per-service walk', /Per-service walk/.test(content)],
    ['mentions tabs_create_mcp', /tabs_create_mcp/.test(content)],
    ['mentions browser_take_screenshot or equivalent', /screenshot/i.test(content)],
    ['mentions comms-sources', /comms-sources/.test(content)],
    ['mentions /wiki-update for writes', /\\/wiki-update/.test(content)],
    ['mentions /wiki-init prerequisite', /\\/wiki-init/.test(content)],
    ['no hardcoded Teams URL', !/teams\\.microsoft\\.com/.test(content)],
    ['no hardcoded Slack URL', !/slack\\.com/i.test(content)],
    ['has re-run branch', /re-run/i.test(content)],
    ['no Matt reference', !/\\bMatt\\b/.test(content)],
    ['no Together School', !/Together School/.test(content)],
    ['no Kevin reference', !/\\bKevin\\b/.test(content)],
    ['mentions priority tiers structure', /always check|Always check/.test(content)],
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

Expected: all 15 checks pass.

- [ ] **Step 3: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add skills/comms-init/SKILL.md && git commit -m "$(cat <<'EOF'
feat(skills): comms-init socratic onboarding for comms monitoring

New skill. Walks through every communication service the user uses,
opens each in a Chrome tab via the mcp__claude-in-chrome tools, takes
screenshots to actually look at the UI, asks pointed questions about
priorities and navigation, and writes everything to comms-sources as
structured per-service prose.

No hardcoded service names, no service-specific templates. The skill
reads whatever service the user names, explores the actual page it
sees, and builds configuration from that — including gotchas the
user flags and exclusions the user wants respected.

Re-runnable to add new services later without destroying existing
configuration. Requires /wiki-init to have run first (comms-sources
needs to exist as a page).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Integration gate

Human verification. Does the end-to-end chain actually work on a fresh install?

- [ ] **Step 1: Create a clean test state**

```
# In a fresh shell, back up any existing user state dir
if [ -d ~/.claude/aela-plugin ]; then
  mv ~/.claude/aela-plugin ~/.claude/aela-plugin.backup-$(date +%Y%m%d%H%M%S)
fi
```

This ensures you're testing a first-run experience, not a re-run.

- [ ] **Step 2: Restart Claude Code**

`/exit` and restart. Skills cache repopulates at session start.

- [ ] **Step 3: Verify skill discovery**

In the new session, confirm all three new skills appear in the skill list:
- `aela-init`
- `wiki-init`
- `comms-init`

Also confirm the TTS changes from Task 1 didn't break anything — the session-start hook should still emit the personality injection as before (voice still works, the personality text renders with `{{userName}}` substituted to whatever `getUserName()` returns, which falls back to `friend` since no user copy exists yet).

- [ ] **Step 4: Run `/aela-init`**

Invoke `/aela-init`. Answer the three questions:
- Name: your actual name
- Voice: pick any voice from the list (or accept `aela-default`)
- Work: a one-liner about what you do

At the end, confirm:
- `~/.claude/aela-plugin/personality.yaml` exists and has `user_name: "<your name>"`
- `~/.claude/aela-plugin/settings.json` exists and has `"voice": "<chosen voice>"`
- You heard a voice confirmation

Accept the chain into `/wiki-init`.

- [ ] **Step 5: `/wiki-init` runs automatically from the chain**

Confirm:
- `~/.claude/aela-plugin/wiki/pages/` contains six `.md` files (the six contract pages)
- `~/.claude/aela-plugin/wiki/index.md` exists and lists all six
- `.aela/wiki/project/` exists under the current project
- `docs/wiki-ingest/` exists in the current project
- Any flagged sources are reported to you by name

Accept the chain into `/comms-init`.

- [ ] **Step 6: `/comms-init` runs**

Walk through the socratic flow for at least one service you actually use. Confirm:
- A Chrome tab opens to the service you name
- Screenshots are taken and you're asked pointed questions
- After answering, `comms-sources` gets a new section written via `/wiki-update`
- `wiki_read(wiki: "personal", page: "comms-sources")` returns the new section content

- [ ] **Step 7: Restart Claude Code once more**

`/exit` and restart. On the new session, verify:
- `session-orient.js` now injects a `User is called <your name>` line (because `personality.yaml` has `user_name` set)
- The personal wiki index shows all six contract pages
- The orientation section shows the five always-injected pages populated (even if the content is still mostly placeholder — the sections exist)
- `wiki-maintenance.js` no longer flags `comms-sources` as missing (it was created during `/wiki-init`)

- [ ] **Step 8: Smoke-test `/check-comms`**

Invoke `/check-comms`. It should now succeed — reads `comms-sources`, walks the configured service(s), reports findings (or "nothing new"). If it returns "No comms configured", something went wrong in `/comms-init` — investigate.

- [ ] **Step 9: No commit**

This task is verification-only.

- [ ] **Step 10 (optional cleanup): Restore prior state if this was a throwaway test**

If the test was on a clean fresh-install test state and you want to go back to your actual state:

```
rm -rf ~/.claude/aela-plugin
mv ~/.claude/aela-plugin.backup-<timestamp> ~/.claude/aela-plugin
```

Only run this if you backed up in Step 1 and want to revert.

---

## Self-review

**1. Spec coverage.**

Phase 3b scope:

- [x] TTS plumbing: personality storage migration — Task 1
- [x] TTS plumbing: settings.json for voice — Task 1
- [x] `/aela-init` — Task 2
- [x] `/wiki-init` — Task 3
- [x] `/comms-init` — Task 4
- [x] Integration gate — Task 5

**Not in Phase 3b scope:**

- `PLUGIN-FEATURES.md` — Phase 4
- `README.md` rewrite — Phase 5
- Matt-head's wiki content migration — Phase 6

**2. Placeholder scan.** No TBDs. Every task prompt contains the full skill body or code verbatim.

**3. Type consistency.** `user_name` (YAML field) vs `userName` (template placeholder, personality.js parameter) — deliberately different because the YAML convention is snake_case and the JS convention is camelCase. The `readPersonality` function normalises: the YAML `user_name` becomes the JS `userName` in the returned object.

**4. Neutrality check.** Every skill has explicit negative checks for `Matt`, `Together School`, `Kevin`, and hardcoded service URLs. Re-read `feedback_skill_prose_already_loaded.md` and `feedback_framing_is_load_bearing.md` before executing the tasks — Phase 3a had two neutrality leaks in my own task prompts that got caught in review, and 3b is more prose-heavy so the risk is higher.

**5. Two things worth flagging for the implementer.**

- **Task 1's legacy fallback is deliberate.** `getUserName` reads `personality.yaml` first, then the legacy `pluginConfigs.aela-voice@*.options.userName`. `getVoice` reads `settings.json` first, then the legacy `plugin/personality/voice.txt`. This is so Matt's existing install (which has neither of the new files yet) keeps working until Phase 6 migration flips him over. Do NOT remove the legacy fallbacks "to clean up" — they're load-bearing for one more phase.
- **Task 3's contract page bodies are deliberately terse.** Each page has only section headers with one-line italic placeholders beneath. That's the point — `/wiki-init` creates the skeleton, real content accumulates through use. Do NOT pad the bodies with example tasks or example team members — that's exactly the kind of noise the spec rejects.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-3b-init-skills.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, final code reviewer pass before Task 5.
2. **Inline Execution** — batch with checkpoints, watch live.

**Which approach?**
