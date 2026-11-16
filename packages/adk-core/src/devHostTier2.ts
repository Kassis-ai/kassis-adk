import { runProcess, type ProcessOutput } from './processRun.ts';

const PROBE_MS = 8000;
const RPC_PORT = '7400';
const EGRESS_PORT = '7401';

/** Docker or Podman arguments for the pre-started runner. No socket is mounted. */
export type DevHostTier2Plan = {
  readonly network: string;
  readonly runnerName: string;
  readonly networkCreateArgs: readonly string[];
  readonly runnerArgs: readonly string[];
  readonly backendEnvArgs: readonly string[];
};

function slug(addonId: string): string {
  const cleaned = addonId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = cleaned.length > 0 ? cleaned : 'addon';
  return base.slice(0, 40);
}

function failed(result: ProcessOutput): boolean {
  return result.timedOut || result.status !== 0;
}

/**
 * One internal network and one generic runner container for this addon.
 * The backend joins that network afterwards and is the only RPC peer.
 */
export function devHostTier2Plan(
  addonId: string,
  image: string,
  addonDir: string,
  mountPath: string
): DevHostTier2Plan {
  const id = slug(addonId);
  const network = `kassis-tier2-${id}`;
  const runnerName = `kassis-tier2-runner-${id}`;
  const backendName = `kassis-devhost-${id}`;
  return {
    network,
    runnerName,
    networkCreateArgs: ['network', 'create', '--internal', network],
    runnerArgs: [
      'run',
      '-d',
      '--name',
      runnerName,
      '--network',
      network,
      '--entrypoint',
      'node',
      '-v',
      `${addonDir}:${mountPath}:ro`,
      '-e',
      'KASSIS_TIER2_RPC_HOST=0.0.0.0',
      '-e',
      `KASSIS_TIER2_RPC_PORT=${RPC_PORT}`,
      image,
      'core/addon-platform/tier2/tier2ContainerAgent.mjs',
    ],
    backendEnvArgs: [
      '--env',
      `KASSIS_TIER2_CONTAINER_RUNNERS=${runnerName}:${RPC_PORT}`,
      '--env',
      'KASSIS_TIER2_EGRESS_BIND=0.0.0.0',
      '--env',
      `KASSIS_TIER2_EGRESS_PORT=${EGRESS_PORT}`,
      '--env',
      `KASSIS_TIER2_EGRESS_ADVERTISE_HOST=${backendName}`,
    ],
  };
}

/** Removes a previous runner so `dev` can start again. Failures are ignored. */
export function removeDevHostTier2(runtime: string, plan: DevHostTier2Plan): void {
  runProcess(runtime, ['rm', '-f', plan.runnerName], PROBE_MS);
  runProcess(runtime, ['network', 'rm', plan.network], PROBE_MS);
}

/** Creates the internal network and starts the runner. The backend is not started here. */
export function startDevHostTier2Runner(
  runtime: string,
  plan: DevHostTier2Plan
): { ok: true } | { ok: false; message: string } {
  removeDevHostTier2(runtime, plan);
  const created = runProcess(runtime, plan.networkCreateArgs, PROBE_MS);
  if (failed(created)) return { ok: false, message: 'The tier 2 runner network was not created.' };
  const started = runProcess(runtime, plan.runnerArgs, PROBE_MS);
  if (failed(started)) {
    removeDevHostTier2(runtime, plan);
    return { ok: false, message: 'The tier 2 runner container was not started.' };
  }
  return { ok: true };
}

/** Attaches the backend container to the runner network. No port is published. */
export function connectDevHostTier2(
  runtime: string,
  plan: DevHostTier2Plan,
  containerId: string
): { ok: true } | { ok: false; message: string } {
  const connected = runProcess(
    runtime,
    ['network', 'connect', plan.network, containerId],
    PROBE_MS
  );
  if (failed(connected)) {
    return { ok: false, message: 'The dev host did not join the tier 2 runner network.' };
  }
  return { ok: true };
}
