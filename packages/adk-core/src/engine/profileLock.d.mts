import type { CatalogIssue } from './catalogIssue.js';
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
