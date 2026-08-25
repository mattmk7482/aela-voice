#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');
const MCP_DIR = join(PLUGIN_ROOT, 'mcp-servers', 'tts');

// ── 1. Ensure node_modules ──────────────────────────────────────────────────

if (!existsSync(join(MCP_DIR, 'node_modules'))) {
  try {
    execSync('npm install --omit=dev', { cwd: MCP_DIR, stdio: 'ignore', timeout: 25000 });
  } catch { /* best effort */ }
}

// ── 2. Provision voices ─────────────────────────────────────────────────────
// Push any locally-held voice sample the TTS server is missing. Covers every
// wav, not just aela-default: a cloned voice can't be regenerated (synthesis is
// stochastic), so the local copy is the only copy, and pointing ttsServerUrl at
// a different server must not silently lose the active voice.
//
// Two source dirs. The plugin's own voices/ ships aela-default; ~/.claude/
// aela-plugin/voices/ is user-added and survives plugin updates, which wipe the
// version-pinned cache. Later dirs win on a name clash.

const { getTtsUrl } = await import(
  pathToFileURL(join(MCP_DIR, 'config.js')).href
);
const { sampleExists, uploadSample } = await import(
  pathToFileURL(join(MCP_DIR, 'backend.js')).href
);

const ttsUrl = getTtsUrl();
const voiceDirs = [
  join(PLUGIN_ROOT, 'voices'),
  join(homedir(), '.claude', 'aela-plugin', 'voices'),
];

const localVoices = new Map();
for (const dir of voiceDirs) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir)) {
    if (file.toLowerCase().endsWith('.wav')) localVoices.set(file, join(dir, file));
  }
}

for (const [file, path] of localVoices) {
  try {
    if (!await sampleExists(ttsUrl, file)) {
      await uploadSample(ttsUrl, file, readFileSync(path));
    }
  } catch { /* TTS server may not be reachable yet — not fatal */ }
}

// ── 3. Inject personality ───────────────────────────────────────────────────

const { buildPersonality } = await import(
  pathToFileURL(join(MCP_DIR, 'personality.js')).href
);

const personality = buildPersonality(PLUGIN_ROOT);

const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: personality,
  },
};

console.log(JSON.stringify(output));
