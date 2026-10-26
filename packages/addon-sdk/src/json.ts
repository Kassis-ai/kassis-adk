/** Values that cross the host boundary: HTTP bodies, events, jobs, settings, tier 2 RPC. */
export type JsonPrimitive = string | number | boolean | null;

export type JsonArray = readonly JsonValue[];

/**
 * A JSON object. Values may be `undefined` so optional fields type-check; serialisation drops
 * them. Declare payload types with `type`, not `interface`: interfaces have no implicit index
 * signature and are not assignable to this type.
 */
export type JsonObject = { readonly [key: string]: JsonValue | undefined };

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/** A JSON Schema (draft 2020-12) document. */
export type JsonSchema = JsonObject;
