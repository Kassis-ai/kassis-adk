/**
 * Fails when a public @kassis package cannot be installed from the tarball npm publishes.
 * npm pack ignores main, types, and exports inside publishConfig, so prepack must
 * copy those fields onto the package before the tarball is written.
 * Usage: node scripts/check-package-publishing.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpm } from '../tools/adk/airgap-bundle.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(repoRoot, 'packages');
const REGISTRY = 'https://registry.npmjs.org/';
const SOURCE_EXT = ['.ts', '.tsx', '.mts'];
/**
 * Every public package packs JavaScript. Do not add names here.
 * @type {ReadonlySet<string>}
 */
const TYPESCRIPT_PACK_ALLOW = new Set();

/** @param {string} entry */
function isSourceEntry(entry) {
  if (entry.endsWith('.d.ts') || entry.endsWith('.d.mts')) return false;
  return SOURCE_EXT.some((ext) => entry.endsWith(ext));
}

/** @param {unknown} value @param {string[]} out */
function collectEntries(value, out) {
  if (typeof value === 'string' && value.startsWith('.')) out.push(value);
  else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const item of Object.values(value)) collectEntries(item, out);
  }
}

/**
 * @param {string} relative
 * @param {readonly string[]} files
 */
function coveredByFiles(relative, files) {
  const clean = relative.replace(/^\.\//, '');
  if (clean === 'package.json') return true;
  return files.some((entry) => {
    const name = entry.replace(/^\.\//, '');
    return clean === name || clean.startsWith(`${name}/`);
  });
}

/** @param {string} stdout @returns {Array<{ filename?: string }> | null} */
function packJson(stdout) {
  let end = stdout.lastIndexOf(']');
  while (end >= 0) {
    let start = stdout.lastIndexOf('[', end);
    while (start >= 0) {
      try {
        const parsed = JSON.parse(stdout.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      start = stdout.lastIndexOf('[', start - 1);
    }
    end = stdout.lastIndexOf(']', end - 1);
  }
  return null;
}

/** @param {string} tarball @param {string} destination */
function extractTarball(tarball, destination) {
  const extracted = spawnSync('tar', ['-xzf', tarball, '-C', destination], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) {
    throw new Error(`tar extract failed for ${path.basename(tarball)}\n${extracted.stderr ?? ''}`);
  }
}

/** @returns {string[]} */
function failures() {
  const found = [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kassis-publish-'));
  try {
    for (const name of fs.readdirSync(packagesDir)) {
      const manifestPath = path.join(packagesDir, name, 'package.json');
      if (!fs.existsSync(manifestPath)) continue;
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@kassis/')) continue;
      if (manifest.private === true) continue;
      const registry = manifest.publishConfig?.registry;
      if (registry !== REGISTRY) {
        found.push(
          `${manifest.name} is publishable and publishConfig.registry is ${registry ?? 'missing'} (expected ${REGISTRY})`
        );
        continue;
      }
      const destination = path.join(root, name);
      fs.mkdirSync(destination);
      const stdout = runNpm(['pack', '--json', '--pack-destination', destination], path.join(packagesDir, name));
      const packed = packJson(stdout);
      if (!packed) {
        found.push(`${manifest.name} npm pack did not return JSON`);
        continue;
      }
      const filename = Array.isArray(packed) && packed[0] && typeof packed[0].filename === 'string' ? packed[0].filename : '';
      const tarball = path.join(destination, path.basename(filename));
      const staging = path.join(destination, 'out');
      fs.mkdirSync(staging);
      extractTarball(tarball, staging);
      const packedManifest = JSON.parse(fs.readFileSync(path.join(staging, 'package', 'package.json'), 'utf8'));
      const files = Array.isArray(packedManifest.files) ? packedManifest.files.filter((item) => typeof item === 'string') : [];
      const entries = [];
      collectEntries(packedManifest.main, entries);
      collectEntries(packedManifest.types, entries);
      collectEntries(packedManifest.exports, entries);
      for (const entry of entries) {
        if (isSourceEntry(entry) && !TYPESCRIPT_PACK_ALLOW.has(manifest.name)) {
          found.push(`${manifest.name} packed entry ${entry} is TypeScript`);
        }
        if (!coveredByFiles(entry, files)) {
          found.push(`${manifest.name} packed entry ${entry} is outside files`);
        }
        const onDisk = path.join(staging, 'package', entry.replace(/^\.\//, ''));
        if (!fs.existsSync(onDisk)) {
          found.push(`${manifest.name} packed entry ${entry} is not in the tarball`);
        }
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  for (const name of fs.readdirSync(packagesDir)) {
    const manifestPath = path.join(packagesDir, name, 'package.json');
    if (!fs.existsSync(manifestPath)) continue;
    const committed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (typeof committed.name !== 'string' || !committed.name.startsWith('@kassis/')) continue;
    if (committed.private === true) continue;
    const entries = [];
    collectEntries(committed.main, entries);
    collectEntries(committed.types, entries);
    collectEntries(committed.exports, entries);
    if (entries.length === 0) continue;
    const pointsAtSource = entries.some((entry) => entry.includes('/src/') || entry.startsWith('./src'));
    if (!pointsAtSource) {
      found.push(`${committed.name} committed package.json does not point at src/`);
    }
    if (entries.some((entry) => entry.includes('/dist/') || entry.startsWith('./dist'))) {
      found.push(`${committed.name} committed package.json points at dist/`);
    }
  }
  return found;
}

const found = failures();
if (found.length > 0) {
  process.stderr.write(`${found.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('public @kassis packages publish to GitHub Packages\n');
