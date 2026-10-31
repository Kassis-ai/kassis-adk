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

function keyIsInsideAddon(manifestPath, keyPath) {
  const addonDir = path.resolve(path.dirname(manifestPath));
  const resolvedKey = path.resolve(keyPath);
  const relative = path.relative(addonDir, resolvedKey);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function signManifestFile(manifestPath, keyPath) {
  if (keyIsInsideAddon(manifestPath, keyPath)) {
    throw new Error('Refusing to sign with a private key inside the addon folder');
  }
  const hex = fs.readFileSync(keyPath, 'utf8').trim();
  const key = crypto.createPrivateKey({
    key: Buffer.from(hex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const body = { ...manifest };
  delete body.signature;
  const publicDer = crypto.createPublicKey(key).export({ type: 'spki', format: 'der' });
  body.signing = {
    alg: 'ed25519',
    keyId: crypto.createHash('sha256').update(publicDer).digest('hex'),
  };
  const { computeAddonContentHash, computeUiContentHash } = await loadSignerModule(
    'addonContentHash.mjs',
    '../../server/core/addon-deployment/addonContentHash.mjs'
  );
  const addonDir = path.dirname(manifestPath);
  // manifest.json is outside the hash scope, so writing this field does not change the digest.
  body.contentHash = await computeAddonContentHash(addonDir);
  const publisher = typeof body.publisher === 'string' ? body.publisher : '';
  if (publisher !== 'kassis') {
    const uiContentHash = await computeUiContentHash(addonDir);
    if (uiContentHash) body.uiContentHash = uiContentHash;
    else delete body.uiContentHash;
  }
  const signature = crypto
    .sign(null, Buffer.from(await canonicalString(body)), key)
    .toString('hex');
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...body, signature }, null, 2)}\n`);
  process.stdout.write(`${path.resolve(manifestPath)}\n`);
}
