/**
 * Ed25519 manifest verify and the package sha256 digest.
 * The bytes match the host verifier: SPKI DER public key, hex signature,
 * UTF-8 message, Node crypto.verify with a null algorithm.
 */
import crypto from 'node:crypto';

/**
 * @param {string} messageUtf8
 * @param {string} signatureHex
 * @param {string} publicKeyDerHex
 * @returns {boolean}
 */
export function verifyEd25519SpkiHex(messageUtf8, signatureHex, publicKeyDerHex) {
  const publicKey = crypto.createPublicKey({
    key: Buffer.from(publicKeyDerHex, 'hex'),
    format: 'der',
    type: 'spki',
  });
  return crypto.verify(
    null,
    Buffer.from(messageUtf8, 'utf8'),
    publicKey,
    Buffer.from(signatureHex, 'hex')
  );
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function sha256DigestHex(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
