/**
 * Mirror client ADK markdown into packages/adk-core/src/client-docs for offline
 * search_docs and addon-cli prepack (lib/client-docs). maintainers.md is excluded.
 *
 *   node tools/adk/sync-client-docs.mjs          # write mirror
 *   node tools/adk/sync-client-docs.mjs --check  # fail on drift
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const INDEX_PATH = path.join(repoRoot, 'packages/adk-core/src/discovery/docs-index.json');
const MIRROR_DIR = path.join(repoRoot, 'packages/adk-core/src/client-docs');
const MAINTAINERS = 'maintainers.md';
const checkOnly = process.argv.includes('--check');

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadIndex() {
  const parsed = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  if (!parsed || !Array.isArray(parsed.documents)) {
    throw new Error(`Invalid docs index: ${INDEX_PATH}`);
  }
  return parsed.documents;
}

/** @returns {string[]} */
function sync() {
  const failures = [];
  const expectedIds = new Set();
  for (const document of loadIndex()) {
    if (!document || typeof document.id !== 'string' || typeof document.path !== 'string') {
      failures.push('docs-index entry missing id or path');
      continue;
    }
    if (document.path.endsWith(`/${MAINTAINERS}`)) {
      failures.push(`docs-index must not ship ${MAINTAINERS}: ${document.id}`);
      continue;
    }
    const sourcePath = path.join(repoRoot, document.path.replaceAll('/', path.sep));
    if (!fs.existsSync(sourcePath)) {
      failures.push(`Missing source doc for ${document.id}: ${document.path}`);
      continue;
    }
    const sourceText = fs.readFileSync(sourcePath, 'utf8');
    expectedIds.add(document.id);
    const destPath = path.join(MIRROR_DIR, `${document.id}.md`);
    if (checkOnly) {
      if (!fs.existsSync(destPath)) {
        failures.push(`Missing mirrored doc: ${path.relative(repoRoot, destPath)}`);
        continue;
      }
      const mirrorText = fs.readFileSync(destPath, 'utf8');
      if (mirrorText !== sourceText) {
        failures.push(
          `Drift ${document.id}: run node tools/adk/sync-client-docs.mjs (source ${sha256(sourceText).slice(0, 8)}, mirror ${sha256(mirrorText).slice(0, 8)})`
        );
      }
      if (typeof document.text === 'string' && document.text !== sourceText) {
        failures.push(`docs-index text drift for ${document.id} (rebuild docs-index excerpts from source)`);
      }
    } else {
      fs.mkdirSync(MIRROR_DIR, { recursive: true });
      fs.writeFileSync(destPath, sourceText);
    }
  }

  if (fs.existsSync(MIRROR_DIR)) {
    for (const name of fs.readdirSync(MIRROR_DIR)) {
      if (!name.endsWith('.md')) continue;
      const id = name.slice(0, -3);
      if (!expectedIds.has(id)) {
        failures.push(`Unexpected file in client-docs mirror: ${name}`);
      }
    }
  } else if (checkOnly && expectedIds.size > 0) {
    failures.push(`Missing mirror directory: ${path.relative(repoRoot, MIRROR_DIR)}`);
  }

  return failures;
}

function main() {
  const failures = sync();
  if (failures.length > 0) {
    console.error(checkOnly ? 'sync-client-docs --check failed\n' : 'sync-client-docs failed\n');
    for (const row of failures) console.error(`  ${row}`);
    process.exit(1);
  }
  const count = loadIndex().filter((d) => d && typeof d.id === 'string').length;
  console.log(
    checkOnly
      ? `sync-client-docs OK (${count} mirrored client pages)`
      : `sync-client-docs wrote ${count} pages to packages/adk-core/src/client-docs`
  );
}

main();