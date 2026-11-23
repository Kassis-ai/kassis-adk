/**
 * Route and principal types for the Tier 1 host contract.
 * Tier 1 only methods say so on the facade: Tier 2 RPC refuses them.
 */
import type { AddonPrincipal } from './addonIdentity.js';

/** Host-issued principals for this addon. `service` is the actor a job handler receives. */
export interface PrincipalFacade {
  readonly service: AddonPrincipal;
}

/**
 * Express middleware (`RequestHandler`). The SDK does not depend on Express.
 * `AddonRouter` does not accept this value; pass it to the router the addon built.
 */
export type RouteMiddleware = (
  request: object,
  response: object,
  next: (error?: unknown) => void
) => void | Promise<void>;

export interface RouteServeOptions {
  /** Sub-path below `/api/v1/addons/<id>`. Defaults to `/`. */
  readonly path?: string;
}

/**
 * Per-route host checks. Tier 1 only. Tier 2 RPC refuses `guards`, so `serve`
 * cannot skip the one-permission `routes.mount` rule.
 */
export interface RouteGuards {
  /** Tier 1 only. Tier 2 RPC refuses `guards.authenticate`. */
  authenticate(): RouteMiddleware;
  /** Tier 1 only. Tier 2 RPC refuses `guards.permission`. */
  permission(permission: string): RouteMiddleware;
  /** Tier 1 only. Tier 2 RPC refuses `guards.anyOf`. */
  anyOf(permissions: readonly string[]): RouteMiddleware;
  /** Tier 1 only. Tier 2 RPC refuses `guards.resource`. Scope is `own`, `department`, or `all`. */
  resource(type: string, scope: 'own' | 'department' | 'all'): RouteMiddleware;
  /** Tier 1 only. Tier 2 RPC refuses `guards.auditResource`. */
  auditResource(): RouteMiddleware;
  /** Tier 1 only. Tier 2 RPC refuses `guards.auditChanges`. */
  auditChanges(): RouteMiddleware;
}
