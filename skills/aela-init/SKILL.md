---
name: aela-init
description: First-run identity and voice onboarding. Three questions (name, voice, work), creates ~/.claude/aela-plugin/ with personality.yaml and settings.json, tests TTS aloud, offers to chain into /wiki-init. Also the re-run target for personality template refreshes.
---

# aela-init

First-run onboarding. Ask three questions, write them to the user state dir, speak out loud to confirm voice works, offer to continue with `/wiki-init`.

This skill is also how users re-run the template refresh when a plugin update ships a new personality template — re-invoking shows the user the template delta and asks what to merge.

## Before starting

Check whether `~/.claude/aela-plugin/personality.yaml` already exists:

- **If it doesn't exist** — this is a first run. Proceed with the three-question flow below.
- **If it exists** — this is a re-run. Show the user a summary of what's currently configured (user_name, voice, any other fields) and ask whether they want to update one of the fields, refresh against the shipped template, or cancel. Re-running should never silently overwrite anything.

## The three questions

Ask them one at a time, not as a bundle. Wait for a genuine answer before moving to the next.

### Question 1 — What should I call you?

Open-ended. The user types a name. Trim whitespace. Don't validate beyond "is it non-empty." The name gets stored as the `user_name` field in `personality.yaml` and is what the session-orient hook injects as "User is called X" on subsequent sessions.

### Question 2 — Which voice should I use?

Call `list_voices` (the TTS MCP tool) to get the available voices on the configured TTS server. Present them to the user as a list. Ask them to pick one. If they're not sure, default to `aela-default` (the shipped voice) and say so.

Once selected, call `set_voice` with the chosen voice name. This writes to `~/.claude/aela-plugin/settings.json` via the updated TTS config.

### Question 3 — What kind of work do you do?

Open-ended, one-line answer. Something like "I'm a backend engineer at a small team" or "I run the operations side of a marketing agency." Don't drill in — this is a seed, not an interview. The answer helps you (the companion) understand the user's day-to-day so your reflections and suggestions can be calibrated from the first turn. You'll learn more over time through observation.

Store the answer as prose inside the `user-profile` contract page when `/wiki-init` runs next (the user-profile page doesn't exist yet at this point — `/wiki-init` creates it). Hold the answer in context and pass it to `/wiki-init` as the seed content for `user-profile`.

## Write the user state

After all three answers are in hand:

1. **Create the user state directory** — `~/.claude/aela-plugin/` if it doesn't exist yet. Use the `Bash` tool: `mkdir -p ~/.claude/aela-plugin`. Resolve `~` to an absolute path first.
2. **Copy the personality template.** Read `<plugin-root>/personality/default.yaml` (via the `Read` tool). The plugin root is available as `${CLAUDE_PLUGIN_ROOT}` in the environment. The file has three top-level keys: `user_name`, `companionName`, `personality`.
3. **Set `user_name`** to the answer from Question 1 using the Edit tool on the in-memory copy before writing. Or equivalently: call the TTS MCP tool `update_personality` if it exposes a user_name write path. The simplest path is: use the Bash tool to run a small Node one-liner that uses the TTS personality.js `writePersonality` export to write the file with the new user_name field. If that feels too indirect, write the file directly: `yaml.stringify({ user_name: "<name>", companionName: "Aela", personality: "<body>" })` and write the string with Bash.
4. **Write `settings.json`** — either via `setVoice` (the TTS MCP tool `set_voice` calls this) or by writing `~/.claude/aela-plugin/settings.json` directly with `{ "voice": "<selected-voice>" }`.

## Test the voice

Call `speak` with a short confirmation: "Nice to meet you, <name>. Let me know if the voice is alright or if you want to try a different one." The user will hear this aloud. If they want a different voice, re-run Question 2.

## Offer the chain

After the voice test lands, tell the user:

> "Next I can set up your wiki memory — that's where I hold everything I'll learn about your work across sessions. Want to run `/wiki-init` now? (You can also run it later whenever you're ready.)"

If they say yes, invoke `/wiki-init` via the Skill tool. If they say no or defer, end the skill cleanly with a brief confirmation.

## What to return

A brief summary (2-3 lines): user_name set, voice chosen, state dir created. If the chain into `/wiki-init` was accepted, say so. If declined, note that `/wiki-init` is available anytime.

Do NOT return verbose logs, voice test audio details, or step-by-step output. This is onboarding — terse and friendly beats thorough.
