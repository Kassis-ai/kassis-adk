/**
 * Local half of `kassis adk sync`. The published-profile download needs a
 * reachable Kassis instance; this pins a profile document the caller already has.
 * `pack` writes the evidence pack from framework section 7.4.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalJsonStringify } from './canonicalJson.mjs';
import { cliPackageVersion, recordMachineChecks } from './certifyChecks.mjs';
import { certifyAttestation } from './certifyAttestation.mjs';
import { diffManifestSurface } from './evidenceSummary.mjs';

export function buildProfileLock(profile) {
  if (!profile || typeof profile !== 'object') {
    throw new Error('A profile document is required');
  }
  const version = profile.version;
  const guardrails = profile.guardrails;
  if (typeof version !== 'string' || version.length === 0 || !Array.isArray(guardrails)) {
    throw new Error('Profile needs a version and a guardrails array');
  }
  const body = {
    profileId: typeof profile.profileId === 'string' ? profile.profileId : 'addon-coding-agent',
    version,
    guardrails,
  };
  if (Array.isArray(profile.skills)) {
    body.skills = profile.skills;
  }
  const hash = createHash('sha256').update(canonicalJsonStringify(body)).digest('hex');
  return { ...body, hash };
}

/**
 * A new attestation. Outcomes are null so certify fails until each one is answered.
 *
 * @param {object | null | undefined} lock
 */
