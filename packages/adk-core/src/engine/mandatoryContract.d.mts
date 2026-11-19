import type { CatalogIssue } from './catalogIssue.js';
export function auditMandatoryContract(addonDir: string): {
  ok: boolean;
  issues: CatalogIssue[];
  evidence: object;
};
export function mandatoryContractRefusal(audit: {
  ok: boolean;
  issues: CatalogIssue[];
}): { code: string; message: string } | null;
export function writeMandatoryContractEvidence(addonDir: string, evidence: object): void;
