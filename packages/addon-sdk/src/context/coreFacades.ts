/**
 * ctx.core: core domain operations, typed, permission- and tenant-scoped, audited by the host.
 * Every call acts for a principal and is checked against that principal's permissions.
 */
import type { Disposable } from '../disposable.js';
import type { JsonObject, JsonValue } from '../json.js';
import type { AddonPrincipal } from './addonIdentity.js';
import type { CommunicationFacade } from './communicationFacade.js';
import type { FileTextExtraction } from './tier1HostTypes.js';

export type {
  CommunicationAccessCheck,
  CommunicationFacade,
  CommunicationListQuery,
  CommunicationMessage,
  CommunicationSendInput,
  CommunicationSendResult,
} from './communicationFacade.js';

export interface CaseRecord {
  readonly id: string;
  readonly title: string | null;
  readonly status: string | null;
  readonly [field: string]: JsonValue | undefined;
}

export interface CaseCreateInput {
  readonly title: string;
  readonly description?: string;
  readonly caseType?: string;
  readonly priority?: string;
  readonly fields?: JsonObject;
}

export interface CaseEntityLink {
  readonly caseId: string;
  readonly entityId: string;
  readonly role?: string;
}

export interface CasesFacade {
  get(principal: AddonPrincipal, caseId: string): Promise<CaseRecord | null>;
  create(principal: AddonPrincipal, input: CaseCreateInput): Promise<CaseRecord>;
  update(principal: AddonPrincipal, caseId: string, changes: JsonObject): Promise<CaseRecord>;
  attachEntity(principal: AddonPrincipal, link: CaseEntityLink): Promise<void>;
}

export interface ApprovalGuardInput {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly proposedChange?: JsonObject | null;
}

export type ApprovalGuardResult =
  | { readonly status: 'allowed' }
  | { readonly status: 'held'; readonly requestId: string }
  | { readonly status: 'unavailable' };

export interface ApprovalActor {
  readonly userId: number;
  readonly email: string;
  readonly name?: string;
}

export interface ApprovalOutcome {
  readonly subjectType: string;
  readonly subjectId: string;
  readonly action: string;
  readonly requestId: string;
  readonly proposedChange: JsonObject | null;
  readonly decidedBy: ApprovalActor;
  readonly comment: string | null;
  /** The people whose work was approved; empty when the engine could not tell. */
  readonly makerUserIds?: readonly number[];
}

export type ApprovalApplier = (outcome: ApprovalOutcome) => Promise<void>;

export interface ApprovalsFacade {
  /** Allowed, held for four-eyes approval, or unavailable when the engine is not ready. */
  guard(principal: AddonPrincipal, input: ApprovalGuardInput): Promise<ApprovalGuardResult>;
  /** Whether a policy is enforced for the record type. */
  isEnforced(subjectType: string): Promise<boolean>;
  /** Applies the change once a held request is approved. */
  registerApplier(subjectType: string, applier: ApprovalApplier): Disposable;
  /** Runs the applier registered for the outcome's record type. */
  applyRegistered(outcome: ApprovalOutcome): Promise<void>;
}

export interface DuplicateCandidate {
  readonly displayName: string;
  readonly entityType?: string;
  readonly identifiers?: JsonObject;
}

export interface DuplicateMatch {
  readonly entityId: string;
  readonly displayName: string;
  readonly score: number;
}

export interface PartiesFacade {
  findDuplicates(
    principal: AddonPrincipal,
    candidate: DuplicateCandidate,
    options?: { readonly limit?: number }
  ): Promise<readonly DuplicateMatch[]>;
  /** Seeds the entity risk lane once; later calls do nothing. */
  ensureRiskLaneSeeded(principal: AddonPrincipal): Promise<void>;
}

export interface EntitySearchQuery {
  readonly text: string;
  readonly limit?: number;
}

export interface EntitySearchHit {
  readonly entityId: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly score: number;
}

export interface EntityLinkInput {
  readonly sourceType: string;
  readonly sourceId: string;
  readonly entityId?: string;
  readonly candidate?: JsonObject;
  readonly role?: string;
}

