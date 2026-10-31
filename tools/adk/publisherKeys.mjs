/**
 * Bank developer keys. The private key is written outside the addon folder.
 * Registering it still needs an approval on the instance.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PUBLISHER_ID = /^[a-z0-9][a-z0-9-]*$/;

export function publisherKeysDir() {
  return path.join(os.homedir(), '.kassis', 'keys');
}

function restrictToCurrentUser(file) {
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // chmod is a no-op on some Windows volumes.
  }
  if (process.platform !== 'win32') return;
  const user = process.env.USERNAME || process.env.USER;
  if (!user) return;
  spawnSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:(R)`], { stdio: 'ignore' });
}

function privateKeyFromFile(keyPath) {
  const hex = fs.readFileSync(keyPath, 'utf8').trim();
  return crypto.createPrivateKey({
    key: Buffer.from(hex, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
}

export function generatePublisherKey(publisher) {
  if (!PUBLISHER_ID.test(publisher)) {
    throw new Error('publisher must be a lowercase id');
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  const privateDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const fingerprint = crypto.createHash('sha256').update(publicDer).digest('hex');
  const dir = publisherKeysDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${fingerprint}.key`);
  fs.writeFileSync(file, privateDer.toString('hex'), { encoding: 'utf8', mode: 0o600 });
  restrictToCurrentUser(file);
  return { publisher, fingerprint, publicKey: publicDer.toString('hex'), file };
}

export function exportPublicKey(keyPath, outPath) {
  const publicDer = crypto.createPublicKey(privateKeyFromFile(keyPath)).export({
    type: 'spki',
    format: 'der',
  });
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, `${publicDer.toString('hex')}\n`);
  return publicDer.toString('hex');
}

export async function registerPublisherKey({
  instance,
  publisher,
  keyPath,
  token,
  fetchImpl = globalThis.fetch,
}) {
  if (!token) throw new Error('KASSIS_ADK_TOKEN is required');
  if (!instance) throw new Error('keys register --instance=<url> is required');
  if (!PUBLISHER_ID.test(publisher)) throw new Error('publisher must be a lowercase id');
  const publicKeyDerHex = crypto
    .createPublicKey(privateKeyFromFile(keyPath))
    .export({ type: 'spki', format: 'der' })
    .toString('hex');
  const url = `${String(instance).replace(/\/$/, '')}/api/v1/platform/addon-publishers/${encodeURIComponent(publisher)}/keys`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ publicKeyDerHex }),
  });
  const text = await response.text();
  if (!response.ok && response.status !== 202) {
    throw new Error(`Key registration failed (${response.status})`);
  }
  return text;
}
