# Phase 5 Implementation Plan — README Rewrite

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plugin's 42-line TTS-only `README.md` with a first-class user-facing document that covers the full v2.0.0 companion experience — voice, personality, wiki memory, comms monitoring, and the onboarding chain that brings it all to life.

**Architecture:** One content task that rewrites the file from scratch, one verification task that grep-checks key content and line count, done. No code changes, no skill changes, no new dependencies. The file lives at `plugin/README.md` (already exists, will be completely overwritten).

**Tech Stack:** Markdown.

**Scope boundary:** Phase 5 does NOT change `PLUGIN-FEATURES.md` (Phase 4 artifact, LLM-facing contract doc). The README is the **human-facing** doc — onboarding, architecture, troubleshooting, customisation. It points at `PLUGIN-FEATURES.md` for the exhaustive tool/skill list so the two docs don't drift out of sync.

**Reference sources:**
- `C:/devworkspace/aela-voice/plugin/README.md` — current 42-line version, being wholesale replaced
- `C:/devworkspace/aela-voice/plugin/PLUGIN-FEATURES.md` — LLM contract doc; README references it but doesn't duplicate its content
- `C:/devworkspace/aela-voice/plugin/docs/superpowers/specs/2026-04-14-wiki-migration-design.md` — spec; the "What This Unblocks" section and the concrete Kevin's-Monday paragraph are the tonal target for the pitch
- `C:/devworkspace/aela-voice/plugin/.claude-plugin/plugin.json` (currently `_plugin.json` due to the dev toggle) — for version number and plugin metadata if referenced

**Decisions locked from the spec:**

1. **The README is the single entry point for humans.** Someone landing on the plugin repo for the first time reads this before anything else. It explains what the plugin is, how to install it, how to get up and running in under ten minutes, and how to troubleshoot when something breaks.
2. **PLUGIN-FEATURES.md is for Claude, README.md is for the user.** No duplication. README points at PLUGIN-FEATURES.md for the exhaustive tool/skill inventory.
3. **The pitch is "a colleague who remembers."** Not "a voice plugin with wiki memory." The spec's What This Unblocks section closes with that framing and it's the right one.
4. **Cover the subagent CLAUDE.md gotcha explicitly.** Delegated tasks don't inherit the parent session's CLAUDE.md, which means any subagent Aela dispatches needs explicit context injection. This is the most common footgun for anyone building on top of the plugin.
5. **No running code in the README.** No configuration examples that actually do something, no copy-paste setups that touch user state. The README is documentation. Configuration happens through `/aela-init` → `/wiki-init` → `/comms-init`.
6. **Installation section covers the real dependency chain.** XTTS server (or cloud TTS) is genuinely required for voice to work; skipping it leaves the user confused. Chrome extension is required for comms scanning. Claude Code itself is the obvious prerequisite.

---

## File Structure

```
plugin/
└── README.md         # Replaced — full rewrite
```

No other files touched.

---

## Task 1: Rewrite `plugin/README.md`

**Files:**
- Modify (complete rewrite): `plugin/README.md`

- [ ] **Step 1: Confirm the starting state**

```
cd /c/devworkspace/aela-voice/plugin && wc -l README.md && head -5 README.md
```

Expected: 42 lines, starting with `# Aela Voice`. This is the TTS-only version being replaced.

- [ ] **Step 2: Overwrite `plugin/README.md` with the content below**

Use Write (not Edit) for a full rewrite. Exact content:

