/**
 * Copy publishConfig entry fields onto the package for the tarball only.
 * npm pack ignores main, types, and exports inside publishConfig.
 * postpack restores the workspace file, which keeps src entries for Docker.
 */
import fs from 'node:fs';
import path from 'node:path';

const modeArg = process.argv[2] ?? 'apply';
const mode = modeArg === 'apply' || modeArg === 'restore' ? modeArg : 'apply';
const pkgPath = path.resolve(
  modeArg === 'apply' || modeArg === 'restore' ? (process.argv[3] ?? 'package.json') : modeArg
);
const backup = `${pkgPath}.prepack-backup`;
const entryKeys = ['main', 'types', 'exports', 'bin', 'module', 'browser'];
const keepKeys = ['registry', 'access', 'provenance'];

function readPackage() {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function writePackage(value) {
  fs.writeFileSync(pkgPath, `${JSON.stringify(value, null, 2)}\n`);
}

if (mode === 'restore') {
  if (!fs.existsSync(backup)) process.exit(0);
  fs.copyFileSync(backup, pkgPath);
  fs.rmSync(backup);
  process.exit(0);
}

if (mode !== 'apply') {
  process.stderr.write('pack-publish-fields.mjs apply|restore [package.json]\n');
  process.exit(1);
}

if (fs.existsSync(backup)) {
  fs.copyFileSync(backup, pkgPath);
  fs.rmSync(backup);
}

const original = fs.readFileSync(pkgPath);
fs.writeFileSync(backup, original);
const pkg = readPackage();
const publishConfig = pkg.publishConfig ?? {};
for (const key of entryKeys) {
  if (publishConfig[key] !== undefined) pkg[key] = publishConfig[key];
}
const kept = {};
for (const key of keepKeys) {
  if (publishConfig[key] !== undefined) kept[key] = publishConfig[key];
}
pkg.publishConfig = kept;
writePackage(pkg);
