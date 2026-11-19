export function canonicalJsonStringify(value: unknown): string;

export function buildCanonicalManifestString(manifest: Record<string, unknown>): string;

export type AddonContentFile = {
  relativePath: string;
  absolutePath: string;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
};

export function isContentHash(value: unknown): value is string;

export function computeAddonContentHash(addonDir: string): Promise<string>;

export function computeUiContentHash(addonDir: string): Promise<string | null>;

export function listUiContentFiles(addonDir: string): Promise<AddonContentFile[]>;

export function listAddonContentFiles(addonDir: string): Promise<AddonContentFile[]>;

export function hashAddonContentFiles(
  files: ReadonlyArray<{ relativePath: string; absolutePath: string }>
): Promise<string>;

export function verifyEd25519SpkiHex(
  messageUtf8: string,
  signatureHex: string,
  publicKeyDerHex: string
): boolean;

export function sha256DigestHex(bytes: Uint8Array): string;

export interface ManifestSnapshot {
  readonly version?: string;
  readonly tier?: number;
  readonly permissions?: readonly ({ readonly name?: string } | string)[];
  readonly egress?: { readonly hosts?: readonly string[] };
  readonly events?: {
    readonly publishes?: readonly ({ readonly name?: string } | string)[];
    readonly subscribes?: readonly string[];
  };
  readonly provides?: readonly { readonly capability?: string; readonly version?: string }[];
  readonly requires?: readonly { readonly capability?: string; readonly range?: string }[];
  readonly optional?: readonly { readonly capability?: string; readonly range?: string }[];
  readonly database?: {
    readonly ownedTables?: readonly string[];
    readonly readAccess?: readonly string[];
  };
  readonly signing?: { readonly keyId?: string };
}

export interface NameListDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
}

export interface ManifestSurfaceDiff {
  readonly tier: { readonly from: number | null; readonly to: number | null };
  readonly permissions: NameListDiff;
  readonly egressHosts: NameListDiff;
  readonly events: NameListDiff;
  readonly capabilities: NameListDiff;
  readonly dataAccess: NameListDiff;
}

export interface ManifestSurface {
  readonly tier: number | null;
  readonly permissions: readonly string[];
  readonly egressHosts: readonly string[];
  readonly events: readonly string[];
  readonly capabilities: readonly string[];
  readonly dataAccess: readonly string[];
}

export function manifestSurface(manifest: unknown): ManifestSurface;

export function diffManifestSurface(
  previous: ManifestSnapshot | null,
  next: ManifestSnapshot | null
): ManifestSurfaceDiff;

export interface EvidenceAnswerView {
  readonly key: string;
  readonly outcome: string | null;
  readonly label: 'self-attested' | 'machine';
}

export interface DeploymentEvidenceSummary {
  readonly contentHash: {
    readonly client: string | null;
    readonly host: string;
    readonly match: boolean;
  };
  readonly manifestDiff: {
    readonly client: ManifestSurfaceDiff | null;
    readonly host: ManifestSurfaceDiff;
  };
  readonly answers: readonly EvidenceAnswerView[];
}

export interface DeploymentEvidenceAnswer {
  readonly key: string;
  readonly outcome: string | null;
  readonly verification: string;
}

export interface DeploymentEvidenceInput {
  readonly clientContentHash: string | null;
  readonly hostContentHash: string;
  readonly clientManifestDiff: ManifestSurfaceDiff | null;
  readonly previousManifest: ManifestSnapshot | null;
  readonly nextManifest: ManifestSnapshot | null;
  readonly answers: readonly DeploymentEvidenceAnswer[];
}

export function summarizeDeploymentEvidence(
  input: DeploymentEvidenceInput
): DeploymentEvidenceSummary;

export type PublisherTrustKeyStatus = 'pending' | 'current' | 'previous' | 'revoked';

export type PublisherTrustPublisherStatus = 'active' | 'suspended';

export type PublisherTrustPublisher = {
  id: string;
  displayName: string;
  allowedTiers: number[];
  idPrefixes: string[];
  status: PublisherTrustPublisherStatus;
};

export type PublisherTrustKey = {
  fingerprint: string;
  publisherId: string;
  publicKeyDerHex: string;
  status: PublisherTrustKeyStatus;
  notBefore: string | null;
  notAfter: string | null;
};

export type PublisherTrustSnapshot = {
  publishers: PublisherTrustPublisher[];
  keys: PublisherTrustKey[];
};

export type LegacyPublisherTrustSet = {
  current?: string;
  previous?: string[];
  keys?: string[];
};

export type LegacyPublisherTrustPolicy = {
  revoked?: string[];
  publishers: Record<string, LegacyPublisherTrustSet>;
};

export type PublisherTrustPolicy = PublisherTrustSnapshot | LegacyPublisherTrustPolicy;

export type ManifestTrustDecision = {
  publicKeyDerHex: string;
  deprecated: boolean;
};

export class PublisherTrustError extends Error {
  constructor(message: string);
}

export function fingerprintPublicKey(derHex: string): string;

export function isFirstPartyPublisher(publisher: string | null | undefined): boolean;

export function loadPublisherTrustPolicy(): PublisherTrustPolicy;

export function configurePublisherTrustSeed(filePath: string): void;

export function configurePublisherTrustDb(
  port: (() => Promise<PublisherTrustPolicy | null>) | null
): void;

export function invalidatePublisherTrustCache(): void;

export function bindPublisherTrustInvalidation(subscribe: (invalidate: () => void) => void): void;

export function normalizePublisherTrust(policy: PublisherTrustPolicy): PublisherTrustSnapshot;

export function mergePublisherTrust(
  sources: Array<PublisherTrustSnapshot | null>
): PublisherTrustSnapshot;

export function loadMergedPublisherTrust(): Promise<PublisherTrustSnapshot>;

export function assertPublisherTrusted(
  publisher: string,
  fingerprint: string,
  policy: PublisherTrustPolicy
): void;

export function keyIsTrusted(derHex: string, publisher: string, policy: PublisherTrustPolicy): void;

export function isPublisherTrustError(error: unknown): boolean;

export function resolveManifestTrust(
  manifest: Record<string, unknown>,
  snapshot: PublisherTrustSnapshot,
  bootstrapKeyHex: string | undefined,
  now?: Date
): ManifestTrustDecision;
