/** Whole cents. Rejects more than two decimal places and non-positive amounts. */
export function toCents(amount: string): number | null {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amount)) return null;
  const [whole, fraction = ''] = amount.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

export function centsToAmount(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  return `${whole}.${fraction}`;
}

/** FR-06. Missing currency threshold is high value. Equal to the threshold is high value. */
export function isHighValue(
  currency: string,
  cents: number,
  thresholds: Readonly<Record<string, string>>
): boolean {
  const raw = thresholds[currency];
  if (typeof raw !== 'string') return true;
  const limit = toCents(raw);
  if (limit === null) return true;
  return cents >= limit;
}
