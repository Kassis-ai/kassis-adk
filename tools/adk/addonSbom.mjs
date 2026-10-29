/**
 * CycloneDX document for the libraries an addon build ships.
 * Versions come from package-lock.json. Names come from the esbuild metafile,
 * the Vite manifest, or the addon's own dependencies.
 */
import fs from 'node:fs';
import path from 'node:path';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function packageNameFromInput(relative) {
  const normalized = relative.replace(/\\/g, '/');
  const marker = 'node_modules/';
  const at = normalized.lastIndexOf(marker);
  if (at < 0) return '';
  const rest = normalized.slice(at + marker.length);
  const parts = rest.split('/');
  if (parts[0]?.startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0] ?? '';
}

function namesFromMeta(dir) {
  const file = path.join(dir, 'dist', 'server', 'meta.json');
  if (!fs.existsSync(file)) return [];
  const meta = readJson(file);
  const inputs = meta && typeof meta === 'object' && meta.inputs && typeof meta.inputs === 'object' ? meta.inputs : {};
  return Object.keys(inputs).map(packageNameFromInput).filter(Boolean);
}

function namesFromVite(dir) {
  const file = path.join(dir, 'frontend', 'dist', '.vite', 'manifest.json');
  if (!fs.existsSync(file)) return [];
  const manifest = readJson(file);
  if (!manifest || typeof manifest !== 'object') return [];
  const names = [];
  for (const entry of Object.values(manifest)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.imports)) continue;
    for (const item of entry.imports) {
      if (typeof item === 'string') names.push(packageNameFromInput(item));
    }
  }
  return names.filter(Boolean);
}

function namesFromPackage(dir) {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return [];
  const manifest = readJson(file);
  const dependencies = manifest && typeof manifest.dependencies === 'object' ? manifest.dependencies : {};
  return Object.keys(dependencies);
}

function versionOf(lock, name) {
  const packages = lock && typeof lock.packages === 'object' ? lock.packages : {};
  const entry = packages[`node_modules/${name}`];
  if (entry && typeof entry.version === 'string') return entry.version;
  return '0.0.0';
}

export function buildAddonSbom(dir) {
  const discovered = [...namesFromMeta(dir), ...namesFromVite(dir)];
  const names = [...new Set(discovered.length > 0 ? discovered : namesFromPackage(dir))].sort();
  const lockFile = path.join(dir, 'package-lock.json');
  const lock = fs.existsSync(lockFile) ? readJson(lockFile) : {};
  const components = names.map((name) => {
    const version = versionOf(lock, name);
    return {
      type: 'library',
      name,
      version,
      purl: `pkg:npm/${name}@${version}`,
    };
  });
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    components,
  };
}

export function writeAddonSbom(dir) {
  const text = `${JSON.stringify(buildAddonSbom(dir), null, 2)}\n`;
  fs.writeFileSync(path.join(dir, 'sbom.json'), text);
  return text;
}
