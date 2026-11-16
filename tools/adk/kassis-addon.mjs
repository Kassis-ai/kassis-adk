#!/usr/bin/env node
/**
 * kassis-addon command line. Argument parsing and printing live here.
 * Command work is in @kassis/adk-core, which does not print or exit.
 */
import { parseArgs } from 'node:util';
import { cliVersion } from '../../packages/adk-core/src/issues.ts';
import { runCommand } from '../../packages/adk-core/src/runCommand.ts';
const COMMANDS = [
  'init',
  'build',
  'check',
  'conformance',
  'test',
  'dev',
  'migrate',
  'doctor',
  'requirements',
  'plan',
  'budgets',
  'engineering',
  'pack',
  'package',
  'sbom',
  'deploy',
  'status',
  'sign',
  'keys',
  'certify',
  'attest',
  'explain',
  'sync',
  'rules',
  'scaffold',
];

const HELP = {
  '': `Usage: kassis-addon <command> [flags]

Commands:
  init          Copy the addon template
  build         Bundle the server and, when present, the UI
  check         Validate manifest.json
  conformance   Import check and migration down scripts
  test          Run node --test in ./test
  dev           Start a configured local dev host
  migrate       up, down, status or claim on the dev host database
  doctor        Check Node, registry auth, keys, instance, and hostApi
  requirements  Trace Must rows in REQUIREMENTS.md to test/ or GAPS.md
  plan          Map each requirement to a rung in PLAN.md
  budgets       Soft thin-addon budgets with BUDGETS.md reasons
  engineering   Timeouts, pagination, i18n, idempotent handlers, no module state
  pack          Write an evidence pack
  package       Write a signed .addon zip
  sbom          Write sbom.json for this addon
  deploy        Upload a .addon and print the approval request id
  status        Print installed and pending versions
  sign          Sign the manifest
  keys          generate, export-public, or register
  certify       Attestation gate
  attest        Write a blank attestation
  explain       Explain a KADK code
  sync          Pin an agent profile
  rules         Rewrite rule files from the lock
  scaffold      Add a route, capability, event, job, migration, or UI slot

Flags:
  --help        Show help and exit 0
  --version     Print the CLI version and exit 0
  --json        Print { ok, issues, data }

Run kassis-addon <command> --help for that command.
`,
  init: `Usage: kassis-addon init --id <addon-id> [--dir <path>] [--publisher <id>] [--tier 1|2] [--rung 1|2|3] [--json]

--id is required. --id value and --id=value both work. Publisher defaults to kassis, tier to 2, rung to 1.
`,
  build: `Usage: kassis-addon build [--only server|ui|all] [--json]

Writes dist/server/index.js and, when src/ui/index.ts exists, frontend/dist/index.js.
`,
  check: `Usage: kassis-addon check [--json]

Validates manifest.json. Schema errors use KADK-1xx codes. A permission outside the addon id uses KADK-110. A banned dependency is KADK-221. A private approval, notification, audit, user, or role table is KADK-310 unless REUSE.md explains it (KADK-311). An owned table with no database.tableNotes warns as KADK-312. Writes .kassis/evidence/reuse-core.json. process.packs and process/*.json are checked offline (keys, references, permissions, record types). A kind with no host schema warns KADK-313 and does not check the body. A manifest v2 record access check that returns true or only throws is KADK-730. An empty or throw-only deletion handler is KADK-732. A missing handler is KADK-729 or KADK-731. Writes .kassis/evidence/mandatory-contract.json.
`,
  conformance: `Usage: kassis-addon conformance [--json]

Runs the addon-testkit import check and rejects an up script with no down script.
`,
  test: `Usage: kassis-addon test [--json]

Runs node --test in ./test. Prints "No test directory" and exits 0 when that folder is missing.
`,
  dev: `Usage: kassis-addon dev [--image <name>] [--json]

Starts Docker or Podman. The image is --image, then KASSIS_DEVHOST_IMAGE, then ~/.kassis/devhost.json, then ghcr.io/kassis-ai/kassis-devhost:latest. Pulls the image when it is not already local. Does not build an image. The container publishes on 127.0.0.1. Also starts a tier 2 runner on an internal network. Neither container receives a Docker socket.
`,
  migrate: `Usage: kassis-addon migrate <up|down|status|claim> [--target <url>] [--json]

Applies migrations only to the database inside the dev host started by kassis-addon dev. Refuses when no dev host is running, and refuses any other target.
History is kept per addon id (manifest.json). Each script runs in one transaction with its history row, so a failure keeps nothing. A script edited after it was applied stops up and down.
claim assigns history rows written by an older ADK (no addon id) to this addon, for its own script names.
`,
  doctor: `Usage: kassis-addon doctor [--requirements] [--json]

Checks the Node version, GitHub Packages login (the token is not printed), signing key files, instance reachability, and manifest hostApi against HOST_API_VERSION. With --requirements, scans addon source for ctx facade calls that the manifest tier cannot use (tier-matrix.json).
`,
  plan: `Usage: kassis-addon plan [--json]

Reads every FR-* and NFR-* row in REQUIREMENTS.md and requires a rung in PLAN.md: configuration, extension-point, facade, own-code, or gap. Writes .kassis/evidence/requirement-mapping.json with the rung split. Certify fails when PLAN.md is missing (KADK-720), a row has no rung (KADK-721), or a rung is not one of those five (KADK-722).
`,
  requirements: `Usage: kassis-addon requirements [--json]

Parses Must rows in REQUIREMENTS.md and requires each id in test/ or GAPS.md. Writes .kassis/evidence/requirements-coverage.json. Certify fails when a Must id is untraced (KADK-719).
`,
  budgets: `Usage: kassis-addon budgets [--json]

Counts owned tables, routes.mount calls, production dependencies and server source bytes against soft limits. Over a limit needs a BUDGETS.md reason row (metric | count | limit | reason). Writes .kassis/evidence/thin-addon-budgets.json. Certify fails with KADK-723 when a reason is missing.
`,
  engineering: `Usage: kassis-addon engineering [--json]

Scans addon source for outbound calls without timeouts (KADK-724), findMany without take/skip (KADK-725), UI chrome outside i18n or i18next imports (KADK-726), non-idempotent job/event handlers (KADK-727), and module-level let/var state (KADK-728). Writes .kassis/evidence/engineering-practice.json. Certify runs the same gate.
`,
  pack: `Usage: kassis-addon pack [--out <dir>] [--json]
`,
  sbom: `Usage: kassis-addon sbom [--json]

Writes sbom.json for the libraries this addon ships.
`,
  package: `Usage: kassis-addon package [--out <path>] [--json]

Writes <id>-<version>.addon beside the addon folder. The zip holds the signed manifest.json, the files in the content-hash scope, the certify evidence pack (checks.json, attestation.json, and agent-profile.lock.json), frontend/dist when that folder exists, and sbom.json. package writes sbom.json when it is missing or older than the server build. Refuses a manifest with no signature or no contentHash, and refuses a folder whose certify checks did not all exit 0. Does not sign and does not call the network. Sign after sbom.json changes.
`,
  deploy: `Usage: kassis-addon deploy [--instance <url>] [<file.addon>] [--json]

Uploads the .addon to POST /api/v1/addon-security/deploy and prints the approval request id. --instance <url> and --instance=<url> both work. Token: KASSIS_ADK_TOKEN. The same command works from a jump host that only has the .addon file.
`,
  status: `Usage: kassis-addon status --instance <url> [--json]

Prints installed and pending versions from GET /api/v1/platform/addons/installations. Token: KASSIS_ADK_TOKEN. The response is the addon id, active version, publisher, and pending versions.
`,
  sign: `Usage: kassis-addon sign [--key <path>] [--json]

Inside this repository, omit --key to use the repo signer. Outside it, --key is required.
`,
  keys: `Usage: kassis-addon keys <generate|export-public|register> [--publisher <id>] [--key <path>] [--out <path>] [--instance <url>] [--json]
`,
  certify: `Usage: kassis-addon certify [--json]

Runs check, conformance, build, and test, then records adk.requirements-traced, adk.requirement-plan-mapped, adk.attest-pinned-profile, and adk.mandatory-contract-intact before the attestation gate. A fresh record-type scaffold fails that check until canAccess and onDelete are filled in. --json prints { ok, issues, data }.
`,
  attest: `Usage: kassis-addon attest [--json]

Writes .kassis/attestation.json with null outcomes when it is missing.
`,
  explain: `Usage: kassis-addon explain <KADK-code> [--json]
`,
  sync: `Usage: kassis-addon sync [--profile <id>] [--instance <url>] [--from <file>] [--json]
`,
  rules: `Usage: kassis-addon rules [--json]
`,
  scaffold: `Usage: kassis-addon scaffold --kind <addon|route|capability|event|job|migration|ui-slot|ui-page|mcp-tool|record-type> [--id <addon-id>] [--name <kebab>] [--dir <path>] [--json]
`,
};

