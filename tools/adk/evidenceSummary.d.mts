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

export function diffManifestSurface(
  previous: ManifestSnapshot | null,
  next: ManifestSnapshot | null
): ManifestSurfaceDiff;

export function summarizeDeploymentEvidence(input: DeploymentEvidenceInput): DeploymentEvidenceSummary;
