/**
 * ctx.risk: submissions to the risk platform and snapshot reads. The provider id is the calling
 * addon (registered through ctx.extend.registerRiskFactors); factor codes must belong to it.
 */
import type { JsonObject } from '../json.js';
import type { AddonPrincipal } from './addonIdentity.js';

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
}
