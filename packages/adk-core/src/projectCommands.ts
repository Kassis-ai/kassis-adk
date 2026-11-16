import fs from 'node:fs';
import path from 'node:path';
import { checkAddonImports } from '@kassis/addon-testkit';
import { initAddon } from '../../../tools/adk/scaffold.mjs';
import {
  certifyAttestation,
  kadkIssue as catalogIssue,
} from '../../../tools/adk/certifyAttestation.mjs';
import {
  blankAttestation,
  buildProfileLock,
  packEvidence,
} from '../../../tools/adk/profileLock.mjs';
import { writeAgentRuleFiles } from '../../../tools/adk/agentRules.mjs';
import {
  downloadProfile,
  readBundledProfile,
  verifyProfileSignature,
} from '../../../tools/adk/profileBundle.mjs';
import { submitCertifiedRun } from '../../../tools/adk/registryRun.mjs';
import { buildAddon } from '../../../tools/adk/addonBuild.mjs';
import { signManifestFile } from '../../../tools/adk/signManifest.mjs';
import {
  exportPublicKey,
  generatePublisherKey,
  registerPublisherKey,
} from '../../../tools/adk/publisherKeys.mjs';
import { recordMachineChecks } from '../../../tools/adk/certifyChecks.mjs';
import {
  auditRequirementsTracing,
  writeRequirementsCoverage,
} from '../../../tools/adk/requirementsTrace.mjs';
import {
  auditRequirementPlan,
  writeRequirementMapping,
} from '../../../tools/adk/requirementPlan.mjs';
import { auditReuseCore, writeReuseCoreEvidence } from '../../../tools/adk/reuseCore.mjs';
import {
  auditThinAddonBudgets,
  writeThinAddonBudgetsEvidence,
} from '../../../tools/adk/thinAddonBudgets.mjs';
import {
  auditEngineeringPractice,
  writeEngineeringPracticeEvidence,
} from '../../../tools/adk/engineeringPractice.mjs';
import type { AdkIssue, CommandResult, JsonObject, LogListener } from './types.ts';
import { checkManifestDirectory } from './manifestCheck.ts';
import {
  commandResult,
  failure,
  isRecordValue,
  kadkIssue,
  operationalIssue,
  readJson,
  redactSecrets,
  repoRoot,
} from './issues.ts';
import { runProcess } from './processRun.ts';

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'command failed';
}

function fromCatalog(issue: {
  code: string;
  severity: string;
  message: string;
  fix: string;
}): AdkIssue {
  return {
    code: issue.code,
    severity: issue.severity === 'warning' ? 'warning' : 'error',
    message: issue.message,
    fix: issue.fix,
    file: '',
    line: null,
  };
}

function optionalNumber(text: string): number | undefined {
  if (!text) return undefined;
  return Number(text);
}

export function initProject(
  id: string,
  dir: string,
  publisher: string,
  tier: string,
  rung: string
): CommandResult {
  if (!id) {
    return failure('init --id is required', 'Pass --id <addon-id> or --id=<addon-id>.');
  }
  const options: { publisher?: string; tier?: number; rung?: number } = {};
  if (publisher) options.publisher = publisher;
  const tierNumber = optionalNumber(tier);
  const rungNumber = optionalNumber(rung);
  if (tierNumber !== undefined) options.tier = tierNumber;
  if (rungNumber !== undefined) options.rung = rungNumber;
  try {
    return commandResult([], { dir: initAddon(id, dir, options) });
  } catch (error) {
    return failure(
      messageOf(error),
      'Fix the id, directory, publisher, tier, or rung and run init again.',
      'ADK-USAGE',
      {
        dir,
      }
    );
  }
}

