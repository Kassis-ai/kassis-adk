/**
 * Copy templates/kassis-addon into an empty directory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const templateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../templates/kassis-addon');
const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function displayName(id) {
  return id
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function copyTree(from, to, id, name) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(source, target, id, name);
      continue;
    }
    const text = fs.readFileSync(source, 'utf8').replaceAll('__ADDON_ID__', id).replaceAll('__ADDON_NAME__', name);
    fs.writeFileSync(target, text);
  }
}

export function initAddon(id, dir) {
  if (!ID_RE.test(id)) {
    throw new Error('Addon id must be kebab-case');
  }
  if (fs.existsSync(dir) && fs.readdirSync(dir).filter((name) => name !== '.git').length > 0) {
    throw new Error(`Directory is not empty: ${dir}`);
  }
  copyTree(templateDir, dir, id, displayName(id));
  return dir;
}
