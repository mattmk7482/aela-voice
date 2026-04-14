---
title: aela-voice v2.0.0 install polish pass — design
date: 2026-04-15
status: draft
---

# aela-voice v2.0.0 install polish pass — design

## Context

v2.0.0 Phases 1, 2, 3a, and 3b have shipped. Matt tested the full clean-install flow into `matt-head-test/` and the onboarding completed successfully — the personal wiki populated, `/aela-init` + `/wiki-init` ran, the contract pages exist. The install works.

Testing surfaced ten notes (`matt-head-test/notes.txt`) covering UX polish, first-run hand-holding, a turn-end voice calibration problem, an ambiguous `sources.md` lifecycle, and a silent half-init bug in `/wiki-init` where the project wiki directory is never created.

This spec covers the polish pass that blocks distribution of v2.0.0. No new features. No architectural change. Targeted edits to existing skills, hooks, and one store helper.

**Phase slot:** Phase 3c — install polish pass, between 3b and Phase 4.

## Out of scope

- Any new feature. Any migration work. Any change to the spec's locked decisions from the parent v2.0.0 design doc (`2026-04-14-wiki-migration-design.md`).
- Phase 4–6 work.
- The deferred Phase 7 split-session comms launcher.

## Ten notes → design

### 1. sources.md lifecycle + project wiki dir (notes 5, 6, 7 + wiki-init bug)

**Problem.** `sources.md` lives at `<project>/.aela/wiki/project/raw/sources.md` per the parent spec, but no code path actually creates it. `readSources()` gracefully returns `[]` when absent, so `wiki-maintenance.js` flags every discovered source forever until the first `/wiki-ingest` run happens to write the file as a side effect. The state is accidental, not designed.

Related: `/wiki-init` currently only touches the project wiki through a single `wiki_update_index(wiki: "project")` call tacked on as "also call" at the end of its prose. In the clean-install test, that call was skipped — the assistant saw no pages to index and moved on. Result: `matt-head-test/.aela/` doesn't exist at all. `docs/wiki-ingest/` got created (explicit `mkdir` in the skill) but the project wiki itself didn't.

**Fix.** Make `/wiki-init` responsible for seeding `sources.md` with every discovered source as `ingested: false`. This is deterministic, makes the "first scan is a real diff" invariant true from turn one, and materialises `.aela/wiki/project/raw/` as a side effect — closing the silent-half-init bug.

**Design.**

1. **Extract discovery into `store.js`.** Add `discoverWorkspaceSources()` to `mcp-servers/wiki/store.js`. It walks `WORKSPACE_ROOT`, runs the same glob + git-authorship filter `wiki-maintenance.js` currently implements inline, and returns `[{path, mtime}]` as workspace-relative ids. Single source of truth for discovery logic.
2. **`wiki-maintenance.js` refactors onto the helper.** Its `checkSources()` becomes a thin wrapper that calls `discoverWorkspaceSources()`, diffs against `readSources()`, and emits the report. No behavioural change to the session-start output.
3. **`/wiki-init` seeds `sources.md`.** New explicit step in the skill: call a small Node invocation that imports `discoverWorkspaceSources()` and writes `<project>/.aela/wiki/project/raw/sources.md` as a YAML document with every discovered entry as `{path, mtime, ingested: false}`. This runs whether or not any sources are found — an empty `sources: []` file is still created, so the file-exists invariant holds from install time.
4. **`/wiki-init` project-wiki materialisation is made non-optional.** The skill prose for `wiki_update_index(wiki: "project")` is rewritten from "also call" to a first-class step with explicit "this creates the project wiki directory — required" framing. As insurance, step 3 above already forces the directory into existence, so the update_index call becomes idempotent cleanup rather than the only creation path.

**Invariant after this fix:** immediately after `/wiki-init` completes, `<project>/.aela/wiki/project/` exists with a valid `raw/sources.md` containing every workspace-relative source discovered at that moment, all marked `ingested: false`. `/wiki-ingest` flips entries to `true` as it processes them. `wiki-maintenance.js` diffs against the file on every session start.

