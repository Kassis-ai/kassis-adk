/**
 * Copy the SDK, the testkit, the CLI, the template, and the public verification key.
 * The private signing key is not included.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSbom } from './package-sbom.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const COPY_ROOTS = [
  'packages/addon-sdk',
  'packages/addon-testkit',
  'tools/adk',
  'templates/kassis-addon',
];

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

export function writeAirgapBundle(outDir, root = repoRoot) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const relative of COPY_ROOTS) {
    copyTree(path.join(root, relative), path.join(outDir, relative));
  }
  const key = path.join(root, 'server/keys/addon_verification_public.key');
  const keyOut = path.join(outDir, 'keys');
  fs.mkdirSync(keyOut, { recursive: true });
  fs.copyFileSync(key, path.join(keyOut, 'addon_verification_public.key'));
  fs.writeFileSync(path.join(outDir, 'sbom.json'), `${JSON.stringify(buildSbom(root), null, 2)}\n`);
  const privateKey = path.join(outDir, 'server/keys/addon_signing_private.key');
  if (fs.existsSync(privateKey)) {
    throw new Error('Air-gap bundle included the private signing key');
  }
  return outDir;
}

function main() {
  const out = process.argv.find((arg) => arg.startsWith('--out='));
  if (!out) {
    console.error('Usage: node tools/adk/airgap-bundle.mjs --out=<dir>');
    process.exit(1);
  }
  console.log(writeAirgapBundle(path.resolve(out.slice('--out='.length))));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
