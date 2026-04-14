#!/usr/bin/env node
/**
 * SessionStart hook — wiki orientation.
 *
 * Emits additionalContext containing, in order:
 *   1. User name injection line (if personality.yaml exists)
 *   2. PLUGIN-FEATURES.md contents (if the file exists)
 *   3. Personal wiki index
 *   4. Project wiki index
 *   5. Five orientation pages in full: tasks-active, team-state,
 *      working-preferences, user-profile, reflections
 *
 * Any of these sources that are absent are skipped entirely — no
 * placeholders in their place. The hook must never fail session
 * start due to missing files.
 */

import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = join(__dirname, '..');

// ── Bootstrap: ensure hooks' node_modules exists ────────────────────────────
// Matches the TTS server's start.js pattern. On a fresh install, node_modules
// is absent until the first invocation runs npm install. Best effort — if npm
// fails, the subsequent yaml import will throw a clear error.
// stdio: 'ignore' because this hook's stdout must stay a single clean JSON line.

if (!existsSync(join(__dirname, 'node_modules'))) {
  try {
    execSync('npm install --omit=dev', {
      cwd: __dirname,
      stdio: 'ignore',
      timeout: 25000,
    });
  } catch { /* best effort */ }
}

// Now that deps are guaranteed installed, dynamically import yaml and the
// wiki store. Static imports can't be used here because the bootstrap above
// might need to run before yaml is available on disk.

const { default: YAML } = await import('yaml');
const { wikiUpdateIndex, wikiRead, wikiList } = await import('../mcp-servers/wiki/store.js');

const ORIENTATION_PAGES = [
  'tasks-active',
  'team-state',
  'working-preferences',
  'user-profile',
  'reflections',
];

// ── User name ────────────────────────────────────────────────────────────────

function readUserName() {
  const base = process.env.AELA_PLUGIN_HOME || homedir();
  const personalityPath = join(base, '.claude', 'aela-plugin', 'personality.yaml');
  if (!existsSync(personalityPath)) return null;
  try {
    const raw = readFileSync(personalityPath, 'utf-8');
    const parsed = YAML.parse(raw) || {};
    return parsed.user_name || null;
  } catch {
    return null;
  }
}

// ── Plugin features doc ─────────────────────────────────────────────────────

function readPluginFeatures() {
  const p = join(PLUGIN_ROOT, 'PLUGIN-FEATURES.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf-8').trim();
}

// ── Orientation page reads ───────────────────────────────────────────────────

function readOrientationPage(name) {
  try {
    const content = wikiRead('personal', name);
    return `### ${name}\n\n${content.trim()}\n`;
  } catch {
    // wikiRead throws on missing — skip the page entirely, no placeholder
    return null;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

// Reindex before reading — guards against wiki pages delivered via git pull
// that never went through wiki_create
try { wikiUpdateIndex('personal'); } catch { /* non-fatal, probably no wiki yet */ }
try { wikiUpdateIndex('project');  } catch { /* non-fatal */ }

const sections = [];

// 1. User name
const userName = readUserName();
if (userName) {
  sections.push(`User is called ${userName}.`);
}

// 2. Plugin features
const features = readPluginFeatures();
if (features) {
  sections.push('# Plugin Features\n\n' + features);
}

// 3. Personal wiki index
const personalIndex = wikiList('personal');
sections.push('## Personal wiki index\n\n' + personalIndex.trim());

// 4. Project wiki index
const projectIndex = wikiList('project');
sections.push('## Project wiki index\n\n' + projectIndex.trim());

// 5. Orientation pages — skip any page that doesn't exist yet
const pageSections = ORIENTATION_PAGES
  .map(readOrientationPage)
  .filter(Boolean)
  .join('\n---\n\n');
if (pageSections) {
  sections.push('## Orientation pages (loaded in full)\n\n' + pageSections);
}

const additionalContext = '# Wiki orientation\n\n' + sections.join('\n\n---\n\n') + '\n';

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext,
  },
}));
