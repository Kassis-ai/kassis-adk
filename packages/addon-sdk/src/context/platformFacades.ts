/**
 * Platform facades of AddonContext. Each replaces host services addons resolve by name today
 * (see the facade table in the package README). Every operation is async so a tier 2 addon can
 * reach it over RPC; registrations return a Disposable and complete before the addon is
 * marked ready, so a failed registration fails initialize().
 */
import type { Disposable } from '../disposable.js';
import type { JsonObject, JsonValue } from '../json.js';
import type { EventPayloads } from './addonDeclarations.js';
import type { AddonPrincipal } from './addonIdentity.js';
import type { RouteGuards, RouteServeOptions } from './tier1PlatformMembers.js';

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
  /**
   * Tier 1 only. Tier 2 RPC refuses `serve`.
   * Registers `router` on the addon mount and does not add a second permission.
   */
  serve(router: AddonRouter, options?: RouteServeOptions): Disposable;
  /** Tier 1 only. Tier 2 RPC refuses `guards`. */
  readonly guards: RouteGuards;
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
  /**
   * `service` writes a system row (no user id). Omit it for the signed-in user.
   * A service principal without `service`, or a user principal with `service`, is KADK-613.
   */
  readonly actor?: 'user' | 'service';
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
  /** `user` or `service`, matching the publisher's principal. */
  readonly actorKind?: 'user' | 'service';
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

export type {
  AddonFetchInit,
  AddonFetchResponse,
  AddonJob,
  AddonPromptPack,
  CapabilitiesFacade,
  CapabilityProvision,
  HttpFacade,
  HttpMethod,
  JobEnqueueOptions,
  JobHandler,
  JobRef,
  JobRegistrationOptions,
  JobState,
  JobStatus,
  JobsFacade,
  LlmFacade,
  LlmInvokeOptions,
  LlmResult,
  LlmUsage,
  LockHandle,
  LocksFacade,
  PromptVariables,
  PromptsFacade,
} from './runtimeFacades.js';
