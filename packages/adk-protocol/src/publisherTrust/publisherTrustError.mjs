export class PublisherTrustError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublisherTrustError';
  }
}

const TRUST_FAILURES = [
  'Addon signing key is revoked',
  'Addon signing key is pending',
  'Addon signing key is unknown',
  'Addon signing key is outside its validity window',
  'Addon signing key is not trusted for this publisher',
  'Addon publisher is not trusted',
  'Addon signing block is required',
  'Addon tier is not allowed for this publisher',
  'Addon id is outside the publisher prefixes',
  'Publisher trust policy is missing',
];

export function isPublisherTrustError(error) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return TRUST_FAILURES.some((text) => message.includes(text));
}
