# aela-voice v2.0.0 — Wiki Migration + Plugin Release Design

**Status:** design complete, ready for implementation plan
**Author:** Matt + Aela
**Date:** 2026-04-14

## Background

This spec defines **aela-voice v2.0.0**. It is not only a wiki migration — it is the release that turns aela-voice from a TTS plugin into a full companion. Three strands ship together:

1. **Wiki migration.** The LLM Wiki system built and hardened in `matt-head` (two wikis, MCP-backed tools, hooks, ingestion, portal-page federation) becomes a first-class plugin feature so any user can install and get a persistent memory layer across every project they work in.
2. **Init skill chain.** Three new skills (`/aela-init`, `/wiki-init`, `/comms-init`) chain on first run to bootstrap identity, memory, and comms monitoring from nothing. Users answer three questions and get a working companion.
3. **Release-ready plugin.** Two-server architecture (the existing voice server plus a new wiki server), generalised `/check-comms`, rewritten README, and a `matt-head` canary migration that proves the whole thing works end to end.

This spec is a delta over the current state of the plugin (`aela-voice/plugin`) and the shipped-and-stable wiki system in `matt-head` (commits `20d279a` through `1b7f9e6`, 2026-04-13). All architectural decisions from that hardening are assumed — most importantly the split of write operations into `wiki_create` (MCP, schema-enforced) plus `wiki-update` (skill, Edit-based).

Post-v2.0.0 work — generalisation refactor, onboarding refinements after real-user encounters, and a comms session architecture redesign — is sequenced after release and called out in the Migration Sequence section.

## Vocabulary

Every other section uses these exact names.

| Term | Meaning | Filesystem |
|---|---|---|
| **Personal wiki** | The user-scoped wiki that spans all projects. Grows via conversation, comms scans, turn-end reflection. One per user, per machine. Survives plugin reinstall. | `~/.claude/aela-plugin/wiki/` |
| **Project wiki** | The project-scoped wiki about a specific codebase or body of work. Grows via source ingestion, code exploration, implementation discovery. One per project. | `<project>/.aela/wiki/project/` |
| **Plugin cache / plugin code** | Shipped plugin files — code, default personality template, PLUGIN-FEATURES.md. Wiped on reinstall. Never user-editable. | `~/.claude/plugins/cache/...` |
| **User state dir** | Everything the user can edit that must survive reinstall: personal wiki, personality.yaml, settings. | `~/.claude/aela-plugin/` |
| **Contract pages** | The named pages plugin hooks and skills depend on. Created by `/wiki-init` on first run. Seven are always injected at session start; one (`comms-sources`) is loaded on demand. | (various; see below) |
| **Source** | A file outside the wiki that should be ingested into it: superpowers specs/plans, `docs/wiki-ingest/*.md`, external wiki indexes. Tracked in `sources.md`. | various |
| **Contract** | Shorthand for the set of page names and file paths plugin hooks and skills depend on. Documented in `PLUGIN-FEATURES.md`. | n/a |
| **Companion** | The in-session personality the user interacts with. Named by the user during `/aela-init` (default "Aela"). The companion name affects personality only; filesystem paths are plugin-named. | n/a |

**Contract pages** — the eight load-bearing named pages:

| Page | Wiki | Always injected? |
|---|---|---|
| Aela wiki index (`index.md`) | personal | yes |
| Project wiki index (`index.md`) | project | yes |
| `tasks-active` | personal | yes |
| `team-state` | personal | yes |
| `working-preferences` | personal | yes |
| `user-profile` | personal | yes |
| `reflections` | personal | yes |
| `comms-sources` | personal | on demand (read by `/check-comms`) |

## Design Goals

