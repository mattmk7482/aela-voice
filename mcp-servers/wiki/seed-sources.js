#!/usr/bin/env node
/**
 * seed-sources — one-shot CLI invoked by /wiki-init.
 *
 * Writes <project>/.aela/wiki/project/raw/sources.md with every
 * workspace source discovered at install time, all marked
 * ingested: false. Idempotent — if the file already exists AND is
 * non-empty AND parses as valid YAML with a sources key, exits
 * without touching it so we never clobber user state. If the file
 * exists but is empty or corrupt, overwrites it and logs a warning.
 *
 * Also creates the project wiki directory as a side effect, which
 * materialises the .aela/wiki/project/ tree that session-orient and
 * wiki-maintenance need.
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

import { discoverWorkspaceSources, wikiDir } from './store.js';

const projectRawDir = join(wikiDir('project'), 'raw');
const sourcesPath = join(projectRawDir, 'sources.md');

function isValidSourcesFile(path) {
  try {
    const content = readFileSync(path, 'utf-8').trim();
    if (!content) return false;
    const parsed = YAML.parse(content);
    return parsed && Array.isArray(parsed.sources);
  } catch {
    return false;
  }
}

if (existsSync(sourcesPath)) {
  if (isValidSourcesFile(sourcesPath)) {
    console.log(`sources.md already exists at ${sourcesPath} — leaving untouched.`);
    process.exit(0);
  }
  console.warn(`sources.md at ${sourcesPath} exists but is empty or unparseable — overwriting.`);
}

try {
  mkdirSync(projectRawDir, { recursive: true });

  const discovered = discoverWorkspaceSources();
  const entries = discovered.map(({ path, mtime }) => ({
    path,
    mtime,
    ingested: false,
  }));

  const doc = { sources: entries };
  writeFileSync(sourcesPath, YAML.stringify(doc), 'utf-8');

  console.log(`Seeded ${entries.length} source(s) to ${sourcesPath}`);
} catch (e) {
  console.error(`seed-sources: failed to write — ${e.message}`);
  process.exit(1);
}
