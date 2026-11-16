import type { JsonObject, JsonValue } from '../json.js';

export type SqlValue = string | number | boolean | null | Date;

/** JSON value the host binds to `$1`..`$n` in tier 2 parameterised SQL. */
export type AddonSqlParam = string | number | boolean | null | JsonObject | readonly JsonValue[];

export type AddonDataBatchStatement = {
  readonly op: 'query' | 'execute';
  readonly sql: string;
  readonly params?: readonly AddonSqlParam[];
};

export type AddonDataReadOptions = {
  readonly limit?: number;
};

export type AddonDataQueryResult = {
  readonly rows: readonly JsonObject[];
};

export type AddonDataExecuteResult = {
  readonly count: number;
};

export type AddonDataBatchResult = {
  readonly results: readonly (AddonDataQueryResult | AddonDataExecuteResult)[];
};

export type AddonDataReadResult = AddonDataQueryResult;

/**
 * Tier 2 `ctx.data`: parameterised SQL and owned-table reads. The host binds placeholders,
 * chooses the schema, and runs statements as the addon run-time role.
 */
export interface AddonTier2DataClient {
  read(table: string, options?: AddonDataReadOptions): Promise<AddonDataReadResult>;
  query(sql: string, params?: readonly AddonSqlParam[]): Promise<AddonDataQueryResult>;
  execute(sql: string, params?: readonly AddonSqlParam[]): Promise<AddonDataExecuteResult>;
  transaction(statements: readonly AddonDataBatchStatement[]): Promise<AddonDataBatchResult>;
}

/**
 * Tier 1 `ctx.data`: Prisma tagged templates on the addon's allow-listed models.
 * Refused for manifest tier 2.
 */
export interface AddonTier1DataClient {
  $transaction<T>(work: (tx: AddonTier1DataClient) => Promise<T>): Promise<T>;
  $queryRaw(query: TemplateStringsArray, ...values: SqlValue[]): Promise<JsonObject[]>;
  $executeRaw(query: TemplateStringsArray, ...values: SqlValue[]): Promise<number>;
}

/**
 * Effective data client depends on manifest `tier`. {@link DeclareAddon} narrows to
 * {@link AddonTier2DataClient} or {@link AddonTier1DataClient} when the manifest is `as const`.
 */
export type AddonDataClient = AddonTier1DataClient | AddonTier2DataClient;