import { describe, expect, it } from 'vitest';
import {
  CLEAN_ROOM_SCAFFOLD_REFUSALS,
  CLEAN_ROOM_SCAFFOLD_SUCCESS,
} from '../../../../scripts/adk-clean-room-scaffold.mjs';

const TEMPLATE_KINDS = [
  'addon',
  'route',
  'capability',
  'event',
  'job',
  'migration',
  'ui-slot',
  'ui-page',
  'mcp-tool',
] as const;

describe('clean room scaffold kinds (S1.20)', () => {
  it('covers every template scaffold kind except init-only addon', () => {
    const exercised = new Set([
      ...CLEAN_ROOM_SCAFFOLD_SUCCESS.map((row) => row.kind),
      ...CLEAN_ROOM_SCAFFOLD_REFUSALS.map((row) => row.kind),
    ]);
    for (const kind of TEMPLATE_KINDS) {
      if (kind === 'addon') continue;
      expect(exercised.has(kind), `missing clean-room exercise for ${kind}`).toBe(true);
    }
  });

  it('uses distinct scaffold names', () => {
    const names = CLEAN_ROOM_SCAFFOLD_SUCCESS.map((row) => row.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('documents tier 2 capability refusal', () => {
    expect(CLEAN_ROOM_SCAFFOLD_REFUSALS).toEqual([
      { kind: 'capability', name: 'lookup', code: 'KADK-218' },
    ]);
  });
});