/**
 * Offline process pack check for `kassis-addon check`. No host and no database.
 * Body schemas are not invented: process-pack-kinds.json records schema null
 * until the host publishes one.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { kadkIssue } from './certifyAttestation.mjs';
import { checkoutThenBeside } from './kitPaths.mjs';

const require = createRequire(import.meta.url);

function kitFile(besideName, specifier, ...segments) {
  const chosen = checkoutThenBeside(import.meta.url, besideName, ...segments);
  if (fs.existsSync(chosen)) return chosen;
  return require.resolve(specifier);
}

const kindsPath = kitFile(
  'process-pack-kinds.json',
  '@kassis/addon-sdk/process-pack-kinds.json',
  'packages',
  'addon-sdk',
  'process-pack-kinds.json'
);
const schemaPath = kitFile(
  'process-pack.schema.json',
  '@kassis/addon-sdk/schema/process-pack.schema.json',
  'packages',
  'addon-sdk',
  'schema',
  'process-pack.schema.json'
);

const kindsCatalog = require(kindsPath);
const packSchema = require(schemaPath);
const validatePack = new Ajv2020({ allErrors: true, strict: false }).compile(packSchema);

const FILE_PATTERN = /^process\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.json$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(file) {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')), error: '' };
  } catch (error) {
    if (error instanceof SyntaxError) return { value: null, error: 'invalid JSON' };
    if (error && error.code === 'ENOENT') return { value: null, error: 'missing' };
    throw error;
  }
}

function kindById(id) {
  const kinds = Array.isArray(kindsCatalog.kinds) ? kindsCatalog.kinds : [];
  return kinds.find((entry) => entry && entry.id === id) ?? null;
}

function namespacePrefixes(addonId) {
  if (!addonId) return [];
  return [...new Set([`${addonId}.`, `${addonId.replace(/-/g, '_')}.`])];
}

function inNamespace(key, prefixes) {
  return prefixes.some((prefix) => key.startsWith(prefix));
}

function permissionNames(manifest) {
  const list = manifest.permissions;
  if (!Array.isArray(list)) return new Set();
  const names = list.flatMap((item) =>
    isRecord(item) && typeof item.name === 'string' ? [item.name] : []
  );
  return new Set(names);
}

function resourceTypeNames(manifest) {
  const list = manifest.resourceTypes;
  if (!Array.isArray(list)) return new Set();
  const names = list.flatMap((item) =>
    isRecord(item) && typeof item.type === 'string' ? [item.type] : []
  );
  return new Set(names);
}

function listProcessFiles(addonDir) {
  const root = path.join(addonDir, 'process');
  const found = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      if (fs.statSync(abs).isDirectory()) {
        walk(abs);
        continue;
      }
      if (!name.endsWith('.json')) continue;
      found.push(path.relative(addonDir, abs).split(path.sep).join('/'));
    }
  }
  walk(root);
  return found.sort();
}

function schemaDetail(errors) {
  return (errors ?? [])
    .map((error) => {
      const where = error.instancePath || '/';
      return `${where} ${error.message ?? 'is invalid'}`;
    })
    .join('; ');
}

function envelopeIssue(file, detail) {
  return kadkIssue('KADK-316', { path: file, detail });
}

function manifestEntry(item, index, prefixes, seenKeys) {
  const pathName = `process.packs[${index}]`;
  if (!isRecord(item)) {
    return { issues: [envelopeIssue(pathName, 'must be an object')], entry: null };
  }
  const issues = [];
  const key = typeof item.key === 'string' ? item.key : '';
  const kind = typeof item.kind === 'string' ? item.kind : '';
  const file = typeof item.file === 'string' ? item.file : '';
  if (!key || !kind || !file) {
    issues.push(envelopeIssue(pathName, 'needs key, kind and file'));
  }
  if (key && !inNamespace(key, prefixes)) {
    const label = prefixes.map((prefix) => `'${prefix}'`).join(' or ');
    issues.push(kadkIssue('KADK-125', { value: key, path: `${pathName}.key`, prefixes: label }));
  }
  if (key && seenKeys.has(key)) {
    issues.push(kadkIssue('KADK-317', { value: key }));
  }
  if (key) seenKeys.add(key);
  if (file && !FILE_PATTERN.test(file)) {
    issues.push(kadkIssue('KADK-126', { file }));
  }
  if (kind && !kindById(kind)) {
    issues.push(envelopeIssue(`${pathName}.kind`, `unknown kind '${kind}'`));
  }
  return {
    issues,
    entry: { key, kind, file, index },
  };
}

function fileIssues(addonDir, entry, declaredPermissions, declaredTypes) {
  if (!entry.file || !FILE_PATTERN.test(entry.file)) return [];
  const abs = path.join(addonDir, entry.file);
  const parsed = readJson(abs);
  if (parsed.error === 'missing') return [kadkIssue('KADK-126', { file: entry.file })];
  if (parsed.error) return [envelopeIssue(entry.file, parsed.error)];
  const issues = [];
  const data = parsed.value;
  if (!validatePack(data)) {
    issues.push(envelopeIssue(entry.file, schemaDetail(validatePack.errors)));
  }
  if (!isRecord(data)) return issues;
  if (
    (entry.key && data.key !== entry.key) ||
    (entry.kind && data.kind !== entry.kind)
  ) {
    issues.push(kadkIssue('KADK-127', { file: entry.file }));
  }
  const kind = kindById(typeof data.kind === 'string' ? data.kind : entry.kind);
  if (kind && kind.schema == null) {
    issues.push(kadkIssue('KADK-313', { key: entry.key || String(data.key), kind: kind.id }));
  } else if (kind && kind.schema != null) {
    issues.push(
      envelopeIssue(entry.file, `kind '${kind.id}' names a schema this check does not load`)
    );
  }
  const permissions = Array.isArray(data.permissions) ? data.permissions : [];
  for (const value of permissions) {
    if (typeof value === 'string' && !declaredPermissions.has(value)) {
      issues.push(kadkIssue('KADK-128', { key: entry.key, value }));
    }
  }
  const types = Array.isArray(data.resourceTypes) ? data.resourceTypes : [];
  for (const value of types) {
    if (typeof value === 'string' && !declaredTypes.has(value)) {
      issues.push(kadkIssue('KADK-129', { key: entry.key, value }));
    }
  }
  return issues;
}

function referenceIssues(entryKey, references, knownKeys) {
  if (!Array.isArray(references)) return [];
  const issues = [];
  for (const value of references) {
    const shown = typeof value === 'string' ? value : '';
    if (!shown || /^\d+$/.test(shown) || !knownKeys.has(shown)) {
      issues.push(kadkIssue('KADK-314', { key: entryKey, value: shown || String(value) }));
    }
  }
  return issues;
}

/**
 * @param {string} addonDir
 * @returns {{ ok: boolean, issues: Array<{ code: string, severity: string, message: string, fix: string }> }}
 */
