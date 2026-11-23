/**
 * Tier 1 parity for LLM, prompts, jobs, locks, rate limit, Prisma.sql, and widgets.
 * No principal, no permission check, no tenant stamp, no audit-actor rewrite.
 * Tier 2 RPC refuses these members.
 */
import type { JsonObject, JsonValue } from '../json.js';

/** Fields completeDirect and invokeRegistered accept, including model parameters. */
export interface LlmDirectRequest {
  readonly operationId?: string;
  readonly prompt?: string;
  readonly addonId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly profile?: string;
  readonly response_json_schema?: JsonObject;
  readonly caseId?: string | number | null;
  readonly caseTitle?: string;
  readonly case_id?: string | number | null;
  readonly case_title?: string;
  readonly contextAction?: string;
  readonly user?: { readonly id?: number | string; readonly email?: string } | null;
  readonly entityType?: string;
  readonly entityId?: string | number;
  readonly promptKey?: string;
  readonly promptSource?: 'managed' | { readonly unmanaged: true; readonly reason: string };
  readonly promptMetadata?: {
    readonly hash?: string;
    readonly promptKey?: string;
    readonly owner?: string;
    readonly usageLogId?: number | null;
  };
  readonly authToken?: string;
  readonly skipCache?: boolean;
  readonly skipAudit?: boolean;
  readonly file_urls?: readonly string[];
  readonly bypass_agent?: boolean;
}

export interface LlmDirectResult {
  readonly text?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly usage?: {
    readonly total_tokens?: number;
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  } | null;
}

export interface PromptResolveOptions {
  readonly userId?: number | string | null;
  readonly caseId?: string | number | null;
  readonly sessionId?: string | null;
  readonly abTestGroup?: string | null;
  readonly skipCache?: boolean;
  readonly captureRunId?: string | null;
  readonly domain?: string | null;
  readonly fallbackTemplate?: string | null;
  readonly softRequiredVariables?: boolean;
}

export interface PromptDirectResult {
  readonly prompt: string;
  readonly metadata: {
    readonly hash?: string | null;
    readonly promptKey?: string;
    readonly templateId?: number | string | null;
    readonly version?: number;
    readonly llmDefaults?: { readonly temperature?: number; readonly maxTokens?: number } | null;
  };
}

export interface HostJobRef {
  readonly id?: string | number;
}

export interface JobSchedulerRow {
  readonly id?: string | null;
  readonly key?: string;
  readonly name: string;
  readonly pattern?: string | null;
}

export interface JobSchedulerTemplate {
  readonly name: string;
  readonly data: JsonObject;
  readonly opts?: JsonObject;
}

export interface JobSchedulerQueue {
  getJobSchedulers(): Promise<readonly JobSchedulerRow[]>;
  removeJobScheduler(id: string): Promise<boolean>;
  upsertJobScheduler(
    jobId: string,
    repeat: { readonly pattern: string },
    template: JobSchedulerTemplate
  ): Promise<unknown>;
}

/** `ctx.jobs.host`. The Bull id is not prefixed. Tier 2 RPC refuses `host`. */
export interface JobsHost {
  /** Tier 1 only. Tier 2 RPC refuses `host.add`. Unprefixed types are accepted. */
  add(queueName: string, jobType: string, data: JsonObject, options?: JsonObject): Promise<HostJobRef>;
  /** Tier 1 only. Tier 2 RPC refuses `host.resolveQueueName`. */
  resolveQueueName(queueName: string): string;
  /** Tier 1 only. Tier 2 RPC refuses `host.queue`. Null when that queue is absent. */
  queue(queueName: string): JobSchedulerQueue | null;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

/** AI token bucket. Not the HTTP limit on `routes.mount`. Tier 2 RPC refuses `rateLimit`. */
export interface RateLimitFacade {
  /** Tier 1 only. Tier 2 RPC refuses `rateLimit.consume`. */
  consume(key: string, capacity: number, refillRate: number, requested?: number): Promise<RateLimitResult>;
}

/** Prisma.sql / join / empty / raw. Fragments are the host Prisma values. Not a query runner. */
export interface SqlQuery {
  readonly strings: readonly string[];
  readonly values: readonly unknown[];
}

/** Tier 1 only. Tier 2 RPC refuses `sql`. Not `ctx.data`. */
export interface SqlNamespace {
  /** Tier 1 only. Tier 2 RPC refuses `sql.sql`. */
  sql(strings: TemplateStringsArray, ...values: readonly unknown[]): SqlQuery;
  /** Tier 1 only. Tier 2 RPC refuses `sql.join`. */
  join(values: readonly SqlQuery[], separator?: SqlQuery): SqlQuery;
  readonly empty: SqlQuery;
  /** Tier 1 only. Tier 2 RPC refuses `sql.raw`. */
  raw(sql: string): SqlQuery;
}

export interface WidgetSchemaInput {
  readonly widgetId: string;
  readonly legacyIds?: readonly string[];
  readonly buildCustomData: (config: JsonObject) => JsonObject | null;
}

/** Tier 1 only. Tier 2 RPC refuses `widgets`. */
export interface WidgetSchemaFacade {
  /** Tier 1 only. Tier 2 RPC refuses `widgets.register`. */
  register(schema: WidgetSchemaInput): void;
}

export interface FileTextExtraction {
  readonly text: string;
  readonly metadata: { readonly [key: string]: JsonValue | readonly JsonValue[] | undefined };
}
