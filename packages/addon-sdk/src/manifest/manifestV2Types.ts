/**
 * Manifest v2, written by hand to match schema/addon-manifest.v2.schema.json. Every field is
 * enforced by the host or the CLI; informational fields live under `metadata`. Arrays are
 * readonly so a manifest written `as const satisfies AddonManifestV2` keeps literal names.
 */
import type { AddonTier } from '../context/addonIdentity.js';
import type { JsonSchema } from '../json.js';

export interface ManifestGroup {
  /** Slug in the addon namespace, for example `<id>.reviewers` or `<id>-reviewers`. */
  readonly name: string;
  readonly displayName: string;
  readonly description?: string;
  /** Permissions this group grants; each must appear in `permissions`. */
  readonly permissions: readonly string[];
}

export interface ManifestPermission {
  /** `<id>.<resource>.<action>` (or the id with underscores). */
  readonly name: string;
  readonly displayName?: string;
  readonly description?: string;
  readonly resourceType?: string;
  readonly action?: string;
  readonly category?: string;
  /** Granted to the default role when the addon is installed. */
  readonly default?: boolean;
}

export interface CapabilityRequirement {
  readonly capability: string;
  /** Semver range, for example `^1.0.0` or `>=1.2.0 <2.0.0`. */
  readonly range: string;
}

export interface CapabilityOffer {
  readonly capability: string;
  /** Strict semver of the contract this addon implements. */
  readonly version: string;
}

export interface PublishedEventDeclaration {
  /** `<id>.<noun>.<verb>`. */
  readonly name: string;
  /** JSON Schema file inside the addon package, ending in `.schema.json`. */
  readonly schema: string;
}

export interface ManifestEvents {
  readonly publishes?: readonly PublishedEventDeclaration[];
  /** Core events and events other addons publish. */
  readonly subscribes?: readonly string[];
}

export interface ManifestDatabase {
  /** Tables the addon owns. Tier 2 entries are qualified with `data.schema`. */
  readonly ownedTables?: readonly string[];
  /** Core tables a tier 1 addon may read during the migration to its own schema. */
  readonly readAccess?: readonly string[];
}

/** Uninstall handling for data in `data.schema`. Required when `database.ownedTables` is non-empty. */
export type DataRetentionPolicy = 'retain' | 'archive' | 'purge';

export type LegacyTableStrategy = 'retain' | 'rename';

/** Tier 1 only: a table that still lives in `public` until Phase 4 moves it. */
export interface LegacyTableDeclaration {
  readonly tableName: string;
  readonly strategy: LegacyTableStrategy;
  /** Required for `rename`; must carry the addon prefix. */
  readonly newName?: string;
  /** `YYYY-MM-DD`. */
  readonly removalDeadline: string;
  readonly rationale?: string;
}

export interface McpContributionDeclaration {
  /** Module path inside the package, for example `dist/mcp/contribution.js`. */
  readonly entry: string;
  readonly tools: readonly string[];
}

export interface ManifestNavItem {
  readonly section: string;
  readonly name: string;
  readonly href: string;
  readonly icon?: string;
  readonly permission?: string;
  readonly permissions?: readonly string[];
  readonly order?: number;
}

export interface ManifestDeepLink {
  readonly id: string;
  readonly path: string;
}

export interface ManifestSettingsTab {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly group?: string;
  readonly order?: number;
  readonly keywords?: readonly string[];
  /** Any of these shows the tab; none means system administrators only. */
  readonly permissions?: readonly string[];
}

export interface ManifestUiContributions {
  readonly featureFlag?: string;
  readonly featureLabel?: string;
  readonly nav?: readonly ManifestNavItem[];
  readonly deepLinks?: readonly ManifestDeepLink[];
  readonly settingsTabs?: readonly ManifestSettingsTab[];
}

