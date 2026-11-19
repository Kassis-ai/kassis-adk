/**
 * Copy templates/kassis-addon into an empty directory.
 * Rung 1 is server only. Rung 2 adds UI. Rung 3 adds UI and migrations.
 * There is no fourth rung.
 */
import fs from 'node:fs';
import path from 'node:path';
import { checkoutRoot, moduleDir } from './kitPaths.mjs';

const here = moduleDir(import.meta.url);
const packedTemplate = path.resolve(here, '..', 'templates', 'kassis-addon');
const checkout = checkoutRoot(import.meta.url);
const repoTemplate = checkout ? path.join(checkout, 'templates', 'kassis-addon') : '';
const templateDir = fs.existsSync(path.join(packedTemplate, 'manifest.json'))
  ? packedTemplate
  : repoTemplate;
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PUBLISHER_RE = /^[a-z0-9][a-z0-9-]*$/;

function displayName(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveId(rawId, publisher) {
  if (!PUBLISHER_RE.test(publisher)) throw new Error('Publisher id must be lowercase');
  if (!ID_RE.test(rawId)) throw new Error('Addon id must be kebab-case');
  if (publisher === 'kassis') return rawId;
  const prefix = `${publisher}-`;
  const addonId = rawId.startsWith(prefix) ? rawId : `${prefix}${rawId}`;
  if (!ID_RE.test(addonId)) throw new Error('Addon id must be kebab-case');
  return addonId;
}

function skipped(relative, rung) {
  const ui = relative === 'src/ui' || relative.startsWith('src/ui/');
  const migrations = relative === 'migrations' || relative.startsWith('migrations/');
  if (rung < 2 && (relative === 'vite.config.mjs' || ui)) return true;
  if (rung < 3 && migrations) return true;
  return false;
}

function copyTree(from, to, replacements, rung) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const relative = path.relative(templateDir, source).split(path.sep).join('/');
    if (skipped(relative, rung)) continue;
    const targetName =
      entry.name === 'npmrc' ? '.npmrc' : entry.name === 'gitignore' ? '.gitignore' : entry.name;
    const target = path.join(to, targetName);
    if (entry.isDirectory()) {
      copyTree(source, target, replacements, rung);
      continue;
    }
    let text = fs.readFileSync(source, 'utf8');
    for (const [token, value] of Object.entries(replacements)) {
      text = text.replaceAll(token, value);
    }
    fs.writeFileSync(target, text);
  }
}

function localPackageDir(packageName) {
  const candidates = [
    path.resolve(templateDir, '../../packages', packageName),
    path.resolve(templateDir, '../../../', packageName),
  ];
  return (
    candidates.find((candidate) => fs.existsSync(path.join(candidate, 'package.json'))) ?? null
  );
}

function fileSpec(fromDir, packageDir) {
  const relative = path.relative(fromDir, packageDir);
  if (path.isAbsolute(relative)) return `file:${packageDir.split(path.sep).join('/')}`;
  const posix = relative.split(path.sep).join('/');
  return `file:${posix.startsWith('.') ? posix : `./${posix}`}`;
}

function localSpec(addonDir, packageName, fallback) {
  const found = localPackageDir(packageName);
  if (!found) return fallback;
  return fileSpec(addonDir, found);
}

function cliCommand() {
  // Prepack replaces this flag with true and drops the checkout path from the bundle.
  if (globalThis.__KASSIS_ADK_PACKED__ === true) return 'kassis-addon';
  const repoCli = path.resolve(templateDir, '../../tools/adk/kassis-addon.mjs');
  if (!fs.existsSync(repoCli)) return 'kassis-addon';
  return `node "${repoCli.split(path.sep).join('/')}"`;
}

function finalizeManifest(dir, fields) {
  const file = path.join(dir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.id = fields.id;
  manifest.name = fields.name;
  manifest.publisher = fields.publisher;
  manifest.tier = fields.tier;
  manifest.hostApi = '^1.0.0';
  if (fields.tier === 2) {
    manifest.resources = { memoryMb: 128 };
    manifest.health = { path: '/health' };
  }
  manifest.entrypoints = { main: 'dist/server/index.js' };
  if (fields.rung >= 2) {
    manifest.ui = { entryFile: 'index.js', runtimeLoad: true };
  } else {
    delete manifest.ui;
  }
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

function finalizePackage(dir, addonId) {
  const file = path.join(dir, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cli = cliCommand();
  pkg.name = addonId;
  pkg.scripts.build = `${cli} build`;
  pkg.scripts['build:server'] = `${cli} build --only=server`;
  pkg.scripts['build:ui'] = `${cli} build --only=ui`;
  pkg.scripts.check = `${cli} check`;
  pkg.scripts.certify = `${cli} certify`;
  pkg.dependencies['@kassis/addon-sdk'] = localSpec(dir, 'addon-sdk', '^0.1.0');
  pkg.dependencies['@kassis/addon-testkit'] = localSpec(dir, 'addon-testkit', '^0.1.0');
  pkg.devDependencies['@kassis/addon-cli'] = localSpec(dir, 'addon-cli', '^0.1.0');
  fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function writeMigrations(dir) {
  const migrations = path.join(dir, 'migrations');
  fs.mkdirSync(migrations, { recursive: true });
  fs.writeFileSync(
    path.join(migrations, '0001_init.up.sql'),
    '-- Owned tables for this addon. Keep the matching down script, or mark this file irreversible.\n'
  );
  fs.writeFileSync(path.join(migrations, '0001_init.down.sql'), '-- Reverses 0001_init.up.sql.\n');
}

/**
 * @param {string} id
 * @param {string} dir
 * @param {{ publisher?: string, tier?: number, rung?: number }} [options]
 * @returns {string}
 */
export function initAddon(id, dir, options = {}) {
  const publisher = options.publisher ?? 'kassis';
  const tier = options.tier ?? 2;
  const rung = options.rung ?? 1;
  if (tier !== 1 && tier !== 2) throw new Error('tier must be 1 or 2');
  if (rung !== 1 && rung !== 2 && rung !== 3) throw new Error('rung must be 1, 2, or 3');
  if (tier === 1 && publisher !== 'kassis') throw new Error('Bank addons are tier 2 only');
  const addonId = resolveId(id, publisher);
  if (fs.existsSync(dir) && fs.readdirSync(dir).filter((name) => name !== '.git').length > 0) {
    throw new Error(`Directory is not empty: ${dir}`);
  }
  copyTree(
    templateDir,
    dir,
    {
      __ADDON_ID__: addonId,
      __ADDON_NAME__: displayName(addonId),
      __PUBLISHER__: publisher,
    },
    rung
  );
  finalizeManifest(dir, { id: addonId, name: displayName(addonId), publisher, tier, rung });
  finalizePackage(dir, addonId);
  if (rung === 3) writeMigrations(dir);
  return dir;
}
