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

import { readdirSync, existsSync, statSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { execSync } from 'child_process';

import { readSources, checkWikiHealth } from '../mcp-servers/wiki/store.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || resolve(process.cwd(), '..');

// ── Helpers ──────────────────────────────────────────────────────────────────

function lastCommitAuthorEmail(filePath, repoRoot) {
  try {
    const rel = relative(repoRoot, filePath).replace(/\\/g, '/');
    return execSync(`git log --format="%ae" -1 -- "${rel}"`, {
      cwd: repoRoot,
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    }).trim();
  } catch {
    return '';
  }
}

function currentUserEmail() {
  try {
    return execSync('git config user.email', { cwd: WORKSPACE_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

function findGitRoot(filePath) {
  let dir = dirname(filePath);
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findMdFiles(root, subPatterns) {
  const results = [];
  function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) results.push(full);
    }
  }
  for (const pattern of subPatterns) {
    walk(join(root, pattern));
  }
  return results;
}

// ── Source doc discovery ─────────────────────────────────────────────────────

function checkSources() {
  const sources = readSources();
  const ingestedIds = new Set(sources.filter(s => s.ingested).map(s => s.path));
  const myEmail = currentUserEmail();
  const issues = [];

  if (!existsSync(WORKSPACE_ROOT)) return issues;
  const topLevel = [];
  for (const entry of readdirSync(WORKSPACE_ROOT, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      topLevel.push(join(WORKSPACE_ROOT, entry.name));
    }
  }

  for (const projectDir of topLevel) {
    const candidates = findMdFiles(projectDir, [
      'docs/wiki-ingest',
      'docs/superpowers/specs',
      'docs/superpowers/plans',
    ]);
    for (const filePath of candidates) {
      const repoRoot = findGitRoot(filePath) || projectDir;
      const authorEmail = lastCommitAuthorEmail(filePath, repoRoot);

      if (authorEmail && myEmail && authorEmail !== myEmail) continue;

      const sourceId = relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

      if (!ingestedIds.has(sourceId)) {
        const stat = statSync(filePath);
        issues.push({
          type: 'new_source',
          message: `New source not yet ingested: \`${sourceId}\` (modified ${stat.mtime.toISOString().slice(0, 10)})`,
        });
      }
    }
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
