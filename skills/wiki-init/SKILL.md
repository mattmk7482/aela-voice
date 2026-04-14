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