export function checkProject(dir: string): CommandResult {
  try {
    const reuse = auditReuseCore(dir);
    if (reuse.report) writeReuseCoreEvidence(dir, reuse.report);
    return commandResult(
      [...checkManifestDirectory(dir), ...reuse.issues.map((issue) => fromCatalog(issue))],
      {
        manifest: path.join(dir, 'manifest.json'),
      }
    );
  } catch (error) {
    return failure(
      messageOf(error),
      'Install @kassis/addon-sdk and keep the manifest schema in the repository.',
      'ADK-USAGE'
    );
  }
}

export function conformanceProject(dir: string): CommandResult {
  const issues: AdkIssue[] = checkAddonImports(dir).map((issue) =>
    kadkIssue(issue.code, issue.file, issue.line, { file: issue.file, specifier: issue.specifier })
  );
  const migrations = path.join(dir, 'migrations');
  if (fs.existsSync(migrations)) {
    for (const name of fs.readdirSync(migrations)) {
      if (!name.endsWith('.up.sql')) continue;
      const down = name.replace(/\.up\.sql$/, '.down.sql');
      const upText = fs.readFileSync(path.join(migrations, name), 'utf8');
      if (!fs.existsSync(path.join(migrations, down)) && !upText.includes('irreversible:')) {
        issues.push(
          operationalIssue(
            'ADK-MIGRATION',
            'error',
            `${name} has no down script`,
            'Add the matching .down.sql file, or mark the up script irreversible:.',
            path.join('migrations', name),
            null
          )
        );
      }
    }
  }
  return commandResult(issues, { dir });
}

export function explainProject(code: string): CommandResult {
  if (!code)
    return failure('explain requires a KADK code', 'Pass the code: kassis-addon explain KADK-101.');
  try {
    const issue = catalogIssue(code);
    return commandResult([], {
      code: issue.code,
      severity: issue.severity,
      message: issue.message,
      fix: issue.fix,
    });
  } catch (error) {
    return failure(messageOf(error), 'Use a code from kadk-codes.json.', 'ADK-CODE');
  }
}

function readObject(file: string): object | null {
  if (!fs.existsSync(file)) return null;
  const parsed = readJson(file);
  return isRecordValue(parsed) ? parsed : null;
}

export async function syncProject(
  dir: string,
  profileId: string,
  instance: string,
  from: string
): Promise<CommandResult> {
  try {
    const profile = await loadProfile(profileId || 'addon-coding-agent', instance, from);
    if (!verifyProfileSignature(profile)) {
      return failure(
        'Profile signature is not valid',
        'Sync a signed profile, or pass --from with a file whose signature verifies.',
        'ADK-USAGE'
      );
    }
    const lock = buildProfileLock(profile);
    const lockPath = path.join(dir, '.kassis', 'agent-profile.lock.json');
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    writeAgentRuleFiles(lock, dir);
    return commandResult([], { path: lockPath });
  } catch (error) {
    return failure(messageOf(error), 'Check --profile, --instance, and --from.', 'ADK-USAGE');
  }
}

async function loadProfile(profileId: string, instance: string, from: string): Promise<object> {
  if (from) {
    const parsed = readJson(path.resolve(from));
    if (!isRecordValue(parsed)) throw new Error('--from must be a JSON object');
    return parsed;
  }
  if (instance) return downloadProfile(instance, profileId, process.env.KASSIS_ADK_TOKEN ?? '');
  return readBundledProfile(profileId);
}

export function attestProject(dir: string): CommandResult {
  const attestationPath = path.join(dir, '.kassis', 'attestation.json');
  if (fs.existsSync(attestationPath)) return commandResult([], { path: attestationPath });
  const lock = readObject(path.join(dir, '.kassis', 'agent-profile.lock.json'));
  fs.mkdirSync(path.dirname(attestationPath), { recursive: true });
  fs.writeFileSync(attestationPath, `${JSON.stringify(blankAttestation(lock), null, 2)}\n`);
  return commandResult([], { path: attestationPath });
}

export function rulesProject(dir: string): CommandResult {
  const lock = readObject(path.join(dir, '.kassis', 'agent-profile.lock.json'));
  if (!lock)
    return failure('Run sync before rules', 'Run kassis-addon sync --profile=addon-coding-agent.');
  return commandResult([], { files: writeAgentRuleFiles(lock, dir) });
}

