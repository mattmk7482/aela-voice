/**
 * Wiki store — filesystem operations for the LLM Wiki pattern.
 *
 * Two wikis: "personal" (~/.claude/aela-plugin/wiki/) and "project"
 * (<cwd>/.aela/wiki/project/). The tools are plumbing — the LLM does
 * the thinking.
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  unlinkSync,
  statSync,
} from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { homedir } from 'os';
import { execSync } from 'child_process';
import YAML from 'yaml';

export const VALID_WIKIS = ['personal', 'project'];

function validateWiki(wiki) {
  if (!VALID_WIKIS.includes(wiki)) {
    throw new Error(`Unknown wiki: "${wiki}". Valid: ${VALID_WIKIS.join(', ')}`);
  }
}

export function wikiDir(wiki) {
  validateWiki(wiki);
  if (wiki === 'personal') {
    const base = process.env.AELA_PLUGIN_HOME || homedir();
    return join(base, '.claude', 'aela-plugin', 'wiki');
  }
  // project
  return join(process.cwd(), '.aela', 'wiki', 'project');
}

export function pagesDir(wiki) {
  return join(wikiDir(wiki), 'pages');
}

export function pagePath(wiki, page) {
  const name = page.endsWith('.md') ? page : `${page}.md`;
  return join(pagesDir(wiki), name);
}

// ── Read operations ─────────────────────────────────────────────────────────

export function wikiRead(wiki, page, externalPath) {
  if (externalPath || wiki === 'external') {
    const name = page.endsWith('.md') ? page : `${page}.md`;
    const p = join(externalPath, name);
    if (!existsSync(p)) {
      throw new Error(`Page "${page}" not found at external path "${externalPath}".`);
    }
    return readFileSync(p, 'utf-8');
  }

  const p = pagePath(wiki, page);
  if (!existsSync(p)) {
    throw new Error(`Page "${page}" not found in ${wiki} wiki.`);
  }
  return readFileSync(p, 'utf-8');
}

export function wikiList(wiki) {
  validateWiki(wiki);
  const indexPath = join(wikiDir(wiki), 'index.md');
  if (!existsSync(indexPath)) return '_(empty wiki)_';
  return readFileSync(indexPath, 'utf-8');
}

export function wikiLog(wiki, limit = 20) {
  validateWiki(wiki);
  const logPath = join(wikiDir(wiki), 'log.md');
  if (!existsSync(logPath)) return '_(no log)_';

  const content = readFileSync(logPath, 'utf-8');
  const entries = content.split(/^## /m).filter(e => e.trim());
  const header = entries.length > 0 && !entries[0].startsWith('[') ? entries.shift() : '';
  const recent = entries.slice(-limit);

  if (recent.length === 0) return '_(no log entries)_';
  return recent.map(e => `## ${e.trim()}`).join('\n\n');
}

// ── Write operations ────────────────────────────────────────────────────────

export function wikiCreate(wiki, page, { title, category, description, body, logEntry, tags } = {}) {
  validateWiki(wiki);

  const missing = ['title', 'category', 'description', 'body'].filter(
    f => !{ title, category, description, body }[f]
  );
  if (missing.length > 0) {
    throw new Error(`wiki_create: missing required fields: ${missing.join(', ')}`);
  }

  const p = pagePath(wiki, page);
  if (existsSync(p)) {
    throw new Error(
      `wiki_create: page "${page}" already exists in ${wiki} wiki. Use the wiki-update skill to modify existing pages.`
    );
  }

  mkdirSync(pagesDir(wiki), { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const frontmatter = YAML.stringify({
    title,
    description,
    category,
    tags: tags && tags.length > 0 ? tags : [],
    created: today,
    updated: today,
  });

  const content = `---\n${frontmatter}---\n\n${body}`;
  writeFileSync(p, content, 'utf-8');

  const entry = logEntry || `create | ${page}`;
  appendLog(wiki, entry);

  wikiUpdateIndex(wiki);

  return `Created page "${page}" in ${wiki} wiki.`;
}

export function wikiDelete(wiki, page) {
  validateWiki(wiki);
  const p = pagePath(wiki, page);

  if (existsSync(p)) {
    unlinkSync(p);
  }

  wikiUpdateIndex(wiki);
  appendLog(wiki, `delete | ${page}`);

  return `Deleted page "${page}" from ${wiki} wiki.`;
}

export function wikiUpdateIndex(wiki) {
  validateWiki(wiki);
  const dir = pagesDir(wiki);
  if (!existsSync(dir)) return 'No pages in wiki.';

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  if (files.length === 0) return 'No pages in wiki.';

  const pages = [];
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf-8');
    const name = f.replace(/\.md$/, '');
    const match = raw.match(/^---\n([\s\S]*?)\n---/);
    const fm = match ? (YAML.parse(match[1]) || {}) : {};
    pages.push({
      name,
      title: fm.title || name,
      category: (fm.category || 'uncategorised').toLowerCase(),
      description: fm.description || fm.title || name,
    });
  }

  const groups = {};
  for (const p of pages) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }

  const wikiLabel = wiki.charAt(0).toUpperCase() + wiki.slice(1);
  const lines = [`# ${wikiLabel} Wiki — Index\n`];

  const cats = Object.keys(groups).sort((a, b) => {
    if (a === 'uncategorised') return 1;
    if (b === 'uncategorised') return -1;
    return a.localeCompare(b);
  });

  for (const cat of cats) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    lines.push(`## ${label}\n`);
    for (const p of groups[cat].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push(`- [[${p.name}]] — ${p.description}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');
  const indexPath = join(wikiDir(wiki), 'index.md');
  writeFileSync(indexPath, content, 'utf-8');
  return `Updated ${wiki} wiki index (${pages.length} pages, ${cats.length} categories).`;
}

export function wikiSearch(query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 'Empty query.';

  const allResults = [];

  for (const wiki of VALID_WIKIS) {
    const dir = pagesDir(wiki);
    if (!existsSync(dir)) continue;

    const files = readdirSync(dir).filter(f => f.endsWith('.md'));
    if (files.length === 0) continue;

    for (const file of files) {
      const raw = readFileSync(join(dir, file), 'utf-8');
      const name = file.replace(/\.md$/, '');

      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      const fm = match ? (YAML.parse(match[1]) || {}) : {};
      const body = match ? match[2] : raw;

      const titleText = (fm.title || name).toLowerCase();
      const descriptionText = (fm.description || '').toLowerCase();
      const bodyLower = body.toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (titleText.includes(term)) score += 15;
        if (descriptionText.includes(term)) score += 8;
        const bodyMatches = (bodyLower.match(new RegExp(escapeRegex(term), 'g')) || []).length;
        score += Math.min(bodyMatches, 5);
      }

      if (score > 0) {
        const firstTerm = terms.find(t => bodyLower.includes(t) || titleText.includes(t) || descriptionText.includes(t));
        let snippet = '';
        if (firstTerm) {
          const haystack = bodyLower.includes(firstTerm) ? body : (fm.description || fm.title || name);
          const lowerHaystack = haystack.toLowerCase();
          const idx = lowerHaystack.indexOf(firstTerm);
          if (idx >= 0) {
            const start = Math.max(0, idx - 80);
            const end = Math.min(haystack.length, idx + 120);
            snippet = (start > 0 ? '...' : '') + haystack.slice(start, end).trim() + (end < haystack.length ? '...' : '');
          } else {
            snippet = (fm.description || '').slice(0, 200);
          }
        }

        allResults.push({ wiki, page: name, score, snippet });
      }
    }
  }

  allResults.sort((a, b) => b.score - a.score);
  const top = allResults.slice(0, 10);

  if (top.length === 0) return `No results for "${query}".`;

  return top
    .map(r => `### ${r.wiki}:${r.page} (score: ${r.score})\n${r.snippet}`)
    .join('\n\n---\n\n');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Log ─────────────────────────────────────────────────────────────────────

function appendLog(wiki, entry) {
  const logPath = join(wikiDir(wiki), 'log.md');
  mkdirSync(wikiDir(wiki), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const line = `\n## [${date}] ${entry}\n`;

  if (existsSync(logPath)) {
    const existing = readFileSync(logPath, 'utf-8');
    writeFileSync(logPath, existing + line, 'utf-8');
  } else {
    writeFileSync(logPath, `# ${wiki} Wiki — Log\n${line}`, 'utf-8');
  }
}

// ── Sources tracking ────────────────────────────────────────────────────────

/**
 * Read and parse the project wiki's sources.md.
 * Returns an array of source entries, or an empty array if the file is
 * absent or malformed. Personal wiki has no sources.md.
 */
