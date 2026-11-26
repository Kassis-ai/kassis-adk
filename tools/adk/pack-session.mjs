/**
 * One pack of a package at a time. prepack and the test suite can otherwise
 * overlap, and pack-publish-fields then restores the wrong package.json.
 *
 *   node tools/adk/pack-session.mjs begin "<prepack command>"
 *   node tools/adk/pack-session.mjs end "<postpack command>"
 *
 * begin holds the lock for the later postpack. end always releases it.
 * A lock older than three minutes is discarded so a crashed pack cannot stick.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const STALE_MS = 180000;
const WAIT_MS = 180000;

function lockFile(pkgRoot) {
  const key = path.resolve(pkgRoot).replace(/[^a-z0-9]+/gi, '_').slice(-80);
  return path.join(os.tmpdir(), `kassis-pack-${key}.lock`);
}

function ageMs(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const at = typeof parsed.at === 'number' ? parsed.at : fs.statSync(file).mtimeMs;
    return Date.now() - at;
  } catch {
    try {
      return Date.now() - fs.statSync(file).mtimeMs;
    } catch {
      return STALE_MS + 1;
    }
  }
}

function acquire(pkgRoot) {
  const file = lockFile(pkgRoot);
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() <= deadline) {
    try {
      fs.writeFileSync(file, JSON.stringify({ at: Date.now() }), { flag: 'wx' });
      return;
    } catch (error) {
      if (!error || error.code !== 'EEXIST') throw error;
      if (ageMs(file) > STALE_MS) {
        fs.rmSync(file, { force: true });
        continue;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  }
  throw new Error(`Timed out waiting to pack ${pkgRoot}`);
}

function release(pkgRoot) {
  fs.rmSync(lockFile(pkgRoot), { force: true });
}

function run(command) {
  const result = spawnSync(command, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const mode = process.argv[2];
const command = process.argv.slice(3).join(' ').trim();
const pkgRoot = process.cwd();

if (mode === 'begin') {
  acquire(pkgRoot);
  const status = command ? run(command) : 0;
  if (status !== 0) release(pkgRoot);
  process.exit(status);
}

if (mode === 'end') {
  let status = 0;
  try {
    if (command) status = run(command);
  } finally {
    release(pkgRoot);
  }
  process.exit(status);
}

process.stderr.write('pack-session.mjs begin|end "<command>"\n');
process.exit(1);
