export interface CertifyReport {
  readonly ok: true;
}

export function assertNoHostImports(source: string, label?: string): void;

export function assertEvidencePack(dir: string): CertifyReport;

export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonPrimitive | JsonObject | readonly JsonPrimitive[];
}

export interface TestPrincipal {
  readonly kind: 'user' | 'service';
  readonly userId: number | null;
  readonly email: string | null;
}

export interface AuditSubject {
  readonly type: string;
  readonly id: string;
}

export interface AuditDetailInput {
  readonly subject: AuditSubject;
  readonly outcome?: 'success' | 'failure';
  readonly metadata?: JsonObject;
}

export interface RecordedAudit {
  readonly principal: TestPrincipal;
  readonly action: string;
  readonly detail: AuditDetailInput;
  readonly occurredAt: string;
}

export interface RecordedEvent {
  readonly principal: TestPrincipal;
  readonly name: string;
  readonly payload: JsonObject;
  readonly publisher: string;
  readonly tenant: string;
  readonly correlationId: string;
  readonly occurredAt: string;
}

export interface RecordedEnqueue {
  readonly kind: 'enqueue';
  readonly id: string;
  readonly principal: TestPrincipal;
  readonly type: string;
  readonly data: JsonObject;
}

export interface RecordedSchedule {
  readonly kind: 'schedule';
  readonly type: string;
  readonly cron: string;
  readonly data: JsonObject;
}

export type RecordedJob = RecordedEnqueue | RecordedSchedule;

export interface LlmResult {
  readonly text: string;
  readonly json: null;
  readonly model: string;
  readonly provider: string;
  readonly usage: null;
  readonly prompt: { readonly key: string; readonly hash: null };
}

export interface RecordedLlmCall {
  readonly principal: TestPrincipal;
  readonly promptKey: string;
  readonly variables: JsonObject;
  readonly options: JsonObject | null;
  readonly result: LlmResult;
}

export interface AuditPage {
  readonly entries: readonly {
    readonly id: string;
    readonly action: string;
    readonly occurredAt: string;
    readonly actorUserId: number | null;
    readonly actorEmail: string | null;
    readonly subject: AuditSubject;
    readonly metadata: JsonObject | null;
  }[];
  readonly nextCursor: null;
}

export interface JobRef {
  readonly id: string;
}

export interface JobStatus {
  readonly id: string;
  readonly type: string;
  readonly state: 'waiting';
  readonly progress: null;
  readonly result: null;
  readonly failedReason: null;
}

export interface Disposable {
  dispose(): Promise<void>;
}

export interface CreateTestContextOptions {
  readonly addonId?: string;
  readonly version?: string;
  readonly tier?: 1 | 2;
  readonly tenantId?: string;
}

export interface TestAddonContext {
  readonly addon: { readonly id: string; readonly version: string; readonly tier: 1 | 2 };
  readonly tenant: { readonly id: string };
  readonly logger: {
    debug(message: string, detail?: JsonObject): void;
    info(message: string, detail?: JsonObject): void;
    warn(message: string, detail?: JsonObject): void;
    error(message: string, detail?: JsonObject): void;
  };
  readonly recorded: {
    readonly audit: RecordedAudit[];
    readonly events: RecordedEvent[];
    readonly jobs: RecordedJob[];
    readonly llm: RecordedLlmCall[];
  };
  readonly audit: {
    record(principal: TestPrincipal, action: string, detail: AuditDetailInput): Promise<void>;
    search(principal: TestPrincipal, query?: { readonly actions?: readonly string[] }): Promise<AuditPage>;
  };
  readonly events: {
    publish(principal: TestPrincipal, name: string, payload: JsonObject): Promise<void>;
    subscribe(): Disposable;
  };
  readonly jobs: {
    register(): Disposable;
    enqueue(
      principal: TestPrincipal,
      type: string,
      data: JsonObject,
      options?: { readonly jobId?: string }
    ): Promise<JobRef>;
    schedule(type: string, cron: string, data?: JsonObject): Disposable;
    status(jobId: string): Promise<JobStatus | null>;
  };
  readonly llm: {
    invoke(
      principal: TestPrincipal,
      promptKey: string,
      variables: JsonObject,
      options?: JsonObject
    ): Promise<LlmResult>;
    estimateTokens(text: string): Promise<number>;
  };
}

export function createTestContext(options?: CreateTestContextOptions): TestAddonContext;