function helpText(command) {
  return HELP[command] ?? HELP[''];
}

function textValue(values, name) {
  const value = values[name];
  return typeof value === 'string' ? value : '';
}

function printIssues(issues) {
  for (const issue of issues) {
    process.stderr.write(`${issue.code} ${issue.message}\n`);
    if (issue.fix) process.stderr.write(`  ${issue.fix}\n`);
  }
}

function printStatus(installations) {
  if (!Array.isArray(installations) || installations.length === 0) {
    process.stdout.write('No installations\n');
    return;
  }
  for (const row of installations) {
    if (!row || typeof row !== 'object') continue;
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id) continue;
    const version = typeof row.activeVersion === 'string' ? row.activeVersion : '-';
    const publisher = typeof row.publisher === 'string' ? row.publisher : '-';
    process.stdout.write(`${id} ${version} ${publisher}\n`);
    if (!Array.isArray(row.pendingVersions)) continue;
    for (const pending of row.pendingVersions) {
      if (typeof pending === 'string') process.stdout.write(`pending ${pending}\n`);
    }
  }
}

function printLines(value) {
  if (!Array.isArray(value)) return;
  for (const line of value) {
    if (typeof line === 'string') process.stdout.write(`${line}\n`);
  }
}

function printSuccess(command, data) {
  if (command === 'init' && typeof data.dir === 'string') process.stdout.write(`${data.dir}\n`);
  if (
    (command === 'attest' || command === 'sync' || command === 'keys') &&
    typeof data.path === 'string'
  ) {
    process.stdout.write(`${data.path}\n`);
  }
  if (command === 'pack' && typeof data.out === 'string') process.stdout.write(`${data.out}\n`);
  if (command === 'package' && typeof data.path === 'string' && typeof data.sha256 === 'string') {
    process.stdout.write(`${data.path}\n${data.sha256}\n`);
  }
  if (command === 'deploy' && typeof data.requestId === 'string')
    process.stdout.write(`${data.requestId}\n`);
  if (command === 'status') printStatus(data.installations);
  if (command === 'rules') printLines(data.files);
  if (command === 'keys' && typeof data.fingerprint === 'string') {
    process.stdout.write(`${data.fingerprint}\n${data.publicKey}\n${data.file}\n`);
  }
  if (command === 'keys' && typeof data.response === 'string')
    process.stdout.write(`${data.response}\n`);
  if (command === 'explain') process.stdout.write(`${data.message}\n${data.fix}\n`);
  if (command === 'certify' && typeof data.runId === 'string')
    process.stdout.write(`${data.runId}\n`);
  if (command === 'plan' && typeof data.requirementCount === 'number') {
    const unmapped = Array.isArray(data.unmapped) ? data.unmapped : [];
    process.stdout.write(`Requirements ${data.requirementCount} unmapped ${unmapped.length}\n`);
    for (const id of unmapped) process.stdout.write(`unmapped ${id}\n`);
    const split = data.split && typeof data.split === 'object' ? data.split : {};
    const parts = ['configuration', 'extension-point', 'facade', 'own-code', 'gap'].map(
      (rung) => `${rung}=${typeof split[rung] === 'number' ? split[rung] : 0}`
    );
    process.stdout.write(`split ${parts.join(' ')}\n`);
  }
  if (command === 'requirements' && typeof data.mustCount === 'number') {
    const untraced = Array.isArray(data.untraced) ? data.untraced : [];
    process.stdout.write(`Must ${data.mustCount} untraced ${untraced.length}\n`);
    for (const id of untraced) process.stdout.write(`untraced ${id}\n`);
  }
  if (command === 'budgets' && typeof data.overageCount === 'number') {
    process.stdout.write(`Overages ${data.overageCount}\n`);
    const overages = Array.isArray(data.overages) ? data.overages : [];
    for (const row of overages) {
      if (!row || typeof row !== 'object') continue;
      const metric = typeof row.metric === 'string' ? row.metric : '?';
      const count = typeof row.count === 'number' ? row.count : '?';
      const limit = typeof row.limit === 'number' ? row.limit : '?';
      const reason = typeof row.reason === 'string' ? row.reason : '(no reason)';
      process.stdout.write(`${metric} ${count}/${limit} ${reason}\n`);
    }
  }
  if (command === 'engineering' && Array.isArray(data.failedChecks)) {
    process.stdout.write(`Failed ${data.failedChecks.length}\n`);
    for (const id of data.failedChecks) process.stdout.write(`${id}\n`);
  }
  if (command === 'doctor') {
    process.stdout.write(`Node ${data.nodeVersion}\n`);
    process.stdout.write(
      data.registryOk ? `Registry ${data.registryUser}\n` : 'Registry not logged in\n'
    );
    process.stdout.write(`Signing keys ${data.signingKeys}\n`);
    process.stdout.write(
      data.instanceReachable ? `Instance ${data.instanceUrl}\n` : 'Instance not reachable\n'
    );
    const range = data.hostApiRange ? data.hostApiRange : '(no manifest)';
    process.stdout.write(`hostApi ${data.hostApiVersion} ${range}\n`);
    if (data.requirementsScan === true) {
      process.stdout.write(
        `tier ${data.addonTier} refusals ${typeof data.tierRefusals === 'number' ? data.tierRefusals : 0}\n`
      );
    }
  }
  if (command === 'migrate') {
    printLines(data.lines);
    printLines(data.applied);
    printLines(data.problems);
    printLines(
      Array.isArray(data.claimed) ? data.claimed.map((name) => `claimed ${name}`) : undefined
    );
    if (typeof data.reverted === 'string') {
      process.stdout.write(data.reverted ? `reverted ${data.reverted}\n` : 'Nothing to revert\n');
    }
  }
}

