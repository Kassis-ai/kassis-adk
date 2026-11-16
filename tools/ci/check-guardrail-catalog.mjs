/**
 * Fail CI when coding-agent profile guardrail keys are missing from guardrails.json
 * or catalogue rows are malformed.
 *
 * Usage: node tools/ci/check-guardrail-catalog.mjs
 *        npm run ci:adk:guardrails-catalog
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const CATALOG_PATH = path.join(ROOT, 'packages', 'addon-sdk', 'guardrails.json');
const KADK_PATH = path.join(ROOT, 'packages', 'addon-sdk', 'codes', 'kadk-codes.json');
const PROFILE_V2 = path.join(ROOT, 'tools', 'adk', 'profiles', 'addon-coding-agent.json');
const PROFILE_V3_DRAFT = path.join(ROOT, 'tools', 'adk', 'profiles', 'addon-coding-agent.v3.draft.json');

const GROUPS = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
const LEVELS = new Set(['L1', 'L2', 'L3', 'L4', 'L5']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function profileGuardrailKeys(file) {
  const doc = readJson(file);
  const guardrails = Array.isArray(doc.guardrails) ? doc.guardrails : [];
  return guardrails
    .map((item) => (item && typeof item.key === 'string' ? item.key : null))
    .filter((key) => typeof key === 'string');
}

function main() {
  const errors = [];
  const catalog = readJson(CATALOG_PATH);
  const kadk = readJson(KADK_PATH);
  const kadkCodes = new Set(kadk.codes.map((row) => row.code));
  const byId = new Map();

  if (!Array.isArray(catalog.entries) || catalog.entries.length === 0) {
    errors.push(`${CATALOG_PATH} must contain a non-empty entries array`);
  }

  for (const entry of catalog.entries ?? []) {
    const id = entry?.id;
    if (typeof id !== 'string' || id.length === 0) {
      errors.push('catalogue entry missing id');
      continue;
    }
    if (byId.has(id)) errors.push(`duplicate catalogue id ${id}`);
    byId.set(id, entry);
    if (!GROUPS.has(entry.group)) errors.push(`${id}: unknown group ${entry.group}`);
    if (!LEVELS.has(entry.level)) errors.push(`${id}: unknown level ${entry.level}`);
    if (entry.check === undefined || entry.check === null) errors.push(`${id}: missing check`);
    if (typeof entry.kadkCode !== 'string' || !kadkCodes.has(entry.kadkCode)) {
      errors.push(`${id}: kadkCode ${entry.kadkCode} not in kadk-codes.json`);
    }
    if (typeof entry.fixHint !== 'string' || entry.fixHint.length === 0) {
      errors.push(`${id}: missing fixHint`);
    }
  }

  for (const key of [...profileGuardrailKeys(PROFILE_V2), ...profileGuardrailKeys(PROFILE_V3_DRAFT)]) {
    if (!byId.has(key)) {
      errors.push(`profile guardrail ${key} has no row in guardrails.json`);
    } else if (byId.get(key).inProfile !== true) {
      errors.push(`${key}: profile guardrail must set inProfile true in the catalogue`);
    }
  }

  if (errors.length > 0) {
    console.error('ci:adk:guardrails-catalog failed\n');
    for (const line of errors) console.error(`  - ${line}`);
    process.exit(1);
  }

  console.log(
    `ci:adk:guardrails-catalog OK (${catalog.entries.length} catalogue rows; v2+v3 draft keys covered)`
  );
}

main();