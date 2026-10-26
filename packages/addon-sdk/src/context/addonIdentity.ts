import type { JsonObject } from '../json.js';

/** 1: first-party, in process. 2: client or partner code, in its own process. */
export type AddonTier = 1 | 2;

export interface AddonIdentity {
  readonly id: string;
  readonly version: string;
  readonly tier: AddonTier;
}

/** Injected by the host and applied by every facade. One tenant per instance today (D6). */
export interface TenantScope {
  readonly id: string;
}

declare const principalBrand: unique symbol;

/**
 * Who a facade call acts for. Only the host issues principals: a mounted route gets the
 * signed-in user's (ctx.routes.principalOf), job and event handlers get the addon's service
 * principal. Facades check that principal's permissions and tenant, never the addon's.
 */
export interface AddonPrincipal {
  readonly kind: 'user' | 'service';
  readonly userId: number | null;
  readonly email: string | null;
  readonly [principalBrand]: true;
}

/** Log lines are labelled with the addon id and version by the host. */
export interface AddonLogger {
  debug(message: string, detail?: JsonObject): void;
  info(message: string, detail?: JsonObject): void;
  warn(message: string, detail?: JsonObject): void;
  error(message: string, detail?: JsonObject): void;
}
