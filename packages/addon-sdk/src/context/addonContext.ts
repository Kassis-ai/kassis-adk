/**
 * AddonContext v1: what an addon receives, bound to its id. No method takes an addon name, and
 * nothing global (container, core client, registry) is reachable from it.
 */
import type { AddonExtensionPoints } from '../extend/addonExtensionPoints.js';
import type { AddonDeclarations } from './addonDeclarations.js';
import type { AddonIdentity, AddonLogger, TenantScope } from './addonIdentity.js';
import type { CoreFacades } from './coreFacades.js';
import type {
  AuditFacade,
  CapabilitiesFacade,
  EventsFacade,
  FlagsFacade,
  HttpFacade,
  JobsFacade,
  LlmFacade,
  LocksFacade,
  NotificationsFacade,
  PromptsFacade,
  RoutesFacade,
  SecretsFacade,
  SettingsFacade,
} from './platformFacades.js';
import type { RiskFacade } from './riskFacade.js';

export interface AddonContext<D extends AddonDeclarations = AddonDeclarations> {
  readonly addon: AddonIdentity;
  readonly tenant: TenantScope;
  readonly logger: AddonLogger;
  /** Validated against the manifest `config.schema` before initialize(). */
  readonly config: Readonly<D['config']>;
  readonly secrets: SecretsFacade<D['secretKeys']>;
  readonly routes: RoutesFacade<D['permissions']>;
  /** The addon's own schema, through the addon's database role. */
  readonly data: D['data'];
  readonly core: CoreFacades;
  readonly risk: RiskFacade;
  readonly settings: SettingsFacade;
  readonly flags: FlagsFacade;
  readonly notify: NotificationsFacade;
  readonly audit: AuditFacade<D['auditActions']>;
  readonly events: EventsFacade<D['publishes'], D['subscribes']>;
  readonly jobs: JobsFacade<D['jobTypes']>;
  readonly locks: LocksFacade;
  readonly llm: LlmFacade<D['promptKeys']>;
  readonly prompts: PromptsFacade;
  readonly http: HttpFacade;
  readonly capabilities: CapabilitiesFacade<D['consumes']>;
  readonly extend: AddonExtensionPoints;
}

/** The module an addon's entry point exports. Registrations made in initialize() are tracked by the host. */
export interface AddonModule<D extends AddonDeclarations = AddonDeclarations> {
  initialize(ctx: AddonContext<D>): Promise<void>;
}
