#!/usr/bin/env node
/**
 * kassis-addon command line. Argument parsing and printing live here.
 * Command work is in @kassis/adk-core, which does not print or exit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const COMMANDS = [
  'init',
  'build',
  'check',
  'conformance',
  'test',
  'dev',
  'migrate',
  'doctor',
  'pack',
  'package',
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
  migrate       up, down, or status on the dev host database
  doctor        Check Node, registry auth, keys, instance, and hostApi
  pack          Write an evidence pack
  package       Write a signed .addon zip
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

Validates manifest.json. Schema errors use KADK-1xx codes. A permission outside the addon id uses KADK-110.
`,
  conformance: `Usage: kassis-addon conformance [--json]

Runs the addon-testkit import check and rejects an up script with no down script.
`,
  test: `Usage: kassis-addon test [--json]

Runs node --test in ./test. Prints "No test directory" and exits 0 when that folder is missing.
`,
  dev: `Usage: kassis-addon dev [--image <name>] [--json]

Starts Docker or Podman only when an image is already configured (flag, KASSIS_DEVHOST_IMAGE, or ~/.kassis/devhost.json) and already present locally. Does not build or pull an image. Does not add a publisher to the trust store. If the runtime or the image is missing, exits with an issue instead of waiting.
`,
  migrate: `Usage: kassis-addon migrate <up|down|status> [--target <url>] [--json]

Applies migrations only to the database inside the dev host started by kassis-addon dev. Refuses when no dev host is running, and refuses any other target.
`,
  doctor: `Usage: kassis-addon doctor [--json]

Checks the Node version, GitHub Packages login (the token is not printed), signing key files, instance reachability, and manifest hostApi against HOST_API_VERSION.
`,
  pack: `Usage: kassis-addon pack [--out <dir>] [--json]
`,
  package: `Usage: kassis-addon package [--out <path>] [--json]

Writes <id>-<version>.addon beside the addon folder. The zip holds the signed manifest.json, the files in the content-hash scope, evidence/ when that folder exists, and sbom.json from package-sbom.mjs. Refuses a manifest with no signature or no contentHash. Does not sign and does not call the network. sbom.json is inside the content hash, so generate it and sign before package.
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

Runs check, conformance, build, and test, then the attestation gate. --json prints { ok, issues, data }.
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
  scaffold: `Usage: kassis-addon scaffold --kind <addon|route|capability|event|job|migration|ui-slot> [--id <addon-id>] [--name <kebab>] [--dir <path>] [--json]
`,
};

function cliVersion() {
  const file = path.resolve(here, '../../packages/addon-cli/package.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return typeof parsed.version === 'string' ? parsed.version : '0.0.0';
}

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
  if ((command === 'attest' || command === 'sync' || command === 'keys') && typeof data.path === 'string') {
    process.stdout.write(`${data.path}\n`);
  }
  if (command === 'pack' && typeof data.out === 'string') process.stdout.write(`${data.out}\n`);
  if (command === 'package' && typeof data.path === 'string' && typeof data.sha256 === 'string') {
    process.stdout.write(`${data.path}\n${data.sha256}\n`);
  }
  if (command === 'deploy' && typeof data.requestId === 'string') process.stdout.write(`${data.requestId}\n`);
  if (command === 'status') printStatus(data.installations);
  if (command === 'rules') printLines(data.files);
  if (command === 'keys' && typeof data.fingerprint === 'string') {
    process.stdout.write(`${data.fingerprint}\n${data.publicKey}\n${data.file}\n`);
  }
  if (command === 'keys' && typeof data.response === 'string') process.stdout.write(`${data.response}\n`);
  if (command === 'explain') process.stdout.write(`${data.message}\n${data.fix}\n`);
  if (command === 'certify' && typeof data.runId === 'string') process.stdout.write(`${data.runId}\n`);
  if (command === 'doctor') {
    process.stdout.write(`Node ${data.nodeVersion}\n`);
    process.stdout.write(data.registryOk ? `Registry ${data.registryUser}\n` : 'Registry not logged in\n');
    process.stdout.write(`Signing keys ${data.signingKeys}\n`);
    process.stdout.write(data.instanceReachable ? `Instance ${data.instanceUrl}\n` : 'Instance not reachable\n');
    const range = data.hostApiRange ? data.hostApiRange : '(no manifest)';
    process.stdout.write(`hostApi ${data.hostApiVersion} ${range}\n`);
  }
  if (command === 'migrate') {
    printLines(data.lines);
    printLines(data.applied);
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

const { runCommand } = await import('../../packages/adk-core/src/runCommand.ts');
const json = parsed.values.json === true;
const result = await runCommand({
  command,
  subcommand: parsed.positionals[1] ?? '',
  positional: parsed.positionals[1] ?? '',
  cwd: process.cwd(),
  imageFlag: typeof parsed.values.image === 'string' ? parsed.values.image : undefined,
  followLogs: command === 'dev' && !json,
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