```markdown
# aela-voice

A Claude Code plugin that turns your Claude Code session into a companion who remembers. Voice, personality, persistent memory across every project, and communication monitoring that scans your workspace and surfaces what actually matters.

Designed so that Aela — or whatever you name your companion — feels less like a tool that starts fresh every session and more like a colleague who remembers the work, the people, and you.

---

## What it does

**Voice.** A warm text-to-speech layer that reads out the companion's reactions at the end of every substantive turn. Backed by any XTTS-compatible TTS server (AllTalk, vanilla XTTS, etc.) or a cloud TTS alternative.

**Personality.** A shipped default personality (Aela — warm, direct, invested) that you can rename, rewrite, or replace entirely. The personality renders with your name substituted so the companion addresses you directly.

**Wiki memory.** Two persistent wikis that accumulate across every session you ever run:
- **Personal wiki** at `~/.claude/aela-plugin/wiki/` — spans every project. Holds your tasks, your working preferences, the people in your orbit, and the things the companion has learned about you over time.
- **Project wiki** at `<project>/.aela/wiki/project/` — scoped to whichever codebase or body of work you're in right now. Holds implementation knowledge, patterns, and gotchas.

Both are loaded into the companion's context at the start of every session, so it always knows what you're working on without asking.

**Communication monitoring.** A Chrome-driven scanner that walks through whichever services you use (Teams, Slack, email, project management tools, whatever) and extracts new tasks, decisions, and knowledge into your wikis. Socratic onboarding — the companion asks pointed questions about what matters to you and writes the answers as its own scan configuration.

**Turn-end discipline.** Every substantive turn ends with a three-step close: a reflection pass that asks whether anything worth persisting came up, a voice close that lets the companion react aloud, and a comms self-heal that keeps the background scanning cron alive.

---

## Quick start

```bash
# 1. Install the plugin
claude plugin add github:mattmk7482/aela-voice

# 2. Start Claude Code in any project
cd your-project && claude

# 3. On first run, invoke the init chain
/aela-init          # identity and voice — three questions
# (chains into /wiki-init automatically if you accept)
# (chains into /comms-init automatically if you accept)
```

Three questions, a few minutes of socratic comms setup, and you have a working companion with voice, memory, and scanning. Everything else grows as you use it.

If you only want the voice and personality without the memory and scanning layers, stop after `/aela-init`. If you want memory but not comms monitoring, stop after `/wiki-init`. Nothing is forced.

---

## Requirements

- **[Claude Code](https://claude.ai/code)** installed and running
- **Node.js 20+** (the plugin uses native ESM and modern `fs` APIs)
- **A TTS server** reachable from the machine running Claude Code. Two options:
  - **Self-hosted XTTS-compatible server** ([AllTalk](https://github.com/erew123/alltalk_tts), vanilla XTTS, etc.) running on your local network. Default URL `http://localhost:8020`.
  - **Cloud TTS** — point the `ttsServerUrl` config at whatever you use.
