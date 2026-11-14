/**
 * Inputs of ctx.extend, the host extension points bound to the calling addon: none of them
 * takes `addonName`. Where a host registration type has the same shape, the host type is
 * `<Contribution> & { addonName: string }`, so each shape is defined once, here. Types marked
 * "host-specific" differ from the host's (which use Prisma or untyped values); the host adapts.
 */
import type { JsonObject, JsonValue } from '../json.js';
import type { AddonPrincipal } from '../context/addonIdentity.js';
import type { ApprovalOutcome } from '../context/coreFacades.js';
import type { AddonDataClient } from '../context/dataClient.js';

/** Host-specific: the host keys `promptKeys` by its own prompt-owner list. */
export type InvestigationDomainContribution = {
  id: string;
  label: string;
  categories?: readonly string[];
  /** Prompt owner → prompt template key for this domain. */
  promptKeys?: Readonly<Record<string, string>>;
  /** True when the domain uses each owner's base key. */
  usesBasePromptKeys?: boolean;
};

export type InvestigationTemplateDefaults = {
  title: string;
  summary: string;
  objective: string;
  triggerDescription?: string;
  keyQuestion?: string;
};

export type InvestigationTemplateContext = JsonObject & {
  readonly source_id?: number | string | null;
};

/** Host-specific: the host types the create input, metadata and user as untyped values. */
export type InvestigationTemplateContribution = {
  templateKey: string;
  getContext: (createInput: JsonObject) => InvestigationTemplateContext | null;
  buildDefaults: (context: InvestigationTemplateContext) => InvestigationTemplateDefaults;
  buildMetadata: (input: {
    context: InvestigationTemplateContext;
    existingMetadata: JsonObject | null;
  }) => JsonObject;
  afterCreate?: (
    investigationId: number,
    context: InvestigationTemplateContext,
    principal: AddonPrincipal
  ) => Promise<void>;
  enrichDetail?: (
    investigationId: number,
    context: InvestigationTemplateContext
  ) => Promise<JsonObject | null>;
};

export type EchoCompareResult = {
  summary: JsonObject;
  breakingChanges: string[];
};

export type EchoStrategy = {
  compare(oldEcho?: JsonObject, newEcho?: JsonObject): EchoCompareResult;
  generateForResource(resourceId: string, context?: JsonObject): Promise<JsonObject | null>;
};

/** Host-specific: the host entry also takes a `postAccept` hook that receives Prisma rows. */
export type EchoStrategyContribution = {
  resourceType: string;
  entry: {
    strategy: EchoStrategy;
    permission: string;
    postCreate?: (created: { id: number }, resourceId: string) => Promise<void>;
  };
};

export type EmployeeDirectoryRow = {
  id: number | string;
  user_id: number | null;
  source_employee_id?: number | string | null;
  full_name: string | null;
  department?: string | null;
  job_title?: string | null;
  org_unit_id?: number | null;
};

export type EmployeeDirectorySearchQuery = {
  q?: string;
  limit?: number;
};

export type EmployeeDirectoryProvider = {
  search: (query: EmployeeDirectorySearchQuery) => Promise<EmployeeDirectoryRow[]>;
  resolveByUserIds: (userIds: number[]) => Promise<EmployeeDirectoryRow[]>;
};

export type EmployeeDirectoryContribution = {
  provider: EmployeeDirectoryProvider;
};

/** A record type documents can be attached to. `prismaModel` names a model the host client can read. */
export type DocumentableContribution = {
  ownerType: string;
  label: string;
  idField: string;
  allowedCategories: string[];
  prismaModel: string;
  select: Record<string, boolean>;
  idCast: 'integer' | 'string';
  docProp: string;
  existenceChecker: (id: string | number) => Promise<boolean>;
};

export type QuestionnaireRegistryActor = {
  userId: number | null;
  userEmail: string;
  userName: string;
};

export type QuestionnaireRegistrySubject = {
  subject_type: string;
  subject_id: string;
};

export type QuestionnairePinHelpers = {
  pinQuestions: (questionIds: string[]) => Promise<void>;
  replacePinnedQuestions: (questionIds: string[]) => Promise<void>;
  listPackQuestionIds: (questionnaireId: string) => Promise<string[]>;
};

export type QuestionnaireOpenContext = {
  domain: string;
  subject: QuestionnaireRegistrySubject;
  responseId: string;
  questionnaireId: string | null;
  actor: QuestionnaireRegistryActor;
} & QuestionnairePinHelpers;

export type QuestionnaireCommitContext = {
  domain: string;
  subject: QuestionnaireRegistrySubject;
  responseId: string;
  questionnaireId: string | null;
  questionId: string;
  questionLibraryId: string;
  visibleQuestionIds: string[];
  runningScore: number;
  actor: QuestionnaireRegistryActor;
} & QuestionnairePinHelpers;

