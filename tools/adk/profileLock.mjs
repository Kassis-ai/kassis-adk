/**
 * Local half of `kassis adk sync`. The published-profile download needs a
 * reachable Kassis instance; this pins a profile document the caller already has.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJsonStringify } from '../../server/core/addon-deployment/canonicalJson.mjs';
import { certifyAttestation } from './certifyAttestation.mjs';

export function buildProfileLock(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('A profile document is required');
  }
  const version = profile.version;
  const guardrails = profile.guardrails;
  if (typeof version !== 'string' || version.length === 0 || !Array.isArray(guardrails)) {
    throw new Error('Profile needs a version and a guardrails array');
  }
  const body = {
    profileId: typeof profile.profileId === 'string' ? profile.profileId : 'addon-coding-agent',
    version,
    guardrails,
  };
  const hash = createHash('sha256').update(canonicalJsonStringify(body)).digest('hex');
  return { ...body, hash };
}

export function packEvidence(input) {
  const result = certifyAttestation({ lock: input.lock, attestation: input.attestation });
  if (!result.ok) return result;
  fs.mkdirSync(input.outDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.outDir, 'attestation.json'),
    `${JSON.stringify(input.attestation, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(input.outDir, 'agent-profile.lock.json'),
    `${JSON.stringify(input.lock, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(input.outDir, 'certify.json'),
    `${JSON.stringify({ ok: true, issues: result.issues }, null, 2)}\n`
  );
  return result;
}
