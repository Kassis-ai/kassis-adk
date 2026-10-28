import { describe, expect, it } from 'vitest';
import {
  diffManifestSurface,
  summarizeDeploymentEvidence,
  type ManifestSnapshot,
} from '../../../../server/core/addon-deployment/evidenceSummary.js';

const previous: ManifestSnapshot = {
  tier: 1,
  permissions: [{ name: 'sample.view' }],
  egress: { hosts: ['old.example'] },
  events: { publishes: [{ name: 'sample.case.opened' }], subscribes: ['core.case.closed'] },
  database: { ownedTables: ['sample_items'], readAccess: ['cases'] },
};

const next: ManifestSnapshot = {
  tier: 2,
  permissions: [{ name: 'sample.view' }, { name: 'sample.edit' }],
  egress: { hosts: ['new.example'] },
  events: { publishes: [{ name: 'sample.case.opened' }] },
  provides: [{ capability: 'sample.check', version: '1.0.0' }],
  database: { ownedTables: ['sample_items'] },
};

describe('deployment evidence summary', () => {
  it('diffs permissions, egress, events, capabilities, data access and tier', () => {
    const diff = diffManifestSurface(previous, next);
    expect(diff.tier).toEqual({ from: 1, to: 2 });
    expect(diff.permissions).toEqual({ added: ['sample.edit'], removed: [] });
    expect(diff.egressHosts).toEqual({ added: ['new.example'], removed: ['old.example'] });
    expect(diff.events.removed).toEqual(['subscribe:core.case.closed']);
    expect(diff.capabilities.added).toEqual(['provide:sample.check@1.0.0']);
    expect(diff.dataAccess).toEqual({ added: [], removed: ['read:cases'] });
  });

  it('shows the host content hash and manifest diff beside the client evidence', () => {
    const clientDiff = diffManifestSurface(null, previous);
    const summary = summarizeDeploymentEvidence({
      clientContentHash: 'sha256-client',
      hostContentHash: 'sha256-host',
      clientManifestDiff: clientDiff,
      previousManifest: previous,
      nextManifest: next,
      answers: [
        { key: 'adk.lowest-rung', outcome: 'followed', verification: 'self' },
        { key: 'adk.certify', outcome: 'followed', verification: 'machine' },
      ],
    });
    expect(summary.contentHash).toEqual({
      client: 'sha256-client',
      host: 'sha256-host',
      match: false,
    });
    expect(summary.manifestDiff.client).toEqual(clientDiff);
    expect(summary.manifestDiff.host.permissions.added).toEqual(['sample.edit']);
    expect(summary.answers).toEqual([
      { key: 'adk.lowest-rung', outcome: 'followed', label: 'self-attested' },
      { key: 'adk.certify', outcome: 'followed', label: 'machine' },
    ]);
  });

  it('matches when the host recomputes the same content hash', () => {
    const summary = summarizeDeploymentEvidence({
      clientContentHash: 'sha256-same',
      hostContentHash: 'sha256-same',
      clientManifestDiff: null,
      previousManifest: null,
      nextManifest: null,
      answers: [{ key: 'adk.work-in-own-repo', outcome: null, verification: 'human' }],
    });
    expect(summary.contentHash.match).toBe(true);
    expect(summary.manifestDiff.client).toBeNull();
    expect(summary.manifestDiff.host.tier).toEqual({ from: null, to: null });
    expect(summary.answers[0]).toEqual({
      key: 'adk.work-in-own-repo',
      outcome: null,
      label: 'self-attested',
    });
  });
});
