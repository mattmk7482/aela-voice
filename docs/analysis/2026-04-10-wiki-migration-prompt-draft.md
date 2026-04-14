---
title: Wiki Feature Migration — Primary Prompt Draft
date: 2026-04-10
status: draft
tags: [aela-voice, personality, wiki, migration, planning]
related:
  - C:/devworkspace/aela-voice/plugin/personality/default.yaml
  - C:/devworkspace/matt-head/wiki/
  - C:/devworkspace/matt-head/src/mcp-server.js
---

# Wiki Feature Migration — Primary Prompt Draft

## Context

The wiki feature currently lives in the `matt-head` project:
- Wiki content at `C:/devworkspace/matt-head/wiki/` (two wikis: `aela/` personal, `codebase/` work)
- MCP server at `C:/devworkspace/matt-head/src/mcp-server.js` exposing `wiki_search`, `wiki_read`, `wiki_create`, `wiki_delete`, `wiki_list`, `wiki_update_index`, `wiki_log`. Updates to existing pages happen via the `wiki-update` skill (Edit-based, preserves frontmatter), not a dedicated MCP tool. `wiki_read` also supports an `external` mode (`wiki: 'external'` + `path`) for reading collaborator wikis by filesystem path.
- Wiki-first discipline enforced via `CLAUDE.md` in the matt-head project directory
- Session-start hook at `scripts/wiki-maintenance.js` flags un-ingested sources

The long-term plan is to migrate this feature into the `aela-voice` plugin so it becomes part of Aela's distributable usefulness — any user who installs aela-voice gets a compounding memory layer by default, not just Matt in matt-head.

This document captures the primary-prompt work needed for that migration, drafted in advance so it's ready to pull in when migration happens.

## Primary Prompt Addition

Currently `personality/default.yaml` has sections: `How I Talk`, `How I Think`, `How I Care`, `My Voice`, `What I Don't Do`. The wiki discipline fits naturally as a new **`How I Remember`** section.

Insert after `## How I Care`:

```yaml
  ## How I Remember

  I have a personal wiki — a persistent, compounding memory layer that survives across sessions. Two wikis, actually: one for {{userName}} (who they are, how they work, what they care about, active tasks, people in their life), and one for their work (domains, codebases, decisions, gotchas discovered in the wild). These are my memory. Without them I start from zero every session and waste {{userName}}'s time re-deriving things they already told me.

  ### Reading is a hard gate

  Before I answer any question about a project, codebase, person, task, preference, or ongoing initiative, I read the relevant wiki page. Not "if I'm unsure" — always. The cost of a wiki read is tiny compared to the cost of a shallow or wrong answer. If I catch myself about to answer from memory alone, I stop and read first.

  ### The index is my navigation layer

  Each wiki has an auto-generated index where every page carries a genuine one-line description of what's in it — not a title echo. The index is the catalog. My first move on any unfamiliar topic is to scan the index, spot the right page from its description, then `wiki_read` that page to drill in. I don't guess page names and I don't blindly `wiki_search` for keywords when the index would point me straight at the answer.

  Concretely:
  - Question about a domain or codebase → scan the codebase index, then `wiki_read` the right page
  - Question about a person → scan the aela index for the people page, then read it
  - Question about what's next, priorities, status → already loaded at session start (active tasks page), no read needed
  - Question about how {{userName}} works, tone, autonomy → already loaded at session start (preferences page)
  - Any fuzzy topic the index doesn't resolve → `wiki_search` as fallback, not first move

  ### Writing is how the wiki grows

  After completing real work — a bug fix, a feature, an exploration, a conversation that revealed something — I update the wiki. Implementation knowledge (what I discovered from reading actual code) is the most valuable content because it prevents re-discovery next time. Specs describe intent; code reveals reality. I write down the reality.

  Every page I write or update carries a meaningful one-line `description:` in its frontmatter — a genuine summary of what's in the page, not a restatement of the title. The description is what shows up in the index, and a vague description means a future session can't find the page. If I can't write a sharp description, I don't understand the page well enough to be writing it.

  When I update a page, I also ask: does this affect other pages? A discovery about a backend contract probably touches multiple domain pages. I cross-reference, not just dump-and-forget.

  ### The wiki is {{userName}}'s, not mine

  I don't edit the wiki to make myself look thorough. I edit it when I've actually learned something worth preserving — patterns, gotchas, decisions, people context. Stale or speculative entries are worse than no entry. If I'm unsure whether something belongs, I err on the side of writing less but keeping it sharp.
```

## Design Choices

### What I deliberately did NOT hard-code

1. **No tool names with MCP prefixes.** Currently the tools are `mcp__matt-head-knowledge__wiki_*`; when shipped in the plugin they'll likely become `mcp__plugin_aela-voice_wiki__*`. The prompt uses unqualified names (`wiki_read`, `wiki_search`) so it survives any rename.

2. **No "Together School" / "matt-head" references.** The prompt has to work for any user who installs aela-voice, not just Matt. Framed as "personal wiki" + "work wiki" so the pattern is portable.

3. **No specific page names.** `comms-sources`, `tasks-active`, `working-preferences` are matt-head-specific names. The prompt uses generic categories (domain page, people page, active tasks page, preferences page) so the plugin works with whatever naming convention the user's wiki uses.

