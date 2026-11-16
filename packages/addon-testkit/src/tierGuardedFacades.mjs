/**
 * Tier-guarded ctx facades for offline tests (extend, locks, capabilities, data).
 */

import { assertCtxMethodAllowed } from './tierRefusal.mjs';

function disposable() {
  return {
    async dispose() {
      return undefined;
    },
  };
}

/**
 * @param {1 | 2} tier
 * @returns {object}
 */
export function createTierGuardedCapabilities(tier) {
  return {
    async get() {
      assertCtxMethodAllowed(tier, 'ctx.capabilities.get');
      return null;
    },
    async consume() {
      assertCtxMethodAllowed(tier, 'ctx.capabilities.consume');
      return null;
    },
    provide() {
      assertCtxMethodAllowed(tier, 'ctx.capabilities.provide');
      return disposable();
    },
    register() {
      assertCtxMethodAllowed(tier, 'ctx.capabilities.register');
      return disposable();
    },
  };
}

/**
 * @param {1 | 2} tier
 * @returns {object}
 */
export function createTierGuardedLocks(tier) {
  return {
    async acquire() {
      assertCtxMethodAllowed(tier, 'ctx.locks.acquire');
      return disposable();
    },
  };
}

/**
 * @param {1 | 2} tier
 * @returns {object}
 */
export function createTierGuardedExtend(tier) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (typeof prop !== 'string' || prop === 'then') return undefined;
        const method = `ctx.extend.${prop}`;
        return () => {
          assertCtxMethodAllowed(tier, method);
          return disposable();
        };
      },
    }
  );
}

/**
 * @returns {object}
 */
function inMemoryTier1DataClient() {
  return {
    async $queryRaw() {
      return [];
    },
    async $executeRaw() {
      return 0;
    },
    async $transaction(work) {
      return work(inMemoryTier1DataClient());
    },
  };
}

/**
 * @param {1 | 2} tier
 * @returns {object}
 */
export function createTierGuardedData(tier) {
  return {
    async read(_table, _options) {
      assertCtxMethodAllowed(tier, 'ctx.data.read');
      return { rows: [] };
    },
    async query(_sql, _params) {
      assertCtxMethodAllowed(tier, 'ctx.data.query');
      return { rows: [] };
    },
    async execute(_sql, _params) {
      assertCtxMethodAllowed(tier, 'ctx.data.execute');
      return { count: 0 };
    },
    async transaction(_statements) {
      assertCtxMethodAllowed(tier, 'ctx.data.transaction');
      return { results: [] };
    },
    async $queryRaw() {
      assertCtxMethodAllowed(tier, 'ctx.data.$queryRaw');
      return [];
    },
    async $executeRaw() {
      assertCtxMethodAllowed(tier, 'ctx.data.$executeRaw');
      return 0;
    },
    async $transaction(work) {
      assertCtxMethodAllowed(tier, 'ctx.data.$transaction');
      return work(inMemoryTier1DataClient());
    },
  };
}