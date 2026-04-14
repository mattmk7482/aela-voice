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
} from 'fs';
import { join } from 'path';
import { homedir } from 'os';
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
    return join(homedir(), '.claude', 'aela-plugin', 'wiki');
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
      return `Page "${page}" not found at external path "${externalPath}".`;
    }
    return readFileSync(p, 'utf-8');
  }

  const p = pagePath(wiki, page);
  if (!existsSync(p)) {
    return `Page "${page}" not found in ${wiki} wiki.`;
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
