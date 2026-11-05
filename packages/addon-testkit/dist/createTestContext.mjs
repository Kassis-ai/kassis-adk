/**
 * In-memory AddonContext recorders. No database and no model provider.
 */
/**
 * @typedef {object} TestPrincipal
 * @property {'user' | 'service'} kind
 * @property {number | null} userId
 * @property {string | null} email
 */
/**
 * @typedef {object} AuditSubject
 * @property {string} type
 * @property {string} id
 */
/**
 * @typedef {object} AuditDetailInput
 * @property {AuditSubject} subject
 * @property {'success' | 'failure'} [outcome]
 * @property {Record<string, string | number | boolean | null>} [metadata]
 */
/**
 * @typedef {object} RecordedAudit
 * @property {TestPrincipal} principal
 * @property {string} action
 * @property {AuditDetailInput} detail
 * @property {string} occurredAt
 */
/**
 * @typedef {object} RecordedEvent
 * @property {TestPrincipal} principal
 * @property {string} name
 * @property {object} payload
 * @property {string} publisher
 * @property {string} tenant
 * @property {string} correlationId
 * @property {string} occurredAt
 */
/**
 * @typedef {object} RecordedEnqueue
 * @property {'enqueue'} kind
 * @property {string} id
 * @property {TestPrincipal} principal
 * @property {string} type
 * @property {object} data
 */
/**
 * @typedef {object} RecordedSchedule
 * @property {'schedule'} kind
 * @property {string} type
 * @property {string} cron
 * @property {object} data
 */
/**
 * @typedef {RecordedEnqueue | RecordedSchedule} RecordedJob
 */
/**
 * @typedef {object} RecordedLlmCall
 * @property {TestPrincipal} principal
 * @property {string} promptKey
 * @property {object} variables
 * @property {object | null} options
 * @property {{ text: string, json: null, model: string, provider: string, usage: null, prompt: { key: string, hash: null } }} result
 */
/**
 * @typedef {object} TestAddonContext
 * @property {{ id: string, version: string, tier: 1 | 2 }} addon
 * @property {{ id: string }} tenant
 * @property {{ debug: Function, info: Function, warn: Function, error: Function }} logger
 * @property {{ audit: RecordedAudit[], events: RecordedEvent[], jobs: RecordedJob[], llm: RecordedLlmCall[] }} recorded
 * @property {{ record: Function, search: Function }} audit
 * @property {{ publish: Function, subscribe: Function }} events
 * @property {{ register: Function, enqueue: Function, schedule: Function, status: Function }} jobs
 * @property {{ invoke: Function, estimateTokens: Function }} llm
 */
function disposable() {
    return {
        async dispose() {
            return undefined;
        },
    };
}
function requireText(value, message) {
    if (typeof value !== 'string' || value.length === 0)
        throw new Error(message);
}
/**
 * @param {{ addonId?: string, version?: string, tier?: 1 | 2, tenantId?: string }} [options]
 * @returns {TestAddonContext}
 */
