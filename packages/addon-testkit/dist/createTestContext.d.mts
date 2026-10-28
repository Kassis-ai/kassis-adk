/**
 * @param {{ addonId?: string, version?: string, tier?: 1 | 2, tenantId?: string }} [options]
 * @returns {TestAddonContext}
 */
export function createTestContext(options?: {
    addonId?: string;
    version?: string;
    tier?: 1 | 2;
    tenantId?: string;
}): TestAddonContext;
export type TestPrincipal = {
    kind: "user" | "service";
    userId: number | null;
    email: string | null;
};
export type AuditSubject = {
    type: string;
    id: string;
};
export type AuditDetailInput = {
    subject: AuditSubject;
    outcome?: "success" | "failure" | undefined;
    metadata?: Record<string, string | number | boolean | null> | undefined;
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
    kind: "enqueue";
    id: string;
    principal: TestPrincipal;
    type: string;
    data: object;
};
export type RecordedSchedule = {
    kind: "schedule";
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
    recorded: {
        audit: RecordedAudit[];
        events: RecordedEvent[];
        jobs: RecordedJob[];
        llm: RecordedLlmCall[];
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
};
