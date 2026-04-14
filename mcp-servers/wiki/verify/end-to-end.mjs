/**
 * End-to-end verification of the seven wiki MCP tools against an
 * isolated temp working directory. Exercises the full tool surface
 * via direct store imports (the MCP protocol layer is exercised
 * separately by the manual stdio check in Task 8).
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-e2e-'));
process.chdir(tmp);
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const {
  wikiCreate,
  wikiRead,
  wikiList,
  wikiSearch,
  wikiUpdateIndex,
  wikiLog,
  wikiDelete,
  wikiDir,
} = await import('../store.js');

// Fail-fast: abort if AELA_PLUGIN_HOME is not honoured. Without this guard,
// a broken wikiDir would silently write to the real personal wiki.
const resolved = wikiDir('personal');
if (!resolved.startsWith(process.env.AELA_PLUGIN_HOME)) {
  console.error(`FAIL wikiDir('personal') = ${resolved}, expected to start with AELA_PLUGIN_HOME = ${process.env.AELA_PLUGIN_HOME}`);
  console.error('Refusing to run — env isolation is broken, would pollute real personal wiki.');
  process.exit(1);
}

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

// 1. Create a page in each wiki
wikiCreate('personal', 'working-preferences', {
  title: 'Working Preferences',
  category: 'preference',
  description: 'How the user wants to be worked with — tone, autonomy, banter',
  body: 'Direct, no padding, ask before touching prod.',
});
wikiCreate('project', 'architecture-overview', {
  title: 'Architecture Overview',
  category: 'context',
  description: 'The 30,000-ft view of how the system fits together',
  body: 'Two MCP servers, two wikis, one rich turn-end.',
});
check('personal page created', existsSync(join(tmp, 'fake-home', '.claude', 'aela-plugin', 'wiki', 'pages', 'working-preferences.md')));
check('project page created', existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'architecture-overview.md')));

// 2. wikiRead round-trip
const personalRead = wikiRead('personal', 'working-preferences');
check('personal wikiRead', /tone, autonomy, banter/.test(personalRead));
const projectRead = wikiRead('project', 'architecture-overview');
check('project wikiRead', /Two MCP servers/.test(projectRead));

// 3. wikiList shows the generated index
const personalIdx = wikiList('personal');
check('personal index lists the page', /\[\[working-preferences\]\]/.test(personalIdx));
const projectIdx = wikiList('project');
check('project index lists the page', /\[\[architecture-overview\]\]/.test(projectIdx));

// 4. wikiSearch finds the page across both wikis
const searchResult = wikiSearch('autonomy');
check('search finds personal hit', /personal:working-preferences/.test(searchResult));

const projSearch = wikiSearch('architecture');
check('search finds project hit', /project:architecture-overview/.test(projSearch));

// 5. Description-weighted scoring — term only in description matches
wikiCreate('project', 'payments', {
  title: 'Payments',
  category: 'reference',
  description: 'Stripe integration for the parent app, runs via webhook ingest pipeline',
  body: 'See the relevant service for details.',
});
const descSearch = wikiSearch('webhook');
check('description-only term matches', /project:payments/.test(descSearch), descSearch);

// 6. wikiLog shows create entries
const log = wikiLog('project');
check('log has architecture-overview create', /create \| architecture-overview/.test(log));
check('log has payments create', /create \| payments/.test(log));

// 7. wikiUpdateIndex can be re-run idempotently
const idxMsg = wikiUpdateIndex('project');
check('wikiUpdateIndex returns count', /Updated project wiki index/.test(idxMsg));

// 8. wikiDelete removes the page and the log has the delete
wikiDelete('project', 'payments');
check('deleted page removed', !existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'payments.md')));
const log2 = wikiLog('project');
check('log shows delete entry', /delete \| payments/.test(log2));

// 9. Index no longer contains deleted page
const finalIdx = wikiList('project');
check('index does not list deleted page', !/payments/.test(finalIdx));

// 10. External wiki read
const extDir = join(tmp, 'ext');
mkdirSync(extDir, { recursive: true });
writeFileSync(join(extDir, 'their-page.md'), '# Their Page\nSome content.\n', 'utf-8');
const ext = wikiRead('external', 'their-page', extDir);
check('external wiki read works', /Their Page/.test(ext));

// Cleanup — chdir out of tmp first so Windows can release the dir
process.chdir(tmpdir());
try {
  rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  // Windows may still hold handles briefly; non-fatal for verification
}

console.log(failed > 0 ? `\n${failed} check(s) failed.` : '\nAll end-to-end checks passed.');
process.exit(failed > 0 ? 1 : 0);
