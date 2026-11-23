/**
 * In-memory AddonContext recorders. No database and no model provider.
 * Declared-name refusals mirror the host AddonContext facades (KADK-606, 401, 610, 608, 605, 607).
 */
export type TestPrincipal = {
    kind: 'user' | 'service';
    userId: number | null;
    email: string | null;
};
export type AuditSubject = {
    type: string;
    id: string;
};
export type AuditDetailInput = {
    subject: AuditSubject;
    outcome?: 'success' | 'failure';
    metadata?: Record<string, string | number | boolean | null>;
};
export type RecordedAudit = {
    principal: TestPrincipal;
    action: string;
    detail: AuditDetailInput;
    occurredAt: string;
};
export type RecordedEvent = {
    principal: TestPrincipal;
    name: string;
    payload: object;
    publisher: string;
    tenant: string;
    correlationId: string;
    occurredAt: string;
};
export type RecordedEnqueue = {
    kind: 'enqueue';
    id: string;
    principal: TestPrincipal;
    type: string;
    data: object;
};
export type RecordedSchedule = {
    kind: 'schedule';
    type: string;
    cron: string;
    data: object;
};
export type RecordedJob = RecordedEnqueue | RecordedSchedule;
export type RecordedLlmCall = {
    principal: TestPrincipal;
    promptKey: string;
    variables: object;
    options: object | null;
    result: {
        text: string;
        json: null;
        model: string;
        provider: string;
        usage: null;
        prompt: {
            key: string;
            hash: null;
        };
    };
};
export type RecordedSecretRead = {
    key: string;
};
export type RecordedHttpFetch = {
    url: string;
};
export type CreateTestContextOptions = {
    addonId?: string;
    version?: string;
    tier?: 1 | 2;
    tenantId?: string;
    config?: Record<string, unknown>;
    manifest?: Record<string, unknown>;
    manifestPath?: string;
};
export type TestAddonContext = {
    addon: {
        id: string;
        version: string;
        tier: 1 | 2;
    };
    tenant: {
        id: string;
    };
    logger: {
        debug: Function;
        info: Function;
        warn: Function;
        error: Function;
    };
    config: Readonly<Record<string, unknown>>;
    recorded: {
        audit: RecordedAudit[];
        events: RecordedEvent[];
        jobs: RecordedJob[];
        llm: RecordedLlmCall[];
        secrets: RecordedSecretRead[];
        http: RecordedHttpFetch[];
        settings: object[];
        flags: object[];
        notify: object[];
        risk: object[];
        core: object[];
        prompts: object[];
        routes: object[];
    };
    audit: {
        record: Function;
        search: Function;
    };
    events: {
        publish: Function;
        subscribe: Function;
    };
    jobs: {
        register: Function;
        enqueue: Function;
        schedule: Function;
        status: Function;
    };
    llm: {
        invoke: Function;
        estimateTokens: Function;
    };
    secrets: {
        get: Function;
    };
    http: {
        fetch: Function;
    };
    routes: object;
    settings: object;
    flags: object;
    notify: object;
    risk: object;
    core: object;
    prompts: object;
    capabilities: object;
    locks: object;
    extend: object;
    data: object;
};
/**
 * @param {CreateTestContextOptions} [options]
 * @returns {TestAddonContext}
 */
export declare function createTestContext(options?: CreateTestContextOptions): TestAddonContext;