1. **First-run to working companion with minimal friction.** A user running `/aela-init` → `/wiki-init` → `/comms-init` answers three questions (name, voice, what comms services they use) and ends up with a voice companion, a scaffolded wiki, and a working comms scan. No wall-clock number — the flow must feel frictionless, nothing more.
2. **Plugin code and user content never share a filesystem root.** Plugin code lives in `~/.claude/plugins/cache/...` and gets wiped on reinstall. User content (wiki, personality, settings) lives in `~/.claude/aela-plugin/` and is never touched by reinstall. Any file the user can edit lives outside the plugin cache.
3. **Matt's install migrates cleanly as the reference canary.** Phase 6 is the end-to-end verification. If matt-head can't migrate without data loss or workflow regression, the migration is not done.
4. **Multiple concurrent Claude sessions can write to the same personal wiki safely.** Edit's `old_string`-matching provides optimistic concurrency for free: if two sessions try to edit the same page, the second gets a clean "string not found" error and retries. Filesystem atomicity handles creates and deletes. No lock protocol needed.
5. **The plugin is componentised into two MCP servers (voice, wiki).** Voice is the existing TTS server, untouched. Wiki is new — ported from matt-head's `src/wiki/` with migration-level improvements (dual-wiki search, description-weighted scoring, external mode).
6. **Capability neutrality, with a named orientation contract.** No matt-head or Together School specifics leak into plugin code. But the plugin *does* bake in the eight contract pages listed above — the interface between hooks/skills and the user's wiki. `/wiki-init` creates them on first run so every install starts with the contract satisfied.
7. **The door stays open for post-release generalisation and onboarding refinement without structural rework.** v2.0.0 locks the shape; v2.1 refactors the interior; v2.2 refines onboarding after the first real-user encounter.
8. **Usable out of the box with minimal onboarding; meaningful personalisation is earned via ongoing observation.** The plugin works for any user after answering the three onboarding questions. It does not require the user to describe their role, responsibilities, priorities, working style, or relationships. All of that gets learned — written to the personal wiki by the companion over time, referenced back to shape future behaviour. The base experience is generic and competent; the specialised experience emerges with use.

**Explicit non-goals for v2.0.0:**

- Works perfectly for business execs, pro devs, and vibe coders out of the box (deferred to Phase 7 generalisation pass).
- Onboarding is perfectly tailored per persona (deferred to Phase 8 onboarding refinements, after real-user encounters).

## Storage Architecture

Everything editable lives outside the plugin cache so reinstall never destroys user content.

```
~/.claude/aela-plugin/              # user state dir (survives reinstall)
├── wiki/                           # personal wiki
│   ├── index.md
│   ├── raw/
│   │   └── log.md                  # no sources.md — personal wiki has no file sources
│   └── pages/
│       ├── tasks-active.md
│       ├── team-state.md
│       ├── working-preferences.md
│       ├── user-profile.md
│       ├── reflections.md
│       ├── comms-sources.md
│       └── <user-created pages>.md
├── personality.yaml                # user's customised personality
└── settings.json                   # TTS voice, rate, etc.

<project>/.aela/                    # per-project state (in project repo)
└── wiki/
    └── project/
        ├── index.md
        ├── raw/
        │   ├── log.md
        │   └── sources.md          # yaml format, tracks ingested sources
        └── pages/
            └── <project pages>.md

~/.claude/plugins/cache/...         # plugin code (wiped on reinstall)
├── personalities/
│   └── default.yaml                # shipped template
├── PLUGIN-FEATURES.md               # shipped contract doc
├── mcp-servers/
│   ├── voice/
│   └── wiki/
├── skills/
└── hooks/
```