export function readSources() {
  const p = join(wikiDir('project'), 'raw', 'sources.md');
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, 'utf-8');
    const parsed = YAML.parse(raw);
    if (parsed && Array.isArray(parsed.sources)) return parsed.sources;
    return [];
  } catch {
    return [];
  }
}

// ── Health checks ───────────────────────────────────────────────────────────

/**
 * Check a wiki for health issues. Currently checks for pages whose
 * frontmatter lacks a `description` field — those pages will produce
 * useless index entries.
 * Returns an array of issue objects: { type: 'health', message: string }.
 */
export function checkWikiHealth(wiki) {
  validateWiki(wiki);
  const dir = pagesDir(wiki);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith('.md'));
  const missingDesc = [];

  for (const f of files) {
    const content = readFileSync(join(dir, f), 'utf-8');
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) continue;
    const fm = YAML.parse(match[1]) || {};
    if (!fm.description) missingDesc.push(f.replace(/\.md$/, ''));
  }

  if (missingDesc.length === 0) return [];
  return [{
    type: 'health',
    message: `${wiki} wiki pages missing description: ${missingDesc.join(', ')}`,
  }];
}

// ── Workspace source discovery ──────────────────────────────────────────────

/**
 * Walk WORKSPACE_ROOT for markdown files under docs/wiki-ingest/,
 * docs/superpowers/specs/, and docs/superpowers/plans/ across every
 * top-level sibling project. Filter by git authorship — keep files
 * either untracked or last-committed by the current git user.
 * Returns an array of { path, mtime } where path is workspace-relative
 * (POSIX separators).
 *
 * WORKSPACE_ROOT env var overrides the default of one level above cwd.
 * Single source of truth for source discovery — used by
 * wiki-maintenance.js and the seed-sources CLI.
 */