/** A component the addon renders into a host slot. The host wraps it in an error boundary. */
export interface ManifestUiSlot {
  /** Host slot id, for example `party.detail.tabs`. */
  readonly slot: string;
  /** Exported component name in the addon UI bundle. */
  readonly component: string;
  readonly order?: number;
  /** Permission needed to see the slot content. */
  readonly permission?: string;
}

export interface ManifestUi {
  readonly entryFile?: string;
  readonly runtimeLoad?: boolean;
  readonly assetOrigin?: string | null;
  readonly contributions?: ManifestUiContributions;
  readonly slots?: readonly ManifestUiSlot[];
}

export type ResourceTypeAbility =
  'pin' | 'follow' | 'anchor' | 'search' | 'preview' | 'share' | 'linkToCase' | 'workItems';

export interface ManifestResourceRelation {
  readonly id: string;
  readonly to: string;
  readonly label: string;
}

export interface ManifestResourceType {
  /** `{shortId}:{slug}`. */
  readonly type: string;
  readonly label: string;
  readonly abilities: { readonly [ability in ResourceTypeAbility]?: boolean };
  readonly icon?: string;
  readonly sensitivity?: string;
  readonly viewPermissions?: readonly string[];
  readonly access?: string;
  readonly table?: string;
  readonly urlTemplate?: string;
  readonly relations?: readonly ManifestResourceRelation[];
  readonly events?: { readonly deleted?: string; readonly changed?: string };
}

/** Informational only. Nothing in the host enforces these fields. */
export interface ManifestMetadata {
  readonly displayName?: string;
  readonly description?: string;
  readonly author?: string;
  readonly license?: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly iconUrl?: string;
  readonly docUrl?: string;
  readonly supportEmail?: string;
}

/** Covered by the manifest signature. keyId is the sha256 hex of the Ed25519 SPKI DER. */
export interface ManifestSigning {
  readonly alg: 'ed25519';
  readonly keyId: string;
}

export interface AddonManifestV2 {
  readonly manifestVersion: 2;
  /** Namespace root of every name the addon publishes. The mount path is derived from it. */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly publisher: string;
  readonly tier: AddonTier;
  /** Semver range of the host API the addon was built against. */
  readonly hostApi: string;
  readonly entrypoints?: { readonly main: string };
  readonly signature?: string;
  readonly signing?: ManifestSigning;
  readonly contentHash?: string;
  /** sha256 of frontend/dist. Required for a client publisher UI. */
  readonly uiContentHash?: string;
  readonly permissions?: readonly ManifestPermission[];
  /** Permissions every route of the addon needs; each must be declared in `permissions`. */
  readonly requiredPermissions?: readonly string[];
  /** RBAC groups carrying only this manifest's permissions; created empty at install. */
  readonly groups?: readonly ManifestGroup[];
  readonly requires?: readonly CapabilityRequirement[];
  readonly optional?: readonly CapabilityRequirement[];
  readonly provides?: readonly CapabilityOffer[];
  readonly events?: ManifestEvents;
  readonly audit?: { readonly actions: readonly string[] };
  readonly egress?: { readonly hosts: readonly string[] };
  /** Heap limit the tier 2 supervisor passes to the addon process. */
  readonly resources?: { readonly memoryMb: number };
  /** Path the supervisor calls inside the addon process. */
  readonly health?: { readonly path: string };
  readonly jobs?: { readonly types: readonly string[] };
  readonly prompts?: { readonly keys: readonly string[] };
  readonly secrets?: { readonly keys: readonly string[] };
  readonly config?: { readonly schema: JsonSchema };
  readonly data?: { readonly schema: string; readonly retention?: DataRetentionPolicy };
  readonly database?: ManifestDatabase;
  readonly legacyTables?: readonly LegacyTableDeclaration[];
  readonly contributions?: { readonly mcp?: McpContributionDeclaration };
  readonly resourceTypes?: readonly ManifestResourceType[];
  readonly ui?: ManifestUi;
  readonly metadata?: ManifestMetadata;
}
