/**
 * Maps a manifest onto the name lists the testkit enforces. Logic matches
 * server/core/addon-platform/context/mapManifestToAddonContextPolicy.ts.
 */

const NO_NAMES = Object.freeze([]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {string} path
 * @returns {Error}
 */
function invalid(path) {
  return new Error(`Addon manifest field '${path}' has the wrong shape`);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string[]}
 */
function stringList(value, path) {
  if (!Array.isArray(value)) throw invalid(path);
  return value.map((item, index) => {
    if (typeof item !== 'string') throw invalid(`${path}[${index}]`);
    return item;
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string[]}
 */
function optionalStringList(value, path) {
  if (value === undefined) return [...NO_NAMES];
  return stringList(value, path);
}

/**
 * @param {unknown} section
 * @param {string} sectionPath
 * @param {string} key
 * @returns {string[] | undefined}
 */
function sectionStringList(section, sectionPath, key) {
  if (section === undefined) return undefined;
  if (!isRecord(section)) throw invalid(sectionPath);
  if (!Object.prototype.hasOwnProperty.call(section, key)) return [...NO_NAMES];
  return stringList(section[key], `${sectionPath}.${key}`);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function publishNames(value) {
  if (value === undefined) return [...NO_NAMES];
  if (!Array.isArray(value)) throw invalid('events.publishes');
  return value.map((item, index) => {
    if (typeof item === 'string') return item;
    if (isRecord(item) && typeof item.name === 'string') return item.name;
    throw invalid(`events.publishes[${index}]`);
  });
}

/**
 * @param {unknown} events
 * @returns {{ publishes: string[], subscribes: string[] }}
 */
function eventLists(events) {
  if (events === undefined) return { publishes: [...NO_NAMES], subscribes: [...NO_NAMES] };
  if (!isRecord(events)) throw invalid('events');
  return {
    publishes: publishNames(events.publishes),
    subscribes: optionalStringList(events.subscribes, 'events.subscribes'),
  };
}

/**
 * @param {Record<string, unknown>} config
 * @returns {string[]}
 */
function secretKeysFromConfig(config) {
  const keys = [];
  for (const [name, entry] of Object.entries(config)) {
    if (!isRecord(entry) || !Object.prototype.hasOwnProperty.call(entry, 'secretKey')) continue;
    if (typeof entry.secretKey !== 'string') throw invalid(`config.${name}.secretKey`);
    keys.push(entry.secretKey);
  }
  return keys;
}

/**
 * @param {unknown} config
 * @returns {{ secretKeys: string[] }}
 */
function readConfig(config) {
  if (config === undefined) return { secretKeys: [...NO_NAMES] };
  if (!isRecord(config)) throw invalid('config');
  if (Object.prototype.hasOwnProperty.call(config, 'schema')) return { secretKeys: [...NO_NAMES] };
  return { secretKeys: secretKeysFromConfig(config) };
}

/**
 * @typedef {object} TestContextManifestPolicy
 * @property {ReadonlySet<string>} auditActions
 * @property {ReadonlySet<string>} publishes
 * @property {ReadonlySet<string>} subscribes
 * @property {ReadonlySet<string>} jobTypes
 * @property {ReadonlySet<string>} promptKeys
 * @property {ReadonlySet<string>} secretKeys
 * @property {readonly string[]} egressHosts
 */

/**
 * @param {Record<string, unknown> | null | undefined} manifest
 * @returns {TestContextManifestPolicy}
 */
export function manifestPolicyFromManifest(manifest) {
  const emptySets = {
    auditActions: new Set(),
    publishes: new Set(),
    subscribes: new Set(),
    jobTypes: new Set(),
    promptKeys: new Set(),
    secretKeys: new Set(),
    egressHosts: NO_NAMES,
  };
  if (!manifest) return emptySets;

  const events = eventLists(manifest.events);
  const config = readConfig(manifest.config);
  const declaredSecrets = sectionStringList(manifest.secrets, 'secrets', 'keys');

  const auditActions =
    sectionStringList(manifest.audit, 'audit', 'actions') ??
    optionalStringList(manifest.auditableActions, 'auditableActions');
  const jobTypes = sectionStringList(manifest.jobs, 'jobs', 'types') ?? [...NO_NAMES];
  const promptKeys = sectionStringList(manifest.prompts, 'prompts', 'keys') ?? [...NO_NAMES];
  const secretKeys = declaredSecrets ?? config.secretKeys;
  const egressHosts = sectionStringList(manifest.egress, 'egress', 'hosts') ?? [...NO_NAMES];

  return {
    auditActions: new Set(auditActions),
    publishes: new Set(events.publishes),
    subscribes: new Set(events.subscribes),
    jobTypes: new Set(jobTypes),
    promptKeys: new Set(promptKeys),
    secretKeys: new Set(secretKeys),
    egressHosts,
  };
}