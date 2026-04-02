#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
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

// ── 2. Provision default voice ──────────────────────────────────────────────
// Check if aela-default voice exists on the XTTS server. If not, upload it.

const { getTtsUrl } = await import(
  pathToFileURL(join(MCP_DIR, 'config.js')).href
);

const ttsUrl = getTtsUrl();
const samplePath = join(PLUGIN_ROOT, 'voices', 'aela-default.wav');

try {
  const check = await fetch(`${ttsUrl}/sample/aela-default.wav`, { method: 'HEAD' });
  if (!check.ok && existsSync(samplePath)) {
    const fileData = readFileSync(samplePath);
    const formData = new FormData();
    formData.append('wavFile', new Blob([fileData]), 'aela-default.wav');
    await fetch(`${ttsUrl}/upload_sample`, { method: 'POST', body: formData });
  }
} catch { /* TTS server may not be reachable yet — not fatal */ }

// ── 3. Inject personality ───────────────────────────────────────────────────

const { buildPersonality } = await import(
  pathToFileURL(join(MCP_DIR, 'personality.js')).href
);
const { getUserName } = await import(
  pathToFileURL(join(MCP_DIR, 'config.js')).href
);

const userName = getUserName();
const personality = buildPersonality(PLUGIN_ROOT, userName);

const output = {
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: personality,
  },
};

console.log(JSON.stringify(output));
