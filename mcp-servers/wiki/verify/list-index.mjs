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

const afterCreate = wikiList('project');
check(
  'wikiList returns placeholder when index.md absent',
  /empty/.test(afterCreate)
);

mkdirSync(join(tmp, '.aela', 'wiki', 'project'), { recursive: true });
writeFileSync(
  join(tmp, '.aela', 'wiki', 'project', 'index.md'),
  '# Manual Index\n',
  'utf-8'
);
const idx = wikiList('project');
check('wikiList returns index.md content', /Manual Index/.test(idx));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