export function auditProcessPacks(addonDir) {
  const manifestPath = path.join(addonDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return { ok: true, issues: [] };
  const parsed = readJson(manifestPath);
  if (!isRecord(parsed.value)) return { ok: true, issues: [] };
  const manifest = parsed.value;
  const packs = isRecord(manifest.process) ? manifest.process.packs : undefined;
  const prefixes = namespacePrefixes(typeof manifest.id === 'string' ? manifest.id : '');
  const declaredPermissions = permissionNames(manifest);
  const declaredTypes = resourceTypeNames(manifest);
  const issues = [];
  const seenKeys = new Set();
  const entries = [];
  if (Array.isArray(packs)) {
    packs.forEach((item, index) => {
      const result = manifestEntry(item, index, prefixes, seenKeys);
      issues.push(...result.issues);
      if (result.entry) entries.push(result.entry);
    });
  }
  const knownKeys = new Set(entries.map((entry) => entry.key).filter((key) => key.length > 0));
  const listed = new Set();
  for (const entry of entries) {
    if (entry.file && FILE_PATTERN.test(entry.file)) listed.add(entry.file);
    issues.push(...fileIssues(addonDir, entry, declaredPermissions, declaredTypes));
    const abs = entry.file ? path.join(addonDir, entry.file) : '';
    const file = abs && fs.existsSync(abs) ? readJson(abs) : null;
    const references = file && isRecord(file.value) ? file.value.references : undefined;
    issues.push(...referenceIssues(entry.key, references, knownKeys));
  }
  for (const file of listProcessFiles(addonDir)) {
    if (!listed.has(file)) issues.push(kadkIssue('KADK-318', { file }));
  }
  return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
}
