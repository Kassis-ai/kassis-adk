/**
 * In-memory AddonContext recorders. No database and no model provider.
 * Declared-name refusals mirror the host AddonContext facades (KADK-606, 401, 610, 608, 605, 607).
 */
import fs from 'node:fs';
import path from 'node:path';
import { manifestPolicyFromManifest } from './manifestPolicy.mjs';
import { TestContextError } from './testContextError.mjs';
import { createTierGuardedCapabilities, createTierGuardedData, createTierGuardedExtend, createTierGuardedLocks, } from './tierGuardedFacades.mjs';
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
 * @typedef {object} RecordedSecretRead
 * @property {string} key
 */
/**
 * @typedef {object} RecordedHttpFetch
 * @property {string} url
 */
/**
 * @typedef {object} CreateTestContextOptions
 * @property {string} [addonId]
 * @property {string} [version]
 * @property {1 | 2} [tier]
 * @property {string} [tenantId]
 * @property {Record<string, unknown>} [manifest]
 * @property {string} [manifestPath]
 */
/**
 * @typedef {object} TestAddonContext
 * @property {{ id: string, version: string, tier: 1 | 2 }} addon
 * @property {{ id: string }} tenant
 * @property {{ debug: Function, info: Function, warn: Function, error: Function }} logger
 * @property {{ audit: RecordedAudit[], events: RecordedEvent[], jobs: RecordedJob[], llm: RecordedLlmCall[], secrets: RecordedSecretRead[], http: RecordedHttpFetch[] }} recorded
 * @property {{ record: Function, search: Function }} audit
 * @property {{ publish: Function, subscribe: Function }} events
 * @property {{ register: Function, enqueue: Function, schedule: Function, status: Function }} jobs
 * @property {{ invoke: Function, estimateTokens: Function }} llm
 * @property {{ get: Function }} secrets
 * @property {{ fetch: Function }} http
 * @property {object} capabilities
 * @property {object} locks
 * @property {object} extend
 * @property {object} data
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
 * @param {CreateTestContextOptions} options
 * @returns {Record<string, unknown> | null}
 */
function resolveManifest(options) {
    if (options.manifest && typeof options.manifest === 'object') {
        return options.manifest;
    }
    const manifestPath = typeof options.manifestPath === 'string' && options.manifestPath.length > 0
        ? options.manifestPath
        : fs.existsSync(path.join(process.cwd(), 'manifest.json'))
            ? path.join(process.cwd(), 'manifest.json')
            : null;
    if (!manifestPath)
        return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
/**
 * @param {string} host
 * @returns {string}
 */
function normaliseHost(host) {
    return host.toLowerCase().replace(/\.$/, '');
}
/**
 * @param {string} host
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesEgressHost(host, pattern) {
    if (!pattern.startsWith('*.'))
        return host === pattern;
    const suffix = pattern.slice(1);
    return (host.endsWith(suffix) &&
        !host.slice(0, -suffix.length).includes('.') &&
        host.length > suffix.length);
}
/**
 * @param {readonly string[]} allowed
 * @param {string} url
 * @returns {URL}
 */
function assertEgressAllowed(addonId, allowed, url) {
    let target;
    try {
        target = new URL(url);
    }
    catch {
        throw new Error(`ctx.http.fetch: '${url}' is not an absolute URL`);
    }
    const host = normaliseHost(target.hostname);
    const patterns = allowed.map(normaliseHost);
    if (target.protocol !== 'https:' ||
        target.username ||
        target.password ||
        !patterns.some((pattern) => matchesEgressHost(host, pattern))) {
        throw new TestContextError('KADK-607', 'egress.hosts', { id: addonId, host: target.host });
    }
    return target;
}
/**
 * @param {CreateTestContextOptions} [options]
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
    const policy = manifestPolicyFromManifest(resolveManifest(options));
    /** @type {RecordedAudit[]} */
    const audit = [];
    /** @type {RecordedEvent[]} */
    const events = [];
    /** @type {RecordedJob[]} */
    const jobs = [];
    /** @type {RecordedLlmCall[]} */
    const llm = [];
    /** @type {RecordedSecretRead[]} */
    const secrets = [];
    /** @type {RecordedHttpFetch[]} */
    const http = [];
    return {
        addon: { id: addonId, version, tier },
        tenant: { id: tenantId },
        logger: {
            debug() { },
            info() { },
            warn() { },
            error() { },
        },
        recorded: { audit, events, jobs, llm, secrets, http },
        audit: {
            /**
             * @param {TestPrincipal} principal
             * @param {string} action
             * @param {AuditDetailInput} detail
             */
            async record(principal, action, detail) {
                requireText(action, 'audit action is required');
                if (!policy.auditActions.has(action)) {
                    throw new TestContextError('KADK-606', 'audit.actions', { id: addonId, value: action });
                }
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
                if (!policy.publishes.has(name)) {
                    throw new TestContextError('KADK-401', 'events.publishes', { id: addonId, event: name });
                }
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
            /**
             * @param {string} name
             */
            subscribe(name) {
                requireText(name, 'event name is required');
                if (!policy.subscribes.has(name)) {
                    throw new TestContextError('KADK-403', 'events.subscribes', { id: addonId, event: name });
                }
                return disposable();
            },
        },
        jobs: {
            /**
             * @param {string} type
             */
            register(type) {
                requireText(type, 'job type is required');
                if (!policy.jobTypes.has(type)) {
                    throw new TestContextError('KADK-610', 'jobs.types', { id: addonId, value: type });
                }
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
                if (!policy.jobTypes.has(type)) {
                    throw new TestContextError('KADK-610', 'jobs.types', { id: addonId, value: type });
                }
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
                if (!policy.jobTypes.has(type)) {
                    throw new TestContextError('KADK-610', 'jobs.types', { id: addonId, value: type });
                }
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
                if (!policy.promptKeys.has(promptKey)) {
                    throw new TestContextError('KADK-608', 'prompts.keys', { id: addonId, value: promptKey });
                }
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
        secrets: {
            /**
             * @param {string} key
             */
            async get(key) {
                requireText(key, 'secret key is required');
                if (!policy.secretKeys.has(key)) {
                    throw new TestContextError('KADK-605', 'secrets.keys', { id: addonId, value: key });
                }
                secrets.push({ key });
                return `fake-secret:${key}`;
            },
        },
        http: {
            /**
             * @param {string} url
             */
            async fetch(url) {
                requireText(url, 'url is required');
                assertEgressAllowed(addonId, policy.egressHosts, url);
                http.push({ url });
                return {
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: {},
                    async json() {
                        return {};
                    },
                    async text() {
                        return '';
                    },
                };
            },
        },
        capabilities: createTierGuardedCapabilities(tier),
        locks: createTierGuardedLocks(tier),
        extend: createTierGuardedExtend(tier),
        data: createTierGuardedData(tier),
    };
}
