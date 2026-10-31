/**
 * Machine checks `certify` records in `.kassis/evidence/checks.json`.
 * Evidence for a machine guardrail is this file. Typed attestation evidence is not.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_STORED_MAX = 4000;

function sha256Text(text) {
  return `sha256-${createHash('sha256').update(text).digest('hex')}`;
}

function storedOutput(output) {
  if (output.length <= OUTPUT_STORED_MAX) return output;
  return `${output.slice(0, OUTPUT_STORED_MAX)}\n… truncated\n`;
}

function finishCheck(id, inputHash, exitCode, started, output) {
  return {
    id,
    inputHash,
    exitCode,
    durationMs: Date.now() - started,
    outputDigest: sha256Text(output),
    output: storedOutput(output),
  };
}

function readText(file) {
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8');
}

function collectFiles(dir, relative, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const absolute = path.join(dir, entry.name);
    const next = relative.length > 0 ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) collectFiles(absolute, next, out);
    else if (entry.isFile()) out.push({ relative: next, absolute });
  }
}

function hashTree(addonDir, relativeDirs) {
  const hash = createHash('sha256');
  const files = [];
  for (const relative of relativeDirs) {
    collectFiles(path.join(addonDir, relative), relative, files);
  }
  files.sort((left, right) => {
    if (left.relative < right.relative) return -1;
    if (left.relative > right.relative) return 1;
    return 0;
  });
  for (const file of files) {
    hash.update(file.relative);
    hash.update('\0');
    hash.update(fs.readFileSync(file.absolute));
    hash.update('\n');
  }
  return `sha256-${hash.digest('hex')}`;
}

export function cliPackageVersion() {
  const candidates = [path.resolve(here, '../package.json')];
  if (globalThis.__KASSIS_ADK_PACKED__ !== true) {
    candidates.push(path.resolve(here, '../../packages/addon-cli/package.json'));
  }
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed.name === '@kassis/addon-cli' && typeof parsed.version === 'string')
        return parsed.version;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  return '0.0.0';
}

function contentHashModulePath() {
  const beside = path.join(here, 'addonContentHash.mjs');
  if (fs.existsSync(beside)) return beside;
  return path.resolve(here, '../../server/core/addon-deployment/addonContentHash.mjs');
}

function contentHashOf(addonDir) {
  const modulePath = contentHashModulePath();
  const script = [
    "import { pathToFileURL } from 'node:url';",
    `const loaded = await import(pathToFileURL(${JSON.stringify(modulePath)}).href);`,
    `process.stdout.write(await loaded.computeAddonContentHash(${JSON.stringify(addonDir)}));`,
  ].join('\n');
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  const value = (result.stdout ?? '').trim();
  return value.startsWith('sha256-') ? value : null;
}

function runAddonCommand(addonDir, command, inputHash) {
  const cli = path.join(here, 'kassis-addon.mjs');
  const started = Date.now();
  const result = spawnSync(process.execPath, [cli, command], {
    cwd: addonDir,
    encoding: 'utf8',
  });
  const errorText = result.error instanceof Error ? result.error.message : '';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${errorText}`;
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return finishCheck(`kassis-addon-${command}`, inputHash, exitCode, started, output);
}

function buildInputHash(addonDir) {
  return sha256Text(
    `${readText(path.join(addonDir, 'package.json'))}\n${hashTree(addonDir, ['src', 'frontend'])}`
  );
}

/**
 * Runs check, conformance, build and test, then the content hash.
 * Writes `.kassis/evidence/checks.json` and returns that document.
 *
 * @param {string} addonDir
 */
export function recordMachineChecks(addonDir) {
  const root = path.resolve(addonDir);
  const checks = [
    runAddonCommand(root, 'check', sha256Text(readText(path.join(root, 'manifest.json')))),
    runAddonCommand(root, 'conformance', hashTree(root, ['src', 'frontend', 'migrations'])),
    runAddonCommand(root, 'build', buildInputHash(root)),
    runAddonCommand(root, 'test', hashTree(root, ['test'])),
  ];
  const document = {
    cliVersion: cliPackageVersion(),
    nodeVersion: process.version,
    contentHash: contentHashOf(root),
    checks,
  };
  const evidenceDir = path.join(root, '.kassis', 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.writeFileSync(path.join(evidenceDir, 'checks.json'), `${JSON.stringify(document, null, 2)}\n`);
  return document;
}