export function discoverWorkspaceSources() {
  const workspaceRoot = process.env.WORKSPACE_ROOT || resolve(process.cwd(), '..');
  if (!existsSync(workspaceRoot)) return [];

  const myEmail = currentUserEmail(workspaceRoot);
  const results = [];

  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const projectDir = join(workspaceRoot, entry.name);

    const candidates = findMdFilesUnder(projectDir, [
      'docs/wiki-ingest',
      'docs/superpowers/specs',
      'docs/superpowers/plans',
    ]);

    for (const filePath of candidates) {
      const repoRoot = findGitRoot(filePath) || projectDir;
      const authorEmail = lastCommitAuthorEmail(filePath, repoRoot);
      // Untracked files have no author email; keep them. Tracked
      // files must match current git user.
      if (authorEmail && myEmail && authorEmail !== myEmail) continue;

      const sourceId = relative(workspaceRoot, filePath).replace(/\\/g, '/');
      const stat = statSync(filePath);
      results.push({
        path: sourceId,
        mtime: stat.mtime.toISOString(),
      });
    }
  }

  return results;
}

function currentUserEmail(cwd) {
  try {
    return execSync('git config user.email', { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

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

function findGitRoot(filePath) {
  let dir = dirname(filePath);
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function findMdFilesUnder(root, subPatterns) {
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
