/**
 * kassis addon / adk commands.
 * certify reads .kassis/agent-profile.lock.json and .kassis/attestation.json
 * and exits 1 when a blocking KADK-7xx issue is present.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest, conformanceIssues } from './addonCheck.mjs';
import { writeAgentRuleFiles } from './agentRules.mjs';
import { certifyAttestation, kadkIssue } from './certifyAttestation.mjs';
import { buildProfileLock, packEvidence } from './profileLock.mjs';
import { downloadProfile, readBundledProfile, verifyProfileSignature } from './profileBundle.mjs';
import { submitCertifiedRun } from './registryRun.mjs';
import { initAddon } from './scaffold.mjs';

const root = process.cwd();
const here = path.dirname(fileURLToPath(import.meta.url));
const packedRoot = path.resolve(here, '..');
const repoRoot = fs.existsSync(path.join(packedRoot, 'templates/kassis-addon/manifest.json'))
  ? packedRoot
  : path.resolve(here, '../..');
const lockPath = path.join(root, '.kassis', 'agent-profile.lock.json');
const attestationPath = path.join(root, '.kassis', 'attestation.json');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function flagValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : '';
}

async function certify() {
  const result = certifyAttestation({
    lock: readJson(lockPath),
    attestation: readJson(attestationPath),
  });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ok: result.ok, issues: result.issues }));
  } else {
    for (const issue of result.issues) {
      console.log(`${issue.code} ${issue.message}`);
      console.log(`  ${issue.fix}`);
    }
  }
  if (!result.ok) process.exit(1);
  const instance = process.env.KASSIS_ADK_INSTANCE || '';
  const token = process.env.KASSIS_ADK_TOKEN || '';
  const agentId = process.env.KASSIS_ADK_AGENT_ID || '';
  if (instance && token && agentId) {
    const lock = readJson(lockPath);
    const attestation = readJson(attestationPath);
    const submitted = await submitCertifiedRun({
      instance,
      token,
      agentId,
      profileCode: lock.profileId,
      answers: attestation.answers,
    });
    console.log(submitted.runId);
  }
  process.exit(0);
}

function attest() {
  if (fs.existsSync(attestationPath)) {
    console.log(attestationPath);
    return;
  }
  const lock = readJson(lockPath);
  const answers = Array.isArray(lock?.guardrails)
    ? lock.guardrails.map((item) => ({ key: item.key, outcome: '', note: null, evidence: null }))
    : [];
  fs.mkdirSync(path.dirname(attestationPath), { recursive: true });
  fs.writeFileSync(
    attestationPath,
    `${JSON.stringify(
      {
        version: lock?.version ?? '',
        lockHash: lock?.hash ?? '',
        runId: '',
        answers,
      },
      null,
      2
    )}\n`
  );
  console.log(attestationPath);
}

function explain(code) {
  try {
    const issue = kadkIssue(code);
    console.log(`${issue.code} ${issue.message}`);
    console.log(issue.fix);
  } catch {
    console.error(`Unknown code ${code ?? ''}`);
    process.exit(1);
  }
}

async function sync() {
  const from = flagValue('from');
  const profileId = flagValue('profile') || 'addon-coding-agent';
  const instance = flagValue('instance') || '';
  let profile;
  if (from) profile = JSON.parse(fs.readFileSync(from, 'utf8'));
  else if (instance) {
    profile = await downloadProfile(instance, profileId, process.env.KASSIS_ADK_TOKEN || '');
  } else profile = readBundledProfile(profileId);
  if (!verifyProfileSignature(profile)) {
    console.error('Profile signature is not valid');
    process.exit(1);
  }
  const lock = buildProfileLock(profile);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  writeAgentRuleFiles(lock, root);
  console.log(lockPath);
}

function pack() {
  const outDir = flagValue('out') || path.join(root, '.kassis', 'evidence');
  const result = packEvidence({
    lock: readJson(lockPath),
    attestation: readJson(attestationPath),
    outDir,
  });
  for (const issue of result.issues) {
    console.log(`${issue.code} ${issue.message}`);
  }
  if (!result.ok) process.exit(1);
  console.log(outDir);
}

async function check() {
  const manifest = readJson(path.join(root, 'manifest.json'));
  if (!manifest) {
    console.error('manifest.json is missing');
    process.exit(1);
  }
  const issues = await checkManifest(manifest, repoRoot);
  for (const issue of issues) console.error(issue);
  process.exit(issues.length === 0 ? 0 : 1);
}

function conformance() {
  const issues = conformanceIssues(root);
  for (const issue of issues) console.error(issue);
  process.exit(issues.length === 0 ? 0 : 1);
}

async function sign() {
  const manifest = readJson(path.join(root, 'manifest.json'));
  const id = typeof manifest?.id === 'string' ? manifest.id : '';
  if (!id) {
    console.error('manifest.json needs an id');
    process.exit(1);
  }
  const key = flagValue('key');
  if (!key) {
    const bundled = path.join(repoRoot, 'tools/signing/sign-all-addons.mjs');
    if (!fs.existsSync(bundled)) {
      console.error('sign --key=<path> is required outside the Kassis repository');
      process.exit(1);
    }
    const result = spawnSync(process.execPath, [bundled, `--only=${id}`], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    process.exit(result.status ?? 1);
  }
  const { signManifestFile } = await import('./signManifest.mjs');
  try {
    await signManifestFile(path.join(root, 'manifest.json'), path.resolve(key));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'sign failed');
    process.exit(1);
  }
  process.exit(0);
}

async function keys() {
  const sub = process.argv[3];
  const keysModule = await import('./publisherKeys.mjs');
  if (sub === 'generate') {
    const publisher = flagValue('publisher');
    if (!publisher) {
      console.error('keys generate --publisher=<id> is required');
      process.exit(1);
    }
    const created = keysModule.generatePublisherKey(publisher);
    console.log(created.fingerprint);
    console.log(created.publicKey);
    console.log(created.file);
    return;
  }
  if (sub === 'export-public') {
    const key = flagValue('key');
    const out = flagValue('out');
    if (!key || !out) {
      console.error('keys export-public --key=<path> --out=<path> is required');
      process.exit(1);
    }
    keysModule.exportPublicKey(path.resolve(key), path.resolve(out));
    console.log(path.resolve(out));
    return;
  }
  if (sub === 'register') {
    const instance = flagValue('instance');
    const publisher = flagValue('publisher');
    const key = flagValue('key');
    if (!instance || !publisher || !key) {
      console.error('keys register --instance=<url> --publisher=<id> --key=<path> is required');
      process.exit(1);
    }
    await keysModule.registerPublisherKey({
      instance,
      publisher,
      keyPath: path.resolve(key),
      token: process.env.KASSIS_ADK_TOKEN || '',
    });
    return;
  }
  console.error('Usage: node tools/adk/kassis-addon.mjs keys <generate|export-public|register>');
  process.exit(1);
}

function init() {
  const id = flagValue('id');
  if (!id) {
    console.error('Usage: node tools/adk/kassis-addon.mjs init --id=<addon-id> [--dir=<path>]');
    process.exit(1);
  }
  const dir = path.resolve(flagValue('dir') || path.join(root, id));
  console.log(initAddon(id, dir));
}

function rules() {
  const lock = readJson(lockPath);
  if (!lock) {
    console.error('Run sync before rules');
    process.exit(1);
  }
  for (const file of writeAgentRuleFiles(lock, root)) console.log(file);
}

function test() {
  const tests = path.join(root, 'test');
  if (!fs.existsSync(tests)) {
    console.log('No test directory');
    return;
  }
  const result = spawnSync(process.execPath, ['--test'], { cwd: tests, stdio: 'inherit' });
  process.exit(result.status ?? 1);
}

function dev() {
  const manifest = readJson(path.join(root, 'manifest.json'));
  const id = typeof manifest?.id === 'string' ? manifest.id : '';
  if (!id) {
    console.error('manifest.json needs an id');
    process.exit(1);
  }
  console.log(`Routes mount at /api/v1/addons/${id}`);
  console.log(`UI loads from /addons-ui/${id}/index.js`);
}

function migrate() {
  const migrations = path.join(root, 'migrations');
  if (!fs.existsSync(migrations)) {
    console.log('No migrations');
    return;
  }
  const names = fs.readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort();
  for (const name of names) console.log(name);
  console.log('Not applied. Run the up script through the release ledger.');
}

const command = process.argv[2];
const commands = {
  certify,
  attest,
  explain: () => explain(process.argv[3]),
  sync,
  pack,
  check,
  conformance,
  sign,
  keys,
  init,
  rules,
  test,
  dev,
  migrate,
};
const selected = commands[command];
if (!selected) {
  console.error(
    'Usage: node tools/adk/kassis-addon.mjs <certify|attest|explain|sync|pack|check|conformance|sign|keys|init|rules|test|dev|migrate>'
  );
  process.exit(1);
}
Promise.resolve(selected()).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
