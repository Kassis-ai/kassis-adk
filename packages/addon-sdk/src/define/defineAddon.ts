/**
 * Compile-time mandatory contract (S2.17). A record type cannot omit access, deletion,
 * sensitivity, or an audit subject. An addon manifest slice that owns tables cannot omit
 * retention. `check` already reports KADK-124 and KADK-309 for the same manifest rules.
 * Host registration of these parts is a later wave (S2.19).
 */
import type { AddonContext, AddonModule } from '../context/addonContext.js';
import type { AddonDeclarations } from '../context/addonDeclarations.js';
import type { AddonPrincipal } from '../context/addonIdentity.js';
import type { ManifestResourceSensitivity } from '../manifest/manifestV2Catalog.js';
import type { DataRetentionPolicy } from '../manifest/manifestV2Types.js';

export interface RecordTypeAuditSubject {
  readonly subjectType: string;
  readonly aliases?: readonly string[];
  readonly relatedTypes?: readonly string[];
  readonly catalogued?: boolean;
  readonly pathPrefixes?: readonly string[];
}

export interface RecordTypeDefinition {
  readonly type: string;
  readonly sensitivity: ManifestResourceSensitivity;
  readonly auditSubject: RecordTypeAuditSubject;
  readonly canAccess: (principal: AddonPrincipal, recordId: string) => Promise<boolean>;
  readonly onDelete: (principal: AddonPrincipal, recordId: string) => Promise<void>;
}

export interface AddonManifestContract {
  readonly database?: { readonly ownedTables?: readonly string[] };
  readonly data?: { readonly retention?: DataRetentionPolicy };
}

type NonEmptyOwnedTables = { readonly ownedTables: readonly [string, ...string[]] };

type ManifestWithRetention<M extends AddonManifestContract> =
  M['database'] extends NonEmptyOwnedTables
    ? M & { readonly data: { readonly retention: DataRetentionPolicy } }
    : M;

export interface DefinedAddon<D extends AddonDeclarations = AddonDeclarations> extends AddonModule<D> {
  readonly recordTypes: readonly RecordTypeDefinition[];
}

export interface DefineAddonInput<
  D extends AddonDeclarations,
  M extends AddonManifestContract,
> {
  readonly manifest?: ManifestWithRetention<M>;
  readonly recordTypes?: readonly RecordTypeDefinition[];
  initialize(ctx: AddonContext<D>): Promise<void>;
}

export function defineRecordType<const T extends RecordTypeDefinition>(recordType: T): T {
  return recordType;
}

export function defineAddon<
  D extends AddonDeclarations = AddonDeclarations,
  const M extends AddonManifestContract = AddonManifestContract,
>(definition: DefineAddonInput<D, M>): DefinedAddon<D> {
  const recordTypes = definition.recordTypes ?? [];
  return {
    recordTypes,
    initialize(ctx: AddonContext<D>): Promise<void> {
      return definition.initialize(ctx);
    },
  };
}
