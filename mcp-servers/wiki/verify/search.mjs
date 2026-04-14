import { mkdtempSync, rmSync, mkdirSync } from 'fs';
import { tmpdir, homedir } from 'os';
import { join } from 'path';
import { writeFileSync } from 'fs';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const personalRoot = join(tmp, 'fake-home', '.claude', 'aela-plugin', 'wiki');
mkdirSync(personalRoot, { recursive: true });
process.env.AELA_PLUGIN_HOME = join(tmp, 'fake-home');

const { wikiCreate, wikiSearch, wikiDir } = await import('../store.js');

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

wikiCreate('personal', 'matt-profile', {
  title: 'User Profile',
  category: 'person',
  description: 'Structural info about Matt — role, responsibilities, relationships',
  body: 'Some prose about working with the user.',
});

wikiCreate('project', 'auth-flow', {
  title: 'Auth Flow',
  category: 'reference',
  description: 'Authentication flow across the backend and together-app',
  body: 'The auth flow uses token exchange between services.',
});
wikiCreate('project', 'unrelated', {
  title: 'Unrelated',
  category: 'reference',
  description: 'Something else entirely',
  body: 'This page has no auth content.',
});

const result = wikiSearch('auth');
check('result mentions project:auth-flow', /project:auth-flow/.test(result), result);
check('result tagged with wiki name', /project:/.test(result));

const authIdx = result.indexOf('auth-flow');
const unrelatedIdx = result.indexOf('unrelated');
check(
  'auth-flow ranks above unrelated OR unrelated absent',
  authIdx >= 0 && (unrelatedIdx === -1 || authIdx < unrelatedIdx),
  `authIdx=${authIdx}, unrelatedIdx=${unrelatedIdx}`
);

const personalResult = wikiSearch('responsibilities');
check('personal wiki hit tagged personal:', /personal:matt-profile/.test(personalResult), personalResult);

wikiCreate('project', 'token-spec', {
  title: 'Token Spec',
  category: 'reference',
  description: 'Describes token exchange format used by the auth flow',
  body: 'Content that does not contain the search term at all.',
});
const tokenSearch = wikiSearch('exchange');
check(
  'token-spec found via description match',
  /project:token-spec/.test(tokenSearch),
  tokenSearch
);

const empty = wikiSearch('');
check('empty query returns message', /Empty query/.test(empty));

const nothing = wikiSearch('xyzzyabsent');
check('no results returns message', /No results/.test(nothing));

try { rmSync(tmp, { recursive: true, force: true }); } catch { /* Windows EBUSY on ESM-locked dirs — benign */ }
process.exit(failed > 0 ? 1 : 0);