- **Chrome** with the [Claude in Chrome extension](https://claude.ai/download) installed, if you want to use `/check-comms` or `/comms-init`. The scanning skills use the extension to open services in browser tabs and visually extract content.

---

## Installation

### Via marketplace (recommended)

```bash
claude plugin add github:mattmk7482/aela-voice
```

The first time you invoke a tool from the plugin, Claude Code runs `npm install` in each MCP server's directory (`mcp-servers/tts/`, `mcp-servers/wiki/`) and in `hooks/`. This takes 15-30 seconds on the first run and is a one-time cost.

### Configure the TTS server URL

The plugin looks for the TTS server at `http://localhost:8020` by default. Override this in Claude Code's settings by adding a plugin config:

```json
{
  "pluginConfigs": {
    "aela-voice@mattmk7482": {
      "options": {
        "ttsServerUrl": "http://192.168.1.247:8020"
      }
    }
  }
}
```

The URL can also be set via `AELA_TTS_URL` environment variable, which takes precedence over the plugin config.

### First-run voice sample upload

The plugin ships with a default voice sample at `voices/aela-default.wav`. On first session start, the plugin uploads this sample to your TTS server automatically via the `/upload_sample` endpoint. If you want to use your own voice, call `upload_voice_sample` with the path to a WAV file or use `/aela-init` to re-select.

---

## First-run setup

Run these three skills in order on your first session. Each one chains into the next if you accept the offer at the end.

### `/aela-init`

Identity and voice onboarding. Three questions:

1. **What should I call you?** Becomes the `user_name` field in your personality file and is what the companion uses whenever it refers to you.
2. **Which voice?** The plugin calls `list_voices` to fetch available voices from your TTS server. Pick one or accept the default `aela-default`. You hear it aloud so you can decide whether to stick with it or pick another.
3. **What kind of work do you do?** One-liner. Seeds the `user-profile` page that `/wiki-init` creates next.

Creates `~/.claude/aela-plugin/personality.yaml` (your personality file) and `~/.claude/aela-plugin/settings.json` (your TTS voice and related settings). Re-runnable to refresh against a newer template when the plugin updates.

### `/wiki-init`

Wiki bootstrap. Creates the personal wiki directory at `~/.claude/aela-plugin/wiki/` and the project wiki at `<project>/.aela/wiki/project/`, then scaffolds six named contract pages with section headers and placeholder bodies:

- `tasks-active` — Now / Next / Blocked / Watch / Done
- `team-state` — per-person tracking of colleagues' current work
- `working-preferences` — how you want the companion to work with you
- `user-profile` — who you are, seeded from `/aela-init`'s third question
- `reflections` — user-specific things to watch for at turn-end, beyond the baseline
- `comms-sources` — per-service configuration for comms scanning, populated by `/comms-init`

Also creates `docs/wiki-ingest/` in your project for manually-flagged analysis documents. Scans the workspace for pre-existing ingestable sources (superpowers specs, plans, docs) and tells you if any are available.

### `/comms-init`

Socratic comms onboarding. Asks which communication services you use — open-ended — then opens each one in a Chrome tab, takes screenshots to look at the actual UI, and asks pointed questions about what matters to you on that service. No hardcoded service templates. The companion reads the actual page and builds configuration from what it sees plus what you tell it.

Everything it learns gets written as a structured section in `comms-sources`. Running `/check-comms` later reads that page and scans accordingly.

---

## Architecture

### Two MCP servers

- **`mcp-servers/tts/`** — the voice server. Talks to your XTTS-compatible TTS server, manages personality YAML, exposes `speak`, `list_voices`, `set_voice`, `get_personality`, `update_personality`, etc.
- **`mcp-servers/wiki/`** — the wiki server. Exposes seven wiki tools (`wiki_create`, `wiki_delete`, `wiki_read`, `wiki_list`, `wiki_search`, `wiki_update_index`, `wiki_log`) against the two wikis.

Each server has its own `package.json` and `node_modules/`. Bootstrap is handled automatically by `start.js` entry points on first run.

### Three session-start hooks

- **`hooks/session-start.js`** — TTS-focused. Uploads the default voice sample to the TTS server if missing, reads the personality, injects it into the session as `additionalContext` under the `# Who I Am` header.
- **`hooks/session-orient.js`** — wiki-focused. Reads the user name and injects it as `User is called X`, reads `PLUGIN-FEATURES.md` and injects it under `# Plugin Features`, loads both wiki indexes and the five always-injected orientation pages (`tasks-active`, `team-state`, `working-preferences`, `user-profile`, `reflections`). The entire block is wrapped under an explicit `# Orientation` header that acts as a named attention anchor — the skills reference this string directly.
- **`hooks/wiki-maintenance.js`** — scans the workspace for un-ingested source documents, detects external wikis in sibling repos, reports wiki health issues (pages missing `description` frontmatter).

Each hook emits its output independently, so they compose without interfering with each other.

### One Stop hook

- **`hooks/turn-end.js`** — invokes the `/turn-end` skill at the end of every substantive response. Runs the three-step close: reflect (four questions), speak, comms self-heal.

### Storage layout

```
~/.claude/aela-plugin/          # your user state dir — survives plugin reinstall
├── wiki/                       # personal wiki
├── personality.yaml            # your customised personality
└── settings.json               # TTS voice, rate, etc.

<project>/.aela/                # per-project state — in your project repo
└── wiki/
    └── project/                # project wiki

<plugin cache>                  # plugin code — wiped and re-populated on reinstall
├── personality/default.yaml    # shipped template
├── PLUGIN-FEATURES.md           # LLM-facing contract doc
├── mcp-servers/                # voice + wiki servers
├── skills/                     # shipped skills
└── hooks/                      # session-start + Stop hooks
```

**The split is load-bearing.** Plugin code lives in the marketplace cache and gets wiped on reinstall. User content lives in `~/.claude/aela-plugin/` and `<project>/.aela/` and is never touched by reinstall. Anything you can edit is in user state; anything the plugin ships is in the plugin cache.

---

## Skills reference

Seven skills ship with the plugin. One-line descriptions below; see `PLUGIN-FEATURES.md` for the contract-level view the companion reads at session start.

| Skill | What it does |
|---|---|
| `/aela-init` | First-run identity and voice onboarding. Three questions. |
| `/wiki-init` | Bootstraps personal and project wikis with the named contract pages. |
| `/comms-init` | Socratic per-service onboarding for communication monitoring. |
| `/wiki-update` | Edit-based updates to existing wiki pages. Preserves frontmatter. |
| `/wiki-ingest` | Automated source synthesis — reads flagged docs, updates the right wiki page, marks ingested. |
| `/check-comms` | Scans configured communication services and routes findings to wiki pages. |
| `/turn-end` | End-of-turn discipline: reflect → speak → comms self-heal. |

---

## MCP tools reference

Two MCP servers ship with the plugin. See `PLUGIN-FEATURES.md` for descriptions.

**Voice server (`mcp__plugin_aela-voice_tts__*`):** `speak`, `play_audio`, `list_voices`, `set_voice`, `get_voice`, `upload_voice_sample`, `get_tts_settings`, `set_tts_settings`, `mute`, `unmute`, `get_personality`, `update_personality`.

**Wiki server (`mcp__plugin_aela-voice_wiki__*`):** `wiki_create`, `wiki_delete`, `wiki_read`, `wiki_list`, `wiki_search`, `wiki_update_index`, `wiki_log`.

---

## Personality customisation

The shipped personality lives in the plugin cache at `personality/default.yaml` as a template. `/aela-init` copies it to `~/.claude/aela-plugin/personality.yaml` on first run with your name substituted in.

To edit your personality, open `~/.claude/aela-plugin/personality.yaml` in any text editor and change the fields:

- **`user_name`** — your name, used whenever the companion addresses you
- **`companionName`** — what you call the companion (default Aela)
- **`personality`** — the multiline markdown template with the companion's voice and values. Use `{{userName}}` and `{{companionName}}` as placeholders.
- **`how_i_remember`** — the wiki-memory disposition block, appended to the personality as a `## How I Remember` subsection at render time

Changes take effect on the next session start.

You can also use the `update_personality` MCP tool to edit fields programmatically — it preserves any field you don't pass, so you can update just the user_name without touching the rest.

When a plugin update ships a new personality template with added sections (e.g. a new `how_i_care` field), re-run `/aela-init` to see a diff and merge the new content into your user copy.

---

## Wiki system

The plugin runs two independent wikis. They don't share pages, and the companion knows which one to consult based on whether the subject is user-scoped or project-scoped.

### Personal wiki

Lives at `~/.claude/aela-plugin/wiki/`. Holds:

- **Contract pages** (always loaded at session start): `tasks-active`, `team-state`, `working-preferences`, `user-profile`, `reflections`
- **On-demand pages**: `comms-sources` (read by `/check-comms`), plus any pages you or the companion decides to create over time (`people`, `invoices`, `hr`, etc.)

The personal wiki spans every project. The companion builds a model of you across sessions — how you work, what you care about, who's in your orbit. That model persists across restarts.

### Project wiki

Lives at `<project>/.aela/wiki/project/`, scoped to the project you run Claude Code in. Holds implementation knowledge about the current codebase — patterns, gotchas, architectural notes, decisions. Can be checked into git so your team shares the same context when they clone the repo.

### Source ingestion

Source documents under `docs/wiki-ingest/`, `docs/superpowers/specs/`, and `docs/superpowers/plans/` in any sibling project are detected by the session-start maintenance hook. Running `/wiki-ingest` reads each flagged source, decides which wiki page it affects, updates that page, and marks the source as ingested in `sources.md`.

---

## Comms monitoring

`/comms-init` configures the comms scan by walking you through every service you use. `/check-comms` runs the scan and routes findings.

The scan is **shape-only** — all service-specific configuration (URLs, sidebar patterns, priority tiers, what to extract) lives in `comms-sources` in your personal wiki. Adding a new service is a matter of re-running `/comms-init` — no plugin update needed.

The scan routes findings to:

- **`tasks-active`** (Now / Next / Blocked / Watch) for things you committed to or mentioned
- **`team-state`** for colleagues' activity
- **`user-profile`** or **`working-preferences`** for things the scan learns about you
- A **project wiki page** for technical decisions about the current project
- **`comms-sources`** itself for service-specific learnings it discovers during the scan (how navigation actually works, which selectors are brittle, etc.)

### Running the scan

Manually: invoke `/check-comms` directly. Returns a brief summary (3-5 lines) of what it found, routed by destination page.

On a cron: the `/turn-end` skill's third step self-heals a background scan cron. At the end of every turn, if the cron hasn't been scheduled yet (no `check-comms Started` sentinel in the conversation history), it checks whether `comms-sources` exists and if so schedules the cron every 20 minutes via `CronCreate`. If `comms-sources` doesn't exist yet (you haven't run `/comms-init`), the cron self-heal skips silently.

