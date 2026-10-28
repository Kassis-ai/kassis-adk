/**
 * Manifest check and static conformance for one addon directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const HOST_IMPORT = /(?:from\s+|import\s*\(\s*)['"](?:@\/shared\/|@\/features\/|server\/)/;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
}

async function loadAjv() {
  try {
    const file = createRequire(import.meta.url).resolve('ajv/dist/2020.js');
    const loaded = await import(pathToFileURL(file).href);
    return loaded.default;
  } catch {
    throw new Error('ajv is not installed');
  }
}

export async function checkManifest(manifest, root) {
  const schemaCandidates = [
    path.join(root, 'packages/addon-sdk/schema/addon-manifest.v2.schema.json'),
    path.join(root, 'schema/addon-manifest.v2.schema.json'),
  ];
  const schemaPath = schemaCandidates.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) throw new Error('addon manifest schema was not found');
  const Ajv = await loadAjv();
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(schemaPath, 'utf8')));
  const issues = [];
  if (!validate(manifest)) {
    for (const error of validate.errors ?? []) {
      issues.push(`${error.instancePath || '/'} ${error.message}`);
    }
  }
  const id = typeof manifest.id === 'string' ? manifest.id : '';
  const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
  for (const permission of permissions) {
    const name = typeof permission?.name === 'string' ? permission.name : '';
    if (id && name && !name.startsWith(`${id}.`)) {
      issues.push(`permission ${name} is outside ${id}.*`);
    }
  }
  return issues;
}

export function conformanceIssues(addonDir) {
  const issues = [];
  const files = [];
  walk(path.join(addonDir, 'src'), files);
  walk(path.join(addonDir, 'frontend'), files);
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    if (HOST_IMPORT.test(text)) {
      issues.push(`${path.relative(addonDir, file)} imports the host`);
    }
  }
  const migrations = path.join(addonDir, 'migrations');
  if (fs.existsSync(migrations)) {
    for (const name of fs.readdirSync(migrations)) {
      if (!name.endsWith('.up.sql')) continue;
      const down = name.replace(/\.up\.sql$/, '.down.sql');
      const upText = fs.readFileSync(path.join(migrations, name), 'utf8');
      if (!fs.existsSync(path.join(migrations, down)) && !upText.includes('irreversible:')) {
        issues.push(`${name} has no down script`);
      }
    }
  }
  return issues;
}
