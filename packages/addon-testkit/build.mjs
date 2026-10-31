/**
 * tsc keeps the .mjs extension. The published entry is dist/index.js and dist/index.d.ts.
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
  {
    stdio: 'inherit',
  }
);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

function move(fromName, toName) {
  const from = path.join(dist, fromName);
  const to = path.join(dist, toName);
  fs.rmSync(to, { force: true });
  fs.renameSync(from, to);
}

move('index.mjs', 'index.js');
move('index.d.mts', 'index.d.ts');