**Path resolution.** All paths resolve via `os.homedir()` — Windows `%USERPROFILE%\.claude\` and Unix `~/.claude/` both work without special-casing.

**Project wiki naming.** `.aela/wiki/project/` leaves room for `.aela/` to hold other per-project state in the future without a second dotdir. The `project/` subdirectory matches the per-wiki layout and leaves room for other wiki types if they're ever added.

**Personal wiki is plugin-named, not companion-named.** Users who rename their companion in `/aela-init` do not move files. Multi-user systems do not collide if two users name their companions the same thing.

**Personality template vs user copy.** Plugin ships `personalities/default.yaml` as a template. On first run `/aela-init` copies it to `~/.claude/aela-plugin/personality.yaml`. All edits (via `update_personality` MCP tool or hand edits) write to the user copy. The TTS server reads the user copy if present, falls back to the template otherwise. Reinstall rewrites the template but does not touch the user copy.

**Template refresh on plugin upgrade.** When the plugin ships a new template, `/aela-init` can be re-run to offer a refresh. It cannot tell what's user-customisation vs an older template, so it presents the current user file and the new template side by side and lets the user pick what to merge. v2.0.0 ships user-driven refresh only. Automatic merging is deferred.

## MCP Server Packaging

Two servers under `plugin/mcp-servers/`, each with its own `package.json`.

| Directory | Purpose |
|---|---|
| `mcp-servers/voice/` | Existing TTS server. Unchanged. |
| `mcp-servers/wiki/` | New. Hosts the wiki tool surface. Ports from matt-head's `src/wiki/store.js`, `src/mcp-tools.js`, `src/mcp-server.js`. |

**Shared dependency.** `yaml@^2.8.3` is already a TTS dep (used for personality parsing). Wiki server reuses it for frontmatter assembly, sources.md parsing, and wiki index generation. No new root dep required.

**Wiring.** Both servers registered in `plugin/.mcp.json`. Wiki tools become available via their MCP namespace assigned by Claude Code based on server ID.

## Wiki Tool Surface

Seven MCP tools exposed by the wiki server.

| Tool | Purpose |
|---|---|
| `wiki_create` | Create a new page. Typed params: `wiki`, `page`, `title`, `category`, `description`, `body`, optional `tags`, optional `logEntry`. Errors if the page already exists. Auto-reindexes the wiki after successful create. |
| `wiki_delete` | Remove a page. File removal, auto-reindex, log entry. |
| `wiki_read` | Read a page. Errors on missing (agents fix good errors). Optional `path` parameter triggers external mode for federation — `wiki: 'external', path: '<abs-path>', page: '<name>'`. |
| `wiki_list` | List all pages in a wiki (returns `index.md`). |
| `wiki_search` | Keyword search across **both** wikis in one call. No `wiki` parameter. Results tagged with which wiki each hit came from. Scores matches as **Title > Description > Body** (concrete weights subject to tuning: title ×15, description ×8, body ×1 per term capped at 5). Description weight sits between title and body because a description is curated prose that explicitly summarises the page. |
| `wiki_update_index` | Rebuild `index.md` from pages on disk. |
| `wiki_log` | Read recent wiki activity. |

**Updates deliberately do not go through an MCP tool.** Updating an existing page is the job of the `wiki-update` skill, which uses the Edit tool directly. Edit's `old_string`-matching preserves frontmatter by not touching it and provides optimistic concurrency for free — if two sessions try to edit the same region, the second gets a clean error and retries with a fresh read.

**Frontmatter discipline.** Every page has YAML frontmatter with at minimum `name`, `description`, `category`, `created`, `updated`. `wiki_create` enforces the schema on creation. `wiki-update` preserves all frontmatter by editing only the body.

## Skills Shipped with the Plugin

Seven skills under `plugin/skills/`.

| Skill | Purpose |
|---|---|
| `/aela-init` | Identity and voice onboarding. Asks the user's name, offers voice selection, tests TTS, copies the default personality template to the user's personality.yaml, offers to chain into `/wiki-init`. Also the re-run target for plugin template refreshes. |
| `/wiki-init` | Wiki bootstrap. Creates `~/.claude/aela-plugin/wiki/` if absent, creates `<project>/.aela/wiki/project/`, creates `docs/wiki-ingest/`. Scaffolds the eight contract pages. Scans the project for pre-existing ingestable sources. Offers to chain into `/comms-init`. |
| `/comms-init` | Socratic comms onboarding. Asks which services the user uses (Teams / Slack / Gmail / Discord / whatever). Opens each in a tab via Chrome tools. Waits for login. Explores the UI. Asks pointed questions about priorities and what to extract. Writes everything into the user's `comms-sources` wiki page. Can be re-run at any time to add a new service. |
| `/check-comms` | Generalised comms scan. Shape-only: reads `comms-sources`, scans each enabled service, extracts tasks/decisions/knowledge, classifies, updates relevant wiki pages, returns a brief summary. Zero service names, zero selectors, zero Together School references in the skill body — everything user-specific or service-specific lives in `comms-sources`. |
| `/wiki-update` | Edit-based update flow for existing pages. Plugin-level (not project-level) so subagents dispatched by cron can use it everywhere without per-project setup. Walks the caller through: Edit body → assess whether description needs refreshing → call `wiki_update_index`. |
| `/wiki-ingest` | Automated source ingestion. Reads flagged sources (superpowers specs/plans across the workspace, `docs/wiki-ingest/*.md`, external `.aela/wiki/` indexes from sibling repos), decides which wiki page each belongs to, updates that page via `/wiki-update`, marks the source as ingested in `sources.md`. Runnable as `/wiki-ingest` (process all flagged) or `/wiki-ingest <path>` (targeted). Completes the Karpathy synthesis loop — sources in, wiki pages out, trackable. |
| `/turn-end` | Rich three-step close: reflect → speak → comms self-heal (if enabled). Reflection has four sub-questions documented in Hooks. |

## Personality Addition

The plugin ships `personalities/default.yaml` as a template. `/aela-init` copies it to `~/.claude/aela-plugin/personality.yaml` on first run.

Add a `how_i_remember` section to the default template:

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

**Tone is warm, first-person, disposition-level.** No tool names, no page names, no mechanics. The "how and when" lives in `PLUGIN-FEATURES.md` — that's the hard-instruction layer.

## Hooks

Two SessionStart hooks (run in order) and one Stop hook.

### `wiki-maintenance.js` (SessionStart)

Scans the workspace for un-ingested sources and flags wiki health issues. Emits a plain text message listing:

- Un-ingested superpowers specs/plans across the workspace (globs `**/docs/superpowers/specs/**/*.md` and `**/docs/superpowers/plans/**/*.md` from `WORKSPACE_ROOT`, defaults to one level above project root)
- Un-ingested docs in `**/docs/wiki-ingest/**/*.md`
- New or stale `.aela/wiki/` directories in sibling repos (portal-page ingestion targets)
- Wiki pages missing `description:` frontmatter
- Any other health checks worth surfacing

Filter: keep files that are untracked OR last-committed by the current user (`git config user.email`). Skip files committed by anyone else — their own `wiki-maintenance.js` will handle them.

Reads and writes `sources.md` via the `yaml` lib directly (it's a Node script, the dep is available locally).

### `session-orient.js` (SessionStart)

Runs `wikiUpdateIndex` on both wikis (non-fatal try/catch) to catch any pages delivered via git pull. Then emits `additionalContext` containing, in order:

1. **User name injection line** — `User is called {name}`, read from `personality.yaml`'s `user_name` field. Exists so the companion never loses track of who it's talking to once user-specific strings have been stripped from skill bodies.
2. **PLUGIN-FEATURES.md contents** — the plugin's self-description. Concise, hand-maintained, versioned with each release. Under 100 lines. One line per skill, one line per MCP tool, grouped by server. Includes the baseline worth-persisting criteria, the reflections tight-filter rule ("would this appear on the user's job spec if job specs were honest"), and the "always address the user by name" imperative.
3. **Aela wiki index** (full `index.md`).
4. **Project wiki index** (full `index.md`).
5. **Five orientation pages in full:** `tasks-active`, `team-state`, `working-preferences`, `user-profile`, `reflections`.
6. **Comms cron reschedule sentinel** (if comms is enabled).

`comms-sources` is not in the orientation set — it's read on demand by `/check-comms` and `/comms-init`.

### `turn-end.js` (Stop)

Plugin-owned. Invokes the `/turn-end` skill. In v2.0.0 the plugin's `/turn-end` is rich — it replaces matt-head's project-level override entirely. No more divergence between the plugin version and the project version.

Three phases: **reflect → speak → comms self-heal**. Reflect is async-masked by speak's TTS playback, so any reflection output lands silently under the audio.

**Reflection — four questions:**

1. **Is anything from this turn worth persisting to wiki?** Against the baseline in PLUGIN-FEATURES.md:
   - *Decisions* — non-obvious calls the user made, with the reason
   - *Tasks-active updates* — something moved (Now → Done, Watch → Next, Blocked unblocked)
   - *People / team-state* — someone's focus shifted, a new person entered the orbit
   - *Cross-references* — if one fact affects multiple pages, update them all

   Plus the user-specific extensions from the injected `reflections` page (seeded by `/aela-init` and grown by question 4 below).

2. **Are any sources flagged by the session-start maintenance hook still un-ingested?** If yes, run `/wiki-ingest` now, or state the reason for deferring (mid-task, user waiting on output). Silent ignore is not allowed — the flag persists until acted on or explicitly deferred.

3. **Did I learn something about the user as a person?** Working style, preferences, decision patterns, reactions, anything that transcends this project. If yes, update `user-profile` (structural) or `working-preferences` (interaction rules) — whichever fits. Do not pile observations into `reflections`: that page is a configuration, not a learning store.

4. **Should `reflections` itself be updated?** Did a new user-specific watchlist category become visible this turn? Apply the tight filter: **would this appear on the user's job spec if job specs were honest of the day-to-day work?** If yes, add. If no, skip. This keeps the page calibrated — high signal, not a junk drawer.

Then speak. Then comms self-heal (only if the comms cron is enabled and the sentinel hasn't fired yet this session).

## External Wiki Federation

External wikis are a source type — nothing more. They go through the same flag-and-synthesise flow as doc sources.

**Pattern:**

- Collaborator wikis are surfaced via **portal pages** in the local project wiki.
- One lightweight entry per external wiki in the project wiki index.
- Portal page body = verbatim copy of the external `index.md`.
- Portal page `description` = synthesised one-liner **filtered through what the companion knows about the user's role and interests**. Not a neutral summary.
- Access on demand via `wiki_read(wiki: 'external', path: '<abs-path>', page: '<name>')` for drill-in beyond the index.

**Flow:**

1. `wiki-maintenance.js` detects a new or changed `.aela/wiki/` directory in a sibling repo and flags it in the session-start report.
2. The user (or the companion on their behalf) runs `/wiki-ingest` on the flagged entry.
3. `/wiki-ingest` reads the external `index.md`, creates the portal page via `wiki_create` (body = verbatim, description = role-filtered), marks the external wiki as ingested in `sources.md`.
4. If the external `index.md` changes later, `wiki-maintenance.js` flags it as "re-ingest". `/wiki-ingest` overwrites the portal page body and refreshes the description.

**Cold start.** If the personal wiki hasn't accumulated enough content to meaningfully filter descriptions, the synthesis falls back to neutral. It sharpens as learning accrues.

**Symmetric by nature.** Any plugin install is both a consumer and a potential source. No special producer-side setup — if `.aela/wiki/index.md` is in the repo, collaborators who clone it get the wiki. Git commit policy for the wiki is left to the user.

## Source Tracking

`sources.md` in YAML format lives in the project wiki only. The personal wiki has no `sources.md` because it has no file-based sources — it grows via conversation, comms scans, and turn-end reflection.

**Location:** `<project>/.aela/wiki/project/raw/sources.md`

**Format:** YAML list keyed by workspace-relative path:

```yaml
sources:
  - path: matt-head/docs/superpowers/specs/2026-04-13-wiki-design.md
    mtime: 2026-04-13T22:14:00Z
    ingested: true
    ingested_at: 2026-04-13T23:01:00Z
    notes: "Folded into wiki/project/pages/aela-voice.md"
  - path: zoho-api/docs/superpowers/specs/2026-04-08-zoho-transport-form-design.md
    mtime: 2026-04-08T11:20:00Z
    ingested: false
