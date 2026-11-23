/**
 * Tier 1 parity with the services first-party addons resolve from the container.
 * These calls do not take a principal, check a permission, stamp a tenant, or rewrite
 * the audit actor. Tier 2 RPC refuses them.
 */
import type { JsonObject } from '../json.js';

export interface CommunicationDirectInput {
  readonly to: string | readonly string[];
  readonly cc?: string | readonly string[] | null;
  readonly bcc?: string | readonly string[] | null;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
  readonly ownerType?: string | null;
  readonly ownerId?: string | number | null;
  readonly userId?: number | null;
  readonly fromName?: string | null;
  readonly replyTo?: string | null;
  readonly priority?: number;
  readonly emailAccountId?: number | null;
  readonly isDraft?: boolean;
  readonly threadId?: string | null;
}

/** The object emailService.sendEmail returns. */
export interface CommunicationDirectResult {
  readonly success: boolean;
  readonly messageId: string;
  readonly emailId: number;
  readonly status: string;
}

export interface PartyScreeningDirect {
  readonly entityId: string;
  readonly entityType?: string | null;
  readonly sanctionsHitCount?: number;
  readonly pepHitCount?: number;
  readonly adverseMediaHitCount?: number;
  readonly topicRiskLevel?: string | null;
  readonly topicRiskScore?: number | null;
  readonly sourceConflictCount?: number;
  readonly reviewAgingCount?: number;
  readonly confirmedAdverseCount?: number;
  readonly correlationId?: string;
}

export interface UboEntityDirect {
  readonly entityId: string;
  readonly entityType?: string | null;
  readonly jurisdictionScore: number;
  readonly jurisdictionReason?: string | null;
  readonly nomineeScore: number;
  readonly nomineeReason?: string | null;
  readonly chainDepthScore: number;
  readonly chainDepthReason?: string | null;
  readonly pepScore: number;
  readonly pepReason?: string | null;
  readonly shellScore: number;
  readonly shellReason?: string | null;
  readonly verificationScore: number;
  readonly verificationReason?: string | null;
  readonly sanctionsHitCount?: number;
  readonly correlationId?: string;
}

export interface JurisdictionDirect {
  readonly entityId: string;
  readonly entityType?: string | null;
  readonly score: number;
  readonly countryCode?: string | null;
  readonly reason?: string | null;
  readonly correlationId?: string;
}

export interface SchemaProfileDirect {
  readonly entityId: string;
  readonly entityType?: string | null;
  readonly attributes: JsonObject;
  readonly schema?: JsonObject;
  readonly correlationId?: string;
}

export interface GraphAssessmentDirect {
  readonly graphId: string;
  readonly providerId: string;
  readonly assessments: readonly {
    readonly factorCode: string;
    readonly score: number;
    readonly reason: string;
    readonly rawValue?: JsonObject;
    readonly computationMode?: string;
    readonly status?: 'known' | 'proposed' | 'confirmed' | 'rejected' | 'overridden';
  }[];
  readonly correlationId?: string;
}

/** SubmitAssessmentsRequest as RiskPlatformService.submitAssessments takes it. */
export interface RiskPlatformSubmit {
  readonly providerId: string;
  readonly subject: {
    readonly subjectType: string;
    readonly subjectId: string;
    readonly tenantId?: string;
    readonly entityType?: string | null;
  };
  readonly assessments: readonly JsonObject[];
  readonly correlationId?: string;
}

export interface RiskBridgeSubmitResult {
  readonly accepted: boolean;
  readonly correlationId: string;
  readonly validationErrors?: readonly string[];
  readonly snapshotId?: string | null;
  readonly assessmentIds?: readonly string[];
  readonly score?: number;
  readonly level?: string;
  readonly version?: number;
}

/** Snapshot detail the lane bridges return, including version. */
export interface RiskBridgeSnapshot {
  readonly score: number;
  readonly level: string;
  readonly domain: string;
  readonly version: number;
  readonly effectiveAt: string;
  readonly snapshotId?: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly tenantId?: string;
  readonly factorBreakdown?: readonly object[];
  readonly composition?: object;
}

export interface LinkedEntityMax {
  readonly score: number;
  readonly entityScores: readonly {
    readonly entityId: string;
    readonly score: number;
    readonly level?: string;
  }[];
  readonly reason: string;
}