try {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      json: { type: 'boolean' },
      requirements: { type: 'boolean' },
      id: { type: 'string' },
      dir: { type: 'string' },
      publisher: { type: 'string' },
      tier: { type: 'string' },
      rung: { type: 'string' },
      only: { type: 'string' },
      out: { type: 'string' },
      key: { type: 'string' },
      from: { type: 'string' },
      profile: { type: 'string' },
      instance: { type: 'string' },
      image: { type: 'string' },
      target: { type: 'string' },
      name: { type: 'string' },
      kind: { type: 'string' },
    },
  });

  const command = parsed.positionals[0] ?? '';
  if (parsed.values.help) {
    process.stdout.write(helpText(command));
    process.exit(0);
  }
  if (parsed.values.version) {
    process.stdout.write(`kassis-addon ${cliVersion()}\n`);
    process.exit(0);
  }
  if (!COMMANDS.includes(command)) {
    process.stderr.write(helpText(''));
    process.exit(1);
  }

  const json = parsed.values.json === true;
  const result = await runCommand({
    command,
    subcommand: parsed.positionals[1] ?? '',
    positional: parsed.positionals[1] ?? '',
    cwd: process.cwd(),
    imageFlag: typeof parsed.values.image === 'string' ? parsed.values.image : undefined,
    followLogs: command === 'dev' && !json,
    requirements: parsed.values.requirements === true,
    onLog: json
      ? undefined
      : (event) => {
          const stream = event.stream === 'stderr' ? process.stderr : process.stdout;
          stream.write(event.text);
        },
    flags: {
      id: textValue(parsed.values, 'id'),
      dir: textValue(parsed.values, 'dir'),
      publisher: textValue(parsed.values, 'publisher'),
      tier: textValue(parsed.values, 'tier'),
      rung: textValue(parsed.values, 'rung'),
      only: textValue(parsed.values, 'only'),
      out: textValue(parsed.values, 'out'),
      key: textValue(parsed.values, 'key'),
      from: textValue(parsed.values, 'from'),
      profile: textValue(parsed.values, 'profile'),
      instance: textValue(parsed.values, 'instance'),
      target: textValue(parsed.values, 'target'),
      name: textValue(parsed.values, 'name'),
      kind: textValue(parsed.values, 'kind'),
    },
  });

  if (json) {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (command === 'certify' && typeof result.data.runId === 'string' && result.data.runId) {
      process.stdout.write(`${result.data.runId}\n`);
    }
  } else {
    if (!result.ok) printIssues(result.issues);
    else printSuccess(command, result.data);
  }
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  const message = error instanceof Error ? error.message : 'command failed';
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
