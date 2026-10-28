import fs from 'node:fs';
import path from 'node:path';

const HOST_IMPORT = /(?:from\s+|import\s*\(\s*)['"](?:@\/|server\/)/;

/**
 * @param {string} source
 * @param {string} [label]
 * @returns {void}
 */
export function assertNoHostImports(source, label = 'source') {
  if (HOST_IMPORT.test(source)) {
    throw new Error(`${label} imports the host`);
  }
}

/**
 * @typedef {object} CertifyReport
 * @property {true} ok
 */

/**
 * @param {string} dir
 * @returns {CertifyReport}
 */
export function assertEvidencePack(dir) {
  const certifyPath = path.join(dir, 'certify.json');
  for (const name of ['attestation.json', 'agent-profile.lock.json', 'certify.json']) {
    if (!fs.existsSync(path.join(dir, name))) {
      throw new Error(`Evidence pack is missing ${name}`);
    }
  }
  const certify = JSON.parse(fs.readFileSync(certifyPath, 'utf8'));
  if (certify.ok !== true) {
    throw new Error('Evidence pack certify result is not ok');
  }
  return certify;
}

export { createTestContext } from './createTestContext.mjs';
