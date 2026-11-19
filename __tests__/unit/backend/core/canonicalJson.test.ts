// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildCanonicalManifestString,
  canonicalJsonStringify,
} from '@kassis/adk-protocol';

describe('canonicalJsonStringify', () => {
  it('sorts object keys at every depth and writes no whitespace', () => {
    const value = {
      zeta: { b: 2, a: { y: true, x: null } },
      alpha: [{ d: 1, c: 2 }],
    };

    expect(canonicalJsonStringify(value)).toBe(
      '{"alpha":[{"c":2,"d":1}],"zeta":{"a":{"x":null,"y":true},"b":2}}'
    );
  });

  it('gives the same string whatever the insertion order', () => {
    const first = { routing: { mountPath: '/a', auth: true }, name: 'demo' };
    const second = { name: 'demo', routing: { auth: true, mountPath: '/a' } };

    expect(canonicalJsonStringify(first)).toBe(canonicalJsonStringify(second));
  });

  it('keeps array order', () => {
    expect(canonicalJsonStringify({ list: ['b', 'a', 3, 1] })).toBe('{"list":["b","a",3,1]}');
  });

  it('orders keys by UTF-16 code unit, not by code point or locale', () => {
    // U+1F600 is stored as the surrogate pair D83D DE00, which sorts before U+FFFD.
    const value = Object.fromEntries([
      ['\uFFFD', 1],
      ['😀', 2],
      ['é', 3],
      ['z', 4],
      ['Z', 5],
    ]);

    expect(canonicalJsonStringify(value)).toBe('{"Z":5,"z":4,"é":3,"😀":2,"\uFFFD":1}');
  });

  it('escapes strings exactly as JSON.stringify does', () => {
    const text = 'quote " backslash \\ newline \n tab \t control \u0001 separator \u2028 café';

    expect(canonicalJsonStringify({ text })).toBe(`{"text":${JSON.stringify(text)}}`);
  });

  it('writes numbers in ECMAScript shortest form', () => {
    expect(canonicalJsonStringify([1.0, -0, 0.1, 1e21, 1e-7, 123456789012345680000])).toBe(
      '[1,0,0.1,1e+21,1e-7,123456789012345680000]'
    );
  });

  it('drops undefined properties and writes undefined array slots as null', () => {
    const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays -- a hole must serialize as null like JSON

    expect(canonicalJsonStringify({ kept: 1, dropped: undefined })).toBe('{"kept":1}');
    expect(canonicalJsonStringify([undefined, 2])).toBe('[null,2]');
    expect(canonicalJsonStringify(sparse)).toBe('[1,null,3]');
  });

  it('rejects values JSON cannot represent faithfully', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => canonicalJsonStringify({ count: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ count: Infinity })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ big: 1n })).toThrow(/BigInt/);
    expect(() => canonicalJsonStringify(circular)).toThrow(/circular/);
    expect(() => canonicalJsonStringify({ when: new Date(0) })).toThrow(/Date/);
    expect(() => canonicalJsonStringify(undefined)).toThrow(/top-level/);
  });

  it('allows the same object twice when it is not circular', () => {
    const shared = { id: 1 };

    expect(canonicalJsonStringify({ left: shared, right: shared })).toBe(
      '{"left":{"id":1},"right":{"id":1}}'
    );
  });
});

describe('buildCanonicalManifestString', () => {
  it('excludes only the top-level signature and keeps contentHash and nested fields', () => {
    const canonical = buildCanonicalManifestString({
      signature: 'top-level-signature',
      name: 'demo',
      contentHash: `sha256-${'a'.repeat(64)}`,
      metadata: { signature: 'nested-value-is-signed' },
    });

    expect(canonical).toBe(
      `{"contentHash":"sha256-${'a'.repeat(64)}","metadata":{"signature":"nested-value-is-signed"},"name":"demo"}`
    );
    expect(canonical).not.toContain('top-level-signature');
  });
});
