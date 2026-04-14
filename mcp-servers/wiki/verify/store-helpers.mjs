import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-helpers-'));
process.chdir(tmp);
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const { wikiCreate, readSources, checkWikiHealth, wikiDir } = await import('../store.js');

// Fail-fast env isolation check
if (!wikiDir('personal').startsWith(process.env.AELA_PLUGIN_HOME)) {
  console.error('FAIL env isolation broken — refusing to run');
  process.exit(1);
}

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// ── readSources ─────────────────────────────────────────────────────────────

const noSources = readSources();
check('readSources returns empty array when file absent', Array.isArray(noSources) && noSources.length === 0);

const rawDir = join(tmp, '.aela', 'wiki', 'project', 'raw');
mkdirSync(rawDir, { recursive: true });
writeFileSync(join(rawDir, 'sources.md'), `sources:
  - path: matt-head/docs/analysis/foo.md
    mtime: 2026-04-10T12:00:00Z
    ingested: true
    ingested_at: 2026-04-11T09:00:00Z
    notes: "Folded into aela-voice page"
  - path: matt-head/docs/superpowers/specs/bar.md
    mtime: 2026-04-12T12:00:00Z
    ingested: false
`, 'utf-8');

const sources = readSources();
check('readSources returns array of two entries', sources.length === 2, `got ${sources.length}`);
check('readSources first entry path', sources[0].path === 'matt-head/docs/analysis/foo.md');
check('readSources first entry ingested', sources[0].ingested === true);
check('readSources second entry ingested false', sources[1].ingested === false);

// ── checkWikiHealth ─────────────────────────────────────────────────────────

wikiCreate('project', 'healthy', {
  title: 'Healthy Page',
  category: 'reference',
  description: 'A page with a good description',
  body: 'Content.',
});

const pagesDir = join(tmp, '.aela', 'wiki', 'project', 'pages');
writeFileSync(join(pagesDir, 'broken.md'), `---
title: Broken
category: reference
---

No description in frontmatter.
`, 'utf-8');

const issues = checkWikiHealth('project');
check('checkWikiHealth returns an array', Array.isArray(issues));
check('checkWikiHealth flags the broken page', issues.some(i => /broken/.test(i.message)));
check('checkWikiHealth does not flag the healthy page', !issues.some(i => /healthy/.test(i.message)));

const personalIssues = checkWikiHealth('personal');
check('checkWikiHealth on empty personal wiki returns empty', personalIssues.length === 0);

process.chdir(tmpdir());
try { rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(failed > 0 ? 1 : 0);
