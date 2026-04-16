# aela-voice

A Claude Code plugin that gives your session a voice, a personality, and persistent memory across every project.

## Install

First, add the matts-place marketplace. In Claude Code, run:

```
/plugin marketplace add https://github.com/mattmk7482/matts-marketplace
```

Then install the plugin:

```
/plugin install aela-voice@matts-place
```

## Requirements

- **Claude Code** installed and running
- **Node.js 20+**
- **An XTTS-compatible TTS server** reachable from the machine running Claude Code ([AllTalk](https://github.com/erew123/alltalk_tts), vanilla XTTS, etc.)
- **Chrome** with the [Claude in Chrome](https://chromewebstore.google.com/detail/claude-in-chrome/fkeaobmnlgofdpbpnaijafahpgiacmoi) extension, if you want communication monitoring

## Setup

Run `/aela-init` on your first session. Five questions:

1. **Companion name** — what to call the assistant (default: Aela)
2. **Your name** — what the companion calls you
3. **What you do** — one-liner about your work, seeds your profile
4. **TTS server URL** — where your XTTS server lives
5. **Voice** — pick from available voices or upload your own

After that, `/aela-init` offers to chain into `/wiki-init` (persistent memory) and `/comms-init` (communication monitoring). Each step is optional — stop wherever you like.

## What you get

**Voice** — the companion speaks aloud at the end of each turn. Not a readback of the written answer — a genuine reaction.

**Personality** — ships with Aela (warm, direct, invested). Rename, rewrite, or replace entirely via `/voice-personality`.

**Wiki memory** — two persistent wikis that grow across sessions:
- **Personal wiki** — who you are, your tasks, your team, your working preferences. Spans every project.
- **Project wiki** — implementation knowledge about the current codebase. Patterns, gotchas, decisions.

**Communication monitoring** — Chrome-driven scanning of Teams, Slack, email, or anything you can open in a browser. Extracts tasks and knowledge into your wikis.

## Skills

| Skill | What it does |
|---|---|
| `/aela-init` | First-run onboarding — identity, TTS, voice |
| `/wiki-init` | Bootstraps personal and project wikis |
| `/comms-init` | Configures communication monitoring per service |
| `/wiki-update` | Edit-based wiki page updates |
| `/wiki-ingest` | Ingests flagged source documents into the wiki |
| `/check-comms` | Scans configured services and routes findings to wiki |
| `/aela-hook` | End-of-turn discipline: reflect, speak, comms self-heal |
| `/voice-personality` | View or edit the companion's personality |

## Things you can ask

Once set up, you can ask the companion naturally:

- "Talk faster" / "Talk slower" — adjusts TTS speed
- "Mute" / "Unmute" — silence or resume the voice
- "Change your voice" — switch between available voices or upload a new one
- "Change your name" / "Change your personality" — edit identity via `/voice-personality`
- "What are you watching for?" — shows the reflections watchlist
- "Check my messages" — runs `/check-comms` on demand
- "What's on my plate?" — reads tasks-active from the wiki

The companion also acts on its own: persisting decisions to wiki, scanning comms on a background cron, and speaking at the end of each turn.

## Troubleshooting

**No voice plays** — check your TTS server is reachable (`curl http://<your-url>/speakers`). Check the companion isn't muted (`unmute` tool).

**check-comms says "no comms configured"** — run `/comms-init` to set up at least one service.

**Session-orient hook timed out on first run** — run `cd <plugin>/hooks && npm install` manually, then restart Claude Code. First-run npm installs can be slow.

## License

MIT.
