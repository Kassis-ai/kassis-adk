/**
 * Fails when a non-private @kassis/* package has no GitHub Packages registry.
 * Usage: node scripts/check-package-publishing.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packagesDir = path.join(repoRoot, 'packages');
const REGISTRY = 'https://npm.pkg.github.com';

/** @returns {string[]} */
function failures() {
  const found = [];
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