```

**Read and write paths:**

- `wiki-maintenance.js` parses and writes via the `yaml` lib directly (Node script, dep available).
- `/wiki-ingest` skill modifies via `Read` + `Edit` — the YAML shape is predictable enough that Edit's `old_string` match on a specific path handles "flip ingested false → true" cleanly.

**Workspace-relative paths.** All sourceIds are workspace-relative (`matt-head/docs/...` not `docs/...`). This is the only stable form across sibling-repo discovery.

## Migration Sequence

v2.0.0 ships at the end of Phase 6. Phases 7 and 8 are post-release work with their own version targets.

### v2.0.0 scope — Phases 0 through 6

**Phase 0 — Pre-flight.** Verify matt-head wiki hardening is stable. Freeze the reference state. Nothing user-visible. This phase exists to stop anyone skipping the "is matt-head actually in a good state to migrate from?" check.

**Phase 1 — Wiki MCP server port.** Create `plugin/mcp-servers/wiki/` with its own `package.json`. Reuse the existing `yaml@^2.8.3` dep. Port `store.js`, `mcp-tools.js`, `mcp-server.js` from matt-head. Apply the migration-level improvements:

- Personal and project wiki paths (not matt-head's `wiki/aela` and `wiki/codebase`)
- Dual-wiki search (`wiki_search` searches both, no `wiki` param, results tagged)
- Description-weighted scoring (Title > Description > Body)
- External mode for `wiki_read`

Wire into `plugin/.mcp.json`. Verify tool surface end-to-end.

**Phase 2 — Hooks port.** Port `session-orient.js` and `wiki-maintenance.js` into `plugin/hooks/`. Apply:

- Session-orient injects the user name line and PLUGIN-FEATURES.md alongside the indexes and five orientation pages
- Wiki-maintenance uses workspace-relative glob discovery, git-authorship filter, yaml `sources.md`, `docs/wiki-ingest/` glob (not `docs/analysis/`), `.aela/wiki/` sibling detection

Wire both into plugin hooks config.

**Phase 3 — Skills.** Port `wiki-update` verbatim from matt-head to `plugin/skills/wiki-update/`. Build the six new or upgraded skills:

- `/aela-init` (with three-question onboarding, personality template copy, companion naming, chain into `/wiki-init`)
- `/wiki-init` (personal and project wiki creation, contract page scaffolding, source scan, chain into `/comms-init`)
- `/comms-init` (socratic onboarding, seeds `comms-sources`)
- `/wiki-ingest` (flag-driven ingestion loop, completes Karpathy synthesis)
- Upgraded `/turn-end` (rich three-step with four-question reflection)
- Generalised `/check-comms` (aggressive strip of all service-specific content from skill body)

Delete the plugin's minimal `/turn-end` (the rich version replaces it).

**Phase 4 — Personality and PLUGIN-FEATURES.md.** Add the `how_i_remember` section to `plugin/personalities/default.yaml`. Write `plugin/PLUGIN-FEATURES.md` from scratch — Karpathy-grounded wiki guidance, full tool surface, contract pages, baseline worth-persisting criteria, reflections tight filter, user-name imperative, when to reach for `wiki_search`. Under 100 lines. Wire session-orient to inject it.

**Phase 5 — README rewrite.** Full rewrite of `plugin/README.md`. Sections: pitch, quick-start, features, installation, configuration, skills reference, MCP servers reference, architecture overview, personality customisation, subagent CLAUDE.md gotcha, troubleshooting, contributing. Replaces the current TTS-only README. First-class user-facing document.

**Phase 6 — Matt migration (canary).** The end-to-end verification. Steps:

- Split `matt-head/wiki/aela/` → `~/.claude/aela-plugin/wiki/` (restructure to match new layout)
- Split `matt-head/wiki/codebase/` → `matt-head/.aela/wiki/project/`
- Delete `matt-head/wiki/`
- Copy `plugin/personalities/default.yaml` → `~/.claude/aela-plugin/personality.yaml` with Matt's existing customisations preserved
- Migrate matt-head `sources.md` to YAML format at the new location
- Rename `matt-head/docs/analysis/` → `matt-head/docs/wiki-ingest/`
- Delete matt-head's duplicate wiki store and MCP code (`src/wiki/`, relevant parts of `src/mcp-tools.js`, `src/mcp-server.js`) — plugin owns these now
- Delete matt-head's project-level `/turn-end` and `/wiki-update` skill overrides — plugin versions cover everything
- Rename `matt-head/wiki/aela/pages/matt-profile.md` → `user-profile.md` as part of the split
- Verify all existing workflows still work (comms scan, session orientation, wiki update, wiki ingest, turn-end)
- Re-run `/comms-init` end-to-end as the generalisation canary — also the acceptance test for the generalised `/check-comms`

**Tag v2.0.0 at end of Phase 6.**

### Post-v2.0.0

**Phase 7 — Generalisation and self-learning architecture (v2.1).** Two-part work:

- **Code and skill cleanup.** Strip any remaining matt-head or Together School leakage from plugin code and skills. Make base behaviour genuinely neutral — no assumed role, no assumed tech stack, no assumed working style. Pure refactoring, no second-user encounter required.
- **Self-learning architecture.** Verify the turn-end active-learning clause and the reflections update loop are load-bearing enough to drive meaningful personal-wiki growth. If not, add mechanism: consultation patterns (how the companion references learnings when making decisions), synthesis passes (periodic "what have I learned about this user lately" reviews), confirmation loops (surface "I think you prefer X, right?" to avoid building on misreads). Goal: after a few weeks of use, the personal wiki holds enough observed truth about the user that the companion's behaviour is noticeably tailored without the user having explained anything.

**Phase 8 — Onboarding refinements (post-Kevin, v2.2).** Clean install on a non-Matt user's machine. Walk `/aela-init` → `/wiki-init` → `/comms-init` on their project. Capture every friction point, every assumption that didn't hold, every awkward prompt. Refine the three init skills based on real encounters.

**TBD — Comms session architecture redesign.** Design the right pattern for comms running alongside active work: keep conversational visibility (companion surfaces findings in real time) while losing cycle noise (UI not flooded with scan events, visible interrupt only when something important lands). Not a session split — something smarter, probably notification-based. Revisited after Phase 8.

## Open Questions

Only one question carries forward. Everything else is resolved.

**Comms session architecture.** How do we keep the conversational visibility of comms running in the active session (the companion surfaces findings in real time, the user can immediately respond to what's surfacing) while losing the cycle noise (UI flooded with scan events, interface cycles every 20 minutes)?

*Where it matters.* The split-session launcher was originally going to ship in v2.0.0, and we deferred it because a full session split throws away the thing that makes in-session comms valuable.

*Possible shapes.*

- Background process with an IPC or file-based notification channel that the active session polls at turn boundaries
- Comms in a separate session that writes "urgent" findings to a file the active session's session-orient or turn-end hook reads
- Hook-driven: a SessionStart or PreToolUse hook checks for new urgent comms findings and injects them as context

*Decision deferred to post-v2.2,* after Phase 7 generalisation and real-user encounters inform the constraints.

## What This Unblocks

With v2.0.0, aela-voice stops being a TTS plugin and becomes the thing it was always meant to be: a companion that follows its user across every project they work in. The personal wiki lives outside any project, outside any plugin cache, and outside any session — it's the user's, permanently, and it grows every turn a meaningful observation lands.

The immediate payoff is that the plugin is now installable. Kevin, Jose, or anyone else can run the three-question onboarding (`/aela-init` → `/wiki-init` → `/comms-init`) and have a working companion in minutes. The base experience is generically competent; the specialisation grows with use. Nobody has to describe themselves upfront — the plugin watches, reflects, and builds its model of the user over time.

The second payoff is team-scale federation. Once multiple people on a team are running the plugin, their per-project wikis become readable to each other via portal pages. A collaborator joining a repo clones it and inherits the accumulated knowledge about that codebase without any explicit handoff. Knowledge stops dying when sessions end.

The third payoff is architectural. The plugin is now structured cleanly enough that generalisation (Phase 7), onboarding refinements (Phase 8), and the comms-session architecture redesign can all happen without rebuilding foundations. v2.0.0 locks the shape; v2.1 and beyond refine it.

**What the first week of use actually looks like — a concrete example.** Kevin installs the plugin on a Monday. `/aela-init` asks his name, his voice preference, and what kind of work he does. He picks a companion name, tests the voice, and gets orientation. `/wiki-init` creates his personal wiki, asks him what project he wants to set up first, and scaffolds the contract pages with empty bodies. `/comms-init` walks him through Teams and Slack, opens each in a tab, watches him navigate, asks pointed questions about which channels actually matter, and writes everything to his `comms-sources`. By Monday afternoon he has a voice companion, a working wiki, and a comms scan he can kick off.

Tuesday and Wednesday he works. His companion watches. Turn-end reflection starts populating `reflections` — "Kevin cares about new customer signups landing in the pipeline channel", "Kevin wants to be told immediately when HR flags a contract issue", "Kevin asks about Q2 marketing budget three times before lunch every Monday". Small observations, each filtered through the job-spec test, each growing the watchlist.

By Friday his `working-preferences` has captured a handful of patterns — how he likes to be pushed back on, when he wants options vs. a recommendation, whether he wants the voice talking during meetings or only at turn-end. `user-profile` holds the structural basics he named during onboarding, plus a few stable observations that promoted up from `reflections`.

By the end of week two, the comms scan is pulling real signal out of his Teams, not noise. His `tasks-active` is tracking what he actually committed to vs. what he only mentioned. His companion references him by name, knows his job, notices when a decision he just made contradicts one from three days ago, and says so.

None of this required Kevin to explain himself. He answered three questions and then went to work.

The underlying goal is simple: Aela — or Kev, or whatever the user names their companion — should feel less like a tool that starts fresh every session and more like a colleague who remembers the work, the people, and the user they're working with.
