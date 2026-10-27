/**
 * Signed profile documents shipped with the CLI, and the optional instance download.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCanonicalManifestString } from '../../server/core/addon-deployment/canonicalJson.mjs';
import {
  keyIsTrusted,
  loadPublisherTrustPolicy,
} from '../../server/core/addon-platform/trust/publisherTrust.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(here, 'profiles');
const publicKeyPath = path.resolve(here, '../../server/keys/addon_verification_public.key');

export function bundledProfilePath(profileId) {
  return path.join(profilesDir, `${profileId}.json`);
}

export function readBundledProfile(profileId) {
  const file = bundledProfilePath(profileId);
  if (!fs.existsSync(file)) {
    throw new Error(`No published profile snapshot for ${profileId}`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function publicKey() {
  const publicKeyHex = fs.readFileSync(publicKeyPath, 'utf8').trim();
  return crypto.createPublicKey({
    key: Buffer.from(publicKeyHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
}

export function verifyProfileSignature(profile, policy = loadPublisherTrustPolicy()) {
  if (!profile || typeof profile.signature !== 'string' || profile.signature.length < 64) {
    return false;
  }
  const canonical = buildCanonicalManifestString(profile);
  const verified = crypto.verify(
    null,
    Buffer.from(canonical, 'utf8'),
    publicKey(),
    Buffer.from(profile.signature, 'hex')
  );
  if (!verified) return false;
  try {
    const publisher = typeof profile.publisher === 'string' && profile.publisher ? profile.publisher : '*';
    keyIsTrusted(fs.readFileSync(publicKeyPath, 'utf8'), publisher, policy);
    return true;
  } catch {
    return false;
  }
}

export async function downloadProfile(instance, profileId, token, fetchImpl = globalThis.fetch) {
  const base = String(instance).replace(/\/$/, '');
  const url = `${base}/api/v1/agent-registry/profiles/published/${encodeURIComponent(profileId)}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetchImpl(url, { headers });
  if (!response.ok) {
    throw new Error(`Profile download failed (${response.status})`);
  }
  const body = await response.json();
  if (body && typeof body === 'object' && body.data && typeof body.data === 'object') {
    return body.data;
  }
  return body;
}
