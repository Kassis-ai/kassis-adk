/**
 * Bundle the CLI and the MCP server so an installed package does not import
 * the repository. Entry points and kit data come from package exports.
 * Data files the bundle reads by path are copied beside lib/.
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

function packageEntry(specifier) {
  return fileURLToPath(import.meta.resolve(specifier));
}

function packageRoot(name) {
  let dir = path.dirname(packageEntry(name));
  while (true) {
    const manifestPath = path.join(dir, 'package.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.name === name) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Package root not found for ${name}`);
}

const coreRoot = packageRoot('@kassis/adk-core');
const coreSrc = path.dirname(packageEntry('@kassis/adk-core'));
const protocolSrc = path.dirname(packageEntry('@kassis/adk-protocol'));
const kitRoots = [coreRoot, packageRoot('@kassis/adk-protocol'), packageRoot('@kassis/addon-sdk')].map(
  (root) => path.resolve(root)
);
// Module keys in the bundle are relative to this directory. The repo root would
// label inlined kit files packages/..., which the installed CLI must not name.
const bundleRoot = path.dirname(coreRoot);

fs.rmSync(lib, { recursive: true, force: true });
fs.mkdirSync(lib, { recursive: true });

function insideRoot(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function allowedBundleFile(file) {
  if (!path.isAbsolute(file)) return true;
  if (file.includes(`${path.sep}node_modules${path.sep}`)) return true;
  return kitRoots.some((root) => insideRoot(root, file));
}

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

const packageFilesOnly = {
  name: 'package-files-only',
  setup(build) {
    build.onResolve({ filter: /.*/ }, async (args) => {
      if (args.pluginData && args.pluginData.fence) return null;
      const resolved = await build.resolve(args.path, {
        importer: args.importer,
        resolveDir: args.resolveDir,
        kind: args.kind,
        pluginData: { fence: true },
      });
      if (resolved.external || (resolved.errors && resolved.errors.length > 0)) return resolved;
      if (!allowedBundleFile(resolved.path)) {
        return {
          errors: [{ text: `prepack bundle pulled a repo file: ${resolved.path}` }],
        };
      }
      return resolved;
    });
  },
};

const plugins = [externalPlugin, packageFilesOnly];

await esbuild.build({
  absWorkingDir: bundleRoot,
  entryPoints: [packageEntry('@kassis/adk-core/cli/kassis-addon')],
  outfile: path.join(lib, 'kassis-addon.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define,
  external,
  plugins,
  legalComments: 'none',
  minifySyntax: true,
  logLevel: 'silent',
});

await esbuild.build({
  absWorkingDir: bundleRoot,
  entryPoints: [packageEntry('@kassis/adk-core/cli/kassis-adk-mcp')],
  outfile: path.join(lib, 'kassis-adk-mcp.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  define,
  external,
  plugins,
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
const profileSource = path.join(coreRoot, 'profiles');
for (const profile of fs.readdirSync(profileSource)) {
  if (profile.endsWith('.json')) {
    fs.copyFileSync(path.join(profileSource, profile), path.join(profiles, profile));
  }
}

function copyIntoLib(source, name) {
  fs.copyFileSync(source, path.join(lib, name));
}

copyIntoLib(path.join(protocolSrc, 'canonicalJson.mjs'), 'canonicalJson.mjs');
copyIntoLib(path.join(protocolSrc, 'addonContentHash.mjs'), 'addonContentHash.mjs');
copyIntoLib(path.join(protocolSrc, 'addonContentHash.config.json'), 'addonContentHash.config.json');
copyIntoLib(
  path.join(repoRoot, 'server/core/addon-platform/trust/publisher-trust.json'),
  'publisher-trust.json'
);
copyIntoLib(
  path.join(coreRoot, 'keys', 'addon_verification_public.key'),
  'addon_verification_public.key'
);
copyIntoLib(packageEntry('@kassis/addon-sdk/codes/kadk-codes.json'), 'kadk-codes.json');
copyIntoLib(packageEntry('@kassis/addon-sdk/tier-matrix.json'), 'tier-matrix.json');
copyIntoLib(packageEntry('@kassis/addon-sdk/guardrails.json'), 'guardrails.json');
copyIntoLib(packageEntry('@kassis/addon-sdk/banned-dependencies.json'), 'banned-dependencies.json');
copyIntoLib(packageEntry('@kassis/addon-sdk/process-pack-kinds.json'), 'process-pack-kinds.json');
copyIntoLib(
  packageEntry('@kassis/addon-sdk/schema/process-pack.schema.json'),
  'process-pack.schema.json'
);
fs.cpSync(path.join(coreSrc, 'discovery'), path.join(lib, 'discovery'), { recursive: true });
fs.cpSync(path.join(coreSrc, 'client-docs'), path.join(lib, 'client-docs'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'templates/kassis-addon'), path.join(pkgRoot, 'templates/kassis-addon'), {
  recursive: true,
});
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
  packageEntry('@kassis/addon-sdk/schema/addon-manifest.v2.schema.json'),
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
      if (/from\s+['"][^'"]*packages\//.test(text)) {
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