export type QuestionnaireCompleteContext = {
  domain: string;
  subject: QuestionnaireRegistrySubject;
  responseId: string;
  runningScore: number;
  documentId: string | null;
  actor: QuestionnaireRegistryActor;
};

export type QuestionnaireReopenContext = {
  domain: string;
  subject: QuestionnaireRegistrySubject;
  responseId: string;
  actor: QuestionnaireRegistryActor;
};

export type QuestionnaireDryRunLine = { code: string; detail: string | null };

export type QuestionnaireDryRunContext = {
  domain: string;
  subject: QuestionnaireRegistrySubject;
  responseId: string;
  questionnaireId: string | null;
};

export type QuestionnaireExtensionField = {
  key: string;
  type:
    | 'string'
    | 'string_list'
    | 'number'
    | 'boolean'
    | 'option_ref'
    | 'pack_ref'
    | 'flag_type_ref'
    | 'schema_path_ref';
  labelKey: string;
  label: string;
};

export type QuestionnaireSubjectAccessContext = {
  user: { id: number; permissions: string[] };
  subject: QuestionnaireRegistrySubject;
};

export type QuestionnaireDomainAdapter = {
  onResponseOpened?: (ctx: QuestionnaireOpenContext) => Promise<void>;
  onAnswerCommitted?: (ctx: QuestionnaireCommitContext) => Promise<void>;
  /** Read-only explanation. Must not write party, case, or clearance state. */
  dryRun?: (ctx: QuestionnaireDryRunContext) => Promise<QuestionnaireDryRunLine[]>;
  /** Addon subjects (anything other than entity, party, case, investigation). */
  canAccessSubject?: (ctx: QuestionnaireSubjectAccessContext) => Promise<boolean>;
  extensionFields?: QuestionnaireExtensionField[];
};

export type QuestionnaireDomainContribution = {
  domain: string;
  label: string;
  configurePermissions: string[];
  respondPermissions: string[];
  viewPermissions: string[];
  subjectTypes: string[];
  adapter?: QuestionnaireDomainAdapter;
};

/** Attaches an adapter to a domain the addon does not own (for example a core domain). */
export type QuestionnaireAdapterContribution = {
  domain: string;
  adapter: QuestionnaireDomainAdapter;
};

/** Host-specific: the host types `questions` as untyped and takes the actor in the input. */
export type QuestionnairePackImport = {
  domain: string;
  name: string;
  description?: string | null;
  /** Idempotency key, for example `eig:12`. */
  kind?: string | null;
  questions: JsonValue;
  requestId?: string | null;
};

export type QuestionnairePackImportResult = {
  packId: string;
  created: boolean;
};

export type LinkableContribution = {
  ownerType: string;
  allowedRoles?: string[];
};

export type LifecycleIdCast = 'integer' | 'string';

export type LifecycleFlagMode = 'deleted_at' | 'status' | 'is_active';

export type DeletableDescriptor = {
  family: string;
  tableName: string;
  prismaModel: string;
  idCast: LifecycleIdCast;
  flagMode: LifecycleFlagMode;
  statusDeletedValue?: string;
  isActiveField?: string;
  ragSourceTypes?: string[];
  cascadeOwner?: { ownerType: string; ownerIdField: string };
  cascadeFamilies?: string[];
  eventDomain: string;
  permissionNamespace: string;
  retentionFamily: string;
};

export type DeletableContribution = {
  descriptor: DeletableDescriptor;
};

export type ResourceId = string | number;

export type FlaggableResourceModel = {
  findUnique: (args: { where: { id: ResourceId } }) => Promise<{ id: ResourceId } | null>;
  findMany: (args: {
    where: { id: { in: ResourceId[] } };
    select?: Record<string, boolean>;
    take?: number;
  }) => Promise<Array<{ id: ResourceId }>>;
};

/** Host-specific: the host's snapshot strategy returns an untyped value. */
export type FlaggableContribution = {
  ownerType: string;
  config: {
    resourceModel: () => FlaggableResourceModel;
    idType?: 'int' | 'uuid';
    snapshotStrategy?: (ownerId: ResourceId) => Promise<JsonObject | null>;
  };
};

export type ApprovalGateKind = 'hold_change' | 'hold_action';

export type ApprovableAction = {
  key: string;
  labelKey: string;
  gate: ApprovalGateKind;
};

export type ApprovableField = {
  key: string;
  labelKey: string;
  type: 'number' | 'string' | 'boolean' | 'enum';
  allowedValues?: string[];
};

