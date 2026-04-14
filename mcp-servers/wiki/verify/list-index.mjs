import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiList, wikiLog, wikiCreate } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

const empty = wikiList('project');
check('empty wikiList returns placeholder', /empty/.test(empty));

const noLog = wikiLog('project');
check('empty wikiLog returns placeholder', /no log/.test(noLog));

wikiCreate('project', 'alpha', {
  title: 'Alpha', category: 'reference', description: 'Alpha desc', body: 'A',
});

const log = wikiLog('project');
check('log contains create entry', /create \| alpha/.test(log));

const { wikiUpdateIndex } = await import('../store.js');

wikiCreate('project', 'beta', {
  title: 'Beta Page', category: 'reference', description: 'Beta desc', body: 'B',
});
wikiCreate('project', 'gamma', {
  title: 'Gamma Page', category: 'context', description: 'Gamma desc with colons: multiple: parts', body: 'G',
});

const result = wikiUpdateIndex('project');
check('wikiUpdateIndex returns status message', /Updated/.test(result));

const idx = wikiList('project');
check('index has Project heading', /Project Wiki — Index/.test(idx));
check('index lists alpha with description', /\[\[alpha\]\] — Alpha desc/.test(idx));
check('index lists beta', /\[\[beta\]\] — Beta desc/.test(idx));
check('index lists gamma with colons in description', /Gamma desc with colons: multiple: parts/.test(idx));
check('reference category heading present', /## Reference/.test(idx));
check('context category heading present', /## Context/.test(idx));

process.chdir(tmpdir());
try {
  rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  // Windows may still hold handles briefly; non-fatal for verification
}
process.exit(failed > 0 ? 1 : 0);