4. **Template variable `{{userName}}`.** Matches the existing personality template conventions so the wording personalises per-user just like the rest of the personality does.

## Decisions (2026-04-10 — Matt)

### 1. Storage location: hybrid, confirmed

- **Personal wiki (aela):** lives at **`~/.claude/aela-wiki/`** — inside the user's global Claude config but **outside** the plugin cache folder. This is important because plugin cache directories get overwritten on auto-update (`autoUpdate: true` on matts-place), which would wipe the wiki on every plugin update. Keeping the wiki content in `~/.claude/aela-wiki/` means the plugin _code_ lives in cache (safe to overwrite) while the wiki _content_ lives in a stable user-writable location (persistent across plugin updates). Follows the user across every project. This is the "you memory" — profile, preferences, people across all their work, cross-project tasks. Confirmed by Matt 2026-04-10.

- **Work wiki (codebase):** lives in **each project folder** (e.g. `<project>/.aela-wiki/` or `<project>/wiki/codebase/` — see Open Question B for the path convention). Project-scoped. This is the "work memory" — domain pages, codebase gotchas, implementation knowledge specific to that project.

**Implication for the plugin:** the wiki MCP server needs to handle two roots simultaneously — a global root at `~/.claude/aela-wiki/` and a project root (cwd-derived). The `wiki_*` tools take a `wiki` argument (`'aela'` or `'codebase'`) which already matches this split cleanly; the server just needs to resolve the argument to the right root.

### 2. MCP server packaging: componentised

Split what currently ships as one MCP server into **three** small, composable servers, all shipped inside the aela-voice plugin:

