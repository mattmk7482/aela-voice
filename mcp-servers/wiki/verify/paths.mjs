import { homedir } from 'os';
import { join } from 'path';
import { wikiDir, pagesDir, pagePath, VALID_WIKIS } from '../store.js';

let failed = 0;
function check(label, actual, expected) {
  if (actual !== expected) {
    console.error(`FAIL ${label}\n  expected: ${expected}\n  actual:   ${actual}`);
    failed++;
  } else {
    console.log(`ok   ${label}`);
  }
}

check('VALID_WIKIS', JSON.stringify(VALID_WIKIS), JSON.stringify(['personal', 'project']));
check(
  'personal wikiDir',
  wikiDir('personal'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki')
);
check(
  'project wikiDir',
  wikiDir('project'),
  join(process.cwd(), '.aela', 'wiki', 'project')
);
check(
  'personal pagesDir',
  pagesDir('personal'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages')
);
check(
  'personal pagePath no ext',
  pagePath('personal', 'tasks-active'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages', 'tasks-active.md')
);
check(
  'personal pagePath with ext',
  pagePath('personal', 'tasks-active.md'),
  join(homedir(), '.claude', 'aela-plugin', 'wiki', 'pages', 'tasks-active.md')
);

try {
  wikiDir('bogus');
  console.error('FAIL validateWiki should throw on unknown wiki');
  failed++;
} catch (e) {
  if (/Unknown wiki/.test(e.message)) {
    console.log('ok   validateWiki throws on unknown wiki');
  } else {
    console.error(`FAIL validateWiki threw unexpected error: ${e.message}`);
    failed++;
  }
}

process.exit(failed > 0 ? 1 : 0);
