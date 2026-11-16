/**
 * Bundle the CLI and the MCP server so an installed package does not import
 * the repository. Data files the bundle reads by path are copied beside lib/.
 * The private signing key is never copied.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const pkgRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(pkgRoot, '../..');
const lib = path.join(pkgRoot, 'lib');
const define = { 'globalThis.__KASSIS_ADK_PACKED__': 'true' };
const external = [
  'ajv',
  'ajv/*',
  '@modelcontextprotocol/sdk',
  '@modelcontextprotocol/sdk/*',
  'es-module-lexer',
  '@kassis/addon-testkit',
];

fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(lib, { recursive: true });

const externalPlugin = {
  name: 'external-cli-deps',
  setup(build) {
    build.onResolve(
      { filter: /^(ajv|@modelcontextprotocol\/sdk|es-module-lexer|@kassis\/addon-testkit)(\/|$)/ },
      (args) => ({
        path: args.path,
        external: true,
      })
    );
  },
};

await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: [path.join(repoRoot, 'tools/adk/kassis-addon.mjs')],
  outfile: path.join(lib, 'kassis-addon.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define,
  external,
  plugins: [externalPlugin],
  legalComments: 'none',
  minifySyntax: true,
  logLevel: 'silent',
});

await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: [path.join(repoRoot, 'tools/adk/kassis-adk-mcp.mjs')],
  outfile: path.join(lib, 'kassis-adk-mcp.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define,
  external,
  plugins: [externalPlugin],
  legalComments: 'none',
  minifySyntax: true,
  logLevel: 'silent',
});

function stripFileComments(file) {
  const lines = fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('//'));
  fs.writeFileSync(file, `${lines.join('\n')}\n`);
}
stripFileComments(path.join(lib, 'kassis-addon.mjs'));
stripFileComments(path.join(lib, 'kassis-adk-mcp.mjs'));

const profiles = path.join(lib, 'profiles');
fs.mkdirSync(profiles, { recursive: true });
for (const profile of fs.readdirSync(path.join(repoRoot, 'tools/adk/profiles'))) {
  if (profile.endsWith('.json')) {
    fs.copyFileSync(
      path.join(repoRoot, 'tools/adk/profiles', profile),
      path.join(profiles, profile)
    );
  }
}

function copyIntoLib(source, name) {
  fs.copyFileSync(source, path.join(lib, name));
}

copyIntoLib(
  path.join(repoRoot, 'server/core/addon-deployment/canonicalJson.mjs'),
  'canonicalJson.mjs'
);
copyIntoLib(
  path.join(repoRoot, 'server/core/addon-deployment/addonContentHash.mjs'),
  'addonContentHash.mjs'
);
copyIntoLib(
  path.join(repoRoot, 'server/core/addon-deployment/addonContentHash.config.json'),
  'addonContentHash.config.json'
);
copyIntoLib(
  path.join(repoRoot, 'server/core/addon-platform/trust/publisherTrust.mjs'),
  'publisherTrust.mjs'
);
copyIntoLib(
  path.join(repoRoot, 'server/core/addon-platform/trust/publisher-trust.json'),
  'publisher-trust.json'
);
copyIntoLib(
  path.join(repoRoot, 'server/keys/addon_verification_public.key'),
  'addon_verification_public.key'
);
copyIntoLib(path.join(repoRoot, 'packages/addon-sdk/codes/kadk-codes.json'), 'kadk-codes.json');
copyIntoLib(path.join(repoRoot, 'packages/addon-sdk/tier-matrix.json'), 'tier-matrix.json');
fs.cpSync(
  path.join(repoRoot, 'packages/adk-core/src/discovery'),
  path.join(lib, 'discovery'),
  { recursive: true }
);
fs.cpSync(
  path.join(repoRoot, 'templates/kassis-addon'),
  path.join(pkgRoot, 'templates/kassis-addon'),
  {
    recursive: true,
  }
);
const templateNpmrc = path.join(pkgRoot, 'templates/kassis-addon/.npmrc');
if (fs.existsSync(templateNpmrc)) {
  fs.copyFileSync(templateNpmrc, path.join(pkgRoot, 'templates/kassis-addon/npmrc'));
}
const templateGitignore = path.join(pkgRoot, 'templates/kassis-addon/.gitignore');
if (fs.existsSync(templateGitignore)) {
  fs.copyFileSync(templateGitignore, path.join(pkgRoot, 'templates/kassis-addon/gitignore'));
}
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
    } else if (entry.name.endsWith('.mjs') || entry.name.endsWith('.js')) {
      const text = fs.readFileSync(full, 'utf8');
      if (text.includes('packages/') || text.includes(".ts'")) {
        throw new Error(`CLI bundle still points at the repository: ${full}`);
      }
    }
  }
}
walk(lib);
for (const dir of ['templates', 'schema', 'bin']) {
  const full = path.join(pkgRoot, dir);
  if (fs.existsSync(full)) walkSecrets(full);
}

function walkSecrets(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSecrets(full);
    else if (/private/i.test(entry.name) || entry.name === 'addon_signing_private.key') {
      throw new Error(`CLI package staged a signing secret: ${full}`);
    }
  }
}