export interface EntityLinkResult {
  readonly entityId: string;
  readonly created: boolean;
}

export interface EntitiesFacade {
  search(principal: AddonPrincipal, query: EntitySearchQuery): Promise<readonly EntitySearchHit[]>;
  link(principal: AddonPrincipal, input: EntityLinkInput): Promise<EntityLinkResult>;
}

export interface DocumentCreateInput {
  readonly fileName: string;
  readonly mimeType: string;
  readonly contentBase64: string;
  readonly ownerType: string;
  readonly ownerId: string;
  readonly category?: string;
  readonly metadata?: JsonObject;
  /** Run the upload pipeline (text extraction, tagging) after storing. */
  readonly process?: boolean;
}

export interface DocumentRecord {
  readonly id: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly ownerType: string | null;
  readonly ownerId: string | null;
}

export type DocumentTextSource =
  | { readonly documentId: string }
  | { readonly contentBase64: string; readonly mimeType: string; readonly fileName?: string };

export interface DocumentTagMatch {
  readonly tag: string;
  readonly tagId: string | null;
}

/**
 * Text to index for semantic search (RAG). The host sets the owner and the visibility from the
 * principal's permissions; the addon cannot choose them.
 */
export interface DocumentIndexInput {
  /** In the addon namespace (`<id>.…`), or a type the host lists for this addon. */
  readonly sourceType: string;
  readonly sourceKey: string;
  readonly content: string;
}

export interface DocumentsFacade {
  create(principal: AddonPrincipal, input: DocumentCreateInput): Promise<DocumentRecord>;
  extractText(
    principal: AddonPrincipal,
    source: DocumentTextSource
  ): Promise<{ readonly text: string; readonly truncated: boolean }>;
  mapTags(principal: AddonPrincipal, tags: readonly string[]): Promise<readonly DocumentTagMatch[]>;
  /** Tier 1 only. Tier 2 RPC refuses `extractBuffer`. No user. `extractText` stays the checked path. */
  extractBuffer(content: Uint8Array, fileName: string): Promise<FileTextExtraction>;
  /** Tier 1 only. Tier 2 RPC refuses `extractFile`. No user. `extractText` stays the checked path. */
  extractFile(fileUrl: string, fileName?: string): Promise<FileTextExtraction>;
  /** Tier 1 only. Tier 2 RPC refuses `mapAiTags`. No user. `mapTags` stays the checked path. */
  mapAiTags(tags: readonly string[]): Promise<readonly (string | number)[]>;
  /** Queues the text for semantic search indexing; blank content is ignored. */
  indexText(principal: AddonPrincipal, input: DocumentIndexInput): Promise<void>;
}

export interface UserSummary {
  readonly id: number;
  readonly email: string;
  readonly name: string | null;
  readonly active: boolean;
}

export type PreferenceWriteResult =
  | { readonly saved: true }
  | { readonly saved: false; readonly reason: 'too_large' | 'too_many_keys' };

export interface UsersFacade {
  get(principal: AddonPrincipal, userId: number): Promise<UserSummary | null>;
  hasPermission(principal: AddonPrincipal, userId: number, permission: string): Promise<boolean>;
  /**
   * Active user ids that hold `permission`. The permission must be one this addon declared.
   * The grant check is the same as hasPermission.
   */
  listByPermission(principal: AddonPrincipal, permission: string): Promise<readonly number[]>;
  /** The principal's own preference, in the addon's namespace. */
  getPreference(principal: AddonPrincipal, key: string): Promise<JsonValue | null>;
  setPreference(
    principal: AddonPrincipal,
    key: string,
    value: JsonValue
  ): Promise<PreferenceWriteResult>;
}

export interface CoreFacades {
  readonly cases: CasesFacade;
  readonly approvals: ApprovalsFacade;
  readonly parties: PartiesFacade;
  readonly entities: EntitiesFacade;
  readonly documents: DocumentsFacade;
  readonly users: UsersFacade;
  readonly communication: CommunicationFacade;
}
