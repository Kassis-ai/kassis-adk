/**
 * Compile adk-core to dist and copy the engine plus the data files it reads by path.
 * Committed package.json keeps src entries. prepack points the tarball at dist.
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

const engineDist = path.join(dist, 'engine');
fs.mkdirSync(engineDist, { recursive: true });
for (const name of fs.readdirSync(path.join(pkgRoot, 'src/engine'))) {
  if (name.endsWith('.mjs') || name.endsWith('.d.mts')) {
    fs.copyFileSync(path.join(pkgRoot, 'src/engine', name), path.join(engineDist, name));
  }
}
fs.cpSync(path.join(pkgRoot, 'src/discovery'), path.join(dist, 'discovery'), { recursive: true });
fs.cpSync(path.join(pkgRoot, 'src/client-docs'), path.join(dist, 'client-docs'), {
  recursive: true,
});
fs.cpSync(path.join(pkgRoot, 'profiles'), path.join(dist, 'engine/profiles'), {
  recursive: true,
});
fs.copyFileSync(
  path.join(repoRoot, 'server/keys/addon_verification_public.key'),
  path.join(dist, 'engine/addon_verification_public.key')
);
