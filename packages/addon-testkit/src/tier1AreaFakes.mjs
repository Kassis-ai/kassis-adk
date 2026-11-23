/**
 * In-memory fakes for the Tier 1 parity members. Tier 2 RPC refuses them on the host.
 * The testkit records the call and returns a stand-in value.
 */

function disposable() {
  return {
    async dispose() {
      return undefined;
    },
  };
}

function middleware(op) {
  return function tier1Guard(_request, _response, next) {
    if (typeof next === 'function') next();
  };
}

/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function tier1ContextFields(recorded) {
  return {
    principal: {
      service: { kind: 'service', userId: null, email: null },
    },
    rateLimit: {
      /**
       * @param {string} key
       * @param {number} capacity
       */
      async consume(key, capacity) {
        recorded.push({ op: 'rateLimit.consume', key, capacity });
        return { allowed: true, remaining: capacity };
      },
    },
    sql: {
      /**
       * @param {TemplateStringsArray} strings
       * @param {readonly unknown[]} values
       */
      sql(strings, ...values) {
        return { strings: [...strings], values };
      },
      /**
       * @param {readonly object[]} values
       * @param {object} [separator]
       */
      join(values, separator) {
        return { strings: ['join'], values: [values, separator ?? null] };
      },
      empty: { strings: [''], values: [] },
      /**
       * @param {string} text
       */
      raw(text) {
        return { strings: [text], values: [] };
      },
    },
    widgets: {
      /**
       * @param {object} schema
       */
      register(schema) {
        recorded.push({ op: 'widgets.register', schema });
      },
    },
  };
}

/**
 * @param {object} facades
 * @param {{ routes: object[], risk: object[], jobs: object[], llm: object[], prompts: object[], core: object[], locks: object[] }} recorded
 */
export function attachTier1FacadeMethods(facades, recorded) {
  const { routes, risk, jobs, llm, prompts, locks, core } = facades;
  routes.serve = (_router, options) => {
    recorded.routes.push({ op: 'serve', options: options ?? null });
    return disposable();
  };
  routes.guards = {
    authenticate: () => middleware('authenticate'),
    permission: (permission) => middleware(`permission:${permission}`),
    anyOf: (permissions) => middleware(`anyOf:${permissions.join(',')}`),
    resource: (type, scope) => middleware(`resource:${type}:${scope}`),
    auditResource: () => middleware('auditResource'),
    auditChanges: () => middleware('auditChanges'),
  };
  const bridge = (op) => async (input) => {
    recorded.risk.push({ op, input });
    return { accepted: true, correlationId: 'test' };
  };
  risk.laneEnabled = (lane) => {
    recorded.risk.push({ op: 'laneEnabled', lane });
    return true;
  };
  risk.submitPartyScreening = bridge('submitPartyScreening');
  risk.submitUboEntity = bridge('submitUboEntity');
  risk.submitJurisdiction = bridge('submitJurisdiction');
  risk.submitSchemaProfile = bridge('submitSchemaProfile');
  risk.hydrateEntities = async (records) => {
    recorded.risk.push({ op: 'hydrateEntities', count: records.length });
    return records;
  };
  risk.readEntitySnapshot = async (entityId, domain) => {
    recorded.risk.push({ op: 'readEntitySnapshot', entityId, domain: domain ?? null });
    return null;
  };
  risk.submitGraph = bridge('submitGraph');
  risk.readGraphSnapshot = async (graphId, domain) => {
    recorded.risk.push({ op: 'readGraphSnapshot', graphId, domain: domain ?? null });
    return null;
  };
  risk.linkedEntityMax = async (entityIds) => {
    recorded.risk.push({ op: 'linkedEntityMax', entityIds });
    return { score: 0, entityScores: [], reason: 'test' };
  };
  risk.analyzeWatchlist = async (rows, rules) => {
    recorded.risk.push({ op: 'analyzeWatchlist', rows, rules });
    return [];
  };
  risk.submitPlatform = bridge('submitPlatform');
  jobs.host = {
    async add(queueName, jobType, data, options) {
      recorded.jobs.push({ kind: 'host.add', queueName, jobType, data, options: options ?? null });
      return { id: 'host-job-1' };
    },
    resolveQueueName(queueName) {
      return queueName;
    },
    queue(queueName) {
      recorded.jobs.push({ kind: 'host.queue', queueName });
      return {
        async getJobSchedulers() {
          return [];
        },
        async removeJobScheduler() {
          return true;
        },
        async upsertJobScheduler() {
          return { id: queueName };
        },
      };
    },
  };
  llm.completeDirect = async (request) => {
    recorded.llm.push({ op: 'completeDirect', request });
    return { text: '' };
  };
  llm.invokeRegistered = async (request) => {
    recorded.llm.push({ op: 'invokeRegistered', request });
    return { text: '' };
  };
  llm.modelName = async () => 'test-model';
  prompts.resolve = async (key, variables, options) => {
    recorded.prompts.push({ op: 'resolve', key, variables, options: options ?? null });
    return { prompt: '', metadata: { promptKey: key } };
  };
  prompts.get = async (key, variables, options) => {
    recorded.prompts.push({ op: 'get', key, variables, options: options ?? null });
    return { prompt: '', metadata: { promptKey: key } };
  };
  locks.acquireExact = async (key, ttlSeconds) => {
    recorded.locks.push({ op: 'acquireExact', key, ttlSeconds });
    return true;
  };
  locks.releaseExact = async (key) => {
    recorded.locks.push({ op: 'releaseExact', key });
  };
  core.communication.sendDirect = async (input) => {
    recorded.core.push({ facade: 'communication', op: 'sendDirect', input });
    return { success: true, messageId: 'm-1', emailId: 1, status: 'sent' };
  };
  core.documents.extractBuffer = async (content, fileName) => {
    recorded.core.push({ facade: 'documents', op: 'extractBuffer', fileName, bytes: content.length });
    return { text: '', metadata: {} };
  };
  core.documents.extractFile = async (fileUrl, fileName) => {
    recorded.core.push({ facade: 'documents', op: 'extractFile', fileUrl, fileName: fileName ?? null });
    return { text: '', metadata: {} };
  };
  core.documents.mapAiTags = async (tags) => {
    recorded.core.push({ facade: 'documents', op: 'mapAiTags', tags });
    return tags;
  };
}
