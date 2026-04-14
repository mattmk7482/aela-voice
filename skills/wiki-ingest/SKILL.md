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
