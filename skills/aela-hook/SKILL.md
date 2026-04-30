---
name: aela-hook
description: Run at the end of every substantive turn — three steps in order (reflect, speak, comms self-heal). The full process is documented in PLUGIN-FEATURES.md under "## The aela-hook process" and is injected into the session context once at session start; this skill is the trigger only. Reflection has four questions covering wiki persistence, un-ingested sources, user-wide learning, and reflections-page updates. Speak delivers the voice close. Comms self-heal schedules the background comms cron using a sentinel-token pattern.
---

# Aela Hook (turn-end trigger)

Three actions in order — work through them using the full process in your Orientation context under **## The aela-hook process**:

1. **Reflect.** Four questions: Q1 worth-persisting / Q2 un-ingested sources / Q3 user-as-person / Q4 reflections-update. Apply the criteria from Orientation.
2. **Speak.** Call the `speak` MCP tool with your genuine reaction unless the silence conditions in Orientation apply.
3. **Comms self-heal.** Sentinel-token pattern. Heal at most once per session.

**Zero wrapper output.** The hook's visible footprint is exactly: wiki tool calls when Q1 persists, a `speak()` call when speaking, possibly a single `check-comms Started` or `check-comms Not Configured` sentinel from comms-heal. Three no-ops produce zero visible output.
