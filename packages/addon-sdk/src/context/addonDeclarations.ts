/**
 * The manifest declarations as types. AddonContext<D> narrows event names, audit actions, job
 * types, prompt keys, secret keys, route permissions and consumed capabilities to what D lists,
 * so an undeclared name fails to compile. The host checks the same lists at runtime.
 */
import type { JsonObject } from '../json.js';
import type {
  AddonDataClient,
  AddonTier1DataClient,
  AddonTier2DataClient,
} from './dataClient.js';
import type { AddonTier } from './addonIdentity.js';

/** Event name → payload type. */
export type EventPayloads = { readonly [eventName: string]: JsonObject };

/** Capability id → the contract the provider implements. */
export type CapabilityContracts = { readonly [capabilityId: string]: object };

export interface AddonDeclarations {
  readonly config: JsonObject;
  readonly publishes: EventPayloads;
  readonly subscribes: EventPayloads;
  readonly auditActions: string;
  readonly jobTypes: string;
  readonly promptKeys: string;
  readonly secretKeys: string;
  readonly permissions: string;
  readonly consumes: CapabilityContracts;
  readonly data: AddonDataClient;
}

type ItemOf<L> = L extends readonly (infer Item)[] ? Item : never;

type FieldOf<L, K extends string> =
  ItemOf<L> extends infer Item
    ? Item extends { readonly [P in K]: infer V extends string }
      ? V
      : never
    : never;

export type ManifestAuditActions<M> = M extends { readonly audit: { readonly actions: infer L } }
  ? ItemOf<L>
  : never;
export type ManifestJobTypes<M> = M extends { readonly jobs: { readonly types: infer L } }
  ? ItemOf<L>
  : never;
export type ManifestPromptKeys<M> = M extends { readonly prompts: { readonly keys: infer L } }
  ? ItemOf<L>
  : never;
export type ManifestSecretKeys<M> = M extends { readonly secrets: { readonly keys: infer L } }
  ? ItemOf<L>
  : never;
export type ManifestPermissionNames<M> = M extends { readonly permissions: infer L }
  ? FieldOf<L, 'name'>
  : never;
export type ManifestPublishedEvents<M> = M extends {
  readonly events: { readonly publishes: infer L };
}
  ? FieldOf<L, 'name'>
  : never;
export type ManifestSubscribedEvents<M> = M extends {
  readonly events: { readonly subscribes: infer L };
}
  ? ItemOf<L>
  : never;
export type ManifestConsumedCapabilities<M> =
  | (M extends { readonly requires: infer L } ? FieldOf<L, 'capability'> : never)
  | (M extends { readonly optional: infer L } ? FieldOf<L, 'capability'> : never);

type ManifestTier<M> = M extends { readonly tier: infer T extends AddonTier } ? T : AddonTier;

type DefaultDataClient<M> = ManifestTier<M> extends 2
  ? AddonTier2DataClient
  : ManifestTier<M> extends 1
    ? AddonTier1DataClient
    : AddonDataClient;

/** Payload and contract types for the names a manifest declares. */
export type AddonTypeMap<M> = {
  readonly publishes: { readonly [E in ManifestPublishedEvents<M>]: JsonObject };
  readonly subscribes: { readonly [E in ManifestSubscribedEvents<M>]: JsonObject };
  readonly consumes?: { readonly [C in ManifestConsumedCapabilities<M>]?: object };
  readonly config?: JsonObject;
  readonly data?: AddonDataClient;
};

type ConsumedContract<T, C extends string> = T extends { readonly consumes: infer K }
  ? C extends keyof K
    ? Exclude<K[C], undefined>
    : object
  : object;

/**
 * Declarations for a manifest written `as const satisfies AddonManifestV2`, plus the types the
 * manifest cannot carry (event payloads, capability contracts, config, data client).
 */
export type DeclareAddon<M, T extends AddonTypeMap<M>> = {
  readonly config: T extends { readonly config: infer C extends JsonObject } ? C : JsonObject;
  readonly publishes: T['publishes'];
  readonly subscribes: T['subscribes'];
  readonly auditActions: ManifestAuditActions<M>;
  readonly jobTypes: ManifestJobTypes<M>;
  readonly promptKeys: ManifestPromptKeys<M>;
  readonly secretKeys: ManifestSecretKeys<M>;
  readonly permissions: ManifestPermissionNames<M>;
  readonly consumes: { readonly [C in ManifestConsumedCapabilities<M>]: ConsumedContract<T, C> };
  readonly data: T extends { readonly data: infer D extends AddonDataClient }
    ? D
    : DefaultDataClient<M>;
};
