import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { configurePublisherTrustSeed } from '@kassis/adk-protocol';
import { isPacked } from './kitPaths.mjs';

// The kit owns its seed copy (packages/adk-core/trust). The packed CLI reads the copy beside lib/.
if (!isPacked()) {
  const seed = fileURLToPath(new URL('../../trust/publisher-trust.json', import.meta.url));
  if (fs.existsSync(seed)) configurePublisherTrustSeed(seed);
}

export {
  PublisherTrustError,
  assertPublisherTrusted,
  fingerprintPublicKey,
  isPublisherTrustError,
  keyIsTrusted,
  loadPublisherTrustPolicy,
} from '@kassis/adk-protocol';
