/**
 * Typechecked by addonSdkTypes.test.ts. Each @ts-expect-error line is a contract violation
 * defineAddon / defineRecordType must reject; the other calls must compile.
 */
import { defineAddon, defineRecordType } from '@kassis/addon-sdk';

export const bare = defineAddon({
  async initialize(): Promise<void> {},
});

export const withRetention = defineAddon({
  manifest: {
    database: { ownedTables: ['addon_sample.rows'] },
    data: { retention: 'retain' },
  },
  recordTypes: [
    defineRecordType({
      type: 'sample:row',
      sensitivity: 'confidential',
      auditSubject: { subjectType: 'sample:row' },
      canAccess: async () => false,
      onDelete: async () => {},
    }),
  ],
  async initialize(): Promise<void> {},
});

defineAddon({
  // @ts-expect-error owned tables require data.retention
  manifest: { database: { ownedTables: ['addon_sample.rows'] } },
  async initialize(): Promise<void> {},
});

// @ts-expect-error a record type requires canAccess
defineRecordType({
  type: 'sample:row',
  sensitivity: 'standard',
  auditSubject: { subjectType: 'sample:row' },
  onDelete: async () => {},
});

// @ts-expect-error a record type requires onDelete
defineRecordType({
  type: 'sample:row',
  sensitivity: 'standard',
  auditSubject: { subjectType: 'sample:row' },
  canAccess: async () => false,
});

// @ts-expect-error a record type requires sensitivity
defineRecordType({
  type: 'sample:row',
  auditSubject: { subjectType: 'sample:row' },
  canAccess: async () => false,
  onDelete: async () => {},
});

// @ts-expect-error a record type requires an audit subject
defineRecordType({
  type: 'sample:row',
  sensitivity: 'mnpi',
  canAccess: async () => false,
  onDelete: async () => {},
});

defineRecordType({
  type: 'sample:row',
  // @ts-expect-error sensitivity is standard, confidential, or mnpi
  sensitivity: 'public',
  auditSubject: { subjectType: 'sample:row' },
  canAccess: async () => false,
  onDelete: async () => {},
});
