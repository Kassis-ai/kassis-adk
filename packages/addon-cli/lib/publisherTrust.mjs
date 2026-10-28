/**
 * Which signing keys may load an addon or a guardrail profile.
 * A fingerprint in `revoked` is refused even if a publisher still lists it.
 * `keys` and `previous` are additional trusted fingerprints for that publisher.
 * A publisher with its own entry does not fall back to `*`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const policyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'publisher-trust.json');

export class PublisherTrustError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublisherTrustError';
  }
}

export function fingerprintPublicKey(derHex) {
  return crypto.createHash('sha256').update(Buffer.from(String(derHex).trim(), 'hex')).digest('hex');
}

export function loadPublisherTrustPolicy() {
  return JSON.parse(fs.readFileSync(policyPath, 'utf8'));
}

export function assertPublisherTrusted(publisher, fingerprint, policy) {
  if (!policy || !Array.isArray(policy.revoked) || !policy.publishers) {
    throw new PublisherTrustError('Publisher trust policy is missing');
  }
  if (policy.revoked.includes(fingerprint)) {
    throw new PublisherTrustError('Addon signing key is revoked');
  }
  const named = policy.publishers[publisher];
  const set = named ?? policy.publishers['*'];
  if (!set || typeof set.current !== 'string') {
    throw new PublisherTrustError('Addon publisher is not trusted');
  }
  const allowed = trustedFingerprints(set);
  if (!allowed.includes(fingerprint)) {
    throw new PublisherTrustError('Addon signing key is not trusted for this publisher');
  }
}

function trustedFingerprints(set) {
  const extra = Array.isArray(set.keys) ? set.keys : [];
  const previous = Array.isArray(set.previous) ? set.previous : [];
  return [set.current, ...extra, ...previous];
}

export function keyIsTrusted(derHex, publisher, policy) {
  assertPublisherTrusted(publisher, fingerprintPublicKey(derHex), policy);
}

const TRUST_FAILURES = [
  'Addon signing key is revoked',
  'Addon publisher is not trusted',
  'Addon signing key is not trusted for this publisher',
  'Publisher trust policy is missing',
];

export function isPublisherTrustError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return TRUST_FAILURES.some((text) => message.includes(text));
}
