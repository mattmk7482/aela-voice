import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const tmp = mkdtempSync(join(tmpdir(), 'wiki-verify-'));
process.chdir(tmp);

const { wikiCreate, wikiDelete, wikiLog } = await import('../store.js');

let failed = 0;
function check(label, cond, detail) {
  if (!cond) { console.error(`FAIL ${label}${detail ? ' — ' + detail : ''}`); failed++; }
  else       { console.log(`ok   ${label}`); }
}

wikiCreate('project', 'doomed', {
  title: 'Doomed', category: 'reference', description: 'Will be deleted', body: 'bye',
});

const pagePath = join(tmp, '.aela', 'wiki', 'project', 'pages', 'doomed.md');
check('page exists before delete', existsSync(pagePath));

const msg = wikiDelete('project', 'doomed');
check('wikiDelete returns success message', /Deleted/.test(msg));
check('page removed from disk', !existsSync(pagePath));

const log = wikiLog('project');
check('log contains delete entry', /delete \| doomed/.test(log));

const msg2 = wikiDelete('project', 'never-existed');
check('delete missing page does not throw', /Deleted/.test(msg2));

rmSync(tmp, { recursive: true, force: true });
process.exit(failed > 0 ? 1 : 0);
