import type { CatalogIssue } from './catalogIssue.js';
export function auditReuseCore(addonDir: string): {
  ok: boolean;
  issues: CatalogIssue[];
  report: object;
};
export function writeReuseCoreEvidence(addonDir: string, report: object): void;
