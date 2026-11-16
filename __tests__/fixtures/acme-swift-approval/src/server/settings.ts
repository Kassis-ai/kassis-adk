import type { JsonObject } from '@kassis/addon-sdk';

export const DEFAULT_MESSAGE_TYPES = ['MT103', 'MT202'] as const;

export const DEFAULT_THRESHOLDS: Readonly<Record<string, string>> = {
  CHF: '1000000',
  EUR: '1000000',
  USD: '1000000',
};

export type SwiftSettings = {
  readonly allowedMessageTypes: readonly string[];
  readonly highValueThresholds: Readonly<Record<string, string>>;
  readonly maxAmountPerMessage: string | null;
  readonly expiryHours: number;
  readonly requireApproveComment: boolean;
  readonly notifyApprovers: boolean;
};

function stringList(value: unknown, fallback: readonly string[]): readonly string[] {
  if (!Array.isArray(value)) return fallback;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : fallback;
}

function thresholdMap(value: unknown): Readonly<Record<string, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_THRESHOLDS;
  const out: Record<string, string> = {};
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount === 'string' && amount.length > 0) out[key] = amount;
  }
  return Object.keys(out).length > 0 ? out : DEFAULT_THRESHOLDS;
}

function amountOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function hours(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 168) return 24;
  return value;
}

/** FR-50, FR-51, FR-52, FR-53, FR-54, FR-55. Missing keys use the BRD defaults. */
export function readSettings(config: JsonObject | null | undefined): SwiftSettings {
  const source = config ?? {};
  return {
    allowedMessageTypes: stringList(source.allowedMessageTypes, DEFAULT_MESSAGE_TYPES),
    highValueThresholds: thresholdMap(source.highValueThresholds),
    maxAmountPerMessage: amountOrNull(source.maxAmountPerMessage),
    expiryHours: hours(source.expiryHours),
    requireApproveComment: source.requireApproveComment === true,
    notifyApprovers: source.notifyApprovers !== false,
  };
}
