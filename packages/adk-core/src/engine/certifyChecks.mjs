/**
 * Machine checks `certify` records in `.kassis/evidence/checks.json`.
 * Evidence for a machine guardrail is this file. Typed attestation evidence is not.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { checkoutFile, moduleDir } from './kitPaths.mjs';
import {
  auditThinAddonBudgets,
  writeThinAddonBudgetsEvidence,
} from './thinAddonBudgets.mjs';
import {
  auditEngineeringPractice,
  writeEngineeringPracticeEvidence,
} from './engineeringPractice.mjs';
import {
  auditMandatoryContract,
  writeMandatoryContractEvidence,
} from './mandatoryContract.mjs';

const here = moduleDir(import.meta.url);

function cliScript() {
  const beside = path.join(here, 'kassis-addon.mjs');
  if (fs.existsSync(beside)) return beside;
  return checkoutFile(import.meta.url, 'tools', 'adk', 'kassis-addon.mjs') || beside;
}
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
  const candidates = [path.resolve(here, '..', 'package.json')];
  const cliPackage = checkoutFile(import.meta.url, 'packages', 'addon-cli', 'package.json');
  if (cliPackage) candidates.push(cliPackage);
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

function contentHashOf(addonDir) {
  const beside = path.join(here, 'addonContentHash.mjs');
  const protocolEntry = createRequire(import.meta.url).resolve('@kassis/adk-protocol');
  const load = fs.existsSync(beside)
    ? `const loaded = await import(pathToFileURL(${JSON.stringify(beside)}).href);`
    : `const loaded = await import(pathToFileURL(${JSON.stringify(protocolEntry)}).href);`;
  const script = [
    "import { pathToFileURL } from 'node:url';",
    load,
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
  const cli = cliScript();
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

const ATTEST_OUTCOMES = new Set(['followed', 'violated', 'not_applicable']);

function readJsonObject(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return null;
  }
}

/**
 * Machine evidence for `adk.attest-pinned-profile`.
 * No lock means nothing is pinned, so the check passes.
 * A lock requires one valid answer per guardrail in `.kassis/attestation.json`.
 */
export function attestPinnedProfileCheck(addonDir) {
  const started = Date.now();
  const lockPath = path.join(addonDir, '.kassis', 'agent-profile.lock.json');
  const attestPath = path.join(addonDir, '.kassis', 'attestation.json');
  const inputHash = sha256Text(`${readText(lockPath)}\n${readText(attestPath)}`);
  if (!fs.existsSync(lockPath)) {
    return finishCheck('adk.attest-pinned-profile', inputHash, 0, started, 'no pinned profile\n');
  }
  const lock = readJsonObject(lockPath);
  const attestation = readJsonObject(attestPath);
  const problems = [];
  if (!lock) problems.push('lock is not a JSON object');
  if (!attestation) problems.push('attestation is missing or not a JSON object');
  if (lock && attestation) {
    if (attestation.version !== lock.version || attestation.lockHash !== lock.hash) {
      problems.push('attestation does not match the pinned lock');
    }
    const guardrails = Array.isArray(lock.guardrails) ? lock.guardrails : [];
    const answers = Array.isArray(attestation.answers) ? attestation.answers : [];
    const seen = new Set();
    for (const answer of answers) {
      const key = answer && typeof answer.key === 'string' ? answer.key : '';
      if (!key) {
        problems.push('answer missing key');
        continue;
      }
      if (seen.has(key)) problems.push(`duplicate answer ${key}`);
      seen.add(key);
      const outcome = answer.outcome;
      if (!ATTEST_OUTCOMES.has(outcome)) problems.push(`${key} outcome is not answered`);
      if ((outcome === 'violated' || outcome === 'not_applicable') && !answer.note) {
        problems.push(`${key} needs a note`);
      }
    }
    for (const guardrail of guardrails) {
      if (guardrail && typeof guardrail.key === 'string' && !seen.has(guardrail.key)) {
        problems.push(`missing answer ${guardrail.key}`);
      }
    }
  }
  const output = problems.length === 0 ? 'attestation answers the pinned profile\n' : `${problems.join('\n')}\n`;
  return finishCheck('adk.attest-pinned-profile', inputHash, problems.length === 0 ? 0 : 1, started, output);
}

