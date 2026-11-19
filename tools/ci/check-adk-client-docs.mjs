/**
 * Client ADK docs must not name kassis repository paths (kit ships via npm / air-gap).
 *
 * Scans docs/developer/technical/adk/*.md except maintainers.md for:
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

function main() {
  const violations = [];
  for (const filePath of listClientDocFiles()) {
    const rel = path.relative(ROOT, filePath).replaceAll('\\', '/');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const rule of FORBIDDEN) {
        if (rule.test(line)) {
          violations.push(`${rel}:${index + 1}: forbidden ${rule.label}`);
        }
      }
    });
  }

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