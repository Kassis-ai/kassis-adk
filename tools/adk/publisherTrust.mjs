import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { configurePublisherTrustSeed } from '@kassis/adk-protocol';

if (globalThis.__KASSIS_ADK_PACKED__ !== true) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  configurePublisherTrustSeed(
    path.resolve(here, '../../server/core/addon-platform/trust/publisher-trust.json')
  );
}

export {
  PublisherTrustError,
  assertPublisherTrusted,
  fingerprintPublicKey,
  isPublisherTrustError,
  keyIsTrusted,
  loadPublisherTrustPolicy,
} from '@kassis/adk-protocol';