/** Host-specific: the host adds `ownerAddon` (the caller here) and types records as untyped maps. */
export type ApprovableContribution = {
  subjectType: string;
  labelKey: string;
  actions: ApprovableAction[];
  fields: ApprovableField[];
  permissions: { view: string[]; decide: string[]; configure: string[] };
  load: (subjectId: string) => Promise<JsonObject | null>;
  resolveMakers: (subject: JsonObject) => Promise<number[]>;
  extraIndependenceRules?: Array<
    (subject: JsonObject, candidateUserId: number) => Promise<boolean>
  >;
  onApproved: (outcome: ApprovalOutcome) => Promise<void>;
  onRejected: (outcome: ApprovalOutcome) => Promise<void>;
  onCancelled?: (outcome: ApprovalOutcome) => Promise<void>;
};

/** Host-specific: condition fields for a record type another addon or core owns. */
export type ApprovableFieldsContribution = {
  subjectType: string;
  fields: ApprovableField[];
  resolve: (subject: JsonObject) => Promise<JsonObject>;
};

export type AuditSubjectContribution = {
  subjectType: string;
  aliases?: readonly string[];
  relatedTypes?: readonly string[];
  catalogued?: boolean;
  pathPrefixes?: readonly string[];
};

export type LicenseFeatureSpec = {
  key: string;
  description?: string;
  defaultAccess?: boolean;
};

export type LicenseFeaturesContribution = {
  features: readonly (string | LicenseFeatureSpec)[];
};

export type AutomationCondition = {
  field: string;
  op: string;
  value?: string | number | boolean | string[] | null;
};

export type AutomationTriggerContribution = {
  key: string;
  label: string;
  trigger: string;
  section: string;
  condition?: AutomationCondition;
  availableActions?: string[];
  defaultFlag?: string;
  /** Flaggable owner for add_flag / remove_flag. Omit when the event is notify-only. */
  resourceType?: string;
  /** Listen-only: the worker subscribes, the Settings catalog omits the row. */
  hidden?: boolean;
};

export type AutomationActionContribution = {
  type: string;
  label: string;
};

export type AutomationFieldContribution = {
  group: string;
  value: string;
  label: string;
  desc?: string;
  allowedValues?: string[];
};

export type AutomationFieldsContribution = {
  fields: AutomationFieldContribution[];
};

/**
 * Host-specific: the host types domains, factors, models and subscriptions in its risk
 * contracts; the SDK passes them as JSON until those contracts move here.
 */
export type RiskSubscriberRegistration = {
  subscriberId: string;
  displayName: string;
  useDomains?: string[];
  useSubjectTypes?: string[];
  domains?: JsonObject[];
  subjectTypes?: JsonObject[];
  linkTypes?: JsonObject[];
  factors?: JsonObject[];
  models?: JsonObject[];
  provider?: JsonObject;
  subscriptions?: JsonObject[];
};

export type RiskFactorsContribution = {
  request: RiskSubscriberRegistration;
};

export type AnalyticsPullArgs = {
  datasetId: string;
  asOf?: string;
  filter?: JsonObject;
};

/** Host-specific: the host types rows and filters as untyped maps. */
export type AnalyticsContributorContribution = {
  contributor: {
    contributorId: string;
    datasets: Array<{ datasetId: string; grain: string }>;
    pull: (args: AnalyticsPullArgs) => Promise<JsonObject[]>;
  };
};

export type GraphRiskMirrorInput = {
  graphId: string;
  providerId: string;
  snapshotId: string;
  version: number;
  score: number;
  level: string;
  domain: string;
  riskModelId: string;
};

/** Host-specific: in process the host passes its own Prisma transaction as `tx`. */
export type GraphRiskMirrorContribution = {
  providerId: string;
  writer: (
    tx: AddonDataClient,
    input: GraphRiskMirrorInput,
    mirrorPayload: JsonObject
  ) => Promise<void>;
};

export type PredictionSubject = {
  type: string;
  id: string;
};

export type PredictionCapability = {
  manifest: {
    id: string;
    version: string;
    subjectTypes: string[];
    predictionType: string;
    persist: boolean;
    permissions: string[];
    featureSchemaId?: string;
  };
  checkEligibility: (subject: PredictionSubject) => Promise<{
    eligible: boolean;
    reasons: string[];
    dataQualityScore?: number;
  }>;
  execute: (subject: PredictionSubject) => Promise<JsonObject>;
};

/** Host-specific: the host takes the capability as an untyped value. */
export type PredictionCapabilityContribution = {
  capability: PredictionCapability;
};

export type ShutdownHookContribution = {
  handler: () => void | Promise<void>;
};
