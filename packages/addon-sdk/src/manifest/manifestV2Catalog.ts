/**
 * Closed vocabularies for manifest v2 fields that are also enforced in addon-manifest.v2.schema.json.
 * Keep schema $defs enums in sync with these arrays (see manifestV2Validation.test.ts).
 */

/** Short ids for `ctx.extend.*` registrations declared in manifest `extends[]`. */
export const MANIFEST_EXTEND_POINT_IDS = [
  'analyticsContributor',
  'approvable',
  'approvableFields',
  'auditSubject',
  'automationAction',
  'automationFields',
  'automationTrigger',
  'communicable',
  'deletable',
  'documentable',
  'echoStrategy',
  'employeeDirectory',
  'flaggable',
  'graphRiskMirror',
  'importQuestionnairePack',
  'investigationDomain',
  'investigationTemplate',
  'licenseFeatures',
  'linkable',
  'predictionCapability',
  'questionnaireDomain',
  'questionnaireDomainAdapter',
  'recordAccess',
  'riskFactors',
  'shutdownHook',
] as const;

export type ManifestExtendPointId = (typeof MANIFEST_EXTEND_POINT_IDS)[number];

/** Codex seal levels (tenant policy keys under resources.sensitivity.<level>.*). */
export const MANIFEST_RESOURCE_SENSITIVITY_LEVELS = [
  'standard',
  'confidential',
  'mnpi',
] as const;

export type ManifestResourceSensitivity = (typeof MANIFEST_RESOURCE_SENSITIVITY_LEVELS)[number];