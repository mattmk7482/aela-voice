#!/usr/bin/env node
/**
 * Stop hook. Blocks the first stop of a sequence with a one-line instruction
 * to run the /turn-end skill. Uses stop_hook_active as the loop guard.
 */

import { readFileSync } from 'fs';

if (process.env.TURN_END_DISABLED) {
  process.exit(0);
}

let payload = {};
try {
  const input = readFileSync(0, 'utf-8');
  payload = JSON.parse(input || '{}');
} catch {
  process.exit(0);
}

if (payload.stop_hook_active === true) {
  process.exit(0);
}

console.log(JSON.stringify({
  decision: 'block',
  reason: 'Before ending this turn: run the `/turn-end` skill.',
}));
