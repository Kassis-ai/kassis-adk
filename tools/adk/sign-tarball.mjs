/**
 * Sign an npm tarball with the publisher Ed25519 key.
 *   node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
 * Writes <file.tgz>.sig next to the tarball. npm publish still attaches provenance.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function signTarball(tarballPath, privateKeyHex) {
  const privateKey = crypto.createPrivateKey({
    key: Buffer.from(privateKeyHex.trim(), 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = crypto.sign(null, fs.readFileSync(tarballPath), privateKey);
  const sigPath = `${tarballPath}.sig`;
  fs.writeFileSync(sigPath, `${signature.toString('hex')}\n`);
  return sigPath;
}

function main() {
  const tarball = process.argv[2];
  const keyFlag = process.argv.find((arg) => arg.startsWith('--key='));
  const keyPath = keyFlag ? path.resolve(keyFlag.slice('--key='.length)) : '';
  if (!tarball || !fs.existsSync(tarball) || !keyPath) {
    console.error('Usage: node tools/adk/sign-tarball.mjs <file.tgz> --key=<path>');
    process.exit(1);
  }
  if (!fs.existsSync(keyPath)) {
    console.error('Publisher signing key was not found');
    process.exit(1);
  }
  console.log(signTarball(tarball, fs.readFileSync(keyPath, 'utf8')));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
