const KEY_STATUSES = new Set(['pending', 'current', 'previous', 'revoked']);

export function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => Number.isInteger(item));
}

function stringList(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === 'string' && item.length > 0);
}

function timeValue(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

function keyStatus(value) {
  return KEY_STATUSES.has(value) ? value : 'pending';
}

function publisherStatus(value) {
  return value === 'active' ? 'active' : 'suspended';
}

export function copyPublisher(publisher) {
  return {
    id: publisher.id,
    displayName: publisher.displayName,
    allowedTiers: [...publisher.allowedTiers],
    idPrefixes: [...publisher.idPrefixes],
    status: publisher.status,
  };
}

export function copyKey(key) {
  return {
    fingerprint: key.fingerprint,
    publisherId: key.publisherId,
    publicKeyDerHex: key.publicKeyDerHex,
    status: key.status,
    notBefore: key.notBefore,
    notAfter: key.notAfter,
  };
}

export function publisherFromRow(row) {
  const id = text(row.id);
  if (!id) return null;
  const displayName = text(row.displayName) || text(row.display_name) || id;
  return {
    id,
    displayName,
    allowedTiers: numberList(row.allowedTiers ?? row.allowed_tiers),
    idPrefixes: stringList(row.idPrefixes ?? row.id_prefixes),
    status: publisherStatus(text(row.status)),
  };
}

export function keyFromRow(row, revoked) {
  const fingerprint = text(row.fingerprint).toLowerCase();
  if (!fingerprint) return null;
  const declared = keyStatus(text(row.status));
  return {
    fingerprint,
    publisherId: text(row.publisherId) || text(row.publisher_id),
    publicKeyDerHex: text(row.publicKeyDerHex || row.public_key_der_hex).toLowerCase(),
    status: revoked.has(fingerprint) ? 'revoked' : declared,
    notBefore: timeValue(row.notBefore ?? row.not_before),
    notAfter: timeValue(row.notAfter ?? row.not_after),
  };
}
