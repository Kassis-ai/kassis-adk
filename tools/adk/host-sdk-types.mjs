/**
 * Build the published @kassis/host-sdk types.
 *
 * tsc writes the declaration graph under packages/host-sdk/temp (gitignored).
 * API Extractor dtsRollup crashes on that graph ("Unable to follow symbol for
 * const", extractor 7.60 with its bundled TypeScript 6), so this copies the
 * reachable declarations into dist/ and rewrites relative imports to stay there.
 * Package imports such as react stay external.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pkgRoot = path.join(repoRoot, 'packages/host-sdk');
const tempRoot = path.join(pkgRoot, 'temp');
const distRoot = path.join(pkgRoot, 'dist');
const specifier = /(?<=from\s+|import\s*\(\s*)['"](@\/[^'"]+|\.[^'"]+)['"]/g;

const tsc = spawnSync(
  process.execPath,
  [
    path.join(repoRoot, 'node_modules/typescript/lib/tsc.js'),
    '-p',
    path.join(pkgRoot, 'tsconfig.build.json'),
    '--pretty',
    'false',
  ],
  { stdio: 'inherit' }
);
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

function resolveDts(fromFile, spec) {
  const base = spec.startsWith('@/')
    ? path.join(tempRoot, 'src', spec.slice(2))
    : path.resolve(path.dirname(fromFile), spec);
  const candidates = [base, `${base}.d.ts`, path.join(base, 'index.d.ts')];
  return candidates.find((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function destFor(abs) {
  const rel = path.relative(tempRoot, abs).replace(/\\/g, '/');
  if (rel.startsWith('packages/host-sdk/src/')) {
    return path.join(distRoot, rel.slice('packages/host-sdk/src/'.length));
  }
  return path.join(distRoot, '_host', rel);
}

const entries = [
  'index',
  'registries',
  'routes',
  'entities',
  'caseWorkspace',
  'i18n',
  'risk',
  'riskLevel',
].map((name) => path.join(tempRoot, 'packages/host-sdk/src', `${name}.d.ts`));

const wanted = new Set();
const queue = [...entries];
while (queue.length > 0) {
  const file = queue.pop();
  if (!file || wanted.has(file)) continue;
  wanted.add(file);
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(specifier)) {
    const target = resolveDts(file, match[1]);
    if (!target) throw new Error(`Cannot resolve ${match[1]} from ${file}`);
    queue.push(target);
  }
}

fs.rmSync(distRoot, { recursive: true, force: true });
for (const file of wanted) {
  const dest = destFor(file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const rewritten = fs
    .readFileSync(file, 'utf8')
    .replace(specifier, (whole, spec) => {
      const target = resolveDts(file, spec);
      let next = path.relative(path.dirname(dest), destFor(target)).replace(/\\/g, '/');
      if (!next.startsWith('.')) next = `./${next}`;
      next = next.replace(/\.d\.ts$/, '');
      return whole.replace(spec, next);
    })
    .replace(/(^\s*(?:\/\*|\*|\/\/).*)$/gm, (line) => line.replaceAll('@/', 'host/'));
  fs.writeFileSync(dest, rewritten);
}

process.stdout.write(
  `host-sdk types: ${wanted.size} declarations in ${path.relative(repoRoot, distRoot)}\n`
);
