import type { CatalogIssue } from './catalogIssue.js';
export function auditEngineeringPractice(addonDir: string): {
  ok: boolean;
  issues: CatalogIssue[];
  evidence: object;
  checkResults: Record<string, { ok: boolean; findings: object[] }>;
};
export function writeEngineeringPracticeEvidence(addonDir: string, evidence: object): void;
