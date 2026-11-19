/**
 * In-memory ctx.core facades for offline tests. Tier refusals use KADK-219.
 */
import { assertCtxMethodAllowed } from './tierRefusal.mjs';
function disposable() {
    return {
        async dispose() {
            return undefined;
        },
    };
}
/**
 * @param {1 | 2} tier
 * @param {object[]} recorded
 * @returns {object}
 */
export function createCoreFacadesFake(tier, recorded) {
    /** @type {Map<string, object>} */
    const cases = new Map();
    let caseSeq = 0;
    /**
     * @param {string} method
     * @param {string} facade
     * @param {string} op
     * @param {Record<string, unknown>} detail
     */
    function note(method, facade, op, detail) {
        assertCtxMethodAllowed(tier, method);
        recorded.push({ facade, op, ...detail });
    }
    return {
        cases: {
            /**
             * @param {unknown} principal
             * @param {string} caseId
             */
            async get(principal, caseId) {
                note('ctx.core.cases.get', 'cases', 'get', { principal, caseId });
                return cases.get(caseId) ?? null;
            },
            /**
             * @param {unknown} principal
             * @param {{ title: string, description?: string, caseType?: string, priority?: string, fields?: object }} input
             */
            async create(principal, input) {
                note('ctx.core.cases.create', 'cases', 'create', { principal, input });
                caseSeq += 1;
                const record = {
                    id: `case-${caseSeq}`,
                    title: input.title,
                    status: null,
                    ...(input.fields ?? {}),
                };
                cases.set(record.id, record);
                return record;
            },
            /**
             * @param {unknown} principal
             * @param {string} caseId
             * @param {object} changes
             */
            async update(principal, caseId, changes) {
                note('ctx.core.cases.update', 'cases', 'update', { principal, caseId, changes });
                const existing = cases.get(caseId);
                if (!existing)
                    throw new Error(`ctx.core.cases.update: unknown case ${caseId}`);
                const next = { ...existing, ...changes, id: caseId };
                cases.set(caseId, next);
                return next;
            },
            /**
             * @param {unknown} principal
             * @param {object} link
             */
            async attachEntity(principal, link) {
                note('ctx.core.cases.attachEntity', 'cases', 'attachEntity', { principal, link });
            },
        },
        approvals: {
            /**
             * @param {unknown} principal
             * @param {object} input
             */
            async guard(principal, input) {
                note('ctx.core.approvals.guard', 'approvals', 'guard', { principal, input });
                return { status: 'allowed' };
            },
            /**
             * @param {string} subjectType
             */
            async isEnforced(subjectType) {
                note('ctx.core.approvals.isEnforced', 'approvals', 'isEnforced', { subjectType });
                return false;
            },
            /**
             * @param {string} subjectType
             * @param {unknown} [_applier]
             */
            registerApplier(subjectType) {
                note('ctx.core.approvals.registerApplier', 'approvals', 'registerApplier', {
                    subjectType,
                });
                return disposable();
            },
            /**
             * @param {object} outcome
             */
            async applyRegistered(outcome) {
                note('ctx.core.approvals.applyRegistered', 'approvals', 'applyRegistered', { outcome });
            },
        },
        parties: {
            /**
             * @param {unknown} principal
             * @param {object} candidate
             * @param {{ limit?: number }} [_options]
             */
            async findDuplicates(principal, candidate) {
                note('ctx.core.parties.findDuplicates', 'parties', 'findDuplicates', {
                    principal,
                    candidate,
                });
                return [];
            },
            /**
             * @param {unknown} principal
             */
            async ensureRiskLaneSeeded(principal) {
                note('ctx.core.parties.ensureRiskLaneSeeded', 'parties', 'ensureRiskLaneSeeded', {
                    principal,
                });
            },
        },
        entities: {
            /**
             * @param {unknown} principal
             * @param {{ text: string, limit?: number }} query
             */
            async search(principal, query) {
                note('ctx.core.entities.search', 'entities', 'search', { principal, query });
                return [];
            },
            /**
             * @param {unknown} principal
             * @param {object} input
             */
            async link(principal, input) {
                note('ctx.core.entities.link', 'entities', 'link', { principal, input });
                return { entityId: input.entityId ?? 'entity-1', created: !input.entityId };
            },
        },
        documents: {
            /**
             * @param {unknown} principal
             * @param {object} input
             */
            async create(principal, input) {
                note('ctx.core.documents.create', 'documents', 'create', { principal, input });
                return {
                    id: 'doc-1',
                    fileName: input.fileName,
                    mimeType: input.mimeType,
                    ownerType: input.ownerType ?? null,
                    ownerId: input.ownerId ?? null,
                };
            },
            /**
             * @param {unknown} principal
             * @param {object} source
             */
            async extractText(principal, source) {
                note('ctx.core.documents.extractText', 'documents', 'extractText', { principal, source });
                return { text: '', truncated: false };
            },
            /**
             * @param {unknown} principal
             * @param {readonly string[]} tags
             */
            async mapTags(principal, tags) {
                note('ctx.core.documents.mapTags', 'documents', 'mapTags', { principal, tags });
                return tags.map((tag) => ({ tag, tagId: null }));
            },
            /**
             * @param {unknown} principal
             * @param {object} input
             */
            async indexText(principal, input) {
                note('ctx.core.documents.indexText', 'documents', 'indexText', { principal, input });
            },
        },
        users: {
            /**
             * @param {unknown} principal
             * @param {number} userId
             */
            async get(principal, userId) {
                note('ctx.core.users.get', 'users', 'get', { principal, userId });
                return null;
            },
            /**
             * @param {unknown} principal
             * @param {number} userId
             * @param {string} permission
             */
            async hasPermission(principal, userId, permission) {
                note('ctx.core.users.hasPermission', 'users', 'hasPermission', {
                    principal,
                    userId,
                    permission,
                });
                return false;
            },
            /**
             * @param {unknown} principal
             * @param {string} permission
             */
            async listByPermission(principal, permission) {
                note('ctx.core.users.listByPermission', 'users', 'listByPermission', {
                    principal,
                    permission,
                });
                return [];
            },
            /**
             * @param {unknown} principal
             * @param {string} key
             */
            async getPreference(principal, key) {
                note('ctx.core.users.getPreference', 'users', 'getPreference', { principal, key });
                return null;
            },
            /**
             * @param {unknown} principal
             * @param {string} key
             * @param {unknown} value
             */
            async setPreference(principal, key, value) {
                note('ctx.core.users.setPreference', 'users', 'setPreference', {
                    principal,
                    key,
                    value,
                });
                return { saved: true };
            },
        },
        communication: {
            /**
             * @param {unknown} principal
             * @param {object} input
             */
            async send(principal, input) {
                note('ctx.core.communication.send', 'communication', 'send', { principal, input });
                return { emailId: 'mail-1', status: 'sent' };
            },
            /**
             * @param {unknown} principal
             * @param {object} query
             */
            async list(principal, query) {
                note('ctx.core.communication.list', 'communication', 'list', { principal, query });
                return [];
            },
            /**
             * @param {string} ownerType
             */
            registerAccess(ownerType) {
                note('ctx.core.communication.registerAccess', 'communication', 'registerAccess', {
                    ownerType,
                });
                return disposable();
            },
        },
    };
}
