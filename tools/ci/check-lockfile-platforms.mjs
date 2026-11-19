/**
 * Fails when a package-lock.json lost platform-specific optional packages.
 * npm install on one OS (seen on Windows) can drop entries such as
 * @rollup/rollup-linux-x64-musl or @esbuild/linux-x64; npm ci on the Linux
 * release runner and in Docker then refuses the lockfile.
 *
 *   node tools/ci/check-lockfile-platforms.mjs [lockfile ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_LOCKFILES = ['package-lock.json', 'server/package-lock.json'];

/**
 * Node resolution inside the lockfile: <owner>/node_modules/<name>, then each
 * enclosing node_modules folder up to the root.
 * @param {Record<string, unknown>} packages
 * @param {string} owner
 * @param {string} name
 */
function resolves(packages, owner, name) {
  let dir = owner;
  while (true) {
    const candidate = dir ? `${dir}/node_modules/${name}` : `node_modules/${name}`;
    if (candidate in packages) return true;
    if (!dir) return false;
    const cut = dir.lastIndexOf('/node_modules/');
    dir = cut === -1 ? '' : dir.slice(0, cut);
  }
}

/**
 * @param {{ packages?: Record<string, { optionalDependencies?: Record<string, string> }> }} lock
 * @returns {string[]} missing entries, as "<owner> -> <optional dependency>"
 */
export function missingOptionalEntries(lock) {
  const packages = lock.packages ?? {};
  const missing = [];
  for (const [key, entry] of Object.entries(packages)) {
    const optional = entry.optionalDependencies ?? {};
    for (const name of Object.keys(optional)) {
      if (!resolves(packages, key, name)) missing.push(`${key || '(root)'} -> ${name}`);
    }
  }
  return missing;
}

function main() {
  const files = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_LOCKFILES;
  let failed = false;
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    const missing = missingOptionalEntries(JSON.parse(fs.readFileSync(file, 'utf8')));
    if (missing.length > 0) {
      failed = true;
      console.error(`${rel}: ${missing.length} optional platform package(s) missing, e.g. ${missing.slice(0, 3).join(', ')}`);
      console.error('  Restore the lockfile from the last good commit; do not commit an npm install from one OS.');
    }
  }
  if (failed) process.exit(1);
  console.log(`ci:deps:lockfile-platforms OK (${files.join(', ')})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