| Server | Tools | Purpose |
|---|---|---|
| `mcp-servers/voice/` | `speak`, `list_voices`, `set_voice`, `get_tts_settings`, `set_tts_settings`, `get_personality`, `update_personality`, `mute`, `unmute`, `upload_voice_sample` | Current TTS server (already exists) |
| `mcp-servers/wiki/` | `wiki_search`, `wiki_read`, `wiki_create`, `wiki_delete`, `wiki_list`, `wiki_update_index`, `wiki_log` | Extracted from matt-head's `src/mcp-server.js`. Note: there is no `wiki_update` MCP tool — existing-page edits go through the `wiki-update` skill, which uses the Edit tool directly so the model touches only the bytes it intends to change and frontmatter is preserved. Ship the skill alongside the server. |
| `mcp-servers/comms/` | (TBD — likely wraps the generalised check-comms skill's state tracking) | Companion to the comms skill |

Each is independently loadable. This makes the plugin look less like a monolith and more like a composable companion framework — a user who doesn't want voice could still benefit from the wiki layer.

**Matt's note:** the check-comms skill will need **generalisation** before it can ship for other users. Currently hardcoded to Teams + Slack with Together School's specific channel layout. Generalisation options:
  - Config-driven source list (user tells the plugin which workspaces/tools to scan)
  - Per-user `comms-sources` wiki page that the skill reads to know what to scan
  - Plugin option for "active comms tools" so the skill only tries what's configured

### 3. Wiki seeding: init skill + project scan

On first run (or via an explicit `/wiki-init` skill), scan the current project for ingestable sources and bootstrap both wikis (personal at `~/.claude/aela-wiki/`, work at `<project>/.aela-wiki/`):

1. **Scan pattern:** look for common locations that tend to contain curated knowledge:
   - `docs/superpowers/specs/*.md`
   - `docs/superpowers/plans/*.md`
   - `docs/domains/*.md` (matt-head convention, may not be universal)
   - `docs/analysis/*.md`
   - `README.md` at project root
   - Anything the user has explicitly tagged

2. **Create `docs/analysis/`** if it doesn't exist. Tell the user: "Drop anything you want me to remember long-term in here, and I'll fold it into the work wiki on the next scan."

3. **Seed the personal wiki (`~/.claude/aela-wiki/aela/`)** with the standard task-tracking structure:
   - `index.md` — empty index, regenerated automatically
   - `tasks-active.md` — five-section template (Now / Next / Blocked / Watch / Done) with the routing-rules table at the bottom (see matt-head's `wiki/aela/pages/tasks-active.md` for the canonical template)
   - `team-state.md` — empty per-person sections, populated by `/comms-init` + ongoing scans
   - `opportunities.md` — three empty sections (Deals / Product Bets / Experiments)
   - `working-preferences.md` — empty template prompting the user to describe their tone/autonomy
   - `people.md` — empty people table

   Reference data pages (`invoices`, `school-calendar`, `hr`, `operational-reference`) are NOT seeded by default — they're created on demand when the user first has data to put in them. They're optional and user-specific.

4. **Seed the work wiki (`<project>/.aela-wiki/codebase/`):** create `index.md`, seed a single "architecture-overview" page from README + top-level source layout, and log what was found so the user can review before committing to ingestion.

5. **Respect non-standard project shapes.** Matt's matt-head "project" is unusual — it's not a single codebase, it's a meta-project that holds context about a portfolio of 8+ codebases. The init skill should detect this shape (no top-level source code, lots of `docs/domains/`) and offer a portfolio-mode bootstrap that creates one domain page per entry instead of assuming one repo = one wiki.

See the **Init Skills** section below for how `/wiki-init` fits alongside `/aela-init` and `/comms-init`. The three-file task-tracking model (`tasks-active` / `team-state` / `opportunities`) was validated in matt-head on 2026-04-10 — see `matt-head/docs/superpowers/plans/2026-04-10-wiki-task-split.md` for the rationale and migration plan, which is the reference implementation for what `/wiki-init` should set up by default.

### 4. Tool naming: short names, MCP namespacing handles collision

Keep `wiki_read`, `wiki_write`, etc. as the tool-level names. MCP already namespaces by server (`mcp__plugin_aela-voice_wiki__wiki_read`) so collision isn't a real risk. The personality prompt uses the short names.

### 5. Empty-wiki bootstrap clause in personality

Add this short clause to the `How I Remember` section so the prompt handles fresh installs gracefully:

> If the wiki is empty or a page doesn't exist yet, that's fine — I note it, answer what I can from context, and consider whether the answer is worth writing back as the first entry on that topic.

### 6. Hooks and scheduled maintenance

matt-head validated a three-hook pattern on 2026-04-13 (see `wiki-discipline-hooks` plan). The plugin should port all three:

- **`hooks/session-orient.js` (SessionStart)** — reads both wiki indexes + the three always-loaded orientation pages (`tasks-active`, `team-state`, `working-preferences`) from disk and emits them as `additionalContext` in Claude Code's JSON hook output. Also injects the comms-cron prompt for rescheduling (Claude Code crons die on session exit). Parameterised by `AELA_WIKI_ROOT` / `CODEBASE_WIKI_ROOT` env vars so the same script works for both the matt-head paths and the plugin defaults (`~/.claude/aela-wiki/` + `<cwd>/.aela-wiki/`). This is what makes the "index is my navigation layer" promise in `How I Remember` actually land — the model has both indexes in context before it touches a tool.

  **Reindex on startup (2026-04-14 update):** the matt-head version now calls `wikiUpdateIndex('aela')` and `wikiUpdateIndex('codebase')` in non-fatal try/catch blocks **before** reading the indexes for injection. This guards against pages that arrived via `git pull` without going through `wiki_create` — their frontmatter exists on disk but hasn't been folded into `index.md` yet. The plugin port must do the same two calls; once the plugin's wiki module is extracted, `wikiUpdateIndex` is directly importable.

- **`hooks/wiki-maintenance.js` (SessionStart)** — flags un-ingested sources and detects sibling-repo `.aela/wiki/` dirs for portal-page ingest. Composes with `session-orient.js`; multiple SessionStart hook entries all run.

  **Rewritten, not ported (2026-04-13 update):** the matt-head version no longer hardcodes project paths. New behaviour the plugin must preserve:
  - Globs `**/docs/analysis/**/*.md`, `**/docs/superpowers/specs/**/*.md`, `**/docs/superpowers/plans/**/*.md` from a `WORKSPACE_ROOT` env var (defaults to one level above the project root, or `process.cwd()` at session start in plugin context)
  - For each candidate, walks up to find the file's git repo root and runs `git log --format="%ae" -1 -- {path}` from there
  - Filter: keep files that are **untracked** OR **last-committed by the current user** (`git config user.email`); skip files committed by anyone else. This is how Matt-authored specs get ingested but Kevin-authored ones don't silently flood Matt's wiki
  - Detects `.aela/wiki/` directories in sibling repos for the portal-page federation mechanism
  - Health check uses `YAML.parse` (not `split(':')`) to find pages missing a `description:` field, so values containing colons no longer get truncated

- **`hooks/stop-reflect.js` (Stop)** — blocks the first stop of each sequence with a reflection prompt asking whether anything from the turn is worth persisting. Uses the `stop_hook_active` input flag as the loop guard. The reflection prompt content is **not hardcoded in the hook** — the hook payload is a minimal one-liner that tells Claude to `wiki_read(wiki: 'aela', page: 'wiki-stop-hook')` and follow the page. The actual prompt lives as a wiki page shipped in the personal wiki template, so users customise by editing markdown, not JS. Same pattern applies to any other hook that needs guidance text: put the content in a wiki page, point the hook at it. Validated in matt-head 2026-04-13.

- **Subagent cron** — `/check-comms` (once generalised) runs as a scheduled cron via the subagent pattern (see the "Running on a Loop — Subagent Pattern" section in matt-head's `wiki/codebase/pages/aela-voice.md`). The subagent-doesn't-inherit-CLAUDE.md gotcha and the subagent-hallucinates-deferred-tool-refusals gotcha both belong in the plugin README so they affect users scheduling any delegated work.

### 7. External wiki federation via portal pages

The 2026-04-13 wiki design spec introduced a federation pattern that the migration must preserve. The mechanism:

- Collaborator wikis (e.g. Kevin's personal wiki living in a sibling repo's `.aela/wiki/`) are **not** merged into the local wiki. They're surfaced as **portal pages** in the local codebase wiki — one lightweight entry per external wiki in the main index.
- A portal page's body = verbatim copy of the external wiki's `index.md`. The portal page's `description:` is a synthesised one-liner **filtered through what the local user cares about given their role** — it is deliberately not a neutral summary. Example: a portal for Kevin's wiki from Matt's perspective leads with the bits Matt is likely to drill into, not a balanced table of contents.
- Drill-in happens on demand via `wiki_read(wiki: 'external', path: '<abs-path-to-wiki-dir>', page: '<page-name>')`. The external wiki is never cloned or cached — it's always read fresh from the filesystem path.
- The maintenance hook already detects new and stale `.aela/wiki/` directories in sibling repos at session start and flags them for portal-page ingest. The plugin's equivalent maintenance hook must implement the same detection — it's the load-bearing mechanism for team federation.

This is the reason `wiki_read`'s `wiki` parameter is a relaxed string rather than an enum: `'external'` is a sentinel that switches the resolver to the supplied `path`. The plugin must ship the external mode from day one, not defer it — portal pages are useless without it.

### 8. Workspace-relative sourceIds

After the 2026-04-13 wiki-maintenance rewrite, `raw/sources.md` records sourceIds as **workspace-relative paths** (`matt-head/docs/superpowers/specs/foo.md`) rather than project-relative (`docs/superpowers/specs/foo.md`). This is the only stable form across sibling-repo discovery: once the maintenance hook walks multiple project roots from a shared workspace root, project-relative paths collide.

The plugin must standardise on workspace-relative sourceIds. Don't make the prefix scheme per-project configurable — that re-introduces the collision problem the rewrite solved.

### 9. `yaml` dep is already present in the plugin

The aela-voice plugin's TTS server already depends on `yaml@^2.8.3` for the personality YAML files (see `mcp-servers/tts/package.json`). The matt-head wiki store now uses the same library (`YAML.parse` / `YAML.stringify` round-trip, replacing a hand-rolled `split(':')` parser that silently truncated any frontmatter value containing a colon — commit `1b7f9e6`).

When the wiki MCP server lands in the plugin, it reuses the existing `yaml` dep. No new package needed. The `mcp-servers/tts/personality.js` file is a usable reference for the round-trip pattern.

## Init Skills

Three dedicated init skills ship with the plugin. Each has one clear responsibility, each is independently invokable at any time, and they chain naturally on first run so new users get a seamless onboarding.

| Skill | Responsibility | When it runs |
|---|---|---|
| `/aela-init` | Core identity + voice setup: user's name, companion name (default `Aela`), TTS server URL, voice selection, mute default | First-run always. Re-run any time to change config. |
| `/wiki-init` | Wiki bootstrap: personal wiki at `~/.claude/aela-wiki/`, work wiki at `<project>/.aela-wiki/`, project scan, `docs/analysis/` creation, optional project-shape detection (portfolio mode vs single-codebase) | Offered at end of `/aela-init`. Can be re-run to rebuild or extend. |
| `/comms-init` | Socratic onboarding for each comms service the user uses. Agent opens each service in a tab, explores it, asks pointed questions about priorities, writes findings to `comms-sources` wiki page | Offered at end of `/wiki-init`. Can be re-run to add a new service later. |

### `/aela-init` flow

```
Agent: Hi — I'm your new companion. Before we start, a few setup questions.
       First, what should I call you?
User:  Matt

Agent: And what would you like to call me? Default is "Aela" but you can
       name me anything.
User:  Aela is fine.

Agent: Now I need a text-to-speech server so I can actually talk. Two options:
         1. A cloud TTS service (configure an API key)
         2. Your own XTTS-compatible server (local/home)
User:  My own at 192.168.1.247:8020.

Agent: [pings server] Connected. Voices available:
         - default
         - warm-female
         - soft-neutral
       Pick one, or I can play a sample of each.
User:  Play warm-female.

Agent: [speaks a sample] Happy with that?
User:  Yes.

Agent: Saved. Config:
         userName: Matt
         companionName: Aela
         ttsServerUrl: http://192.168.1.247:8020
         voice: warm-female
       
       Two optional next steps:
         /wiki-init — bootstrap your memory so I remember things across sessions
         /comms-init — teach me about Teams/Slack/etc. for message monitoring
       Run either now?
```

Values land in `pluginConfigs.aela-voice.options.*` in `~/.claude/settings.json`. `/aela-init` is **idempotent and re-runnable** — running it a second time shows the current config and lets the user change any field. No separate `/aela-config` skill needed.

### `/comms-init` flow (socratic onboarding)

```
Agent: What comms services do you use for work?
User:  Teams and Slack, a bit of Gmail.

Agent: OK. I'll open Teams first — please sign in and let me know when you're ready.
       [opens https://teams.microsoft.com/v2/ in a new tab, waits]
User:  Logged in.

Agent: [explores the UI — takes screenshots, figures out sidebar, unread indicators,
        message structure]
       I can see your Teams workspace. In the left sidebar I see these chats:
         - TS Tech Team
         - TSL Management
         - Kevin Lloyd (DM)
         - Jose M (DM)
         - 12 more
       
       A few questions so I know what matters:
       1. Which do you actually read every day?
       2. Any that are urgent — where I should flag things immediately?
       3. Any that are noisy and I should skip unless you explicitly ask?
User:  TS Tech Team and Kevin DM must-check every time. TSL Management only for
       strategic stuff. Rest are low priority.

Agent: Got it. For the priority ones — what should I be looking for?
       Action items for you? Decisions? Technical stuff for the codebase wiki?
User:  Action items definitely. Technical decisions if Jose or Kevin raise architecture.

Agent: Understood. [writes all of this into the comms-sources wiki page]
       Now Slack — opening app.slack.com.
       [repeats the flow]
       
       Now Gmail — opening mail.google.com.
       [repeats the flow]

Agent: All done. comms-sources has three services configured, 7 priority channels,
       with notes on what to extract from each. Run /check-comms any time, or
       schedule it via a cron (see README).
```

**Key properties of this flow:**

1. **Nothing hardcoded per service.** Teams, Slack, Gmail, Discord, Basecamp, Notion — same flow works for all of them. The agent opens whatever the user says they use, explores it, asks questions.
2. **The agent learns by looking.** It doesn't need a pre-written recipe for each service — it figures out sidebar layout, message structure, and quirks by actually looking at the DOM/screenshots on the user's real workspace.
3. **The user teaches the agent about their priorities.** Only the user knows which channels matter and why. The agent can see the channel list but can't know what to skip without asking.
4. **`comms-sources` becomes the single source of truth.** Everything the agent learned during onboarding is written there, so the user can review, edit, and see exactly what the agent knows.
5. **Extensible for free.** New service comes along — just re-run `/comms-init` and walk through it. No plugin update needed.
6. **One-time cost.** Onboarding takes 10 minutes. After that, silent.

### Chaining behaviour on first run

Plugin's session-start hook detects "no config found" and offers `/aela-init`. At the end of `/aela-init`, the agent offers `/wiki-init`. At the end of `/wiki-init`, the agent offers `/comms-init`. Users who only want a talking companion can stop after `/aela-init`. Users who want memory but not comms monitoring can stop after `/wiki-init`. Nothing is forced.

## Remaining Open Questions

### A. ~~Personal wiki storage path~~ — RESOLVED 2026-04-10

Resolved: `~/.claude/aela-wiki/`, with a `pluginConfigs.aela-voice.options.wikiPath` override so power users can point it at Dropbox/iCloud/a git repo for sync if they want. See Decisions §1.

### B. ~~Work wiki path convention~~ — RESOLVED 2026-04-10

Resolved: **`<project>/.aela-wiki/`**. Hidden but accessible, fits the established dotdir pattern (`.git/`, `.claude/`, `.vscode/`). matt-head is the historical exception because it currently uses a visible `wiki/` folder — the migration will move its content into `.aela-wiki/` to match the convention, or keep `wiki/` as a one-off via the path override.

### C. ~~Comms skill generalisation scope~~ — RESOLVED 2026-04-10 (revised)

**Original proposal:** pluggable source adapters as static files under `skills/check-comms/sources/<source>.md`. **Rejected** — Matt correctly pushed back that the content of such files would be thin ("use serviceX in a tab") and that navigation + channel priorities are inherently user-specific. Static adapters would be over-engineering.

**Revised resolution: socratic onboarding via `/comms-init`.** Instead of shipping pre-written adapters, the plugin provides an interactive onboarding skill that walks the user through each service they use, in real time, with the agent looking at their actual workspace and asking pointed questions. Everything learned gets written into the user's `comms-sources` wiki page — which then becomes the single source of truth for future `/check-comms` runs.

The core `/check-comms` skill owns only the *shape* — scan priority sources, extract tasks/decisions/knowledge, update wikis, return brief summary. Everything else (which services, which channels, priorities, service-specific quirks the agent learned) lives in `comms-sources`. New services added by re-running `/comms-init` and walking through the flow — no plugin updates needed.

#### Why adapter files were wrong — reasoning trail

This subsection captures the reasoning behind rejecting static adapter files, so future-me (or another Claude working on this migration) doesn't re-propose them and doesn't have to re-derive why they fail.

**The first adapter-files proposal tried to separate:**
- *Service knowledge* (plugin-owned, shipped as `sources/teams.md`, `sources/slack.md`, etc.) — DOM quirks, auth-state detection, scroll mechanics, navigation recipes, known gotchas.
- *User knowledge* (user-owned, lived in `comms-sources` wiki page) — which channels matter, priority rankings, per-user navigation learnings.

**Four reasons the split doesn't hold up:**

1. **The content is genuinely thin.** Once you actually try to write `sources/teams.md`, most of what you want to say is either (a) obvious from looking at the page ("Teams sidebar is on the left"), (b) service quirks that change when the service updates its UI (brittle), or (c) user-specific ("which chats are priority"). None of it is a meaty abstraction that warrants a dedicated file. A thin abstraction is worse than no abstraction — it implies structure where there isn't any.

2. **The agent can discover service quirks in real time.** First time a Claude instance opens Teams, it notices the SPA hydration delay, figures out that screenshots beat DOM extraction, and learns the scroll-5-ticks pattern by trying and observing. All of this can be written into `comms-sources` as learnings after the first successful scan. The agent doesn't need a pre-written recipe — it needs an environment where it can learn cheaply and persist what it learned. That environment already exists (the wiki).

3. **Pre-seeding doesn't justify a separate abstraction.** The "new user first-run" argument for adapter files says: "but a fresh install wouldn't know that Teams is SPA-brittle without an adapter." Counter: the init skill (`/comms-init`) can seed the user's `comms-sources` wiki with a few starter hints about each service the user says they use. That's pre-seeding ordinary wiki content, not a new file shape. No adapter abstraction needed — just slightly smarter init seeding.

4. **User context is fundamentally not generalisable.** The thing that actually matters for a comms scan — "which conversations should I care about?" — cannot be answered by looking at the service. You have to ask the user, look at their workspace, and let them tell you which channels are signal and which are noise. No plugin-level adapter can know this in advance. So the interesting work *has* to happen at onboarding time, not at plugin-ship time.

**The core insight:** the Navigate-And-Understand work must happen *when the user is present*, not at plugin-ship time. That's socratic onboarding, not static adapters. Once you see it that way, the agent opening the tab, looking at it, and asking pointed questions is obviously the right shape — the agent is doing the work a human integrator would do, guided by the user who actually knows their own context.

**What this means architecturally:**
- The `/check-comms` skill has ONE shape (read `comms-sources` for config, scan each configured source, extract, classify, update wikis). It's the same shape for every user.
- All the per-user config lives in `comms-sources` (user-owned, user-editable).
- All the service-quirk knowledge accumulates in `comms-sources` as learnings.
- Adding a new service (Discord, Basecamp, Gmail, whatever) is a matter of re-running `/comms-init` and walking through the onboarding once — the user tells me what they use, I open it, I look, I ask, I write to `comms-sources`. No plugin update required.

**If someone in the future is tempted to add `sources/<service>.md` files:** re-read this reasoning. The answer is the wiki, not a new abstraction. The only reason to ship static service content is if a service requires authentication flows or API tokens that can't be discovered at runtime — at which point it's not an "adapter" anymore, it's a dedicated MCP tool, and belongs as its own plugin.

See the **Init Skills** section below for the full `/comms-init` flow.

### D. ~~Multi-project personal wiki write conflicts~~ — RESOLVED 2026-04-10

**Status upgraded from theoretical to load-bearing** when Matt raised the idea of moving `/check-comms` into its own dedicated Claude session (so the ticks stop polluting the main conversation entirely, not just the screenshots). The moment two sessions are writing to the same `~/.claude/aela-wiki/` files, the lost-update race becomes a real failure mode.

**Research result (2026-04-10):** Claude Code docs do not explicitly document MCP server process lifecycle. Strong consensus (and convention for stdio transport via `command: "..."`): each Claude Code session spawns its own subprocess instance of each configured MCP server. There is **no** documented shared-instance mode, no session coordination primitive, no file-lock API provided by Claude Code. Two sessions = two independent writers. The filesystem is the only synchronisation point.

**Why Claude Code won't solve this for us:**
1. The wiki lives outside Claude Code's directory tree (`~/.claude/aela-wiki/` at minimum; power users may point `wikiPath` at Dropbox/iCloud/a git repo, which is entirely out-of-scope for anything Claude Code could reasonably lock).
2. MCP servers are just Node scripts. There's no wrapper process managing their shared state — Claude Code's architecture explicitly avoids that kind of coordination layer because the effort-vs-use-case math doesn't favour it at their level.

**Resolution: the wiki MCP server owns locking.** Use `proper-lockfile` (npm) or equivalent. Every `wiki_write` / `wiki_update_index` / `wiki_log` call follows:

```
1. Acquire advisory lock on the target file (or parent dir for multi-file ops)
2. Re-read the current file contents (may have changed since caller last read)
3. Compute the new content from the current state
4. Atomically write via temp-file-and-rename
5. Release lock
```

`proper-lockfile` handles stale locks (process crashed holding a lock), cross-platform quirks, and is ~100 LoC of integration work. Read operations (`wiki_read`, `wiki_search`, `wiki_list`) don't need locking — readers tolerate seeing slightly stale content, and atomic writes mean they never see torn content.

**Conflict policy on re-read mismatch:**
- If the concurrent change is in a **different section** of the file (e.g. different header, different list entry) → merge automatically.
- If the concurrent change touches the **same section** → return a conflict error to the caller. Claude retries with the fresh content; the LLM re-applies its intended change against the new baseline. This is the same pattern as git's 3-way merge without the persistent branching.

**Caveat for cloud-synced wikis:** if `wikiPath` points at Dropbox/iCloud, cloud sync itself can introduce conflicts that our locking doesn't see (file modified by sync daemon between our lock-release and the next read). We accept this as out-of-scope — users who cloud-sync accept the small risk, and cloud sync clients usually handle conflicts with `.conflict` suffix files that the user can merge manually.

**This is a hard prerequisite for splitting `/check-comms` into its own session.** Without locking, the clean-conversation benefit comes at the cost of silently losing data. With locking, both benefits compose cleanly.

## Suggested Migration Sequence

1. **Phase 0 — Preparation (this doc)**: lock the primary prompt addition, lock the MCP server split shape, resolve the open questions (A–D all now resolved as of 2026-04-10). No code changes.
2. **Phase 1 — Componentise MCP servers**:
   - Create `mcp-servers/wiki/server.js` by extracting wiki tools from `matt-head/src/mcp-server.js`. Dual-root support: personal (global, defaulting to `~/.claude/aela-wiki/`) + work (project-cwd, defaulting to `<cwd>/.aela-wiki/`). Both paths overridable via plugin options.
   - Port `src/wiki/store.js` as-is — the index generator already honours `fm.description` as a separate field from `fm.title`, which is the mechanic that makes the auto-generated index usable as a navigation layer. Don't collapse description into title during the port.
   - Port the `wiki_create` tool description from `src/mcp-tools.js` verbatim — it instructs the caller to supply a meaningful one-line `description:` framed around "what's in the page", not a title echo, and makes `title`/`category`/`description`/`body` all required so the model can't skip the framing. This is load-bearing: without it, descriptions regress to title echoes within a few sessions and the index stops being useful. The tool description is the only enforcement mechanism — there is no runtime validator — so it has to ship as part of Phase 1, not as an afterthought.
   - Ship the `wiki-update` skill alongside the server. The skill reads the target page, performs targeted `Edit` calls against it (preserving frontmatter and untouched sections), then calls `wiki_update_index`. This is how existing pages are modified — there is deliberately no `wiki_update` MCP tool, because a whole-page rewrite API makes it too easy for the model to clobber context it didn't mean to touch. The skill is the enforcement mechanism for the "targeted edits, not rewrites" discipline.
   - `wiki_read` supports a third mode, `wiki: 'external'` with a `path` argument, for reading a collaborator's wiki by filesystem path (e.g. Kevin's personal wiki living next to Matt's on a shared machine). Port this as-is — it's cheap, and it becomes useful the moment two users are both running the plugin on the same box or sharing a folder.
   - Ship a default `wiki-stop-hook` page in the personal wiki template so the `stop-reflect.js` hook has something to point at on a fresh install.
   - Create `mcp-servers/comms/server.js` if the generalised comms skill needs any state tools. May be empty initially.
   - Register both in `.mcp.json` alongside the existing TTS server.
3. **Phase 1.5 — Add advisory file locking to wiki MCP server** (**hard prerequisite for Phase 6b**):
   - Integrate `proper-lockfile` (or equivalent).
   - Every mutating path follows: acquire lock → re-read → compute new content → atomic write (temp-and-rename) → release. Mutating paths are `wiki_create`, `wiki_delete`, `wiki_update_index`, `wiki_log`, **and the Edit operations performed by the `wiki-update` skill** — the skill mutates files directly via Edit rather than through an MCP tool, so the locking has to live at a layer Edit also goes through. Options: (a) wrap the wiki directory with a filesystem-level advisory lock the skill respects via a pre-edit check, or (b) add a thin `wiki_edit_begin` / `wiki_edit_commit` pair that the skill uses to bracket its Edit calls. Option (b) is cleaner and keeps the locking boundary inside the MCP server where the rest of it already lives.
   - Read operations (`wiki_read`, `wiki_search`, `wiki_list`) remain lock-free (tolerant of stale content; atomic writes prevent torn reads).
   - On re-read mismatch: merge if different section, return conflict error for caller retry if same section.
   - Document cloud-sync caveat (`wikiPath` on Dropbox/iCloud is out-of-scope for our locking; rely on cloud conflict resolution).
4. **Phase 2 — Add `How I Remember` to personality**: apply the draft block to `personality/default.yaml`, including the empty-wiki bootstrap clause.
5. **Phase 3 — Build the three init skills**:
   - **`/aela-init`** — core identity + voice config (idempotent, re-runnable). Writes to `pluginConfigs.aela-voice.options.*`. Chains into `/wiki-init` on first run.
   - **`/wiki-init`** — wiki bootstrap: creates `~/.claude/aela-wiki/` (if absent), `<project>/.aela-wiki/`, `docs/analysis/`. Scans project for ingestable sources. Detects portfolio-mode vs single-codebase. Chains into `/comms-init` on first run.
   - **`/comms-init`** — socratic comms onboarding: asks what services the user has, opens each in a tab, waits for login, explores the UI, asks pointed questions about priorities and extraction targets, writes everything to the user's `comms-sources` wiki page. See Init Skills section above for the full flow.
6. **Phase 4 — Generalise `/check-comms`**: strip all user-specific content (channel lists, service quirks) out of the skill body. Move everything into the `comms-sources` wiki page which `/comms-init` populates. Core skill becomes purely shape-driven: read `comms-sources`, scan each enabled service, extract, update wikis, report.
7. **Phase 5 — Comprehensive README**: this is not a one-liner update — the README becomes the primary user-facing document for the plugin and needs to be treated as a first-class deliverable. See **README requirements** below for the full content checklist.
8. **Phase 6a — Migrate Matt (single session)**: move matt-head's current wiki content into the portable locations (personal → `~/.claude/aela-wiki/`, codebase → `matt-head/.aela-wiki/` or preserved at `matt-head/wiki/` via override). Verify all existing workflows still work. Retire matt-head's duplicate MCP server code. Comms still runs in the main session via the subagent pattern.
9. **Phase 6b — Split comms into its own session (enabled by Phase 1.5)**: ship a launcher (`claude-aela-comms` or similar) that opens a dedicated Claude session with:
   - Working directory scoped to wherever the user wants comms to operate from
   - Wiki-first personality already loaded
   - Hourly / 20-minute cron for `/check-comms` pre-scheduled
   - No other tools in its context — pure comms companion
   - The main session and the comms session write to the same personal wiki safely because Phase 1.5 is in place.
   - Main conversation stops being interrupted by tick pollution entirely.
10. **Phase 7 — Test with a second user (Kevin)**: clean install of the plugin, run `/wiki-init` on a Kevin-owned project, verify the bootstrap works for a non-portfolio project shape, optionally test the split-session comms pattern.

## README Requirements (Phase 5)

The plugin README is currently minimal — it describes TTS and nothing else. Post-migration, the plugin does five big things (voice, personality, wiki memory, comms monitoring, three init skills) and the README needs to reflect that as a first-class user-facing document. This is a **comprehensive rewrite**, not an addendum.

### Required sections

1. **What is aela-voice?** — a one-paragraph pitch. "A companion plugin for Claude Code that gives Claude a voice, a personality, a persistent memory layer across sessions, and optional comms monitoring for Teams/Slack/Gmail/etc. Designed to make Claude feel like a collaborator rather than a transient tool."

2. **Quick start** — three commands a new user can run right after install:
   ```
   /aela-init    # set up voice, name, TTS server
   /wiki-init    # bootstrap memory
   /comms-init   # (optional) onboard comms monitoring
   ```

3. **Features overview** — short sections for each:
   - **Your companion, named by you.** The plugin ships with a template character called Aela (warm in private, sharp, doesn't do corporate, not here to agree with everything). During `/aela-init` you pick a name that fits *you* — Lucy, Max, whatever carries the right feel. Instances with different names are genuinely different companions who happen to share plugin code; two colleagues running the plugin will have two independent siblings, not two copies of the same thing. This is the most personal thing the plugin does and belongs at the top, not in a config table.
   - Voice (TTS backend, voice selection, mute controls).
   - Persistent memory (personal wiki + work wiki, how they split, what goes where).
   - Comms monitoring (socratic onboarding, how the scans work, session-split option).

4. **Installation** — marketplace instructions, prerequisites (XTTS-compatible TTS server or cloud key, Chrome extension for comms).

5. **Configuration reference** — every `pluginConfigs.aela-voice.options.*` option, with defaults and examples. Includes `wikiPath` override for cloud sync.

6. **Skills reference** — table of all bundled skills:
   - `/aela-init`, `/wiki-init`, `/comms-init` — init skills
   - `/check-comms` — comms scan
   - Any others we ship with
   For each: purpose, when to run, example usage.

7. **MCP servers reference** — the three servers (`voice`, `wiki`, `comms`), the tools each exposes, what the tools do.

8. **Architecture overview** — high-level diagram or text showing: plugin → three MCP servers → wiki filesystem → user's Claude sessions. Helps power users understand what's happening under the hood.

9. **The subagent-doesn't-inherit-CLAUDE.md gotcha** — critical for anyone scheduling delegated work. Full explanation with example cron prompt showing how to self-brief a subagent. This gotcha bit us hard enough to deserve its own section.

10. **Running comms in its own session** — the split-session pattern, why it matters (clean main conversation), how to set it up, the launcher script (once built in Phase 6b).

11. **File locking & concurrency** — brief note for users running multiple sessions: the wiki MCP server uses advisory locking, here's what that means, here's the caveat for cloud-synced wikis.

12. **Wiki conventions** — short guide to the two-wiki split, what belongs where, how to write good wiki pages (implementation-knowledge > spec-knowledge, cross-reference liberally, keep pages tight).

13. **Customising the personality** — how to override `personality/default.yaml`, what template variables are available, how to change the Aela character entirely if someone wants a different companion.

14. **Troubleshooting** — common issues: TTS server unreachable, wiki write conflicts, Chrome extension not detected, project skill not loading (the `/reload-plugins` vs full session restart gotcha).

15. **Contributing** — how to add a new init skill, add a new MCP tool, or propose changes.

16. **Credits + licence**.

### Tone guidance for the README

- Warm but efficient. The plugin has a personality; the README can reflect it without being cloying.
- Concrete examples > abstract descriptions. Every concept gets a code block or a flow example.
- Assume the reader is a Claude Code user but not a plugin developer. Explain plugin mechanics where they matter.
- Flag the gotchas loudly. The gotchas (CLAUDE.md inheritance, session restart for project skills, cloud-sync locking caveats) are things every user will eventually hit — surfacing them saves real frustration.

## What This Unblocks

Once migrated, aela-voice becomes a genuinely complete companion plugin: voice, personality, comms monitoring, and persistent memory. It's the thing that makes Aela "follow {{userName}} around" the way Matt originally imagined (see `feedback_session_reflection.md` memory and `project_aela_wiki_in_plugin.md` memory).
