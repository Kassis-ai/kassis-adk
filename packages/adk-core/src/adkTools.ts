interface InitOptions {
  readonly publisher?: string;
  readonly tier?: number;
  readonly rung?: number;
}

interface CatalogIssue {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly fix: string;
}

interface CertifyInput {
  readonly lock: object | null;
  readonly attestation: object | null;
  readonly checks?: object | null;
}

interface BuildLog {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

declare module '../../../tools/adk/scaffold.mjs' {
  export function initAddon(id: string, dir: string, options?: InitOptions): string;
}

declare module '../../../tools/adk/certifyAttestation.mjs' {
  export function kadkIssue(code: string, values?: Readonly<Record<string, string>>): CatalogIssue;
  export function certifyAttestation(input: CertifyInput): { ok: boolean; issues: CatalogIssue[] };
}

declare module '../../../tools/adk/reuseCore.mjs' {
  export function auditReuseCore(addonDir: string): {
    ok: boolean;
    issues: CatalogIssue[];
    report: object;
  };
  export function writeReuseCoreEvidence(addonDir: string, report: object): void;
}

declare module '../../../tools/adk/profileLock.mjs' {
  export function buildProfileLock(profile: object): {
    version: string;
    hash: string;
    profileId: string;
  };
  export function blankAttestation(lock: object | null): object;
  export function packEvidence(input: {
    lock: object | null;
    attestation: object | null;
    outDir: string;
    addonDir?: string;
  }): { ok: boolean; issues: CatalogIssue[] };
}

declare module '../../../tools/adk/agentRules.mjs' {
  export function writeAgentRuleFiles(lock: object, dir: string): string[];
}

declare module '../../../tools/adk/profileBundle.mjs' {
  export function readBundledProfile(profileId: string): object;
  export function verifyProfileSignature(profile: object): boolean;
  export function downloadProfile(
    instance: string,
    profileId: string,
    token: string
  ): Promise<object>;
}

declare module '../../../tools/adk/registryRun.mjs' {
  export function submitCertifiedRun(input: {
    instance: string;
    token: string;
    agentId: string;
    profileCode: string;
    answers: readonly object[];
    fetchImpl: typeof fetch;
  }): Promise<{ runId: string }>;
}

declare module '../../../tools/adk/addonBuild.mjs' {
  export function buildAddon(
    addonDir: string,
    options?: { only?: string; onLog?: (event: BuildLog) => void }
  ): Promise<string[]>;
}

declare module '../../../tools/adk/signManifest.mjs' {
  export function signManifestFile(manifestPath: string, keyPath: string): Promise<void>;
}

declare module '../../../tools/adk/publisherKeys.mjs' {
  export function generatePublisherKey(publisher: string): {
    fingerprint: string;
    publicKey: string;
    file: string;
  };
  export function exportPublicKey(keyPath: string, outPath: string): string;
  export function registerPublisherKey(input: {
    instance: string;
    publisher: string;
    keyPath: string;
    token: string;
  }): Promise<string>;
}

declare module '../../../tools/adk/addonSbom.mjs' {
  export function buildAddonSbom(dir: string): {
    bomFormat: string;
    components: { name: string; version: string }[];
  };
  export function writeAddonSbom(dir: string): string;
}

declare module '../../../tools/adk/requirementPlan.mjs' {
  export function auditRequirementPlan(addonDir: string): {
    ok: boolean;
    issues: CatalogIssue[];
    mapping: {
      requirementIds?: string[];
      unmapped?: string[];
      split?: object;
    } | null;
  };
  export function writeRequirementMapping(addonDir: string, mapping: object | null): void;
}

declare module '../../../tools/adk/requirementsTrace.mjs' {
  export function auditRequirementsTracing(addonDir: string): {
    ok: boolean;
    issues: CatalogIssue[];
    coverage: object | null;
  };
  export function writeRequirementsCoverage(addonDir: string, coverage: object | null): void;
}

declare module '../../../tools/adk/thinAddonBudgets.mjs' {
  export const SOFT_BUDGETS: {
    ownedTables: number;
    routes: number;
    dependencies: number;
    serverSourceBytes: number;
  };
  export function auditThinAddonBudgets(addonDir: string): {
    ok: boolean;
    issues: CatalogIssue[];
    evidence: {
      overages?: Array<{
        metric: string;
        count: number;
        limit: number;
        reason: string | null;
      }>;
      counts?: object;
      version?: number;
    };
  };
  export function writeThinAddonBudgetsEvidence(addonDir: string, evidence: object): void;
}

declare module '../../../tools/adk/engineeringPractice.mjs' {
  export function auditEngineeringPractice(addonDir: string): {
    ok: boolean;
    issues: CatalogIssue[];
    evidence: object;
    checkResults: Record<string, { ok: boolean; findings: object[] }>;
  };
  export function writeEngineeringPracticeEvidence(addonDir: string, evidence: object): void;
}

declare module '../../../tools/adk/certifyChecks.mjs' {
  export function recordMachineChecks(addonDir: string): object;
}

export {};
