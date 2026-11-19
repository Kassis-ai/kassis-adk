import type { CatalogIssue } from './catalogIssue.js';
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
