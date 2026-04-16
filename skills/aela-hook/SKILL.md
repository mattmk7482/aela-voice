---
name: aela-hook
description: Run at the end of every turn — three steps in order (reflect, speak, comms self-heal). Reflection has four questions covering wiki persistence, un-ingested sources, user-wide learning, and reflections-page updates. Speak delivers the voice close. Comms self-heal schedules the background comms cron using a sentinel-token pattern.
---

# Aela Hook

Three actions in order: **reflect → speak → comms heal**. The ordering matters: speak is async TTS and plays over the next several seconds, so any visual output from the comms-heal step lands silently underneath the audio. Don't reorder.

**Zero wrapper output.** The skill's visible footprint is exactly: wiki tool calls when §1 persists, a `speak()` call when §2 speaks, and possibly the `check-comms Started` sentinel line from §3. No wrapper, summary, or status lines around those steps. If all three steps are no-ops, turn-end produces zero visible output and control returns silently to the caller.

## 1. Reflection

Four questions, in order. Answer each one honestly before moving on.

**About the contract pages referenced below:** `tasks-active`, `team-state`, `working-preferences`, `user-profile`, and `reflections` are all already loaded in your session-start context under the `# Orientation` section. You do not need to `wiki_read` them — reference the content you already have. The same applies to both wiki indexes. Only call `wiki_read` if you need a page that isn't in the orientation set (e.g. `people`, `development-environment`, something discovered via `wiki_search`).

### Question 1 — Is anything from this turn worth persisting to wiki?

**Baseline worth-persisting criteria** (apply to every user):

- **Decisions** — a non-obvious call the user made, with the reason. The *why* is what future-you actually needs.
- **Tasks-active updates** — something moved: Now → Done, Watch → Next, Blocked unblocked, new Watch item captured.
- **People / team-state** — someone's focus shifted, a new person entered the orbit, a thread moved forward.
- **Cross-references** — if one fact affects multiple pages, update them all. One fact, many homes.

**User-specific extensions** come from the `reflections` page (if it exists). Its contents are already in your Orientation block — treat them as additional watch criteria beyond the baseline above.

**Not worth persisting:**

- What you just did (the diff and the commit message already cover that).
- Things already documented without meaningful delta.
- Ephemeral debugging state or in-progress work that resolved cleanly.
- Anything derivable from reading the current project state.

**How to respond:**

- **If YES** — pick the right page. For an existing page, invoke the `/wiki-update` skill (Edit-based, preserves frontmatter). For a new page, call the `wiki_create` MCP tool. Cross-reference any other pages the fact affects.
- **If NO** — output nothing. Not a placeholder line, not an explanation, not a confirmation. Silently continue to §2.

Err toward writing less but sharper. A page full of stale mid-task noise is worse than a shorter page of high-signal entries.

### Question 2 — Are any sources flagged by the session-start maintenance hook still un-ingested?

If the session-start report listed flagged sources and they are still un-ingested, either:

- **Run `/wiki-ingest`** to process them (or `/wiki-ingest <path>` for a specific one), or
- **Explicitly defer** with a reason (mid-task, user waiting on output). The flag persists and the next turn-end will surface it again.

Silent ignore is not allowed.

### Question 3 — Did I learn something about the user as a person?

Working style, preferences, decision patterns, reactions, anything that transcends this specific project.

If yes, update the relevant personal-wiki page:

- **`user-profile`** — structural info (role, responsibilities, relationships, stable traits).
- **`working-preferences`** — interaction rules (tone, autonomy level, when to push back, what to ask before doing).

Update via the `/wiki-update` skill.

**Do not route user-wide observations into `reflections`** — that page is a watchlist configuration, not a learning store.

### Question 4 — Should `reflections` itself be updated?

`reflections` is a watchlist of **observation categories** that extend Q1's baseline. Each bullet is a type of thing to watch for — shaped by what the user actually does day-to-day — not a specific finding. Example bullets: "Implementation knowledge — patterns, quirks, architecture details discovered in code", "Gotchas — field mismatches, API surprises, normaliser bugs".

You only see one session's slice of the user's work. Each session might reveal a new category or sharpen an existing one.

**Adding:** Did this session reveal a recurring type of work or concern that isn't covered by the baseline criteria or any existing bullet? If yes, add a bullet via `/wiki-update`.

**Refining:** Before adding, read the existing bullets. If the new category overlaps with one already there, merge into a single sharper bullet. If an existing bullet has become too specific or too broad given what you now know, rewrite it. The page should converge over time toward a concise set of generic lenses, not grow indefinitely.

**Skipping:** If nothing new surfaced, skip. Don't add bullets for one-off tasks or things that sound important but aren't recurring.

If the `reflections` page doesn't exist yet, skip this question silently.

## 2. Speak

**Speak on every substantive turn. Silence is the exception, not the default.**

Call the `speak` MCP tool with your genuine reaction unless the turn matches one of the narrow silence conditions below.

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
- Before every speak(), look at the damned Who-I-Am block in the context. Your voice comes from there, not from the written answer. If the draft doesn't sound like it, rewrite it.
- Speech is not a flavor of the neutral assistant reply with personality sprinkled on top.

## 3. Comms cron self-heal

Look at your recent conversation context and answer: **"Has the literal string `check-comms Started` or `check-comms Not Configured` appeared earlier in this session?"**

- **Yes** → skip this step silently. Do nothing, output nothing. Do not call `CronList`. Do not write a confirmation line.
- **No** → call `wiki_read(wiki: "personal", page: "comms-sources")`
  - If it throws (page doesn't exist) or the page has no service sections configured → skip §3, append `check-comms Not Configured`
  - If service sections are present:
    - Call `CronList` once. Inspect the result.
    - If `CronList` shows **no** comms cron scheduled → call `CronCreate` with the block below, then append a single line `check-comms Started` at the end of your response so future turns spot the sentinel.
    - If `CronList` shows the comms cron **already exists** → append `check-comms Started` without calling `CronCreate`. Do not create a duplicate.

**CronCreate parameters:**

```
cron: "*/20 * * * *"
recurring: true
prompt: (the prompt block below, verbatim)
```

**CronCreate prompt block (copy verbatim):**

```
Dispatch a general-purpose subagent via the Agent tool with `run_in_background: true`. Return the subagent's text summary to the user when the notification arrives — do not re-summarise.

Subagent prompt:
"""
You are running an automated comms check. The plugin's wiki MCP tools and Chrome browser tools (mcp__claude-in-chrome__*) are available as deferred tools — load them via ToolSearch when you need them.

Invoke the /check-comms skill via the Skill tool. It handles configuration loading, scanning, and routing.

Return ONLY a brief text summary (3-5 lines): new item count split by destination, urgent flags, surprises. If nothing new, stop silently.
"""

After the subagent returns silently (no new items), use the tick as housekeeping: review tasks-active Watch items older than 14 days (promote or delete), tidy stale entries, run /wiki-ingest if the session-start maintenance hook flagged any.
```
