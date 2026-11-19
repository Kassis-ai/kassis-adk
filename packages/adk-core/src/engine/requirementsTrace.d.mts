import type { CatalogIssue } from './catalogIssue.js';
export function auditRequirementsTracing(addonDir: string): {
  ok: boolean;
  issues: CatalogIssue[];
  coverage: {
    mustIds?: string[];
    untraced?: string[];
  } | null;
};
export function writeRequirementsCoverage(addonDir: string, coverage: object | null): void;
