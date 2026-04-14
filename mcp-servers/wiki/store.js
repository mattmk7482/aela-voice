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

  if (typeof wikiUpdateIndex === 'function') {
    wikiUpdateIndex(wiki);
  }

  return `Created page "${page}" in ${wiki} wiki.`;
}

export function wikiDelete(wiki, page) {
  validateWiki(wiki);
  const p = pagePath(wiki, page);

  if (existsSync(p)) {
    unlinkSync(p);
  }

  if (typeof wikiUpdateIndex === 'function') {
    wikiUpdateIndex(wiki);
  }
  appendLog(wiki, `delete | ${page}`);

  return `Deleted page "${page}" from ${wiki} wiki.`;
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