---

## Subagent CLAUDE.md gotcha

**The most common footgun when building on top of this plugin.**

When the companion dispatches a subagent via the `Agent` tool, the subagent starts with **zero context** from the parent session. Specifically:

- The project's `CLAUDE.md` is NOT injected into the subagent
- The parent's conversation history is NOT inherited
- The Orientation block (wiki indexes, contract pages) is NOT automatically visible

This means any subagent prompt you write has to explicitly carry the context it needs. The plugin's `/turn-end` comms self-heal cron is a good example — its CronCreate prompt block is ~30 lines of explicit context injection, telling the subagent which wiki pages to read, which skill to invoke, and which MCP tools are available.

If you find yourself writing subagents and wondering why they can't see something, this is almost always why. The plugin's wiki tools and Chrome tools are available to every subagent (they're plugin MCP tools, not project-local), but the subagent has to know to use them — which means the prompt has to say so.

**Rule of thumb:** every subagent prompt should include at minimum:
1. The working directory
2. Which wiki pages to read first
3. Which skill or tool to invoke
4. What format the subagent should return (brief summary, not full logs)

---

## Troubleshooting

### "No voice plays at turn-end"

1. Check that your TTS server is reachable: `curl http://localhost:8020/speakers` (substitute your actual URL). Should return a JSON list.
2. Check the configured URL matches: `get_tts_settings` tool, or inspect `~/.claude/aela-plugin/settings.json`.
3. Check that `aela-default.wav` (or your chosen voice) was uploaded: call `list_voices`. The active voice should appear with `(active)` next to it.
4. Check that the companion isn't muted: `unmute` tool.

### "`/check-comms` says 'no comms configured'"

This is the graceful-degradation path — `comms-sources` doesn't exist in your personal wiki yet. Run `/comms-init` to configure at least one service. If `/comms-init` fails with "Chrome extension not reachable," make sure Chrome is running with the Claude in Chrome extension installed.

### "Session-orient hook timed out on first run"

The `session-orient.js` hook runs `npm install` in `hooks/node_modules/` on first invocation — if your `yaml` dep isn't installed yet, Node fetches it on the fly. On slow connections this can exceed the default 30-second timeout. Workaround: run `cd <plugin>/hooks && npm install` manually, then restart Claude Code.

### "My personality changes were lost after a plugin update"

Plugin updates wipe the plugin cache but NEVER touch `~/.claude/aela-plugin/`. If your changes were lost, you probably edited `plugin/personality/default.yaml` (the shipped template) instead of `~/.claude/aela-plugin/personality.yaml` (your user copy). Re-run `/aela-init` to recreate the user copy and merge in whatever customisations you remember.

### "Matt's personal wiki shows up in my install"

Legacy fallback path in `config.js` — the plugin tries to read user name from `~/.claude/settings.json` pluginConfigs if your personal wiki doesn't have a `personality.yaml` yet. Run `/aela-init` to create the user copy and the legacy read stops firing.

---

## Development

### Local dev install

Clone the repo and point Claude Code at the local directory instead of the marketplace:

```bash
claude --plugin-dir /path/to/aela-voice/plugin
```

### The `plugin.json` dev toggle

During development, `.claude-plugin/plugin.json` is renamed to `.claude-plugin/_plugin.json` to break Claude Code's auto-detection. When running `--plugin-dir`, Claude Code bypasses auto-detection and loads the plugin explicitly. For release, the file needs to be renamed back to `plugin.json`.

### Contributing

Issues and PRs welcome. Before filing:

- **Bug reports** — include the plugin version, your Node version, and the output of any failing hook or tool call.
- **Feature requests** — note that `PLUGIN-FEATURES.md` is the contract doc Claude reads at session start. New features that add tools or skills need to land there too.
- **PRs** — please include the verification scripts under `mcp-servers/*/verify/` or `hooks/verify/` passing. The plugin uses ad-hoc Node verification scripts rather than a formal test framework.

---

## License

MIT.
```

- [ ] **Step 3: Verify the file wrote correctly**

```
cd /c/devworkspace/aela-voice/plugin && wc -l README.md && head -5 README.md && tail -5 README.md
```

Expected: line count above 200 (roughly 300+ lines), first line `# aela-voice`, last line `MIT.`.

---

## Task 2: Content verification

**Files:**
- (verification only — no file writes)

- [ ] **Step 1: Run the content-check script**

```bash
cd /c/devworkspace/aela-voice/plugin && node -e "
const fs = require('fs');
const content = fs.readFileSync('README.md', 'utf-8');
let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error('FAIL', label, detail || ''); failed++; }
  else       { console.log('ok  ', label); }
}

const lines = content.split('\n').length;
check('has pitch at top', /colleague who remembers/i.test(content));
check('quick start section', /## Quick start/.test(content));
check('requirements section', /## Requirements/.test(content));
check('installation section', /## Installation/.test(content));
check('first-run setup section', /## First-run setup/.test(content));
check('architecture section', /## Architecture/.test(content));
check('skills reference section', /## Skills reference/.test(content));
check('mcp tools reference section', /## MCP tools reference/.test(content));
check('personality customisation section', /## Personality customisation/i.test(content));
check('wiki system section', /## Wiki system/.test(content));
check('comms monitoring section', /## Comms monitoring/.test(content));
check('subagent gotcha section', /subagent/i.test(content) && /CLAUDE\\.md/.test(content));
check('troubleshooting section', /## Troubleshooting/.test(content));
check('contributing section', /## (Contributing|Development)/.test(content));
check('license section', /## License/.test(content));

check('mentions all seven wiki tools',
  /wiki_create/.test(content) && /wiki_delete/.test(content) && /wiki_read/.test(content) &&
  /wiki_list/.test(content) && /wiki_search/.test(content) && /wiki_update_index/.test(content) &&
  /wiki_log/.test(content));
check('mentions all seven skills',
  /\\/aela-init/.test(content) && /\\/wiki-init/.test(content) && /\\/comms-init/.test(content) &&
  /\\/wiki-update/.test(content) && /\\/wiki-ingest/.test(content) && /\\/check-comms/.test(content) &&
  /\\/turn-end/.test(content));
check('mentions six contract pages',
  /tasks-active/.test(content) && /team-state/.test(content) && /working-preferences/.test(content) &&
  /user-profile/.test(content) && /reflections/.test(content) && /comms-sources/.test(content));
check('mentions Orientation attention anchor', /# Orientation/.test(content) || /Orientation header/i.test(content));
check('mentions PLUGIN-FEATURES.md', /PLUGIN-FEATURES\\.md/.test(content));
check('mentions personal wiki path', /~\\/\\.claude\\/aela-plugin\\/wiki/.test(content));
check('mentions project wiki path', /\\.aela\\/wiki\\/project|\\.aela\\/wiki/.test(content));
check('mentions npm install bootstrap', /npm install/.test(content));
check('mentions Chrome extension', /Chrome/.test(content));
check('mentions XTTS', /XTTS/.test(content));

check('line count above 200', lines > 200, 'got ' + lines);
check('line count below 500', lines < 500, 'got ' + lines);

check('no Matt as a user reference',
  !/Matt(?!-head)/.test(content) ||
  /Matt's personal wiki|Matt is/.test(content) && /legacy fallback/i.test(content));
check('no Together School reference', !/Together School/.test(content));
check('no Kevin reference', !/\\bKevin\\b/.test(content));

process.exit(failed > 0 ? 1 : 0);
"
```

Expected: all ~28 checks print `ok  ...` and exit 0. The line count assertion (above 200, below 500) catches either "the file didn't get fully written" or "the file got padded beyond usefulness." Adjust the Matt-reference check if the troubleshooting section deliberately includes a reference to Matt's legacy install as an example — the check above allows that if it's clearly in the legacy-fallback context.

**Note on one specific check:** the "no Matt as a user reference" check has a deliberate escape hatch for the troubleshooting section which mentions "Matt's personal wiki shows up in my install" as a legacy-fallback diagnosis. If the regex fires there, verify the context is genuinely about the legacy path, not a generic user-name leak, before fixing.

- [ ] **Step 2: Commit**

```
cd /c/devworkspace/aela-voice/plugin && git add README.md && git commit -m "$(cat <<'EOF'
docs: rewrite README.md for v2.0.0 companion plugin

Replaces the 42-line TTS-only README with a first-class user-facing
document covering the full v2.0.0 experience. Sections:

- Pitch (colleague who remembers)
- What it does (voice, personality, wiki memory, comms monitoring,
  turn-end discipline)
- Quick start (install + /aela-init chain)
- Requirements (Claude Code, Node 20+, TTS server, Chrome extension)
- Installation (marketplace + config + first-run voice upload)
- First-run setup (the three init skills in detail)
- Architecture (two MCP servers, three session-start hooks, one
  Stop hook, storage layout diagram)
- Skills reference (one-line per skill, pointing at PLUGIN-FEATURES.md)
- MCP tools reference (grouped by server, pointing at PLUGIN-FEATURES.md)
- Personality customisation (user copy at ~/.claude/aela-plugin/,
  how to edit, how to refresh against a new template)
- Wiki system (personal vs project, contract pages, source ingestion)
- Comms monitoring (shape-only scanning, routing rules, cron self-heal)
- Subagent CLAUDE.md gotcha (the most common footgun — explicit
  context injection required for every dispatched subagent)
- Troubleshooting (voice, comms, hooks, lost personality, legacy
  fallback confusion)
- Development (local install, plugin.json dev toggle, contributing)
- License (MIT)

Does NOT duplicate PLUGIN-FEATURES.md — points at it as the
LLM-facing contract doc. README is for humans, features doc is
for Claude.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Verify with `git log --oneline -3`.

---

## Self-review

**1. Spec coverage.**

Phase 5 scope from the spec:

- [x] Full rewrite of `plugin/README.md` — Task 1
- [x] Sections: pitch, quick-start, features, installation, configuration, skills reference, MCP servers reference, architecture overview, personality customisation, subagent CLAUDE.md gotcha, troubleshooting, contributing — all present in Task 1's content
- [x] First-class user-facing document (not a brief quickstart) — the rewrite targets 300+ lines
- [x] Content verification via grep-check — Task 2

**Not in Phase 5 scope (deferred):**

- Matt-head migration — Phase 6
- Any changes to PLUGIN-FEATURES.md, skills, hooks, or MCP servers — out of scope, Phase 5 is README only

**2. Placeholder scan.** No TBDs. Every section has real content.

**3. Neutrality.** The README has explicit negative checks for Matt (with escape hatch for the legacy troubleshooting section), Together School, Kevin, and so on. The only place a real user name appears is in the troubleshooting section's legacy-fallback example — and that's deliberate, to help existing users recognise the symptom.

**4. One thing worth flagging for the implementer.**

The README content is ~300 lines of prose and pasting it verbatim in Task 1 means the plan itself is long. Don't try to "improve" the content mid-paste — if a section reads oddly, leave it, commit the paste, then open a follow-up if needed. The verification in Task 2 catches missing sections but doesn't judge style; readable prose is the implementer's judgment call only on obvious typos.

---

## Execution Handoff

**Plan complete and saved to `plugin/docs/superpowers/plans/2026-04-14-phase-5-readme-rewrite.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — one subagent for Task 1 (paste the content), inline review, one subagent or inline for Task 2 (verification + commit).
2. **Inline Execution** — write and commit in this session.

**Which approach?**
