import { configurePublisherTrustSeed } from '@kassis/adk-protocol';
import { checkoutFile, isPacked } from './kitPaths.mjs';

if (!isPacked()) {
  const seed = checkoutFile(
    import.meta.url,
    'server',
    'core',
    'addon-platform',
    'trust',
    'publisher-trust.json'
  );
  if (seed) configurePublisherTrustSeed(seed);
}

export {
  PublisherTrustError,
  assertPublisherTrusted,
  fingerprintPublicKey,
  isPublisherTrustError,
  keyIsTrusted,
  loadPublisherTrustPolicy,
} from '@kassis/adk-protocol';
