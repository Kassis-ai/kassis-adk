import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgRoot, '../..');
const tsc = path.join(repoRoot, 'node_modules/typescript/lib/tsc.js');

const compiled = spawnSync(
  process.execPath,
  [tsc, '-p', path.join(pkgRoot, 'tsconfig.json'), '--pretty', 'false'],
  { stdio: 'inherit' }
);
if (compiled.status !== 0) process.exit(compiled.status ?? 1);