/** Machine evidence for profile guardrail `adk.requirements-traced`. */
function runRequirementsTracedCheck(addonDir) {
  const cli = cliScript();
  const started = Date.now();
  const inputHash = sha256Text(
    `${readText(path.join(addonDir, 'REQUIREMENTS.md'))}\n${hashTree(addonDir, ['test'])}\n${readText(path.join(addonDir, 'GAPS.md'))}`
  );
  const result = spawnSync(process.execPath, [cli, 'requirements', '--json'], {
    cwd: addonDir,
    encoding: 'utf8',
  });
  const errorText = result.error instanceof Error ? result.error.message : '';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${errorText}`;
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return finishCheck('adk.requirements-traced', inputHash, exitCode, started, output);
}

/** Machine evidence for profile guardrail `adk.requirement-plan-mapped`. */
function runRequirementPlanCheck(addonDir) {
  const cli = cliScript();
  const started = Date.now();
  const inputHash = sha256Text(
    `${readText(path.join(addonDir, 'REQUIREMENTS.md'))}\n${readText(path.join(addonDir, 'PLAN.md'))}`
  );
  const result = spawnSync(process.execPath, [cli, 'plan', '--json'], {
    cwd: addonDir,
    encoding: 'utf8',
  });
  const errorText = result.error instanceof Error ? result.error.message : '';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}${errorText}`;
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  return finishCheck('adk.requirement-plan-mapped', inputHash, exitCode, started, output);
}

function runThinAddonBudgetsCheck(addonDir) {
  const started = Date.now();
  const inputHash = sha256Text(
    `${readText(path.join(addonDir, 'manifest.json'))}\n${readText(path.join(addonDir, 'package.json'))}\n${readText(path.join(addonDir, 'BUDGETS.md'))}\n${hashTree(addonDir, ['src'])}`
  );
  const audited = auditThinAddonBudgets(addonDir);
  writeThinAddonBudgetsEvidence(addonDir, audited.evidence);
  const output = JSON.stringify({
    ok: audited.ok,
    overages: audited.evidence.overages,
    issues: audited.issues,
  });
  return finishCheck('adk.thin-addon-budgets', inputHash, audited.ok ? 0 : 1, started, output);
}

export function mandatoryContractCheck(addonDir) {
  return runMandatoryContractCheck(addonDir);
}

function runMandatoryContractCheck(addonDir) {
  const started = Date.now();
  const inputHash = sha256Text(
    `${readText(path.join(addonDir, 'manifest.json'))}\n${hashTree(addonDir, ['src'])}`
  );
  const audited = auditMandatoryContract(addonDir);
  writeMandatoryContractEvidence(addonDir, audited.evidence);
  const output = JSON.stringify({ ok: audited.ok, issues: audited.issues });
  return finishCheck(
    'adk.mandatory-contract-intact',
    inputHash,
    audited.ok ? 0 : 1,
    started,
    output
  );
}

function runEngineeringPracticeChecks(addonDir) {
  const started = Date.now();
  const inputHash = hashTree(addonDir, ['src', 'frontend']);
  const audited = auditEngineeringPractice(addonDir);
  writeEngineeringPracticeEvidence(addonDir, audited.evidence);
  const rows = [];
  for (const [id, result] of Object.entries(audited.checkResults)) {
    const output = JSON.stringify({ ok: result.ok, findings: result.findings });
    rows.push(finishCheck(id, inputHash, result.ok ? 0 : 1, started, output));
  }
  return rows;
}

function buildInputHash(addonDir) {
  return sha256Text(
    `${readText(path.join(addonDir, 'package.json'))}\n${hashTree(addonDir, ['src', 'frontend'])}`
  );
}

/**
 * Runs check, conformance, build, test, requirements tracing, requirement
 * mapping, and the pinned-profile attestation check, then the content hash.
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
    runRequirementsTracedCheck(root),
    runRequirementPlanCheck(root),
    attestPinnedProfileCheck(root),
    runThinAddonBudgetsCheck(root),
    runMandatoryContractCheck(root),
    ...runEngineeringPracticeChecks(root),
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
