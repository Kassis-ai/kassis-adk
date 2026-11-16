/**
 * Tier facade availability from @kassis/addon-sdk/tier-matrix.json.
 * Shared by offline doctor scans and createTestContext runtime refusals.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

import { TestContextError } from './testContextError.mjs';

const require = createRequire(import.meta.url);
const MATRIX_PATH = require.resolve('@kassis/addon-sdk/tier-matrix.json');

const METHOD_NAME = /^ctx\.[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*){0,4}$/;

/**
 * @typedef {object} TierMatrixRow
 * @property {string} method
 * @property {boolean} tier1
 * @property {boolean} tier2
 */

/** @type {ReadonlyMap<string, TierMatrixRow> | null} */
let matrixByMethod = null;

/**
 * @returns {ReadonlyMap<string, TierMatrixRow>}
 */
export function loadTierMatrix() {
  if (matrixByMethod) return matrixByMethod;
  const document = JSON.parse(fs.readFileSync(MATRIX_PATH, 'utf8'));
  /** @type {Map<string, TierMatrixRow>} */
  const map = new Map();
  if (document && typeof document === 'object' && Array.isArray(document.methods)) {
    for (const row of document.methods) {
      if (!row || typeof row !== 'object' || typeof row.method !== 'string') continue;
      map.set(row.method, row);
    }
  }
  matrixByMethod = map;
  return map;
}

/**
 * Tier 2 host refusal when the method is absent from the matrix (see tier2RpcAllowlist.ts).
 * @param {string} method
 * @returns {boolean}
 */
export function tier2HostPrefixRefusal(method) {
  if (!METHOD_NAME.test(method) || method.length > 80) return true;
  if (method.startsWith('ctx.extend.')) return true;
  if (method.startsWith('ctx.locks.')) return true;
  if (method === 'ctx.capabilities.register' || method === 'ctx.capabilities.provide') return true;
  if (method.startsWith('ctx.data.') && method !== 'ctx.data.read') return true;
  return false;
}

/**
 * @param {string} method
 * @param {1 | 2} tier
 * @param {ReadonlyMap<string, TierMatrixRow>} matrix
 * @returns {boolean}
 */
export function refusedForTier(method, tier, matrix) {
  const row = matrix.get(method);
  if (row) {
    return tier === 2 ? row.tier2 === false : row.tier1 === false;
  }
  if (tier === 2) return tier2HostPrefixRefusal(method);
  return false;
}

/**
 * @param {1 | 2} tier
 * @param {string} method
 * @returns {void}
 */
export function assertCtxMethodAllowed(tier, method) {
  if (refusedForTier(method, tier, loadTierMatrix())) {
    throw new TestContextError('KADK-219', method, {
      file: 'test',
      method,
      tier: String(tier),
    });
  }
}