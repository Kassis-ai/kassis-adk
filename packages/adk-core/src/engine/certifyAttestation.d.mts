import type { CatalogIssue } from './catalogIssue.js';
export function kadkIssue(
  code: string,
  values?: Readonly<Record<string, string>>
): CatalogIssue;
export function certifyAttestation(input: {
  readonly lock: object | null;
  readonly attestation: object | null;
  readonly checks?: object | null;
}): { ok: boolean; issues: CatalogIssue[] };
