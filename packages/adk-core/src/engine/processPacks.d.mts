import type { CatalogIssue } from './catalogIssue.js';
export function auditProcessPacks(addonDir: string): {
  ok: boolean;
  issues: CatalogIssue[];
};
