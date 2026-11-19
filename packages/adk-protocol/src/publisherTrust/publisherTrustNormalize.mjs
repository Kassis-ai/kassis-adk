import { PublisherTrustError } from './publisherTrustError.mjs';
import { isRecord, keyFromRow, publisherFromRow } from './publisherTrustRecords.mjs';

function normalizeSnapshot(policy) {
  const publishers = [];
  const keys = [];
  for (const row of policy.publishers) {
    if (!isRecord(row)) continue;
    const publisher = publisherFromRow(row);
    if (publisher) publishers.push(publisher);
  }
  for (const row of policy.keys) {
    if (!isRecord(row)) continue;
    const key = keyFromRow(row, new Set());
    if (key) keys.push(key);
  }
  return { publishers, keys };
}

function normalizeLegacy(policy) {
  if (!isRecord(policy.publishers)) {
    throw new PublisherTrustError('Publisher trust policy is missing');
  }
  const revoked = new Set(
    (Array.isArray(policy.revoked) ? policy.revoked : [])
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().toLowerCase())
  );
  const publishers = [];
  const keys = [];
  for (const [id, set] of Object.entries(policy.publishers)) {
    if (!isRecord(set)) continue;
    const firstParty = id === '*' || id === 'kassis';
    publishers.push({
      id,
      displayName: firstParty ? 'Kassis' : id,
      allowedTiers: firstParty ? [1, 2] : [2],
      idPrefixes: firstParty ? ['*'] : [`${id}-`],
      status: 'active',
    });
    const add = (fingerprint, status) => {
      const key = keyFromRow(
        { fingerprint, publisherId: id, status, publicKeyDerHex: '' },
        revoked
      );
      if (key) keys.push(key);
    };
    add(set.current, 'current');
    for (const fingerprint of Array.isArray(set.previous) ? set.previous : [])
      add(fingerprint, 'previous');
    for (const fingerprint of Array.isArray(set.keys) ? set.keys : []) add(fingerprint, 'current');
  }
  for (const fingerprint of revoked) {
    if (!keys.some((key) => key.fingerprint === fingerprint)) {
      keys.push({
        fingerprint,
        publisherId: '',
        publicKeyDerHex: '',
        status: 'revoked',
        notBefore: null,
        notAfter: null,
      });
    }
  }
  return { publishers, keys };
}

export function normalizePublisherTrust(policy) {
  if (!isRecord(policy)) throw new PublisherTrustError('Publisher trust policy is missing');
  if (Array.isArray(policy.publishers) && Array.isArray(policy.keys))
    return normalizeSnapshot(policy);
  return normalizeLegacy(policy);
}
