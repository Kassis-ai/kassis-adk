/**
 * Jobs, locks, prompts, LLM, HTTP, and capabilities on AddonContext.
 * Tier 1 only members say so in TSDoc. Tier 2 RPC refuses them.
 */
import type { Disposable } from '../disposable.js';
import type { JsonObject, JsonSchema, JsonValue } from '../json.js';
import type { CapabilityContracts } from './addonDeclarations.js';
import type { AddonPrincipal } from './addonIdentity.js';
import type {
  JobsHost,
  LlmDirectRequest,
  LlmDirectResult,
  PromptDirectResult,
  PromptResolveOptions,
} from './tier1HostTypes.js';

export interface AddonJob {
  readonly id: string;
  readonly type: string;
  readonly data: JsonObject;
  readonly attempt: number;
  readonly principal: AddonPrincipal;
}

export type JobHandler = (job: AddonJob) => Promise<JsonValue | void>;

export interface JobRegistrationOptions {
  /** A queue the host allows addons to use; the host picks one when omitted. */
  readonly queue?: string;
  readonly concurrency?: number;
}

export interface JobEnqueueOptions {
  readonly priority?: 'low' | 'normal' | 'high';
  readonly delayMs?: number;
  /** Deduplication key: a second enqueue with the same id is ignored while the first exists. */
  readonly jobId?: string;
}

export interface JobRef {
  readonly id: string;
}

export type JobState = 'waiting' | 'delayed' | 'active' | 'completed' | 'failed';

export interface JobStatus {
  readonly id: string;
  readonly type: string;
  readonly state: JobState;
  readonly progress: number | null;
  readonly result: JsonValue | null;
  readonly failedReason: string | null;
}

export interface JobsFacade<T extends string = string> {
  register(type: T, handler: JobHandler, options?: JobRegistrationOptions): Disposable;
  enqueue(
    principal: AddonPrincipal,
    type: T,
    data: JsonObject,
    options?: JobEnqueueOptions
  ): Promise<JobRef>;
  /** Repeats on a cron expression; disposing removes the schedule. */
  schedule(type: T, cron: string, data?: JsonObject): Disposable;
  status(jobId: string): Promise<JobStatus | null>;
  /** Tier 1 only. Tier 2 RPC refuses `host`. Raw enqueue and Bull schedulers. */
  readonly host: JobsHost;
}

export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface LocksFacade {
  /** Null when someone else holds the key. The host prefixes keys with the addon id. */
  acquire(key: string, options: { readonly ttlSeconds: number }): Promise<LockHandle | null>;
  /** Tier 1 only. Tier 2 RPC refuses `acquireExact`. The key is not prefixed. */
  acquireExact(key: string, ttlSeconds: number): Promise<boolean>;
  /** Tier 1 only. Tier 2 RPC refuses `releaseExact`. The key is not prefixed. */
  releaseExact(key: string): Promise<void>;
}

export type PromptVariables = { readonly [name: string]: JsonValue | undefined };

export interface LlmInvokeOptions {
  /** Ask for structured output; `json` in the result holds the parsed value. */
  readonly responseSchema?: JsonSchema;
  /** Case the call is about, for usage attribution and audit. */
  readonly caseId?: string;
  readonly skipCache?: boolean;
}

export interface LlmUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

export interface LlmResult {
  readonly text: string;
  readonly json: JsonValue | null;
  readonly model: string;
  readonly provider: string;
  readonly usage: LlmUsage | null;
  readonly prompt: { readonly key: string; readonly hash: string | null };
}

export interface LlmFacade<K extends string = string> {
  /**
   * Runs a managed prompt. Model, provider, temperature, token limits and timeouts come from AI
   * Settings and the prompt template, never from the addon; usage is tagged with the addon id.
   */
  invoke(
    principal: AddonPrincipal,
    promptKey: K,
    variables: PromptVariables,
    options?: LlmInvokeOptions
  ): Promise<LlmResult>;
  estimateTokens(text: string): Promise<number>;
  /** Tier 1 only. Tier 2 RPC refuses `completeDirect`. Model fields pass through. `invoke` stays KADK-609. */
  completeDirect(request: LlmDirectRequest): Promise<LlmDirectResult>;
  /** Tier 1 only. Tier 2 RPC refuses `invokeRegistered`. */
  invokeRegistered(request: LlmDirectRequest): Promise<LlmDirectResult>;
  /** Tier 1 only. Tier 2 RPC refuses `modelName`. The settings value, not a hardcoded model. */
  modelName(): Promise<JsonValue>;
}

/** Same shape as the host's prompt pack registration, without `addonName`. */
export type AddonPromptPack = {
  /** Alias → canonical prompt key. */
  keys?: Record<string, string>;
  /** Canonical prompt key → fallback template used until the key is tuned in Settings. */
  fallbacks?: Record<string, string>;
};

export interface PromptsFacade {
  registerPack(pack: AddonPromptPack): Disposable;
  /** Tier 1 only. Tier 2 RPC refuses `resolve`. Options are the caller's. */
  resolve(key: string, variables: PromptVariables, options?: PromptResolveOptions): Promise<PromptDirectResult>;
  /** Tier 1 only. Tier 2 RPC refuses `get`. Options are the caller's. */
  get(key: string, variables: PromptVariables, options?: PromptResolveOptions): Promise<PromptDirectResult>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface AddonFetchInit {
  readonly method?: HttpMethod;
  readonly headers?: { readonly [name: string]: string };
  readonly body?: string;
}

export interface AddonFetchResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly headers: { readonly [name: string]: string };
  text(): Promise<string>;
  json(): Promise<JsonValue>;
}

export interface HttpFacade {
  /** Only hosts in `egress.hosts`; the host applies the egress timeout and proxy. */
  fetch(url: string, init?: AddonFetchInit): Promise<AddonFetchResponse>;
}

/** Same shape as the host's capability registration, without `addonName`. */
export type CapabilityProvision<C extends object = object> = {
  capabilityId: string;
  version: string;
  implementation: C;
};

export interface CapabilitiesFacade<Consumed extends CapabilityContracts = CapabilityContracts> {
  /** The capability id must be declared in `provides`. */
  provide<C extends object>(provision: CapabilityProvision<C>): Disposable;
  /** Null when no enabled addon provides it; every caller must handle null. */
  consume<K extends keyof Consumed & string>(capabilityId: K): Consumed[K] | null;
}
