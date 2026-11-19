/**
 * Canonical JSON for addon manifest signatures (RFC 8785 style).
 *
 * Plain ESM with no imports so the server (run by tsx) and the plain-node
 * signing tools under tools/signing/ sign and verify the exact same bytes.
 */

/**
 * Serialize a JSON value deterministically: object keys sorted by UTF-16 code
 * unit at every depth, array order kept, no whitespace, strings and numbers
 * written as JSON.stringify writes them. Properties whose value is undefined,
 * a function or a symbol are dropped (array slots become null), as in JSON.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalJsonStringify(value) {
  const serialized = serializeValue(value, new Set());
  if (serialized === undefined) {
    throw new TypeError(`Cannot canonicalize a top-level ${typeof value}`);
  }
  return serialized;
}

/**
 * The string an addon manifest signature covers: every field except the
 * top-level `signature`. Nested fields and `contentHash` are signed.
 *
 * @param {Record<string, unknown>} manifest
 * @returns {string}
 */
export function buildCanonicalManifestString(manifest) {
  const { signature: _signature, ...signedFields } = manifest;
  return canonicalJsonStringify(signedFields);
}

function compareCodeUnits(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

function serializeValue(value, ancestors) {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new TypeError(`Cannot canonicalize the non-finite number ${value}`);
      }
      return JSON.stringify(value);
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
    case 'bigint':
      throw new TypeError('Cannot canonicalize a BigInt');
    default:
      return serializeContainer(value, ancestors);
  }
}

function serializeContainer(value, ancestors) {
  if (ancestors.has(value)) {
    throw new TypeError('Cannot canonicalize a circular structure');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = Array.from(value, (item) => serializeValue(item, ancestors) ?? 'null');
      return `[${items.join(',')}]`;
    }
    assertPlainObject(value);
    const members = [];
    for (const key of Object.keys(value).sort(compareCodeUnits)) {
      const member = serializeValue(value[key], ancestors);
      if (member !== undefined) {
        members.push(`${JSON.stringify(key)}:${member}`);
      }
    }
    return `{${members.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertPlainObject(value) {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`Cannot canonicalize a ${value.constructor?.name ?? 'non-plain'} object`);
  }
}
