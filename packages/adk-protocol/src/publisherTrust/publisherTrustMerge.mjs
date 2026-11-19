import { copyKey, copyPublisher } from './publisherTrustRecords.mjs';

export function mergePublisherTrust(sources) {
  const publishers = new Map();
  const keys = new Map();
  for (const source of sources) {
    if (!source) continue;
    for (const publisher of source.publishers) {
      const existing = publishers.get(publisher.id);
      const status =
        existing?.status === 'suspended' || publisher.status === 'suspended'
          ? 'suspended'
          : publisher.status;
      publishers.set(publisher.id, { ...copyPublisher(publisher), status });
    }
    for (const key of source.keys) {
      const existing = keys.get(key.fingerprint);
      const next = copyKey(key);
      if (existing?.status === 'revoked' || key.status === 'revoked') next.status = 'revoked';
      if (!next.publicKeyDerHex && existing?.publicKeyDerHex)
        next.publicKeyDerHex = existing.publicKeyDerHex;
      keys.set(key.fingerprint, next);
    }
  }
  return { publishers: [...publishers.values()], keys: [...keys.values()] };
}
