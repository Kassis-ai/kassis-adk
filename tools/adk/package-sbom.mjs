/**
 * CycloneDX-shaped SBOM for the packages an air-gapped install ships.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const PACKAGES = ['packages/addon-sdk/package.json', 'packages/addon-testkit/package.json'];

export function buildSbom(root = repoRoot) {
  const components = PACKAGES.map((relative) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
    const dependencies = Object.keys(manifest.dependencies ?? {}).sort();
    return {
      type: 'library',
      name: manifest.name,
      version: manifest.version,
      purl: `pkg:npm/${manifest.name}@${manifest.version}`,
      dependencies,
    };
  });
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: { type: 'application', name: 'kassis-adk', version: '0.1.0' },
    },
    components,
  };
}

function main() {
  const out = process.argv.find((arg) => arg.startsWith('--out='));
  const text = `${JSON.stringify(buildSbom(), null, 2)}\n`;
  if (!out) {
    process.stdout.write(text);
    return;
  }
  fs.mkdirSync(path.dirname(out.slice('--out='.length)), { recursive: true });
  fs.writeFileSync(out.slice('--out='.length), text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