### 2. /aela-init question order and branching (notes 1, 2, 3, 10)

**Problem.** Current `/aela-init` hardcodes the assistant name to "Aela" in the personality template. Users can't rename the companion during onboarding. The voice question lists all available voices even when only the default exists (no cloned voices), which is a dead choice. No first-run reassurance about the "Stop hook blocking error" text the user sees on every turn once turn-end is wired — they reasonably think something is broken.

**Fix — question order becomes: assistant name → user name → work → voice.**

1. **Q1 assistant name.** Replaces the hardcoded "Aela" in the personality template. The personality YAML uses a `{{assistant_name}}` placeholder that `/aela-init` fills from the user's answer. Template ships with `Aela` as the placeholder default only in the literal documentation/examples, never in the shipped YAML field itself.
2. **Q2 user name.** Unchanged.
3. **Q3 work description.** Unchanged — seeds `user-profile`.
4. **Q4 voice.** Branches on `list_voices` count:
   - **If exactly one voice (the default):** do not list it. Instead say: *"You're on the default voice — you can clone your own from any 5+ second clip, and audiobook samples work best because of their studio-quality recording. Want to upload one now, or skip for today?"* If upload: chain into voice sample upload flow. If skip: proceed.
   - **If more than one voice:** list them as today, ask the user to pick.

**Final step — `IMPORTANT:` reassurance block.** `/aela-init` ends with a prominent `IMPORTANT:` labelled block reading something like: *"From now on you'll see a red-coloured 'Stop hook blocking error' message after every turn. **This is not an error.** It's how I hook into the end of each turn to run turn-end — reflect on what to persist, speak to you, and check comms. Your harness UI will show it as an error-shaped line. Ignore it."* The `IMPORTANT:` prefix exists so the user doesn't skim past it during the first-run information firehose. Lives in `/aela-init`, not `/wiki-init`, because `/aela-init` is the first skill a user runs and the noise window starts there.

### 3. Blank-state nudge (note 1)

**Problem.** A fresh session with no personality configured just loads the Orientation block with no prompt to onboard. The user has no signal that `/aela-init` exists or that they should run it.

**Fix.** `session-orient.js` gains a blank-state check: if `personality.yaml` is missing OR `user_name` is empty OR the assistant name is still the placeholder, the hook appends a single-line nudge to the Orientation injection:

> *No companion configured yet — run `/aela-init` to set up your companion's name, voice, and basic context.*

Deterministic. No LLM discretion. The existing file-existence check logic from Phase 2 cold-start work is the foundation — this adds one branch to the output.

### 4. Turn-end voice bias flip (note 8)

**Problem.** The current skill §2 says "skip trivial acknowledgements" and the LLM over-applies it to anything that doesn't feel like a big reveal. Substantive collaborative turns — note-taking, decision-locking, surfacing findings — produce silence when the assistant genuinely has a reaction. The "cautious default" produces missed moments.

**Fix.** Invert the default. §2 is rewritten so **speak is the default on every substantive turn**. Silence becomes the exception that needs justifying, not the norm. The trigger for silence is narrowed to pure user-side acks: the *user's* message was "ok", "got it", "thanks", or similar. If the user's message was substantive — a question, a decision, a correction, a handoff — speak fires.

**Wording direction (exact prose in the plan, not this spec):**

- Opening line becomes: *"Speak on every substantive turn. Silence is the exception."*
- Negative framing (skip list) narrows from assistant-side self-censorship to user-side ack detection.
- Add: *"If you had a reaction while writing the response, speak it. If you think 'this doesn't feel big enough' — that's the cautious default re-asserting itself. Override it."*

This is a rigid rule, not a flexible one. The skill type is corrective.

### 5. Turn-end silence on no-op persist and comms-heal (note 4)

**Problem.** Turn-end §1 currently prints `nothing to persist` as a visible line, and §3 prints `check-comms Started` plus a "sentinel present" confirmation. Neither carries information the user can act on. The visible lines add noise to a turn-end window that's already heavy with the Stop-hook error text, skill output, and tool call traces.

**Fix.** Silence the no-op paths in §1 and §3 only.

