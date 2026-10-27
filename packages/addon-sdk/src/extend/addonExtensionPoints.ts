/**
 * ctx.extend: the host's register* extension points that have no facade of their own, bound to
 * the calling addon. Routes, capabilities, prompt packs, jobs and event handlers are registered
 * through their facades instead; the README maps all 38 host methods.
 */
import type { Disposable } from '../disposable.js';
import type { AddonPrincipal } from '../context/addonIdentity.js';
import type {
  AnalyticsContributorContribution,
  ApprovableContribution,
  ApprovableFieldsContribution,
  AuditSubjectContribution,
  AutomationActionContribution,
  AutomationFieldsContribution,
  AutomationTriggerContribution,
  DeletableContribution,
  DocumentableContribution,
  EchoStrategyContribution,
  EmployeeDirectoryContribution,
  FlaggableContribution,
  GraphRiskMirrorContribution,
  InvestigationDomainContribution,
  InvestigationTemplateContribution,
  LicenseFeaturesContribution,
  LinkableContribution,
  PredictionCapabilityContribution,
  QuestionnaireAdapterContribution,
  QuestionnaireDomainContribution,
  QuestionnairePackImport,
  QuestionnairePackImportResult,
  RiskFactorsContribution,
  ShutdownHookContribution,
} from './extensionContributions.js';

export interface AddonExtensionPoints {
  registerInvestigationDomain(input: InvestigationDomainContribution): Disposable;
  registerInvestigationTemplate(input: InvestigationTemplateContribution): Disposable;
  registerEchoStrategy(input: EchoStrategyContribution): Disposable;
  registerEmployeeDirectory(input: EmployeeDirectoryContribution): Disposable;
  registerDocumentable(input: DocumentableContribution): Disposable;
  registerQuestionnaireDomain(input: QuestionnaireDomainContribution): Disposable;
  setQuestionnaireDomainAdapter(input: QuestionnaireAdapterContribution): Disposable;
  /** One-shot import into core questionnaire tables, idempotent on `kind`. */
  importQuestionnairePack(
    principal: AddonPrincipal,
    pack: QuestionnairePackImport
  ): Promise<QuestionnairePackImportResult>;
  registerLinkable(input: LinkableContribution): Disposable;
  registerDeletable(input: DeletableContribution): Disposable;
  registerFlaggable(input: FlaggableContribution): Disposable;
  registerApprovable(input: ApprovableContribution): Disposable;
  registerApprovableFields(input: ApprovableFieldsContribution): Disposable;
  registerAuditSubject(input: AuditSubjectContribution): Disposable;
  registerLicenseFeatures(input: LicenseFeaturesContribution): Disposable;
  registerAutomationTrigger(input: AutomationTriggerContribution): Disposable;
  registerAutomationAction(input: AutomationActionContribution): Disposable;
  registerAutomationFields(input: AutomationFieldsContribution): Disposable;
  registerRiskFactors(input: RiskFactorsContribution): Disposable;
  registerAnalyticsContributor(input: AnalyticsContributorContribution): Disposable;
  registerGraphRiskMirror(input: GraphRiskMirrorContribution): Disposable;
  registerPredictionCapability(input: PredictionCapabilityContribution): Disposable;
  registerShutdownHook(input: ShutdownHookContribution): Disposable;
}
