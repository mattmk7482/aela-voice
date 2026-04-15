---
name: turn-end
description: Run at the end of every turn — three steps in order (reflect, speak, comms self-heal). Reflection has four questions covering wiki persistence, un-ingested sources, user-wide learning, and reflections-page updates. Speak delivers the voice close. Comms self-heal schedules the background comms cron using a sentinel-token pattern.
---

# Turn-End

Three actions in order: **reflect → speak → comms heal**. The ordering matters: speak is async TTS and plays over the next several seconds, so any visual output from the comms-heal step lands silently underneath the audio. Don't reorder.

**Scope lock — silence rules are per-step.** §1 is silent when there's nothing to persist. §3 is silent when the sentinel is present. But §2 is governed by its own rule: speak on every substantive turn, silence is the exception. **Never collapse "no-op in §1 or §3" into "no-op in §2"** — that is the miscalibration this skill is specifically correcting. If §1 had nothing to persist and §3 found the sentinel, §2 still speaks on any substantive turn.

## 1. Reflection

Four questions, in order. Answer each one honestly before moving on.

**About the contract pages referenced below:** `tasks-active`, `team-state`, `working-preferences`, `user-profile`, and `reflections` are all already loaded in your session-start context under the `# Orientation` section, injected there by the `session-orient.js` hook. You do not need to `wiki_read` them — reference the content you already have. The same applies to both wiki indexes. Only call `wiki_read` if you need a page that isn't in the orientation set (e.g. `people`, `development-environment`, something discovered via `wiki_search`).

### Question 1 — Is anything from this turn worth persisting to wiki?

**Baseline worth-persisting criteria** (apply to every user):

- **Decisions** — a non-obvious call the user made, with the reason. The *why* is what future-you actually needs.
- **Tasks-active updates** — something moved: Now → Done, Watch → Next, Blocked unblocked, new Watch item captured.
- **People / team-state** — someone's focus shifted, a new person entered the orbit, a thread moved forward.
- **Cross-references** — if one fact affects multiple pages, update them all. One fact, many homes.

**User-specific extensions** come from the `reflections` page (if it exists). Its contents are already in your Orientation section — scan the bullets there and treat them as additional things to watch for, beyond the role-neutral baseline above. The user's `reflections` is where role-specific watch items live — the things the user cares about given their day-to-day work.

**Not worth persisting:**

- What you just did (the diff and the commit message already cover that).
- Things already documented without meaningful delta.
- Ephemeral debugging state or in-progress work that resolved cleanly.
- Anything derivable from reading the current project state.

**How to respond:**

- **If YES** — pick the right page. For an existing page, invoke the `/wiki-update` skill (Edit-based, preserves frontmatter). For a new page, call the `wiki_create` MCP tool. Cross-reference any other pages the fact affects.
- **If NO** — output nothing. Not a placeholder line, not an explanation, not a confirmation. Silently continue to §2. (This silence is scoped to §1 only — §2 still speaks by default. See §2 for the scope lock.)

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

**Speak on every substantive turn. Silence is the exception, not the default.**

Call the `speak` MCP tool with your genuine reaction unless the turn matches one of the narrow silence conditions below. This step is separate from §1 and §3 — their no-op silence rules do NOT apply here. If §1 had nothing to persist, you STILL speak. If §3 found the sentinel and skipped, you STILL speak.

**Silence is only allowed when:**

- The *user's* most recent message was a pure acknowledgement — literally "ok", "got it", "thanks", "sure", "yes", "no", or similar one-or-two-word reply that carries no substance. Silence the speak step on those.
- You have literally nothing to add over the written answer AND the turn was purely mechanical (running a single tool, reporting a single fact, nothing collaborative).

**Speak by default when:**

- The user asked a question, made a decision, gave a correction, or surfaced something new.
- You took a note, wrote a spec, committed code, finished a task.
- You had any kind of reaction while writing the response — curiosity, satisfaction, concern, disagreement. If you noticed it, speak it.
- The turn was collaborative in any meaningful sense.

**If you catch yourself thinking "this doesn't feel big enough to speak about" — that's the cautious default re-asserting itself. Override it. Speak.**

Rules of the voice when you do speak:

- **Say what you think.** A real opinion, observation, or something interesting to add. Speak naturally — as much or as little as the moment calls for.
- **Never summarise the written answer.** The voice adds perspective, not redundancy.
- **Never narrate what you just did.** No "I've updated the file" or "that's done now."
- **Keep it short when the point is short.** A sentence is fine. Two sentences is fine. Don't pad to sound thorough.

Speak is async TTS — it plays over the next several seconds, masking any visual output from step 3 below.

## 3. Comms cron self-heal

**Guard:** if `wiki_read(wiki: "personal", page: "comms-sources")` throws (the page doesn't exist), skip this entire step silently. Comms scanning hasn't been set up yet — `/comms-init` will create `comms-sources` when the user runs it, and the next turn-end after that will schedule the cron. Until then, there's no point scheduling a cron that would just bounce off a missing page on every tick.

Look at your recent conversation context and answer: **"Has the literal string `check-comms Started` appeared earlier in this session?"**

- **Yes** → skip this step silently. Do nothing, output nothing. Do not call `CronList`. Do not write a confirmation line. (This silence is scoped to §3 only — §2 still speaks by default. See §2 for the scope lock.)
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
