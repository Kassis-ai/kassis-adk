import { describe, expect, it } from 'vitest';
import { defineAddon, defineRecordType } from '@kassis/addon-sdk';
import type { AddonContext } from '@kassis/addon-sdk';

describe('defineAddon and defineRecordType', () => {
  it('returns the initialize function and the record types that were declared', async () => {
    let called = false;
    const recordType = defineRecordType({
      type: 'sample:row',
      sensitivity: 'standard',
      auditSubject: { subjectType: 'sample:row' },
      canAccess: async () => false,
      onDelete: async () => {},
    });
    const addon = defineAddon({
      recordTypes: [recordType],
      async initialize(): Promise<void> {
        called = true;
      },
    });

    await addon.initialize({} as AddonContext);
    expect(called).toBe(true);
    expect(addon.recordTypes).toEqual([recordType]);
    expect(recordType.sensitivity).toBe('standard');
    expect(recordType.auditSubject.subjectType).toBe('sample:row');
  });
});
