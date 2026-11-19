/**
 * Find kit data from source, from dist, or from the packed CLI bundle.
 * The packed bundle sets __KASSIS_ADK_PACKED__ and reads files copied beside it.
 * A checkout is the directory that holds the addon template and addon-sdk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function moduleDir(metaUrl) {
  return path.dirname(fileURLToPath(metaUrl));
}

export function isPacked() {
  return globalThis.__KASSIS_ADK_PACKED__ === true;
}

export function checkoutRoot(metaUrl) {
  if (isPacked()) return '';
  let dir = moduleDir(metaUrl);
  for (let depth = 0; depth < 10; depth += 1) {
    const template = path.join(dir, 'templates', 'kassis-addon', 'manifest.json');
    const sdkManifest = path.join(dir, 'packages', 'addon-sdk', 'package.json');
    if (fs.existsSync(template) && fs.existsSync(sdkManifest)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '';
}

export function checkoutFile(metaUrl, ...segments) {
  const root = checkoutRoot(metaUrl);
  if (!root) return '';
  const file = path.join(root, ...segments);
  return fs.existsSync(file) ? file : '';
}

/** File copied beside this module, then the same path in the checkout. */
export function besideThenCheckout(metaUrl, besideName, ...segments) {
  const beside = path.join(moduleDir(metaUrl), besideName);
  if (isPacked()) return beside;
  if (fs.existsSync(beside)) return beside;
  return checkoutFile(metaUrl, ...segments) || beside;
}

/** Checkout copy while developing, then a file beside this module. */
export function checkoutThenBeside(metaUrl, besideName, ...segments) {
  const beside = path.join(moduleDir(metaUrl), besideName);
  if (isPacked()) return beside;
  const repo = checkoutFile(metaUrl, ...segments);
  if (repo) return repo;
  return beside;
}
