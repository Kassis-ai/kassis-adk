/**
 * Load @kassis/addon-sdk/guardrails.json from repo or packed CLI lib.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

export function guardrailCatalogPath() {
  const beside = path.join(here, 'guardrails.json');
  if (globalThis.__KASSIS_ADK_PACKED__ === true && fs.existsSync(beside)) return beside;
  const repoPath = path.resolve(here, '../../packages/addon-sdk/guardrails.json');
  if (fs.existsSync(repoPath)) return repoPath;
  if (fs.existsSync(beside)) return beside;
  return require.resolve('@kassis/addon-sdk/guardrails.json');
}

let cached = null;

export function loadGuardrailCatalog() {
  if (cached) return cached;
  const parsed = JSON.parse(fs.readFileSync(guardrailCatalogPath(), 'utf8'));
  if (!Array.isArray(parsed.entries)) throw new Error('guardrails.json must contain an entries array');
  cached = parsed;
  return parsed;
}

export function listGuardrailCatalogEntries() {
  return loadGuardrailCatalog().entries;
}

export function getGuardrailCatalogEntry(id) {
  if (typeof id !== 'string' || id.length === 0) return undefined;
  return listGuardrailCatalogEntries().find((item) => item && item.id === id);
}

export function formatGuardrailCheck(check) {
  return Array.isArray(check) ? check.join(', ') : String(check ?? '');
}