/**
 * Client ADK docs must not name kassis repository paths (kit ships via npm / air-gap).
 *
 * Scans docs/developer/technical/adk/*.md except maintainers.md, and the
 * matching excerpts in packages/adk-core/src/discovery/docs-index.json, for:
 *   tools/adk
 *   node scripts/
 *   packages/
 *
 * Usage: node tools/ci/check-adk-client-docs.mjs
 *        npm run ci:adk:client-docs
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ADK_DOCS_DIR = path.join(ROOT, 'docs', 'developer', 'technical', 'adk');
const DOCS_INDEX = path.join(ROOT, 'packages', 'adk-core', 'src', 'discovery', 'docs-index.json');
const MAINTAINERS_BASENAME = 'maintainers.md';

/** @type {readonly { label: string; test: (line: string) => boolean }[]} */
const FORBIDDEN = [
  { label: 'tools/adk', test: (line) => line.includes('tools/adk') },
  { label: 'node scripts/', test: (line) => line.includes('node scripts/') },
  { label: 'packages/', test: (line) => line.includes('packages/') },
];

/** @returns {string[]} */
function listClientDocFiles() {
  if (!fs.existsSync(ADK_DOCS_DIR)) {
    throw new Error(`Missing ADK docs directory: ${ADK_DOCS_DIR}`);
  }
  return fs
    .readdirSync(ADK_DOCS_DIR)
    .filter((name) => name.endsWith('.md') && name !== MAINTAINERS_BASENAME)
    .map((name) => path.join(ADK_DOCS_DIR, name))
    .sort();
}

/**
 * @param {string} rel
 * @param {string} text
 * @param {string[]} violations
 */
function collectViolations(rel, text, violations) {
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const rule of FORBIDDEN) {
      if (rule.test(line)) {
        violations.push(`${rel}:${index + 1}: forbidden ${rule.label}`);
      }
    }
  });
}

/** Bundled search_docs excerpts of the client pages. maintainers.md is not in the index. */
function collectIndexViolations(violations) {
  if (!fs.existsSync(DOCS_INDEX)) {
    throw new Error(`Missing docs index: ${DOCS_INDEX}`);
  }
  const parsed = JSON.parse(fs.readFileSync(DOCS_INDEX, 'utf8'));
  const documents = parsed && Array.isArray(parsed.documents) ? parsed.documents : [];
  const rel = path.relative(ROOT, DOCS_INDEX).replaceAll('\\', '/');
  for (const document of documents) {
    if (!document || typeof document.path !== 'string' || typeof document.text !== 'string') continue;
    const page = document.path.replaceAll('\\', '/');
    if (!page.startsWith('docs/developer/technical/adk/') || page.endsWith(`/${MAINTAINERS_BASENAME}`)) {
      continue;
    }
    collectViolations(`${rel} (${page})`, document.text, violations);
  }
}

function main() {
  const violations = [];
  for (const filePath of listClientDocFiles()) {
    const rel = path.relative(ROOT, filePath).replaceAll('\\', '/');
    collectViolations(rel, fs.readFileSync(filePath, 'utf8'), violations);
  }
  collectIndexViolations(violations);

  if (violations.length > 0) {
    console.error('ci:adk:client-docs failed\n');
    for (const row of violations) {
      console.error(`  ${row}`);
    }
    console.error(
      `\nMove repository-path instructions to ${path.join('docs', 'developer', 'technical', 'adk', MAINTAINERS_BASENAME)}.`
    );
    process.exit(1);
  }

  const count = listClientDocFiles().length;
  console.log(`ci:adk:client-docs OK (${count} client pages under adk/)`);
}

main();