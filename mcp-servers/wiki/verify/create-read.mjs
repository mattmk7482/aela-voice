import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiCreate, wikiRead } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

const msg = wikiCreate('project', 'test-page', {
  title: 'Test Page',
  category: 'reference',
  description: 'A test page for verification',
  body: 'Body content here.\n',
});
check('wikiCreate returns success message', /Created/.test(msg));
check('page file exists', existsSync(join(tmp, '.aela', 'wiki', 'project', 'pages', 'test-page.md')));

const content = wikiRead('project', 'test-page');
check('wikiRead returns content with frontmatter', /^---/.test(content));
check('wikiRead body present', /Body content here\./.test(content));
check('wikiRead description persisted', /A test page for verification/.test(content));

try {
  wikiCreate('project', 'test-page', {
    title: 'X', category: 'y', description: 'z', body: 'w',
  });
  check('duplicate create throws', false, 'did not throw');
} catch (e) {
  check('duplicate create throws', /already exists/.test(e.message), e.message);
}

try {
  wikiCreate('project', 'incomplete', { title: 'T' });
  check('missing-field create throws', false, 'did not throw');
} catch (e) {
  check('missing-field create throws', /missing required fields/.test(e.message), e.message);
}

try {
  wikiRead('project', 'nope');
  check('read missing page throws', false, 'did not throw');
} catch (e) {
  check('read missing page throws', /not found/.test(e.message), e.message);
}

const extDir = join(tmp, 'external-wiki');
mkdirSync(extDir, { recursive: true });
writeFileSync(join(extDir, 'ext-page.md'), '# External Content\n', 'utf-8');
const ext = wikiRead('external', 'ext-page', extDir);
check('external wikiRead returns external content', /External Content/.test(ext));

try {
  wikiRead('external', 'nope', extDir);
  check('external wikiRead missing page throws', false, 'did not throw');
} catch (e) {
  check('external wikiRead missing page throws', /not found at external path/.test(e.message), e.message);
}

// Cleanup — chdir out of tmp first so Windows can release the dir
process.chdir(tmpdir());
try {
  rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  // Windows may still hold handles briefly; non-fatal for verification
}
process.exit(failed > 0 ? 1 : 0);
