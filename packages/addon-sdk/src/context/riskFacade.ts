/**
 * ctx.risk: submissions to the risk platform and snapshot reads. The provider id is the calling
 * addon (registered through ctx.extend.registerRiskFactors); factor codes must belong to it.
 */
import type { JsonObject } from '../json.js';
import type { AddonPrincipal } from './addonIdentity.js';
import type {
  GraphAssessmentDirect,
  JurisdictionDirect,
  LinkedEntityMax,
  PartyScreeningDirect,
  RiskBridgeSnapshot,
  RiskBridgeSubmitResult,
  RiskPlatformSubmit,
  SchemaProfileDirect,
  UboEntityDirect,
} from './tier1DirectTypes.js';

export type RiskLane = 'entity' | 'graph';

export type RiskSubject =
  | { readonly type: 'entity'; readonly id: string; readonly entityType?: string }
  | { readonly type: 'graph'; readonly id: string };

export type RiskAssessmentStatus = 'known' | 'proposed' | 'confirmed' | 'rejected' | 'overridden';

export interface RiskAssessmentInput {
  readonly factorCode: string;
  readonly score: number;
  readonly reason: string;
  /** Risk domain code from the risk platform registry; the host default applies when omitted. */
  readonly domain?: string;
  readonly rawValue?: JsonObject;
  readonly computationMode?: string;
  readonly status?: RiskAssessmentStatus;
}

export interface RiskAssessmentSubmission {
  readonly subject: RiskSubject;
  readonly assessments: readonly RiskAssessmentInput[];
  readonly correlationId?: string;
}

/** Hit counts from screening; the core scoring rules turn them into factor scores. */
export interface ScreeningFactorsInput {
  readonly entityId: string;
  readonly entityType?: string;
  readonly sanctionsHitCount?: number;
  readonly pepHitCount?: number;
  readonly adverseMediaHitCount?: number;
  readonly topicRiskLevel?: string | null;
  readonly topicRiskScore?: number | null;
  readonly correlationId?: string;
}

/** Profile attributes scored against the `x-risk` metadata of the entity template. */
export interface ProfileFactorsInput {
  readonly entityId: string;
  readonly entityType?: string;
  readonly attributes: JsonObject;
  readonly schema: JsonObject;
  readonly correlationId?: string;
}

export interface RiskSnapshot {
  readonly score: number;
  readonly level: string;
  readonly domain: string;
  readonly computedAt: string | null;
}

export interface RiskSubmitResult {
  readonly accepted: number;
  readonly snapshot: RiskSnapshot | null;
}

export interface PolicyEvaluationInput {
  readonly rows: readonly JsonObject[];
  readonly rules: readonly JsonObject[];
}

export interface RiskFacade {
  isLaneEnabled(lane: RiskLane): Promise<boolean>;
  /** Null when the subject's lane is disabled. */
  submitAssessments(
    principal: AddonPrincipal,
    submission: RiskAssessmentSubmission
  ): Promise<RiskSubmitResult | null>;
  submitScreeningFactors(
    principal: AddonPrincipal,
    input: ScreeningFactorsInput
  ): Promise<RiskSubmitResult | null>;
  submitProfileFactors(
    principal: AddonPrincipal,
    input: ProfileFactorsInput
  ): Promise<RiskSubmitResult | null>;
  getSnapshot(
    principal: AddonPrincipal,
    subject: RiskSubject,
    domain?: string
  ): Promise<RiskSnapshot | null>;
  /** Evaluates policy rules over rows; returns the violations. */
  evaluatePolicyRules(
    principal: AddonPrincipal,
    input: PolicyEvaluationInput
  ): Promise<readonly JsonObject[]>;
  /** Tier 1 only. Tier 2 RPC refuses `laneEnabled`. Synchronous. `isLaneEnabled` stays a promise. */
  laneEnabled(lane: RiskLane): boolean;
  /** Tier 1 only. Tier 2 RPC refuses `submitPartyScreening`. Screening counts the strict method drops are kept. */
  submitPartyScreening(input: PartyScreeningDirect): Promise<RiskBridgeSubmitResult | null>;
  /** Tier 1 only. Tier 2 RPC refuses `submitUboEntity`. */
  submitUboEntity(input: UboEntityDirect): Promise<RiskBridgeSubmitResult | null>;
  /** Tier 1 only. Tier 2 RPC refuses `submitJurisdiction`. */
  submitJurisdiction(input: JurisdictionDirect): Promise<RiskBridgeSubmitResult | null>;
  /** Tier 1 only. Tier 2 RPC refuses `submitSchemaProfile`. */
  submitSchemaProfile(input: SchemaProfileDirect): Promise<RiskBridgeSubmitResult | null>;
  /** Tier 1 only. Tier 2 RPC refuses `hydrateEntities`. */
  hydrateEntities<T extends { readonly id?: string | number }>(
    records: readonly T[]
  ): Promise<ReadonlyArray<T & { risk_score?: number; risk_level?: string }>>;
  /** Tier 1 only. Tier 2 RPC refuses `readEntitySnapshot`. Includes `version`. No user. */
  readEntitySnapshot(entityId: string, domain?: string): Promise<RiskBridgeSnapshot | null>;
  /** Tier 1 only. Tier 2 RPC refuses `submitGraph`. */
  submitGraph(input: GraphAssessmentDirect): Promise<RiskBridgeSubmitResult | null>;
  /** Tier 1 only. Tier 2 RPC refuses `readGraphSnapshot`. Null immediately when the lane is off. */
  readGraphSnapshot(graphId: string, domain?: string): Promise<RiskBridgeSnapshot | null> | null;
  /** Tier 1 only. Tier 2 RPC refuses `linkedEntityMax`. */
  linkedEntityMax(entityIds: readonly string[]): Promise<LinkedEntityMax | null>;
  /** Tier 1 only. Tier 2 RPC refuses `analyzeWatchlist`. No principal and no tenant stamp. */
  analyzeWatchlist(rows: readonly JsonObject[], rules: readonly JsonObject[]): Promise<readonly object[]>;
  /** Tier 1 only. Tier 2 RPC refuses `submitPlatform`. The request object is not rebuilt. */
  submitPlatform(request: RiskPlatformSubmit): Promise<RiskBridgeSubmitResult>;
}
