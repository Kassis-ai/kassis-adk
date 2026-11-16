export interface MandatoryContractHandler {
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly stub: boolean;
}

export interface MandatoryContractEvidence {
  readonly version: number;
  readonly manifestVersion: number | null;
  readonly resourceTypes: number;
  readonly ownedTables: number;
  readonly handlers: readonly MandatoryContractHandler[];
  readonly skipped?: string;
}

export interface MandatoryContractIssue {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly fix: string;
}

export interface MandatoryContractAudit {
  readonly ok: boolean;
  readonly issues: readonly MandatoryContractIssue[];
  readonly evidence: MandatoryContractEvidence;
}

export function auditMandatoryContract(addonDir: string): MandatoryContractAudit;

export function mandatoryContractRefusal(
  audit: MandatoryContractAudit
): { readonly code: string; readonly message: string } | null;

export function writeMandatoryContractEvidence(
  addonDir: string,
  evidence: MandatoryContractEvidence
): void;
