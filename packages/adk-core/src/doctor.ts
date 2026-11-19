import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkAddonTierRefusals } from '@kassis/addon-testkit';
import type { AdkIssue, CommandResult, JsonObject } from './types.ts';
import { commandResult, isRecordValue, kadkIssue, operationalIssue, readJson } from './issues.ts';
import { HOST_API_VERSION, hostApiSatisfies, parseSemVer } from './hostApiRange.ts';
import { runProcess } from './processRun.ts';

const PROBE_MS = 8000;
const REGISTRY = 'https://npm.pkg.github.com';
const MIN_NODE = 20;

function nodeIssue(): AdkIssue | null {
  const version = parseSemVer(process.versions.node);
  if (version && version.major >= MIN_NODE) return null;
  return operationalIssue(
    'ADK-NODE',
    'error',
    `Node ${process.version} is older than ${MIN_NODE}.0.0.`,
    `Install Node ${MIN_NODE} or newer.`,
    '',
    null
  );
}

function registryIssue(): { issue: AdkIssue | null; user: string } {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = runProcess(npm, ['whoami', '--registry', REGISTRY], PROBE_MS);
  if (result.timedOut) {
    return {
      user: '',
      issue: operationalIssue(
        'ADK-REGISTRY',
        'warning',
        'The GitHub Packages login check did not finish.',
        `Run npm login --registry ${REGISTRY}.`,
        '',
        null
      ),
    };
  }
  const user = result.stdout.trim();
  if (result.status === 0 && /^[A-Za-z0-9-]{1,39}$/.test(user)) {
    return { user, issue: null };
  }
  return {
    user: '',
    issue: operationalIssue(
      'ADK-REGISTRY',
      'warning',
      'GitHub Packages login was not found.',
      `Run npm login --registry ${REGISTRY}. The token is not printed.`,
      '',
      null
    ),
  };
}

function signingIssue(): { issue: AdkIssue | null; count: number } {
  const dir = path.join(os.homedir(), '.kassis', 'keys');
  const count = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((name) => name.endsWith('.key')).length
    : 0;
  if (count > 0) return { count, issue: null };
  return {
    count: 0,
    issue: operationalIssue(
      'ADK-KEY',
      'warning',
      'No publisher signing key is in ~/.kassis/keys.',
      'Run kassis-addon keys generate --publisher=<id>. The private key stays in that folder.',
      '',
      null
    ),
  };
}

async function instanceIssue(): Promise<{
  issue: AdkIssue | null;
  url: string;
  reachable: boolean;
}> {
  const url = (process.env.KASSIS_ADK_INSTANCE ?? '').trim();
  if (!url) {
    return {
      url: '',
      reachable: false,
      issue: operationalIssue(
        'ADK-INSTANCE',
        'warning',
        'KASSIS_ADK_INSTANCE is not set.',
        'Set it to the dev host URL when you want doctor to check reachability. No token is sent or printed.',
        '',
        null
      ),
    };
  }
  let target: URL;
  try {
    target = new URL('/api/v1/adk/version', url);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    return {
      url: '',
      reachable: false,
      issue: operationalIssue(
        'ADK-INSTANCE',
        'error',
        'KASSIS_ADK_INSTANCE is not a URL.',
        'Set an http or https URL.',
        '',
        null
      ),
    };
  }
  try {
    target.username = '';
    target.password = '';
    const response = await fetch(target, { signal: AbortSignal.timeout(3000) });
    const origin = target.origin;
    if (!response.ok) {
      return {
        url: origin,
        reachable: false,
        issue: operationalIssue(
          'ADK-INSTANCE',
          'error',
          `The instance at ${origin} returned ${response.status}.`,
          'Start the dev host or point KASSIS_ADK_INSTANCE at a reachable instance.',
          '',
          null
        ),
      };
    }
    return { url: origin, reachable: true, issue: null };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      url: target.origin,
      reachable: false,
      issue: operationalIssue(
        'ADK-INSTANCE',
        'error',
        `The instance at ${target.origin} is not reachable.`,
        'Start the dev host. doctor stopped after 3 seconds and did not print a token.',
        '',
        null
      ),
    };
  }
}

