/**
 * Scaffold kinds exercised by scripts/adk-clean-room.mjs after init (S1.20).
 * `addon` is covered by init; tier 2 refuses capability with KADK-218 (S1.12).
 */

/** @type {readonly { kind: string, name: string }[]} */
export const CLEAN_ROOM_SCAFFOLD_SUCCESS = [
  { kind: 'route', name: 'status' },
  { kind: 'event', name: 'approved' },
  { kind: 'job', name: 'nightly' },
  { kind: 'migration', name: 'widgets' },
  { kind: 'ui-slot', name: 'reports' },
  { kind: 'ui-page', name: 'dashboard' },
  { kind: 'mcp-tool', name: 'ping' },
];

/** @type {readonly { kind: string, name: string, code: string }[]} */
export const CLEAN_ROOM_SCAFFOLD_REFUSALS = [{ kind: 'capability', name: 'lookup', code: 'KADK-218' }];