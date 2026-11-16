/**
 * Typed access to guardrails.json — groups A–F, enforcement levels, checks, and KADK codes.
 */
import catalog from '../../guardrails.json' with { type: 'json' };

export type GuardrailGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type GuardrailLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface GuardrailCatalogEntry {
  readonly id: string;
  readonly group: GuardrailGroup;
  readonly level: GuardrailLevel;
  /** Machine check id(s), self-attestation label, or planned check name. */
  readonly check: string | readonly string[];
  readonly kadkCode: `KADK-${number}`;
  readonly fixHint: string;
  readonly inProfile?: boolean;
}

const GROUPS = new Set<GuardrailGroup>(['A', 'B', 'C', 'D', 'E', 'F']);
const LEVELS = new Set<GuardrailLevel>(['L1', 'L2', 'L3', 'L4', 'L5']);
const CODE_PATTERN = /^KADK-\d{3}$/;

type RawEntry = (typeof catalog.entries)[number];

function isGroup(value: string): value is GuardrailGroup {
  return GROUPS.has(value as GuardrailGroup);
}

function isLevel(value: string): value is GuardrailLevel {
  return LEVELS.has(value as GuardrailLevel);
}

function normalizeCheck(check: unknown): string | readonly string[] {
  if (typeof check === 'string') return check;
  if (Array.isArray(check) && check.every((item) => typeof item === 'string')) {
    return check;
  }
  throw new TypeError('guardrails.json: check must be a string or string array');
}

function toEntry(raw: RawEntry): GuardrailCatalogEntry {
  const { id, group, level, check, kadkCode, fixHint } = raw;
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('guardrails.json: entry missing id');
  }
  if (!isGroup(group)) throw new TypeError(`guardrails.json: ${id} has unknown group '${group}'`);
  if (!isLevel(level)) throw new TypeError(`guardrails.json: ${id} has unknown level '${level}'`);
  if (!CODE_PATTERN.test(kadkCode)) {
    throw new TypeError(`guardrails.json: ${id} kadkCode '${kadkCode}' is not KADK-NNN`);
  }
  if (typeof fixHint !== 'string' || fixHint.length === 0) {
    throw new TypeError(`guardrails.json: ${id} needs fixHint`);
  }
  const normalizedCheck = normalizeCheck(check);
  const inProfile = raw.inProfile === true ? true : raw.inProfile === false ? false : undefined;
  return {
    id,
    group,
    level,
    check: normalizedCheck,
    kadkCode: kadkCode as `KADK-${number}`,
    fixHint,
    ...(inProfile !== undefined ? { inProfile } : {}),
  };
}

const ENTRIES: ReadonlyMap<string, GuardrailCatalogEntry> = new Map(
  catalog.entries.map((item) => [item.id, toEntry(item)])
);

export const GUARDRAIL_GROUP_LABELS: Readonly<Record<GuardrailGroup, string>> =
  catalog.groupLabels as Readonly<Record<GuardrailGroup, string>>;

export const GUARDRAIL_LEVEL_LABELS: Readonly<Record<GuardrailLevel, string>> =
  catalog.levelLabels as Readonly<Record<GuardrailLevel, string>>;

export function listGuardrailCatalogEntries(): readonly GuardrailCatalogEntry[] {
  return [...ENTRIES.values()];
}

export function getGuardrailCatalogEntry(id: string): GuardrailCatalogEntry | undefined {
  return ENTRIES.get(id);
}

/** Throws when id is absent — programming error when the catalogue must contain the key. */
export function requireGuardrailCatalogEntry(id: string): GuardrailCatalogEntry {
  const entry = ENTRIES.get(id);
  if (!entry) throw new RangeError(`Unknown guardrail catalogue id ${id}`);
  return entry;
}

/** Flatten check to a human-readable string for docs and MCP. */
export function formatGuardrailCheck(check: string | readonly string[]): string {
  if (typeof check === 'string') return check;
  return check.join(', ');
}