#!/usr/bin/env node
/**
 * SessionStart hook — wiki maintenance report.
 *
 * Discovers source docs in the workspace by glob, filters by git
 * authorship (keeps untracked files and files last-committed by the
 * current user), detects external wikis in sibling projects, and
 * reports wiki health issues (pages missing description frontmatter).
 *
 * Writes a plain markdown maintenance report to stdout. Claude reads
 * it as a message at session start and acts on it.
 *
 * WORKSPACE_ROOT env var overrides the default of one level above cwd.
 */

import { readdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';

import { readSources, checkWikiHealth, discoverWorkspaceSources } from '../mcp-servers/wiki/store.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || resolve(process.cwd(), '..');

// ── Source doc discovery ─────────────────────────────────────────────────────

function checkSources() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const entryIds = new Set(sources.map(s => s.path));
  const issues = [];

  const discovered = discoverWorkspaceSources();
  for (const { path, mtime } of discovered) {
    if (ingestedIds.has(path)) continue;

    // Known entry but not yet ingested — flag it
    if (entryIds.has(path)) {
      issues.push({
        type: 'new_source',
        message: `Source not yet ingested: \`${path}\` (modified ${mtime.slice(0, 10)})`,
      });
      continue;
    }

    // Unknown entry — sources.md is out of date. Flag it as new.
    issues.push({
      type: 'new_source',
      message: `New source not yet ingested: \`${path}\` (modified ${mtime.slice(0, 10)})`,
    });
  }

  return issues;
}

// ── External wiki detection ──────────────────────────────────────────────────

function checkExternalWikis() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const issues = [];

  if (!existsSync(WORKSPACE_ROOT)) return issues;
  for (const entry of readdirSync(WORKSPACE_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const wikiPath = join(WORKSPACE_ROOT, entry.name, '.aela', 'wiki');
    if (!existsSync(wikiPath)) continue;

    const portalId = `${entry.name}/.aela/wiki`;
    if (!ingestedIds.has(portalId)) {
      issues.push({
        type: 'external_wiki',
        message: `New external wiki: \`${portalId}\` (no portal page) — ingest recommended`,
      });
    }
  }

  return issues;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const sourceIssues = checkSources();
const externalIssues = checkExternalWikis();
const healthIssues = [
  ...checkWikiHealth('personal'),
  ...checkWikiHealth('project'),
];

const allIssues = [...sourceIssues, ...externalIssues, ...healthIssues];

if (allIssues.length === 0) {
  process.exit(0);
}

console.log('## Wiki Maintenance Needed\n');

if (sourceIssues.length > 0) {
  console.log('### New Sources to Ingest\n');
  for (const s of sourceIssues) console.log(`- ${s.message}`);
  console.log('\nRun `/wiki-ingest` to ingest these, or `/wiki-ingest <path>` for a specific one.\n');
}

if (externalIssues.length > 0) {
  console.log('### External Wikis\n');
  for (const e of externalIssues) console.log(`- ${e.message}`);
  console.log();
}

if (healthIssues.length > 0) {
  console.log('### Wiki Health Issues\n');
  for (const h of healthIssues) console.log(`- ${h.message}`);
  console.log();
}