export function blankAttestation(lock) {
  const guardrails = lock && Array.isArray(lock.guardrails) ? lock.guardrails : [];
  return {
    version: lock && typeof lock.version === 'string' ? lock.version : '',
    lockHash: lock && typeof lock.hash === 'string' ? lock.hash : '',
    runId: '',
    answers: guardrails.map((item) => ({
      key: item.key,
      outcome: null,
      note: null,
      evidence: null,
    })),
  };
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function textValue(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function changeSummaryFrom(source) {
  const record = source && typeof source === 'object' ? source : {};
  return {
    reference: textValue(record.reference),
    rung: textValue(record.rung),
    why: textValue(record.why),
    summary: textValue(record.summary),
  };
}

function readChangeSummary(addonDir, attestation) {
  const file = addonDir ? readJson(path.join(addonDir, '.kassis', 'change-summary.json')) : null;
  const embedded =
    attestation && typeof attestation.changeSummary === 'object' ? attestation.changeSummary : null;
  return changeSummaryFrom(file ?? embedded);
}

function migrationReport(addonDir) {
  if (!addonDir) return [];
  const dir = path.join(addonDir, 'migrations');
  if (!fs.existsSync(dir)) return [];
  const reports = [];
  for (const name of fs
    .readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()) {
    if (name.endsWith('.down.sql')) continue;
    if (!name.endsWith('.up.sql')) {
      reports.push({ name, up: 'present', down: 'unknown' });
      continue;
    }
    const down = name.replace(/\.up\.sql$/, '.down.sql');
    const upText = fs.readFileSync(path.join(dir, name), 'utf8');
    const hasDown = fs.existsSync(path.join(dir, down));
    const downStatus = hasDown
      ? 'present'
      : upText.includes('irreversible:')
        ? 'irreversible'
        : 'missing';
    reports.push({ name, up: 'present', down: downStatus });
  }
  return reports;
}

function addonSbom(addonDir) {
  const pkg = addonDir ? readJson(path.join(addonDir, 'package.json')) : null;
  const dependencies =
    pkg && typeof pkg.dependencies === 'object' && pkg.dependencies ? pkg.dependencies : {};
  const devDependencies =
    pkg && typeof pkg.devDependencies === 'object' && pkg.devDependencies
      ? pkg.devDependencies
      : {};
  const declared = { ...dependencies, ...devDependencies };
  const components = Object.keys(declared)
    .sort()
    .map((name) => ({
      type: 'library',
      name,
      version: String(declared[name]),
      purl: `pkg:npm/${name}@${declared[name]}`,
    }));
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: {
      component: {
        type: 'application',
        name: pkg && typeof pkg.name === 'string' ? pkg.name : 'addon',
        version: pkg && typeof pkg.version === 'string' ? pkg.version : '0.0.0',
      },
    },
    components,
  };
}

function signerFingerprint(manifest) {
  const signing = manifest && typeof manifest.signing === 'object' ? manifest.signing : null;
  return signing && typeof signing.keyId === 'string' ? signing.keyId : null;
}

function checkRow(checks, id) {
  const rows = checks && Array.isArray(checks.checks) ? checks.checks : [];
  const found = rows.find((item) => item && item.id === id);
  if (!found) return null;
  return {
    id: found.id,
    inputHash: found.inputHash,
    exitCode: found.exitCode,
    durationMs: found.durationMs,
    outputDigest: found.outputDigest,
  };
}

function listDiffLines(title, diff) {
  const added = diff.added.length > 0 ? diff.added.join(', ') : 'none';
  const removed = diff.removed.length > 0 ? diff.removed.join(', ') : 'none';
  return [`### ${title}`, '', `- Added: ${added}`, `- Removed: ${removed}`, ''];
}

function renderEvidenceReadme(index) {
  const summary = index.changeSummary;
  const tierFrom =
    index.manifestDiff.tier.from === null ? 'none' : String(index.manifestDiff.tier.from);
  const tierTo = index.manifestDiff.tier.to === null ? 'none' : String(index.manifestDiff.tier.to);
  const lines = [
    '# Evidence pack',
    '',
    '## Change summary',
    '',
    `- Reference: ${summary.reference ?? 'none'}`,
    `- Rung: ${summary.rung ?? 'none'}`,
    `- Why: ${summary.why ?? 'none'}`,
    `- Summary: ${summary.summary ?? 'none'}`,
    '',
    '## Manifest diff',
    '',
    `- Tier: ${tierFrom} to ${tierTo}`,
    '',
    ...listDiffLines('Permissions', index.manifestDiff.permissions),
    ...listDiffLines('Egress hosts', index.manifestDiff.egressHosts),
    ...listDiffLines('Events', index.manifestDiff.events),
    ...listDiffLines('Capabilities', index.manifestDiff.capabilities),
    ...listDiffLines('Data access', index.manifestDiff.dataAccess),
    '## Migrations',
    '',
  ];
  if (index.migrations.length === 0) lines.push('No migrations.', '');
  else {
    for (const migration of index.migrations) {
      lines.push(`- ${migration.name}: up ${migration.up}, down ${migration.down}`);
    }
    lines.push('');
  }
  const testExit = index.test ? String(index.test.exitCode) : 'not recorded';
  const conformanceExit = index.conformance ? String(index.conformance.exitCode) : 'not recorded';
  lines.push(
    '## Test and conformance',
    '',
    `- Test exit: ${testExit}`,
    `- Conformance exit: ${conformanceExit}`,
    '',
    '## SBOM',
    '',
    `- Components: ${index.sbom.components.length}`,
    '',
    '## Package',
    '',
    `- contentHash: ${index.contentHash ?? 'none'}`,
    `- Signer fingerprint: ${index.signerFingerprint ?? 'none'}`,
    `- CLI version: ${index.cliVersion}`,
    ''
  );
  return `${lines.join('\n')}`;
}

function resolveAddonDir(input) {
  if (typeof input.addonDir === 'string' && input.addonDir.length > 0) return input.addonDir;
  if (process.argv[2] === 'pack') return process.cwd();
  return null;
}

export function packEvidence(input) {
  const addonDir = resolveAddonDir(input);
  let checks = input.checks;
  if (checks === undefined && addonDir && fs.existsSync(path.join(addonDir, 'manifest.json'))) {
    checks = recordMachineChecks(addonDir);
  }
  const result = certifyAttestation({
    lock: input.lock,
    attestation: input.attestation,
    checks: checks ?? null,
  });
  if (!result.ok) return result;

  const currentManifest =
    input.manifest ?? (addonDir ? readJson(path.join(addonDir, 'manifest.json')) : null);
  const previousManifest =
    input.previousManifest ??
    (addonDir ? readJson(path.join(addonDir, '.kassis', 'previous-manifest.json')) : null);
  const manifestDiff = diffManifestSurface(previousManifest, currentManifest);
  const index = {
    changeSummary: readChangeSummary(addonDir, input.attestation),
    manifestDiff,
    migrations: migrationReport(addonDir),
    test: checkRow(checks, 'kassis-addon-test'),
    conformance: checkRow(checks, 'kassis-addon-conformance'),
    sbom: addonSbom(addonDir),
    contentHash: checks && typeof checks.contentHash === 'string' ? checks.contentHash : null,
    signerFingerprint: signerFingerprint(currentManifest),
    cliVersion:
      checks && typeof checks.cliVersion === 'string' ? checks.cliVersion : cliPackageVersion(),
  };

  fs.mkdirSync(input.outDir, { recursive: true });
  fs.writeFileSync(
    path.join(input.outDir, 'attestation.json'),
    `${JSON.stringify(input.attestation, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(input.outDir, 'agent-profile.lock.json'),
    `${JSON.stringify(input.lock, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(input.outDir, 'certify.json'),
    `${JSON.stringify({ ok: true, issues: result.issues }, null, 2)}\n`
  );
  fs.writeFileSync(path.join(input.outDir, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  fs.writeFileSync(path.join(input.outDir, 'README.md'), renderEvidenceReadme(index));
  return result;
}
