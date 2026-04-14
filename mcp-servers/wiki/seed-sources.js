#!/usr/bin/env node
/**
 * seed-sources — one-shot CLI invoked by /wiki-init.
 *
 * Writes <project>/.aela/wiki/project/raw/sources.md with every
 * workspace source discovered at install time, all marked
 * ingested: false. Idempotent — if the file already exists, exits
 * without touching it so we never clobber user state.
 *
 * Also creates the project wiki directory as a side effect, which
 * materialises the .aela/wiki/project/ tree that session-orient and
 * wiki-maintenance need.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import YAML from 'yaml';

import { discoverWorkspaceSources, wikiDir } from './store.js';

const projectRawDir = join(wikiDir('project'), 'raw');
const sourcesPath = join(projectRawDir, 'sources.md');

if (existsSync(sourcesPath)) {
  console.log(`sources.md already exists at ${sourcesPath} — leaving untouched.`);
  process.exit(0);
}

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
