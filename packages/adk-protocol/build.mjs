/**
 * tsc keeps the .mjs extension. The published entry is dist/index.js and dist/index.d.ts.
 * The content-hash scope file is read by path, so the build copies it beside the module.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgRoot, '../..');
const tsc = path.join(repoRoot, 'node_modules/typescript/lib/tsc.js');
const dist = path.join(pkgRoot, 'dist');

const compiled = spawnSync(
  process.execPath,
  [tsc, '-p', path.join(pkgRoot, 'tsconfig.json'), '--pretty', 'false'],
  { stdio: 'inherit' }
);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

const emittedIndex = path.join(dist, 'index.mjs');
const publishedIndex = path.join(dist, 'index.js');
fs.rmSync(publishedIndex, { force: true });
fs.renameSync(emittedIndex, publishedIndex);
fs.copyFileSync(path.join(pkgRoot, 'src/index.d.ts'), path.join(dist, 'index.d.ts'));
fs.rmSync(path.join(dist, 'index.d.mts'), { force: true });
fs.copyFileSync(
  path.join(pkgRoot, 'src/addonContentHash.config.json'),
  path.join(dist, 'addonContentHash.config.json')
);
