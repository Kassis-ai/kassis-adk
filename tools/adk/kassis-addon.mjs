/**
 * kassis addon certify | attest | explain
 * certify reads .kassis/agent-profile.lock.json and .kassis/attestation.json
 * and exits 1 when a blocking KADK-7xx issue is present.
 */
import fs from 'node:fs';
import path from 'node:path';
import { certifyAttestation, kadkIssue } from './certifyAttestation.mjs';

const root = process.cwd();
const lockPath = path.join(root, '.kassis', 'agent-profile.lock.json');
const attestationPath = path.join(root, '.kassis', 'attestation.json');

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function certify() {
  const result = certifyAttestation({
    lock: readJson(lockPath),
    attestation: readJson(attestationPath),
  });
  for (const issue of result.issues) {
    console.log(`${issue.code} ${issue.message}`);
    console.log(`  ${issue.fix}`);
  }
  process.exit(result.ok ? 0 : 1);
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

const command = process.argv[2];
if (command === 'certify') certify();
else if (command === 'attest') attest();
else if (command === 'explain') explain(process.argv[3]);
else {
  console.error('Usage: node tools/adk/kassis-addon.mjs <certify|attest|explain> [KADK-7xx]');
  process.exit(1);
}
