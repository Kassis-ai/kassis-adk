import crypto from 'node:crypto';

import { PublisherTrustError } from './publisherTrustError.mjs';
import { normalizePublisherTrust } from './publisherTrustNormalize.mjs';
import { isRecord, text } from './publisherTrustRecords.mjs';

const FIRST_PARTY = new Set(['kassis', 'kassis-corp']);
const USABLE = new Set(['current', 'previous']);

export function fingerprintPublicKey(derHex) {
  return crypto
    .createHash('sha256')
    .update(Buffer.from(String(derHex).trim(), 'hex'))
    .digest('hex');
}

export function isFirstPartyPublisher(publisher) {
  const value = String(publisher ?? '').trim();
  return value === '' || FIRST_PARTY.has(value);
}

function publisherById(snapshot, id) {
  return snapshot.publishers.find((publisher) => publisher.id === id) ?? null;
}

function lookupPublisher(snapshot, publisher) {
  const named = publisherById(snapshot, publisher);
  if (named) return named;
  if (publisher === '*') return publisherById(snapshot, 'kassis');
  return publisherById(snapshot, '*');
}

export function assertPublisherTrusted(publisher, fingerprint, policy) {
  const snapshot = normalizePublisherTrust(policy);
  const fp = String(fingerprint).trim().toLowerCase();
  if (snapshot.keys.some((key) => key.fingerprint === fp && key.status === 'revoked')) {
    throw new PublisherTrustError('Addon signing key is revoked');
  }
  const owner = lookupPublisher(snapshot, publisher);
  if (!owner || owner.status !== 'active') {
    throw new PublisherTrustError('Addon publisher is not trusted');
  }
  const key = snapshot.keys.find(
    (item) => item.fingerprint === fp && item.publisherId === owner.id
  );
  if (!key || !USABLE.has(key.status)) {
    throw new PublisherTrustError('Addon signing key is not trusted for this publisher');
  }
}

export function keyIsTrusted(derHex, publisher, policy) {
  assertPublisherTrusted(publisher, fingerprintPublicKey(derHex), policy);
}

function assertWindow(key, now) {
  const at = now instanceof Date ? now.getTime() : Date.now();
  if (key.notBefore) {
    const start = Date.parse(key.notBefore);
    if (Number.isFinite(start) && at < start) {
      throw new PublisherTrustError('Addon signing key is outside its validity window');
    }
  }
  if (key.notAfter) {
    const end = Date.parse(key.notAfter);
    if (Number.isFinite(end) && at > end) {
      throw new PublisherTrustError('Addon signing key is outside its validity window');
    }
  }
}

function keyMaterial(key, bootstrapKeyHex) {
  if (key.publicKeyDerHex) {
    if (fingerprintPublicKey(key.publicKeyDerHex) !== key.fingerprint) {
      throw new PublisherTrustError('Addon signing key is unknown');
    }
    return key.publicKeyDerHex;
  }
  const fallback = text(bootstrapKeyHex).toLowerCase();
  if (!fallback) return '';
  if (key.publisherId !== 'kassis' && key.publisherId !== '*') return '';
  if (fingerprintPublicKey(fallback) !== key.fingerprint) return '';
  return fallback;
}

function kassisPublisher(snapshot) {
  return publisherById(snapshot, 'kassis') ?? publisherById(snapshot, '*');
}

function currentKassisKey(snapshot) {
  const owner = kassisPublisher(snapshot);
  if (!owner || owner.status !== 'active') {
    throw new PublisherTrustError('Addon publisher is not trusted');
  }
  const owned = snapshot.keys.filter((key) => key.publisherId === owner.id);
  const current = owned.find((key) => key.status === 'current');
  if (current) return current;
  if (owned.some((key) => key.status === 'revoked')) {
    throw new PublisherTrustError('Addon signing key is revoked');
  }
  throw new PublisherTrustError('Addon signing key is unknown');
}

function idAllowed(id, prefixes) {
  return prefixes.some((prefix) => prefix === '*' || (prefix.length > 0 && id.startsWith(prefix)));
}

function signingBlock(manifest) {
  const signing = manifest.signing;
  if (!isRecord(signing)) return null;
  const keyId = text(signing.keyId).toLowerCase();
  if (!keyId) return null;
  return { alg: text(signing.alg), keyId };
}

/**
 * The key that may verify this manifest. Throws PublisherTrustError when the
 * key, publisher, tier, or addon id is not allowed.
 */
export function resolveManifestTrust(manifest, snapshot, bootstrapKeyHex, now = new Date()) {
  const publisher = text(manifest.publisher);
  const signing = signingBlock(manifest);
  if (!signing) {
    if (publisher && !isFirstPartyPublisher(publisher)) {
      throw new PublisherTrustError('Addon signing block is required');
    }
    const key = currentKassisKey(snapshot);
    assertWindow(key, now);
    const publicKeyDerHex = keyMaterial(key, bootstrapKeyHex);
    if (!publicKeyDerHex) throw new PublisherTrustError('Addon signing key is unknown');
    return { publicKeyDerHex, deprecated: true };
  }
  if (signing.alg !== 'ed25519') {
    throw new PublisherTrustError('Addon signing key is not trusted for this publisher');
  }
  const key = snapshot.keys.find((item) => item.fingerprint === signing.keyId);
  if (!key) throw new PublisherTrustError('Addon signing key is unknown');
  if (key.status === 'revoked') throw new PublisherTrustError('Addon signing key is revoked');
  if (key.status === 'pending') throw new PublisherTrustError('Addon signing key is pending');
  if (!USABLE.has(key.status)) throw new PublisherTrustError('Addon signing key is unknown');
  assertWindow(key, now);
  if (key.publisherId !== publisher) {
    throw new PublisherTrustError('Addon signing key is not trusted for this publisher');
  }
  const owner = publisherById(snapshot, key.publisherId);
  if (!owner || owner.status !== 'active') {
    throw new PublisherTrustError('Addon publisher is not trusted');
  }
  const tier = manifest.tier;
  if (publisher !== 'kassis' && tier === 1) {
    throw new PublisherTrustError('Addon tier is not allowed for this publisher');
  }
  if (typeof tier !== 'number' || !owner.allowedTiers.includes(tier)) {
    throw new PublisherTrustError('Addon tier is not allowed for this publisher');
  }
  const id = text(manifest.id);
  if (!idAllowed(id, owner.idPrefixes)) {
    throw new PublisherTrustError('Addon id is outside the publisher prefixes');
  }
  const publicKeyDerHex = keyMaterial(key, bootstrapKeyHex);
  if (!publicKeyDerHex) throw new PublisherTrustError('Addon signing key is unknown');
  return { publicKeyDerHex, deprecated: false };
}
