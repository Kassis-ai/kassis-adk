/**
 * Public API reports for @kassis/addon-sdk and @kassis/host-sdk, produced by API Extractor.
 *   node tools/adk/api-surface.mjs
 *   node tools/adk/api-surface.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const indexPath = path.join(repoRoot, 'packages/addon-sdk/src/index.ts');
const reportPath = path.join(repoRoot, 'packages/addon-sdk/etc/addon-sdk.api.md');

export function apiSurfaceNames(source) {
  const names = new Set();
  const block = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  for (const match of source.matchAll(block)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const alias = trimmed.split(/\s+as\s+/);
      const publicName = (alias[1] ?? alias[0]).trim();
      if (publicName) names.add(publicName);
    }
  }
  const direct = /export\s+(?:async\s+)?(?:const|function|class|type|interface)\s+([A-Za-z0-9_]+)/g;
  for (const match of source.matchAll(direct)) names.add(match[1]);
  return [...names].sort();
}

export function apiSurfaceReport(source) {
  return `# @kassis/addon-sdk\n\n${apiSurfaceNames(source).join('\n')}\n`;
}

function main() {
  const tsc = path.join(repoRoot, 'node_modules/typescript/lib/tsc.js');
  const extractor = path.join(repoRoot, 'node_modules/@microsoft/api-extractor/bin/api-extractor');
  if (!fs.existsSync(extractor)) {
    console.error('Install @microsoft/api-extractor (npm install).');
    process.exit(1);
  }
  const compiled = spawnSync(
    process.execPath,
    [tsc, '-p', path.join(repoRoot, 'packages/addon-sdk/tsconfig.json'), '--pretty', 'false'],
    { stdio: 'inherit' }
  );
  if (compiled.status !== 0) process.exit(compiled.status ?? 1);
  const args = ['run', '--config', path.join(repoRoot, 'packages/addon-sdk/api-extractor.json')];
  const write = process.argv.includes('--write');
  if (write) args.push('--local');
  const result = spawnSync(process.execPath, [extractor, ...args], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  const hostArgs = [path.join(repoRoot, 'packages/host-sdk/build.mjs')];
  if (write) hostArgs.push('--write');
  const host = spawnSync(process.execPath, hostArgs, { cwd: repoRoot, stdio: 'inherit' });
  process.exit(host.status ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