export function createTestContext(options = {}) {
    if (options.tier !== undefined && options.tier !== 1 && options.tier !== 2) {
        throw new Error('tier must be 1 or 2');
    }
    const addonId = typeof options.addonId === 'string' && options.addonId.length > 0
        ? options.addonId
        : 'sample-addon';
    const version = typeof options.version === 'string' && options.version.length > 0 ? options.version : '0.1.0';
    const tenantId = typeof options.tenantId === 'string' && options.tenantId.length > 0
        ? options.tenantId
        : 'tenant';
    const tier = options.tier === 1 ? 1 : 2;
    /** @type {RecordedAudit[]} */
    const audit = [];
    /** @type {RecordedEvent[]} */
    const events = [];
    /** @type {RecordedJob[]} */
    const jobs = [];
    /** @type {RecordedLlmCall[]} */
    const llm = [];
    return {
        addon: { id: addonId, version, tier },
        tenant: { id: tenantId },
        logger: {
            debug() { },
            info() { },
            warn() { },
            error() { },
        },
        recorded: { audit, events, jobs, llm },
        audit: {
            /**
             * @param {TestPrincipal} principal
             * @param {string} action
             * @param {AuditDetailInput} detail
             */
            async record(principal, action, detail) {
                requireText(action, 'audit action is required');
                if (!detail?.subject?.type || !detail.subject.id)
                    throw new Error('audit subject is required');
                audit.push({ principal, action, detail, occurredAt: new Date().toISOString() });
            },
            async search(_principal, query) {
                const actions = query && Array.isArray(query.actions) ? query.actions : [];
                const matched = audit.filter((entry) => actions.length === 0 || actions.includes(entry.action));
                return {
                    entries: matched.map((entry, index) => ({
                        id: String(index + 1),
                        action: entry.action,
                        occurredAt: entry.occurredAt,
                        actorUserId: entry.principal.userId,
                        actorEmail: entry.principal.email,
                        subject: entry.detail.subject,
                        metadata: entry.detail.metadata ?? null,
                    })),
                    nextCursor: null,
                };
            },
        },
        events: {
            /**
             * @param {TestPrincipal} principal
             * @param {string} name
             * @param {object} payload
             */
            async publish(principal, name, payload) {
                requireText(name, 'event name is required');
                events.push({
                    principal,
                    name,
                    payload: payload ?? {},
                    publisher: addonId,
                    tenant: tenantId,
                    correlationId: `corr-${events.length + 1}`,
                    occurredAt: new Date().toISOString(),
                });
            },
            subscribe() {
                return disposable();
            },
        },
        jobs: {
            register() {
                return disposable();
            },
            /**
             * @param {TestPrincipal} principal
             * @param {string} type
             * @param {object} data
             * @param {{ jobId?: string }} [enqueueOptions]
             */
            async enqueue(principal, type, data, enqueueOptions) {
                requireText(type, 'job type is required');
                const requested = enqueueOptions?.jobId;
                if (typeof requested === 'string' && requested.length > 0) {
                    const existing = jobs.find((job) => job.kind === 'enqueue' && job.id === requested);
                    if (existing && existing.kind === 'enqueue')
                        return { id: existing.id };
                }
                const enqueued = jobs.filter((job) => job.kind === 'enqueue').length;
                const id = typeof requested === 'string' && requested.length > 0 ? requested : `job-${enqueued + 1}`;
                jobs.push({ kind: 'enqueue', id, principal, type, data: data ?? {} });
                return { id };
            },
            schedule(type, cron, data) {
                requireText(type, 'job type is required');
                requireText(cron, 'cron is required');
                jobs.push({ kind: 'schedule', type, cron, data: data ?? {} });
                return disposable();
            },
            async status(jobId) {
                const found = jobs.find((job) => job.kind === 'enqueue' && job.id === jobId);
                if (!found || found.kind !== 'enqueue')
                    return null;
                return {
                    id: found.id,
                    type: found.type,
                    state: 'waiting',
                    progress: null,
                    result: null,
                    failedReason: null,
                };
            },
        },
        llm: {
            /**
             * @param {TestPrincipal} principal
             * @param {string} promptKey
             * @param {object} variables
             * @param {object} [invokeOptions]
             */
            async invoke(principal, promptKey, variables, invokeOptions) {
                requireText(promptKey, 'prompt key is required');
                const result = {
                    text: '',
                    json: null,
                    model: '',
                    provider: '',
                    usage: null,
                    prompt: { key: promptKey, hash: null },
                };
                llm.push({
                    principal,
                    promptKey,
                    variables: variables ?? {},
                    options: invokeOptions ?? null,
                    result,
                });
                return result;
            },
            async estimateTokens(text) {
                if (typeof text !== 'string')
                    throw new Error('text is required');
                if (text.length === 0)
                    return 0;
                return Math.ceil(text.length / 4);
            },
        },
    };
}
