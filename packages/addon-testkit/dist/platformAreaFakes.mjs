/**
 * In-memory fakes for settings, flags, notify, risk, routes, prompts and config.
 */
function disposable() {
    return {
        async dispose() {
            return undefined;
        },
    };
}
/**
 * @param {Record<string, unknown> | null | undefined} manifest
 * @param {Record<string, unknown> | undefined} override
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createConfigFake(manifest, override) {
    if (override && typeof override === 'object') {
        return Object.freeze({ ...override });
    }
    const fromManifest = manifest && typeof manifest === 'object' && manifest.config && typeof manifest.config === 'object'
        ? /** @type {Record<string, unknown>} */ (manifest.config)
        : {};
    return Object.freeze({ ...fromManifest });
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createRoutesFake(recorded) {
    return {
        /**
         * @param {unknown} _router
         * @param {{ permission?: string, path?: string }} [_options]
         */
        mount(_router, _options) {
            recorded.push({ op: 'mount', options: _options ?? null });
            return disposable();
        },
        /**
         * @param {object} request
         */
        principalOf(request) {
            if (request &&
                typeof request === 'object' &&
                Object.prototype.hasOwnProperty.call(request, '__kassisPrincipal')) {
                return /** @type {{ __kassisPrincipal: unknown }} */ (request).__kassisPrincipal;
            }
            throw new Error('ctx.routes.principalOf: request was not issued by the host');
        },
    };
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createSettingsFake(recorded) {
    return {
        /**
         * @param {string} key
         */
        async get(key) {
            recorded.push({ op: 'get', key });
            return null;
        },
        async search() {
            recorded.push({ op: 'search' });
            return { limitPerType: 10 };
        },
    };
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createFlagsFake(recorded) {
    /** @type {Map<string, { flagType: string, autoAssigned: boolean, assignedAt: string, metadata: object | null }[]>} */
    const byOwner = new Map();
    /**
     * @param {{ ownerType: string, ownerId: string | number }} target
     */
    function ownerKey(target) {
        return `${target.ownerType}:${String(target.ownerId)}`;
    }
    return {
        /**
         * @param {unknown} principal
         * @param {{ ownerType: string, ownerId: string | number, flagType: string, present: boolean, autoAssigned?: boolean, reason?: string, metadata?: object }} input
         */
        async ensure(principal, input) {
            recorded.push({ op: 'ensure', principal, input });
            const key = ownerKey(input);
            const list = byOwner.get(key) ?? [];
            const index = list.findIndex((row) => row.flagType === input.flagType);
            if (input.present) {
                if (index >= 0) {
                    return { changed: false };
                }
                list.push({
                    flagType: input.flagType,
                    autoAssigned: input.autoAssigned === true,
                    assignedAt: new Date().toISOString(),
                    metadata: input.metadata ?? null,
                });
                byOwner.set(key, list);
                return { changed: true };
            }
            if (index < 0)
                return { changed: false };
            list.splice(index, 1);
            byOwner.set(key, list);
            return { changed: true };
        },
        /**
         * @param {unknown} principal
         * @param {{ ownerType: string, ownerId: string | number }} target
         * @param {string} flagType
         */
        async has(principal, target, flagType) {
            recorded.push({ op: 'has', principal, target, flagType });
            const list = byOwner.get(ownerKey(target)) ?? [];
            return list.some((row) => row.flagType === flagType);
        },
        /**
         * @param {unknown} principal
         * @param {{ ownerType: string, ownerId: string | number }} target
         */
        async list(principal, target) {
            recorded.push({ op: 'list', principal, target });
            return [...(byOwner.get(ownerKey(target)) ?? [])];
        },
        /**
         * @param {unknown} principal
         * @param {object} event
         */
        async evaluateRules(principal, event) {
            recorded.push({ op: 'evaluateRules', principal, event });
        },
    };
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createNotifyFake(recorded) {
    return {
        /**
         * @param {unknown} principal
         * @param {object} notification
         */
        async send(principal, notification) {
            recorded.push({ op: 'send', principal, notification });
        },
        /**
         * @param {string} type
         * @param {object} options
         */
        registerType(type, options) {
            recorded.push({ op: 'registerType', type, options });
            return disposable();
        },
    };
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createPromptsFake(recorded) {
    return {
        /**
         * @param {object} pack
         */
        registerPack(pack) {
            recorded.push({ op: 'registerPack', pack });
            return disposable();
        },
    };
}
/**
 * @param {object[]} recorded
 * @returns {object}
 */
export function createRiskFake(recorded) {
    return {
        /**
         * @param {string} lane
         */
        async isLaneEnabled(lane) {
            recorded.push({ op: 'isLaneEnabled', lane });
            return true;
        },
        /**
         * @param {unknown} principal
         * @param {object} submission
         */
        async submitAssessments(principal, submission) {
            recorded.push({ op: 'submitAssessments', principal, submission });
            return { accepted: submission?.assessments?.length ?? 0, snapshot: null };
        },
        /**
         * @param {unknown} principal
         * @param {object} input
         */
        async submitScreeningFactors(principal, input) {
            recorded.push({ op: 'submitScreeningFactors', principal, input });
            return { accepted: 0, snapshot: null };
        },
        /**
         * @param {unknown} principal
         * @param {object} input
         */
        async submitProfileFactors(principal, input) {
            recorded.push({ op: 'submitProfileFactors', principal, input });
            return { accepted: 0, snapshot: null };
        },
        /**
         * @param {unknown} principal
         * @param {object} subject
         * @param {string} [domain]
         */
        async getSnapshot(principal, subject, domain) {
            recorded.push({ op: 'getSnapshot', principal, subject, domain: domain ?? null });
            return null;
        },
        /**
         * @param {unknown} principal
         * @param {object} input
         */
        async evaluatePolicyRules(principal, input) {
            recorded.push({ op: 'evaluatePolicyRules', principal, input });
            return [];
        },
    };
}
