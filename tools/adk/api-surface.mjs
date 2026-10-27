/**
 * Public export names of @kassis/addon-sdk.
 *   node tools/adk/api-surface.mjs
 *   node tools/adk/api-surface.mjs --write
 */
import fs from 'node:fs';
import path from 'node:path';
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
  const source = fs.readFileSync(indexPath, 'utf8');
  const report = apiSurfaceReport(source);
  if (process.argv.includes('--write')) {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, report);
    console.log(reportPath);
    return;
  }
  const current = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
  if (current !== report) {
    console.error('API surface changed. Run node tools/adk/api-surface.mjs --write');
    process.exit(1);
  }
  console.log(`${apiSurfaceNames(source).length} exports`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
