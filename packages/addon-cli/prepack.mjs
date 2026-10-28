/**
 * Copy the CLI, the template, the profile, and the manifest schema into this
 * package so npm pack does not need the rest of the repository. The private
 * signing key is never copied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgRoot, '../..');
const lib = path.join(pkgRoot, 'lib');

fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(lib, { recursive: true });
for (const name of fs.readdirSync(path.join(repoRoot, 'tools/adk'))) {
  const source = path.join(repoRoot, 'tools/adk', name);
  if (name === 'profiles' && fs.statSync(source).isDirectory()) {
    const dest = path.join(lib, 'profiles');
    fs.mkdirSync(dest, { recursive: true });
    for (const profile of fs.readdirSync(source)) {
      if (profile.endsWith('.json')) fs.copyFileSync(path.join(source, profile), path.join(dest, profile));
    }
    continue;
  }
  if (name.endsWith('.mjs')) fs.copyFileSync(source, path.join(lib, name));
}
fs.copyFileSync(
  path.join(repoRoot, 'server/core/addon-deployment/canonicalJson.mjs'),
  path.join(lib, 'canonicalJson.mjs')
);
fs.copyFileSync(
  path.join(repoRoot, 'server/core/addon-deployment/addonContentHash.mjs'),
  path.join(lib, 'addonContentHash.mjs')
);
fs.copyFileSync(
  path.join(repoRoot, 'server/core/addon-deployment/addonContentHash.config.json'),
  path.join(lib, 'addonContentHash.config.json')
);
fs.copyFileSync(
  path.join(repoRoot, 'server/core/addon-platform/trust/publisherTrust.mjs'),
  path.join(lib, 'publisherTrust.mjs')
);
fs.copyFileSync(
  path.join(repoRoot, 'server/core/addon-platform/trust/publisher-trust.json'),
  path.join(lib, 'publisher-trust.json')
);
fs.copyFileSync(
  path.join(repoRoot, 'server/keys/addon_verification_public.key'),
  path.join(lib, 'addon_verification_public.key')
);
fs.copyFileSync(
  path.join(repoRoot, 'packages/addon-sdk/codes/kadk-codes.json'),
  path.join(lib, 'kadk-codes.json')
);
fs.cpSync(path.join(repoRoot, 'templates/kassis-addon'), path.join(pkgRoot, 'templates/kassis-addon'), {
  recursive: true,
});
fs.mkdirSync(path.join(pkgRoot, 'schema'), { recursive: true });
fs.copyFileSync(
  path.join(repoRoot, 'packages/addon-sdk/schema/addon-manifest.v2.schema.json'),
  path.join(pkgRoot, 'schema/addon-manifest.v2.schema.json')
);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/private/i.test(entry.name) || entry.name === 'addon_signing_private.key') {
      throw new Error(`CLI package staged a signing secret: ${full}`);
    }
  }
}
for (const dir of ['lib', 'templates', 'schema', 'bin']) walk(path.join(pkgRoot, dir));
