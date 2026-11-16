/**
 * Scaffold kinds exercised by scripts/adk-clean-room.mjs after init (S1.20).
 * `addon` is covered by init. Tier 2 `capability` writes `provides` (S2.13).
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
  { kind: 'capability', name: 'lookup' },
];

/** @type {readonly { kind: string, name: string, code: string }[]} */
export const CLEAN_ROOM_SCAFFOLD_REFUSALS = [];