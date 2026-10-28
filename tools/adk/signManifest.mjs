/**
 * Sign manifest.json with an Ed25519 key file. Used when the repo signer is
 * not shipped with the CLI package. Writes contentHash first, because the host
 * refuses a manifest that does not carry one. The private key stays with the caller.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

async function loadSignerModule(fileName, repoRelative) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const packed = path.join(here, fileName);
  const repo = path.resolve(here, repoRelative);
  const file = fs.existsSync(packed) ? packed : repo;
  return import(pathToFileURL(file).href);
}

async function canonicalString(body) {
  const loaded = await loadSignerModule(
    'canonicalJson.mjs',
    '../../server/core/addon-deployment/canonicalJson.mjs'
  );
  return loaded.buildCanonicalManifestString(body);
}

export async function signManifestFile(manifestPath, keyPath) {
  const hex = fs.readFileSync(keyPath, 'utf8').trim();
  const key = crypto.createPrivateKey({
    key: Buffer.from(hex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const body = { ...manifest };
  delete body.signature;
  const { computeAddonContentHash } = await loadSignerModule(
    'addonContentHash.mjs',
    '../../server/core/addon-deployment/addonContentHash.mjs'
  );
  // manifest.json is outside the hash scope, so writing this field does not change the digest.
  body.contentHash = await computeAddonContentHash(path.dirname(manifestPath));
  const signature = crypto.sign(null, Buffer.from(await canonicalString(body)), key).toString('hex');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...body, signature }, null, 2)}\n`);
  process.stdout.write(`${path.resolve(manifestPath)}\n`);
}