function hostApiIssue(dir: string): { issue: AdkIssue | null; range: string; compatible: boolean } {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return { issue: null, range: '', compatible: true };
  let range = '';
  try {
    const parsed = readJson(file);
    if (isRecordValue(parsed) && typeof parsed.hostApi === 'string') range = parsed.hostApi;
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
    return {
      range: '',
      compatible: false,
      issue: kadkIssue('KADK-101', 'manifest.json', null, {
        path: 'manifest.json',
        detail: 'is not valid JSON',
      }),
    };
  }
  if (!range) return { issue: null, range: '', compatible: true };
  const version = parseSemVer(HOST_API_VERSION);
  if (!version || !hostApiSatisfies(range, version)) {
    return {
      range,
      compatible: false,
      issue: kadkIssue('KADK-119', 'manifest.json', null, { range, hostVersion: HOST_API_VERSION }),
    };
  }
  return { issue: null, range, compatible: true };
}

function addonTier(dir: string): { tier: 1 | 2; addonId: string } {
  const file = path.join(dir, 'manifest.json');
  if (!fs.existsSync(file)) return { tier: 2, addonId: '' };
  try {
    const parsed = readJson(file);
    if (!isRecordValue(parsed)) return { tier: 2, addonId: '' };
    const tier = parsed.tier === 1 ? 1 : 2;
    const addonId = typeof parsed.id === 'string' ? parsed.id : '';
    return { tier, addonId };
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof Error)) throw error;
    return { tier: 2, addonId: '' };
  }
}

function tierRefusalIssuesFromScanned(
  scanned: ReturnType<typeof checkAddonTierRefusals>,
  tier: 1 | 2,
  addonId: string
): AdkIssue[] {
  return scanned.map((issue) =>
    kadkIssue(issue.code, issue.file, issue.line, {
      file: issue.file,
      method: issue.method,
      tier: String(tier),
      id: addonId,
    })
  );
}

export interface DoctorProjectOptions {
  readonly requirements?: boolean;
}

/** Local setup checks. Registry output is a username or empty, never a token. */
export async function doctorProject(
  dir: string,
  options: DoctorProjectOptions = {}
): Promise<CommandResult> {
  const node = nodeIssue();
  const registry = registryIssue();
  const signing = signingIssue();
  const instance = await instanceIssue();
  const hostApi = hostApiIssue(dir);
  const manifest = addonTier(dir);
  const setupIssues = [node, registry.issue, signing.issue, instance.issue, hostApi.issue].filter(
    (issue): issue is AdkIssue => issue !== null
  );
  const scannedRefusals = options.requirements
    ? checkAddonTierRefusals(dir, manifest.tier)
    : [];
  const refusalIssues = tierRefusalIssuesFromScanned(
    scannedRefusals,
    manifest.tier,
    manifest.addonId
  );
  const issues = [...setupIssues, ...refusalIssues];
  const refusalsPayload: JsonObject[] = scannedRefusals.map((issue) => ({
    code: issue.code,
    file: issue.file,
    line: issue.line,
    method: issue.method,
  }));
  const data: JsonObject = {
    nodeVersion: process.version,
    nodeOk: node === null,
    registryUser: registry.user,
    registryOk: registry.issue === null,
    signingKeys: signing.count,
    instanceUrl: instance.url,
    instanceReachable: instance.reachable,
    hostApiVersion: HOST_API_VERSION,
    hostApiRange: hostApi.range,
    hostApiCompatible: hostApi.compatible,
    addonTier: manifest.tier,
    tierRefusals: refusalIssues.length,
    ...(options.requirements
      ? { requirementsScan: true, refusals: refusalsPayload }
      : {}),
  };
  return commandResult(issues, data);
}