function dedupeIssues(issues: CommandResult['issues']): CommandResult['issues'] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.code}\n${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function planProject(dir: string): CommandResult {
  const planned = auditRequirementPlan(dir);
  if (planned.mapping) writeRequirementMapping(dir, planned.mapping);
  const unmapped =
    planned.mapping && Array.isArray(planned.mapping.unmapped) ? planned.mapping.unmapped : [];
  const rawSplit = planned.mapping?.split;
  const splitSource = isRecordValue(rawSplit) ? rawSplit : {};
  const countOf = (rung: string): number => {
    const count = splitSource[rung];
    return typeof count === 'number' ? count : 0;
  };
  const split = {
    configuration: countOf('configuration'),
    'extension-point': countOf('extension-point'),
    facade: countOf('facade'),
    'own-code': countOf('own-code'),
    gap: countOf('gap'),
  };
  return {
    ok: planned.ok,
    issues: planned.issues.map((issue) => fromCatalog(issue)),
    data: {
      requirementCount:
        planned.mapping && Array.isArray(planned.mapping.requirementIds)
          ? planned.mapping.requirementIds.length
          : 0,
      unmapped,
      split,
      mappingPath: path.join(dir, '.kassis', 'evidence', 'requirement-mapping.json'),
    },
  };
}

export function requirementsProject(dir: string): CommandResult {
  const tracing = auditRequirementsTracing(dir);
  if (tracing.coverage) writeRequirementsCoverage(dir, tracing.coverage);
  const untraced = tracing.coverage && Array.isArray(tracing.coverage.untraced) ? tracing.coverage.untraced : [];
  return {
    ok: tracing.ok,
    issues: tracing.issues.map((issue) => fromCatalog(issue)),
    data: {
      mustCount:
        tracing.coverage && Array.isArray(tracing.coverage.mustIds)
          ? tracing.coverage.mustIds.length
          : 0,
      untraced,
      coveragePath: path.join(dir, '.kassis', 'evidence', 'requirements-coverage.json'),
    },
  };
}

export function budgetsProject(dir: string): CommandResult {
  const audited = auditThinAddonBudgets(dir);
  writeThinAddonBudgetsEvidence(dir, audited.evidence);
  const overages = Array.isArray(audited.evidence.overages) ? audited.evidence.overages : [];
  return {
    ok: audited.ok,
    issues: audited.issues.map((issue) => fromCatalog(issue)),
    data: {
      overageCount: overages.length,
      overages,
      evidencePath: path.join(dir, '.kassis', 'evidence', 'thin-addon-budgets.json'),
    },
  };
}

export function engineeringProject(dir: string): CommandResult {
  const audited = auditEngineeringPractice(dir);
  writeEngineeringPracticeEvidence(dir, audited.evidence);
  const failed = Object.entries(audited.checkResults)
    .filter(([, result]) => !result.ok)
    .map(([id]) => id);
  return {
    ok: audited.ok,
    issues: audited.issues.map((issue) => fromCatalog(issue)),
    data: {
      failedChecks: failed,
      evidencePath: path.join(dir, '.kassis', 'evidence', 'engineering-practice.json'),
    },
  };
}

export function packProject(dir: string, out: string): CommandResult {
  const outDir = out || path.join(dir, '.kassis', 'evidence');
  try {
    const result = packEvidence({
      lock: readObject(path.join(dir, '.kassis', 'agent-profile.lock.json')),
      attestation: readObject(path.join(dir, '.kassis', 'attestation.json')),
      outDir,
      addonDir: dir,
    });
    return {
      ok: result.ok,
      issues: result.issues.map((issue) => fromCatalog(issue)),
      data: { out: outDir },
    };
  } catch (error) {
    return failure(messageOf(error), 'Run certify before pack.', 'ADK-USAGE', { out: outDir });
  }
}

function stringField(value: object, key: string): string {
  if (!isRecordValue(value)) return '';
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function answerList(attestation: object): readonly object[] {
  if (!isRecordValue(attestation) || !Array.isArray(attestation.answers)) return [];
  return attestation.answers.filter((item) => isRecordValue(item));
}

export async function certifyProject(dir: string): Promise<CommandResult> {
  const lock = readObject(path.join(dir, '.kassis', 'agent-profile.lock.json'));
  const attestation = readObject(path.join(dir, '.kassis', 'attestation.json'));
  let checks: object | null = null;
  if (fs.existsSync(path.join(dir, 'manifest.json'))) {
    try {
      checks = recordMachineChecks(dir);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      checks = null;
    }
  }
  const tracing = auditRequirementsTracing(dir);
  if (tracing.coverage) writeRequirementsCoverage(dir, tracing.coverage);
  const planned = auditRequirementPlan(dir);
  if (planned.mapping) writeRequirementMapping(dir, planned.mapping);
  const reuse = auditReuseCore(dir);
  if (reuse.report) writeReuseCoreEvidence(dir, reuse.report);
  const budgets = auditThinAddonBudgets(dir);
  writeThinAddonBudgetsEvidence(dir, budgets.evidence);
  const engineering = auditEngineeringPractice(dir);
  writeEngineeringPracticeEvidence(dir, engineering.evidence);
  const traceIssues = tracing.issues.map((issue) => fromCatalog(issue));
  const planIssues = planned.issues.map((issue) => fromCatalog(issue));
  const reuseIssues = reuse.issues.map((issue) => fromCatalog(issue));
  const budgetIssues = budgets.issues.map((issue) => fromCatalog(issue));
  const engineeringIssues = engineering.issues.map((issue) => fromCatalog(issue));

  const result = certifyAttestation({ lock, attestation, checks });
  const data: JsonObject = {};
  const attestationIssues = result.issues.map((issue) => fromCatalog(issue));
  const mergedIssues = dedupeIssues([
    ...attestationIssues,
    ...traceIssues,
    ...planIssues,
    ...reuseIssues,
    ...budgetIssues,
    ...engineeringIssues,
  ]);
  const hasError = mergedIssues.some((issue) => issue.severity === 'error');
  if (
    !result.ok ||
    !tracing.ok ||
    !planned.ok ||
    !reuse.ok ||
    !budgets.ok ||
    !engineering.ok ||
    hasError
  ) {
    return { ok: false, issues: mergedIssues, data };
  }
  const instance = process.env.KASSIS_ADK_INSTANCE ?? '';
  const token = process.env.KASSIS_ADK_TOKEN ?? '';
  const agentId = process.env.KASSIS_ADK_AGENT_ID ?? '';
  if (instance && token && agentId && lock && attestation) {
    const submitted = await submitCertifiedRun({
      instance,
      token,
      agentId,
      profileCode: stringField(lock, 'profileId'),
      answers: answerList(attestation),
      fetchImpl: globalThis.fetch,
    });
    return { ok: true, issues: [], data: { runId: submitted.runId } };
  }
  return { ok: true, issues: mergedIssues, data };
}

export async function buildProject(
  dir: string,
  only: string,
  onLog?: LogListener
): Promise<CommandResult> {
  try {
    const outputs = await buildAddon(dir, {
      only: only || 'all',
      onLog: onLog
        ? (event) => {
            onLog(event);
          }
        : undefined,
    });
    for (const output of outputs) onLog?.({ stream: 'stdout', text: `${output}\n` });
    return commandResult([], { outputs });
  } catch (error) {
    return failure(
      messageOf(error),
      'Install the addon dependencies, then run build again.',
      'ADK-USAGE',
      {
        outputs: [],
      }
    );
  }
}

export function testProject(dir: string, onLog?: LogListener): CommandResult {
  const tests = path.join(dir, 'test');
  if (!fs.existsSync(tests)) {
    onLog?.({ stream: 'stdout', text: 'No test directory\n' });
    return commandResult([], { status: 0 });
  }
  const result = runProcess(process.execPath, ['--test'], 0, { cwd: tests });
  if (result.stdout) onLog?.({ stream: 'stdout', text: result.stdout });
  if (result.stderr) onLog?.({ stream: 'stderr', text: result.stderr });
  const status = result.status ?? 1;
  if (status === 0) return commandResult([], { status });
  return commandResult(
    [
      operationalIssue(
        'ADK-TEST',
        'error',
        'node --test failed',
        'Fix the tests in ./test and run test again.'
      ),
    ],
    { status }
  );
}

export async function signProject(
  dir: string,
  key: string,
  onLog?: LogListener
): Promise<CommandResult> {
  const manifestPath = path.join(dir, 'manifest.json');
  const manifest = readObject(manifestPath);
  const id = manifest ? stringField(manifest, 'id') : '';
  if (!id) return failure('manifest.json needs an id', 'Set id in manifest.json before sign.');
  if (!key) {
    const bundled = path.join(repoRoot(), 'tools/signing/sign-all-addons.mjs');
    if (!fs.existsSync(bundled)) {
      return failure(
        'sign --key=<path> is required outside the Kassis repository',
        'Pass --key with the publisher private key file.',
        'ADK-KEY'
      );
    }
    const result = runProcess(process.execPath, [bundled, `--only=${id}`], 120000, {
      cwd: repoRoot(),
    });
    if (result.stdout) onLog?.({ stream: 'stdout', text: result.stdout });
    if (result.stderr) onLog?.({ stream: 'stderr', text: result.stderr });
    if (result.timedOut) {
      return failure(
        'sign did not finish',
        'Run the repo signer again for this addon id.',
        'ADK-USAGE'
      );
    }
    if (result.status !== 0) {
      return failure(
        redactSecrets(result.stderr.trim() || 'sign failed'),
        'Fix the signer error and run sign again.'
      );
    }
    return commandResult([], { id });
  }
  try {
    await signManifestFile(manifestPath, path.resolve(key));
    return commandResult([], { id });
  } catch (error) {
    return failure(
      messageOf(error),
      'Pass a publisher private key that is outside the addon folder.',
      'ADK-KEY'
    );
  }
}

export async function keysProject(
  subcommand: string,
  publisher: string,
  key: string,
  out: string,
  instance: string
): Promise<CommandResult> {
  try {
    if (subcommand === 'generate') {
      if (!publisher)
        return failure('keys generate --publisher=<id> is required', 'Pass --publisher.');
      const created = generatePublisherKey(publisher);
      return commandResult([], {
        fingerprint: created.fingerprint,
        publicKey: created.publicKey,
        file: created.file,
      });
    }
    if (subcommand === 'export-public') {
      if (!key || !out) {
        return failure(
          'keys export-public --key=<path> --out=<path> is required',
          'Pass --key and --out.'
        );
      }
      exportPublicKey(path.resolve(key), path.resolve(out));
      return commandResult([], { path: path.resolve(out) });
    }
    if (subcommand === 'register') {
      if (!instance || !publisher || !key) {
        return failure(
          'keys register --instance=<url> --publisher=<id> --key=<path> is required',
          'Pass --instance, --publisher, and --key. The token is KASSIS_ADK_TOKEN.'
        );
      }
      const response = await registerPublisherKey({
        instance,
        publisher,
        keyPath: path.resolve(key),
        token: process.env.KASSIS_ADK_TOKEN ?? '',
      });
      return commandResult([], { response });
    }
    return failure(
      'keys needs generate, export-public, or register',
      'Run kassis-addon keys --help.'
    );
  } catch (error) {
    return failure(
      messageOf(error),
      'Check the publisher id, key path, and instance URL.',
      'ADK-KEY'
    );
  }
}
