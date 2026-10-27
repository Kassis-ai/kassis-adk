/**
 * Platform facades of AddonContext. Each replaces host services addons resolve by name today
 * (see the facade table in the package README). Every operation is async so a tier 2 addon can
 * reach it over RPC; registrations return a Disposable and complete before the addon is
 * marked ready, so a failed registration fails initialize().
 */
import type { Disposable } from '../disposable.js';
import type { JsonObject, JsonSchema, JsonValue } from '../json.js';
import type { CapabilityContracts, EventPayloads } from './addonDeclarations.js';
import type { AddonPrincipal } from './addonIdentity.js';

export interface SecretsFacade<K extends string = string> {
  /** Null when the operator has not set the secret. Keys must be declared in `secrets.keys`. */
  get(key: K): Promise<string | null>;
}

/** An Express-compatible router or request handler. The SDK does not depend on Express. */
export type AddonRouter = (...args: never[]) => void | Promise<void>;

export interface RouteMountOptions<P extends string = string> {
  /** Checked on every request, after authentication and before rate limits. */
  readonly permission: P;
  /** Sub-path below `/api/v1/addons/<id>`. Defaults to `/`. */
  readonly path?: string;
}

export interface RoutesFacade<P extends string = string> {
  mount(router: AddonRouter, options: RouteMountOptions<P>): Disposable;
  /** Principal of a request the host passed to a mounted router. Throws for any other object. */
  principalOf(request: object): AddonPrincipal;
}

export interface SearchSettings {
  readonly limitPerType: number;
}

export interface SettingsFacade {
  /** Null when the key is unset. The host limits which keys an addon may read. */
  get(key: string): Promise<JsonValue | null>;
  search(): Promise<SearchSettings>;
}

export interface FlagTarget {
  readonly ownerType: string;
  readonly ownerId: string | number;
}

export interface EnsureFlagInput extends FlagTarget {
  readonly flagType: string;
  /** True adds the flag when absent; false removes it when present. */
  readonly present: boolean;
  readonly autoAssigned?: boolean;
  readonly reason?: string;
  readonly metadata?: JsonObject;
}

export interface FlagChange {
  readonly changed: boolean;
}

export interface OwnerFlag {
  readonly flagType: string;
  readonly autoAssigned: boolean;
  readonly assignedAt: string;
  readonly metadata: JsonObject | null;
}

export interface FlagRuleEvent extends FlagTarget {
  readonly trigger: string;
  readonly data?: JsonObject;
}

export interface FlagsFacade {
  ensure(principal: AddonPrincipal, input: EnsureFlagInput): Promise<FlagChange>;
  has(principal: AddonPrincipal, target: FlagTarget, flagType: string): Promise<boolean>;
  list(principal: AddonPrincipal, target: FlagTarget): Promise<readonly OwnerFlag[]>;
  /** Runs the automation rules for a trigger (flag assignment, notifications). */
  evaluateRules(principal: AddonPrincipal, event: FlagRuleEvent): Promise<void>;
}

export type NotificationPriority = 'low' | 'normal' | 'high';

export interface NotificationInput {
  readonly recipientUserId: number;
  readonly type: string;
  readonly title: string;
  readonly message: string;
  readonly priority?: NotificationPriority;
  readonly link?: string;
  readonly payload?: JsonObject;
}

export interface NotificationTypeOptions {
  readonly category: string;
  readonly defaultChannels: readonly string[];
}

export interface NotificationsFacade {
  send(principal: AddonPrincipal, notification: NotificationInput): Promise<void>;
  registerType(type: string, options: NotificationTypeOptions): Disposable;
}

export interface AuditSubjectRef {
  readonly type: string;
  readonly id: string;
}

export interface AuditDetail {
  readonly subject: AuditSubjectRef;
  readonly outcome?: 'success' | 'failure';
  readonly before?: JsonObject | null;
  readonly after?: JsonObject | null;
  readonly metadata?: JsonObject;
}

export interface AuditSearchQuery {
  readonly subject?: AuditSubjectRef;
  readonly actions?: readonly string[];
  /** ISO timestamps. */
  readonly from?: string;
  readonly to?: string;
  readonly cursor?: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly occurredAt: string;
  readonly actorUserId: number | null;
  readonly actorEmail: string | null;
  readonly subject: AuditSubjectRef | null;
  readonly metadata: JsonObject | null;
}

export interface AuditPage {
  readonly entries: readonly AuditEntry[];
  readonly nextCursor: string | null;
}

export interface AuditFacade<A extends string = string> {
  /**
   * Writes one record, stamped with the addon id and the principal. Rejects when the record
   * cannot be written; there is no best-effort variant.
   */
  record(principal: AddonPrincipal, action: A, detail: AuditDetail): Promise<void>;
  search(principal: AddonPrincipal, query: AuditSearchQuery): Promise<AuditPage>;
}

export interface AddonEvent<P extends JsonObject = JsonObject> {
  readonly name: string;
  readonly payload: P;
  /** Addon id of the publisher, or `core`. */
  readonly publisher: string;
  readonly tenant: string;
  readonly correlationId: string;
  readonly occurredAt: string;
  /** Service principal of the subscribing addon. */
  readonly principal: AddonPrincipal;
}

export type EventHandler<P extends JsonObject = JsonObject> = (
  event: AddonEvent<P>
) => Promise<void>;

export interface EventSubscriptionOptions {
  readonly concurrency?: number;
  readonly retries?: number;
  readonly backoff?: 'fixed' | 'exponential';
}

export interface EventsFacade<
  Published extends EventPayloads = EventPayloads,
  Subscribed extends EventPayloads = EventPayloads,
> {
  /** Validated against the declared schema; the host stamps publisher, tenant, correlation id and time. */
  publish<E extends keyof Published & string>(
    principal: AddonPrincipal,
    name: E,
    payload: Published[E]
  ): Promise<void>;
  /** Durable: the handler runs from the host queue with retries, not inside the publisher's call. */
  subscribe<E extends keyof Subscribed & string>(
    name: E,
    handler: EventHandler<Subscribed[E]>,
    options?: EventSubscriptionOptions
  ): Disposable;
}

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
}

export interface LockHandle {
  readonly key: string;
  release(): Promise<void>;
}

export interface LocksFacade {
  /** Null when someone else holds the key. The host prefixes keys with the addon id. */
  acquire(key: string, options: { readonly ttlSeconds: number }): Promise<LockHandle | null>;
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
