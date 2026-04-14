---
name: aela-init
description: First-run identity and voice onboarding. Four questions in order (assistant name, user name, work, voice), creates ~/.claude/aela-plugin/ with personality.yaml and settings.json, tests TTS aloud, offers to chain into /wiki-init. Ends with a prominent IMPORTANT block about the Stop-hook message the user will see on every subsequent turn. Also the re-run target for personality template refreshes.
---

# aela-init

First-run onboarding. Ask four questions in order, write the answers to the user state dir, speak out loud to confirm voice works, show the user the stop-hook reassurance block, offer to continue with `/wiki-init`.

This skill is also how users re-run the template refresh when a plugin update ships a new personality template — re-invoking shows the user the template delta and asks what to merge.

## Before starting

Check whether `~/.claude/aela-plugin/personality.yaml` already exists:

- **If it doesn't exist** — this is a first run. Proceed with the four-question flow below.
- **If it exists** — this is a re-run. Show the user a summary of what's currently configured (companionName, user_name, voice, any other fields) and ask whether they want to update one of the fields, refresh against the shipped template, or cancel. Re-running should never silently overwrite anything.

## The four questions

Ask them one at a time, not as a bundle. Wait for a genuine answer before moving to the next.

### Question 1 — What should I call you? (the companion's name)

This is the name the user will call *you*, the companion. The shipped personality template defaults to `Aela`, but the user can rename the companion to anything they want. Open-ended answer. Trim whitespace. Don't validate beyond "is it non-empty."

Store the answer as `companionName` in `personality.yaml`. The personality template substitutes `{{companionName}}` throughout, so every reference to the companion in the shipped prose will use the chosen name.

If the user asks "why are you asking me this, aren't you Aela?" — answer honestly. The template ships with Aela as the default, but the user owns the relationship and the name. Offer to keep `Aela` if that's what they want.

### Question 2 — What should I call you? (the user's name)

Now the user's own name — what *the companion* calls *them*. Open-ended answer. Trim whitespace. Non-empty is the only validation. Store as `user_name` in `personality.yaml`. This is the name `session-orient.js` injects as `User is called X` on every subsequent session.

### Question 3 — What kind of work do you do?

Open-ended, one-line answer. Something like "I'm a backend engineer at a small team" or "I run the operations side of a marketing agency." Don't drill in — this is a seed, not an interview. The answer helps you (the companion) understand the user's day-to-day so your reflections and suggestions can be calibrated from the first turn. You'll learn more over time through observation.

Store the answer as prose inside the `user-profile` contract page when `/wiki-init` runs next (the page doesn't exist yet at this point — `/wiki-init` creates it). Hold the answer in context and pass it to `/wiki-init` as the seed content for `user-profile`.

### Question 4 — Which voice should I use?

Call `list_voices` (the TTS MCP tool) to get the available voices on the configured TTS server. Branch on the count:

- **If there's only one voice** (the shipped `aela-default`): do not list it. Instead say:

  > "You're on the default voice — it's called `aela-default` and it's shipped with the plugin. If you want your own voice instead, you can clone one from any 5+ second audio clip of the voice you want. Studio-quality recordings work best — audiobook samples are a great source. Want to upload a clip now, or stick with the default for today and customise later?"

  If they upload a clip: walk them through `upload_voice_sample` and then `set_voice` to the new voice name.
  If they skip: call `set_voice("aela-default")` and move on.

- **If there's more than one voice**: list them as before. Ask the user to pick. If they're not sure, default to `aela-default` and say so. Once selected, call `set_voice` with the chosen name.

## Write the user state

After all four answers are in hand:

1. **Create the user state directory** — `~/.claude/aela-plugin/` if it doesn't exist yet. Use the `Bash` tool: `mkdir -p ~/.claude/aela-plugin`. Resolve `~` to an absolute path first.
2. **Copy the personality template.** Read `${CLAUDE_PLUGIN_ROOT}/personality/default.yaml` (via the `Read` tool). The file has three top-level keys: `user_name`, `companionName`, `personality`.
3. **Set `companionName`** to the answer from Question 1 and **`user_name`** to the answer from Question 2. Use the TTS MCP tool `update_personality` if it exposes write paths for both fields — it's the simplest route. Otherwise write the file directly via `yaml.stringify({ user_name: "<name>", companionName: "<companion>", personality: "<body>" })` and a Bash write. The body of the `personality` field remains exactly as shipped — the template handles name substitution at read time via the `{{companionName}}` and `{{userName}}` placeholders.
4. **Write `settings.json`** — via `set_voice` (the TTS MCP tool), which writes `~/.claude/aela-plugin/settings.json` as a side effect.

## Test the voice

Call `speak` with a short confirmation using the user's name where natural:

> "Nice to meet you, <user_name>. Let me know if the voice sounds alright or if you want to try a different one."

The user will hear this aloud. If they want a different voice, re-run Question 4.

## IMPORTANT reassurance — read this to the user before the chain offer

Before you offer the next skill, show the user this exact block. It needs the `IMPORTANT:` prefix so they don't skim past it during the first-run information firehose:

> **IMPORTANT: about the "Stop hook blocking error" you'll see after every turn**
>
> From now on, after every response I give you, your terminal will show a red-coloured line that starts with `Stop hook blocking error`. **This is not an error.** It's how I hook into the end of each turn to run my turn-end routine — reflect on what's worth remembering, speak to you, and check comms if you've got that set up. The harness UI shows it as an error-shaped line because that's how "stop hooks" are styled. Ignore it. Everything is working.

Do not skip this block. Show it verbatim with the `IMPORTANT:` prefix visible.

## Offer the chain

After the reassurance block, offer:

> "Next I can set up your wiki memory — that's where I hold everything I'll learn about your work across sessions. Want to run `/wiki-init` now? (You can also run it later whenever you're ready.)"

If yes, invoke `/wiki-init` via the Skill tool, passing the Question 3 answer through as the seed for `user-profile`. If no or defer, end the skill cleanly with a brief confirmation.

## What to return

A brief summary (2-3 lines): companion name set, user name set, voice chosen, state dir created. If the chain into `/wiki-init` was accepted, say so. If declined, note that `/wiki-init` is available anytime.

Do NOT return verbose logs, voice test audio details, or step-by-step output. This is onboarding — terse and friendly beats thorough.
