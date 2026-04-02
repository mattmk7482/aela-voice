# Aela Voice

A Claude Code plugin that gives Claude a voice and companion personality.

Ships with **Aela** — warm, direct, invested in your work. Backed by any XTTS-compatible TTS server (AllTalk, vanilla XTTS, etc.) on your local network.

## Requirements

- [Claude Code](https://claude.ai/code) installed
- An XTTS-compatible TTS server running and accessible
- Node.js 18+

## Install

```bash
claude plugin add github:<your-handle>/aela-voice
```

You'll be prompted for:
- **TTS Server URL** — your XTTS server address (e.g. `http://192.168.1.247:8020`)
- **Your name** — used to personalise the companion

## What You Get

**Voice tools:**
- `speak` — text-to-speech with sentence pipelining
- `mute` / `unmute` — toggle voice on/off
- `list_voices` / `set_voice` — browse and switch voices
- `upload_voice_sample` — upload a WAV for voice cloning
- `get_tts_settings` / `set_tts_settings` — adjust speed, temperature, etc.

**Personality:**
- `get_personality` / `update_personality` — change name, tone, behaviour
- `/voice-personality` — guided personality editor

## Customisation

The companion personality is at `personality/default.yaml`. Change the name, rewrite the personality, make it your own. Use `{{userName}}` and `{{companionName}}` as placeholders.

## License

MIT
