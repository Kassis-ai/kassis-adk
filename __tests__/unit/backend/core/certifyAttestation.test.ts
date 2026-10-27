import { describe, expect, it } from 'vitest';
import { certifyAttestation } from '../../../../tools/adk/certifyAttestation.mjs';

const lock = {
  version: '3',
  hash: 'abc',
  guardrails: [
    { key: 'no-core-edits', severity: 'blocking', verification: 'human' },
    {
      key: 'manifest-valid',
      severity: 'blocking',
      verification: 'machine',
      checkId: 'kassis addon check',
    },
    { key: 'readme', severity: 'advisory', verification: 'human' },
  ],
};

describe('certifyAttestation', () => {
  it('fails with KADK-701 and KADK-709 when the files are missing', () => {
    const result = certifyAttestation({ lock: null, attestation: null });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-709', 'KADK-701']);
  });

  it('fails with KADK-704 when the attestation is for a different profile version', () => {
    const result = certifyAttestation({
      lock,
      attestation: { version: '2', lockHash: 'abc', answers: [] },
    });
    expect(result.issues.some((issue) => issue.code === 'KADK-704')).toBe(true);
    expect(result.ok).toBe(false);
  });

  it('fails with KADK-703 when a blocking guardrail is violated', () => {
    const result = certifyAttestation({
      lock,
      attestation: {
        version: '3',
        lockHash: 'abc',
        answers: [
          { key: 'no-core-edits', outcome: 'violated', note: 'edited server/' },
          {
            key: 'manifest-valid',
            outcome: 'followed',
            note: null,
            evidence: { checkId: 'kassis addon check' },
          },
          { key: 'readme', outcome: 'followed', note: null, evidence: null },
        ],
      },
    });
    expect(result.issues.map((issue) => issue.code)).toContain('KADK-703');
    expect(result.ok).toBe(false);
  });

  it('passes when every blocking guardrail is followed and the lock hash matches', () => {
    const result = certifyAttestation({
      lock,
      attestation: {
        version: '3',
        lockHash: 'abc',
        answers: [
          { key: 'no-core-edits', outcome: 'followed', note: null, evidence: null },
          {
            key: 'manifest-valid',
            outcome: 'followed',
            note: null,
            evidence: { checkId: 'kassis addon check' },
          },
        ],
      },
    });
    expect(result.issues.map((issue) => issue.code)).toEqual(['KADK-713']);
    expect(result.ok).toBe(true);
  });
});
