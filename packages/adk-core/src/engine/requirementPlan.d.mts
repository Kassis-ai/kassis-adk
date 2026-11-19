import type { CatalogIssue } from './catalogIssue.js';
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
