/**
 * Installs a package directory's npm dependencies so that its node_modules
 * only ever appears complete.
 *
 * Several processes need the same directory at once. At session start the TTS
 * and wiki MCP servers launch alongside the SessionStart hooks, and the hooks
 * import from both servers' directories. Every plugin version is a fresh cache
 * directory, so the first session after an update has all of them installing
 * together. Two `npm install`s in one directory delete each other's files and
 * can both exit 0 over a tree that cannot import: 2.1.2's TTS server never
 * started, and a launcher that trusted any existing node_modules never retried.
 *
 * So each install runs in a private staging directory, is checked, and is
 * published with one rename. A concurrent installer either loses the rename
 * to a tree checked the same way, or finds node_modules already complete.
 *
 * Builtins only: this runs before any dependency exists.
 */

import {
  copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync,
} from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';

const STAGING = '.deps-';

// No install takes this long, so a staging directory this old was left by an
// installer that was killed (a hook past its timeout) and nothing owns it.
const STALE_MS = 10 * 60 * 1000;

// Windows refuses a rename while antivirus holds a just-written file open.
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);

/**
 * Lockfile packages with no package.json under dir/node_modules. This sees a
 * tree gutted the way 2.1.2's was, but not a package that kept its package.json
 * and lost other files, which is why a fresh install is also refused when npm
 * warns TAR_ENTRY_ERROR.
 */
export function missingPackages(dir) {
  const { packages } = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf-8'));
  if (!packages) throw new Error(`${join(dir, 'package-lock.json')} has no "packages" map`);
  return Object.entries(packages)
    .filter(([path, meta]) => path.startsWith('node_modules/') && !meta.dev && !meta.optional)
    .map(([path]) => path)
    .filter(path => !existsSync(join(dir, path, 'package.json')));
}

/**
 * Makes dir/node_modules complete, installing it when absent or incomplete.
 * Returns false after explaining on stderr. Never throws, and never writes to
 * stdout, which is a hook's JSON channel.
 */
export function ensureDeps(dir, { timeout } = {}) {
  let staging;
  try {
    if (existsSync(join(dir, 'node_modules')) && missingPackages(dir).length === 0) return true;
    sweepStale(dir);
    staging = mkdtempSync(join(dir, STAGING));
    copyFileSync(join(dir, 'package.json'), join(staging, 'package.json'));
    copyFileSync(join(dir, 'package-lock.json'), join(staging, 'package-lock.json'));
    install(staging, timeout);
    publish(join(staging, 'node_modules'), dir);
    return true;
  } catch (err) {
    process.stderr.write(`aela-voice: dependencies in ${dir} are not installed: ${firstLine(err.message)}\n`);
    return false;
  } finally {
    if (staging) removeQuietly(staging);
  }
}

function install(staging, timeout) {
  const r = spawnSync('npm install --omit=dev --prefer-offline --no-audit --no-fund', {
    cwd: staging, shell: true, encoding: 'utf-8', timeout, windowsHide: true,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`npm install exited ${r.status}: ${lastLine(r.stderr)}`);
  if (/TAR_ENTRY_ERROR/.test(r.stdout + r.stderr)) {
    throw new Error('npm install exited 0 but could not write every file (TAR_ENTRY_ERROR)');
  }
  const missing = missingPackages(staging);
  if (missing.length) {
    throw new Error(`npm install exited 0 but ${missing.length} packages are missing, e.g. ${missing[0]}`);
  }
}

// Losing the rename to another installer is success: whoever published first
// published a tree checked the same way.
function publish(fresh, dir) {
  const target = join(dir, 'node_modules');
  for (let attempt = 1; ; attempt++) {
    try {
      renameSync(fresh, target);
      return;
    } catch (err) {
      if (existsSync(target)) {
        if (missingPackages(dir).length === 0) return;
        setAside(target, dir);
      } else if (!TRANSIENT.has(err.code)) {
        throw err;
      }
      if (attempt === 5) throw err;
      sleep(100 * attempt);
    }
  }
}

// Moves an incomplete tree into a staging directory, so if deleting it fails
// part way, the stale sweep finishes the job.
function setAside(target, dir) {
  const aside = mkdtempSync(join(dir, STAGING));
  try { renameSync(target, join(aside, 'node_modules')); } catch { /* another installer moved it first */ }
  removeQuietly(aside);
}

function sweepStale(dir) {
  for (const name of readdirSync(dir)) {
    if (!name.startsWith(STAGING)) continue;
    const path = join(dir, name);
    try {
      if (Date.now() - statSync(path).mtimeMs > STALE_MS) rmSync(path, { recursive: true, force: true });
    } catch { /* gone already, or still locked; a later sweep retries */ }
  }
}

function removeQuietly(path) {
  try { rmSync(path, { recursive: true, force: true, maxRetries: 3 }); } catch { /* swept once stale */ }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function firstLine(text) {
  return String(text).trim().split('\n')[0];
}

function lastLine(text) {
  return String(text).trim().split('\n').filter(Boolean).pop() ?? '';
}
