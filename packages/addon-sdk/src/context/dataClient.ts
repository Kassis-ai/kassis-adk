import type { JsonObject } from '../json.js';

export type SqlValue = string | number | boolean | null | Date;

/**
 * The minimum every `ctx.data` client offers: transactions and parameterised SQL in the
 * addon's own schema, through the addon's database role. An addon that ships a generated
 * client for its schema passes that type as `data` in its declarations.
 */
export interface AddonDataClient {
  $transaction<T>(work: (tx: AddonDataClient) => Promise<T>): Promise<T>;
  $queryRaw(query: TemplateStringsArray, ...values: SqlValue[]): Promise<JsonObject[]>;
  $executeRaw(query: TemplateStringsArray, ...values: SqlValue[]): Promise<number>;
}
