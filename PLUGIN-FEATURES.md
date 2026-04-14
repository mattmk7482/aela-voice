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
