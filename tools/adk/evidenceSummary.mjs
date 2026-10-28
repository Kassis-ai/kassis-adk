/**
 * Pure manifest diff and the approval evidence summary.
 * The host calls this beside the client's pack. It does not install an addon.
 */

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort(compareNames);
}

function stringsFrom(list) {
  if (!Array.isArray(list)) return [];
  const names = [];
  for (const item of list) {
    if (typeof item === 'string' && item.length > 0) names.push(item);
  }
  return uniqueSorted(names);
}

function fieldNames(list, field) {
  if (!Array.isArray(list)) return [];
  const names = [];
  for (const item of list) {
    if (typeof item === 'string' && item.length > 0) names.push(item);
    else if (item && typeof item === 'object' && typeof item[field] === 'string' && item[field].length > 0) {
      names.push(item[field]);
    }
  }
  return uniqueSorted(names);
}

function capabilityNames(list, prefix, versionField) {
  if (!Array.isArray(list)) return [];
  const names = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || typeof item.capability !== 'string') continue;
    const version = typeof item[versionField] === 'string' ? item[versionField] : '';
    names.push(`${prefix}:${item.capability}@${version}`);
  }
  return uniqueSorted(names);
}

function emptySurface() {
  return {
    tier: null,
    permissions: [],
    egressHosts: [],
    events: [],
    capabilities: [],
    dataAccess: [],
  };
}

export function manifestSurface(manifest) {
  if (!manifest || typeof manifest !== 'object') return emptySurface();
  const events = manifest.events && typeof manifest.events === 'object' ? manifest.events : {};
  const database = manifest.database && typeof manifest.database === 'object' ? manifest.database : {};
  const egress = manifest.egress && typeof manifest.egress === 'object' ? manifest.egress : {};
  const publishes = fieldNames(events.publishes, 'name').map((name) => `publish:${name}`);
  const subscribes = stringsFrom(events.subscribes).map((name) => `subscribe:${name}`);
  const owned = stringsFrom(database.ownedTables).map((name) => `owned:${name}`);
  const reads = stringsFrom(database.readAccess).map((name) => `read:${name}`);
  return {
    tier: typeof manifest.tier === 'number' ? manifest.tier : null,
    permissions: fieldNames(manifest.permissions, 'name'),
    egressHosts: stringsFrom(egress.hosts),
    events: uniqueSorted([...publishes, ...subscribes]),
    capabilities: uniqueSorted([
      ...capabilityNames(manifest.provides, 'provide', 'version'),
      ...capabilityNames(manifest.requires, 'require', 'range'),
      ...capabilityNames(manifest.optional, 'optional', 'range'),
    ]),
    dataAccess: uniqueSorted([...owned, ...reads]),
  };
}

function diffNames(before, after) {
  const previous = new Set(before);
  const next = new Set(after);
  return {
    added: after.filter((name) => !previous.has(name)),
    removed: before.filter((name) => !next.has(name)),
  };
}

export function diffManifestSurface(previous, next) {
  const before = manifestSurface(previous);
  const after = manifestSurface(next);
  return {
    tier: { from: before.tier, to: after.tier },
    permissions: diffNames(before.permissions, after.permissions),
    egressHosts: diffNames(before.egressHosts, after.egressHosts),
    events: diffNames(before.events, after.events),
    capabilities: diffNames(before.capabilities, after.capabilities),
    dataAccess: diffNames(before.dataAccess, after.dataAccess),
  };
}

function answerLabel(verification) {
  return verification === 'machine' ? 'machine' : 'self-attested';
}

export function summarizeDeploymentEvidence(input) {
  const answers = Array.isArray(input.answers) ? input.answers : [];
  const clientContentHash = typeof input.clientContentHash === 'string' ? input.clientContentHash : null;
  const hostContentHash = typeof input.hostContentHash === 'string' ? input.hostContentHash : '';
  return {
    contentHash: {
      client: clientContentHash,
      host: hostContentHash,
      match: clientContentHash !== null && clientContentHash === hostContentHash,
    },
    manifestDiff: {
      client: input.clientManifestDiff ?? null,
      host: diffManifestSurface(input.previousManifest ?? null, input.nextManifest ?? null),
    },
    answers: answers.map((answer) => ({
      key: typeof answer.key === 'string' ? answer.key : '',
      outcome: typeof answer.outcome === 'string' ? answer.outcome : null,
      label: answerLabel(typeof answer.verification === 'string' ? answer.verification : ''),
    })),
  };
}
