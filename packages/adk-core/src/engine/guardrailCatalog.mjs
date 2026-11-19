/**
 * Load @kassis/addon-sdk/guardrails.json from repo or packed CLI lib.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { checkoutThenBeside } from './kitPaths.mjs';

const require = createRequire(import.meta.url);

export function guardrailCatalogPath() {
  const chosen = checkoutThenBeside(
    import.meta.url,
    'guardrails.json',
    'packages',
    'addon-sdk',
    'guardrails.json'
  );
  if (fs.existsSync(chosen)) return chosen;
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