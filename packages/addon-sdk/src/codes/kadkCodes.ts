/**
 * Typed access to codes/kadk-codes.json. The hundreds digit of a code names its category; a
 * published code keeps its number and meaning for good.
 */
import catalog from '../../codes/kadk-codes.json' with { type: 'json' };

export type KadkCategory =
  | 'manifest'
  | 'boundaries'
  | 'data'
  | 'events'
  | 'ui'
  | 'security'
  | 'attestation';

export type KadkSeverity = 'error' | 'warning';

export type KadkCode = `KADK-${number}`;

export interface KadkCodeDefinition {
  readonly code: KadkCode;
  readonly category: KadkCategory;
  readonly severity: KadkSeverity;
  readonly title: string;
  /** Template with `{placeholder}` slots. */
  readonly message: string;
  readonly fix: string;
  /** Repository path and anchor of the code's documentation. */
  readonly docs: string;
}

export type KadkTemplateValues = Readonly<Record<string, string | number>>;

/** One finding, as the validator, the CLI and the host report it. */
export interface KadkIssue {
  readonly code: KadkCode;
  /** Dotted path of the offending value, for example `jobs.types[1]`; empty for the whole manifest. */
  readonly path: string;
  readonly message: string;
  readonly fix: string;
  readonly docs: string;
}

/** Hundreds digit of the codes in each category. */
export const KADK_CATEGORY_HUNDREDS: Readonly<Record<KadkCategory, number>> = {
  manifest: 1,
  boundaries: 2,
  data: 3,
  events: 4,
  ui: 5,
  security: 6,
  attestation: 7,
};

const CODE_PATTERN = /^KADK-(\d)\d\d$/;
const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

type CatalogEntry = (typeof catalog.codes)[number];

function isCategory(value: string): value is KadkCategory {
  return Object.prototype.hasOwnProperty.call(KADK_CATEGORY_HUNDREDS, value);
}

function isSeverity(value: string): value is KadkSeverity {
  return value === 'error' || value === 'warning';
}

function isKadkCode(value: string): value is KadkCode {
  return CODE_PATTERN.test(value);
}

function toDefinition(entry: CatalogEntry): KadkCodeDefinition {
  const { code, category, severity } = entry;
  if (!isKadkCode(code)) throw new TypeError(`kadk-codes.json: '${code}' is not KADK-NNN`);
  if (!isCategory(category))
    throw new TypeError(`kadk-codes.json: ${code} has unknown category '${category}'`);
  if (!isSeverity(severity))
    throw new TypeError(`kadk-codes.json: ${code} has unknown severity '${severity}'`);
  return { ...entry, code, category, severity };
}

const DEFINITIONS: ReadonlyMap<string, KadkCodeDefinition> = new Map(
  catalog.codes.map((entry) => [entry.code, toDefinition(entry)])
);

export function listKadkCodes(): readonly KadkCodeDefinition[] {
  return [...DEFINITIONS.values()];
}

/** Throws for a code that is not in the catalog, which is a programming error. */
export function getKadkCode(code: KadkCode): KadkCodeDefinition {
  const definition = DEFINITIONS.get(code);
  if (!definition) throw new RangeError(`Unknown KADK code ${code}`);
  return definition;
}

/** Fills `{placeholder}` slots; a slot without a value stays as written. */
export function fillKadkTemplate(template: string, values: KadkTemplateValues): string {
  return template.replace(PLACEHOLDER, (slot, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : slot
  );
}

export function createKadkIssue(
  code: KadkCode,
  path: string,
  values: KadkTemplateValues = {}
): KadkIssue {
  const definition = getKadkCode(code);
  const filled: KadkTemplateValues = { path: path || 'manifest', ...values };
  return {
    code,
    path,
    message: fillKadkTemplate(definition.message, filled),
    fix: fillKadkTemplate(definition.fix, filled),
    docs: definition.docs,
  };
}
