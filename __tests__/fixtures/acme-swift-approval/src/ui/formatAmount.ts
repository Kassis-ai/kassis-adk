/** FR-14. Locale digits, currency code beside them, so the badge is not colour alone. */
export function formatAmount(amount: string, currency: string, locale: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  const digits = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${digits} ${currency}`;
}