- **§1:** remove the `nothing to persist` literal output. If the answer to "is anything worth persisting" is no, continue silently to §2.
- **§3:** remove the "sentinel present" output on the yes-branch. Continue silently. Also remove any confirmation text on successful `CronCreate` — the sentinel line itself (`check-comms Started`) is still written because the attention-token pattern depends on it, but no surrounding commentary.

**Scope lock — speak is untouched.** This silence rule applies to §1 and §3 *only*. §2 retains the bias flip from note 8: speak is the default on substantive turns, silence is the exception for user-side acks. The spec wording must be explicit that collapsing "no-op = silent" across all three steps is incorrect — a no-op in §1 and §3 does not imply a no-op in §2.

### 6. Chrome extension hand-holding (note 9)

**Problem.** When `/comms-init` invokes a browser tool and the Claude-in-Chrome extension isn't connected, the current failure message just says "start Chrome and make sure the extension is active." The user hits this on first run by definition and doesn't know what menu, icon, or toggle to use.

**Fix.** `/comms-init` gains a prerequisite-check block at the top that verifies the extension is connected before invoking any browser tool. If the check fails, the skill prints concrete hand-holding steps: where the extension icon lives in Chrome, how to click it to connect to the current Claude Code session, any toggle the user needs to flip. Inlined in `/comms-init` — no shared preamble, because `/comms-init` is currently the only Chrome-driven skill in the plugin. If that changes later, we extract.

**Exact wording TBD during implementation** — Matt will supply the current UI steps, assistant drafts the prose, Matt edits.

## Verification

The verification model for this phase is "install into a fresh directory and walk the onboarding". No automated tests.

Checklist to run from a clean `~/.claude/aela-plugin/` and empty project directory:

1. Start a session in the empty project. Orientation block should include the "No companion configured yet" nudge.
2. Run `/aela-init`. Verify:
   - First question asks for the *assistant's* name.
   - Second question asks for the user's name.
   - Third asks for work description.
   - Fourth checks `list_voices`: if only default, skip the list, explain cloning, offer upload or skip.
   - Final message is a prominent `IMPORTANT:` block about the Stop-hook error text.
3. Run `/wiki-init`. Verify:
   - Personal wiki populated with six contract pages.
   - `<project>/.aela/wiki/project/` exists.
   - `<project>/.aela/wiki/project/raw/sources.md` exists and contains every workspace-discovered source as `ingested: false`.
   - `<project>/docs/wiki-ingest/` exists.
4. Restart the session. Verify:
   - `wiki-maintenance.js` output flags only un-ingested sources (should match the list in `sources.md`, not a full re-walk).
   - No orientation nudge (companion now configured).
5. Run `/comms-init` with the Chrome extension disabled. Verify the failure message includes concrete extension-enablement steps.
6. Do a substantive collaborative turn (note-taking, decision-locking). Verify turn-end §2 speaks.
7. Do a user-ack turn ("ok", "thanks"). Verify turn-end §2 is silent.
8. Do a turn with no wiki persistence needed. Verify no "nothing to persist" line appears.
9. Do a turn on an already-scheduled comms cron. Verify no "sentinel present" line appears.

All nine pass → ready for distribution.

## Files touched

- `plugin/mcp-servers/wiki/store.js` — add `discoverWorkspaceSources()`.
- `plugin/hooks/wiki-maintenance.js` — refactor `checkSources()` onto the helper.
- `plugin/hooks/session-orient.js` — blank-state nudge branch.
- `plugin/skills/aela-init/SKILL.md` — question order, assistant name, voice branching, IMPORTANT: block.
- `plugin/skills/wiki-init/SKILL.md` — sources.md seeding step, project-wiki materialisation framing.
- `plugin/skills/comms-init/SKILL.md` — Chrome extension prerequisite block.
- `plugin/skills/turn-end/SKILL.md` — speak bias flip, §1 and §3 silence.
- `plugin/personalities/default.yaml` — `{{assistant_name}}` placeholder replaces hardcoded `Aela`.

## Open questions

None. All ten notes resolved and locked in the brainstorm log.
