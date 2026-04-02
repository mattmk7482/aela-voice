---
name: voice-personality
description: View or edit the voice companion's personality. Use when the user wants to change the companion's name, tone, behaviour, or speaking style.
---

# Voice Personality Editor

Help the user view or modify their voice companion's personality.

## How It Works

The personality is stored as a YAML file at `${CLAUDE_PLUGIN_ROOT}/personality/default.yaml` with two fields:
- `companionName` — the character's name (default: "Aela")
- `personality` — the full personality text as a markdown template

The template uses `{{userName}}` and `{{companionName}}` as placeholders that get replaced with real values at session start.

## Process

1. Call `get_personality` to read the current YAML
2. Show it to the user and ask what they want to change
3. Make the changes — preserve `{{userName}}` and `{{companionName}}` placeholders
4. Call `update_personality` with the updated fields
5. Let the user know changes take effect on their next session

## Guidelines

- If the user just wants to change a name, only update `companionName`
- If they want to adjust tone/behaviour, update `personality` while keeping placeholders
- Always preserve `{{userName}}` and `{{companionName}}` in the personality text
- Show the user what changed before writing it back
