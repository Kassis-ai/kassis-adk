export interface CertifyReport {
  readonly ok: true;
}

export function assertNoHostImports(source: string, label?: string): void;

export type AddonImportCode = 'KADK-201' | 'KADK-202' | 'KADK-203' | 'KADK-204' | 'KADK-205';

export interface AddonImportIssue {
  readonly code: AddonImportCode;
  readonly file: string;
  readonly line: number;
  readonly specifier: string;
  readonly message: string;
}

export function checkAddonImports(addonDir: string): AddonImportIssue[];

export type TierRefusalCode = 'KADK-219';

export interface TierRefusalIssue {
  readonly code: TierRefusalCode;
  readonly file: string;
  readonly line: number;
  readonly method: string;
  readonly message: string;
}

export function checkAddonTierRefusals(addonDir: string, tier: 1 | 2): TierRefusalIssue[];

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

export interface RecordedSecretRead {
  readonly key: string;
}

export interface RecordedHttpFetch {
  readonly url: string;
}

export interface RecordedSettingsCall {
  readonly op: 'get' | 'search';
  readonly key?: string;
}

export interface RecordedFlagsCall {
  readonly op: 'ensure' | 'has' | 'list' | 'evaluateRules';
  readonly principal?: TestPrincipal;
  readonly input?: JsonObject;
  readonly target?: JsonObject;
  readonly flagType?: string;
  readonly event?: JsonObject;
}

export interface RecordedNotifyCall {
  readonly op: 'send' | 'registerType';
  readonly principal?: TestPrincipal;
  readonly notification?: JsonObject;
  readonly type?: string;
  readonly options?: JsonObject;
}

export interface RecordedRiskCall {
  readonly op: string;
  readonly principal?: TestPrincipal;
  readonly [key: string]: JsonPrimitive | JsonObject | TestPrincipal | undefined;
}

export interface RecordedCoreCall {
  readonly facade: string;
  readonly op: string;
  readonly principal?: TestPrincipal;
  readonly [key: string]: JsonPrimitive | JsonObject | TestPrincipal | undefined;
}

export interface RecordedPromptsCall {
  readonly op: 'registerPack';
  readonly pack: JsonObject;
}

export interface RecordedExtendCall {
  readonly method: string;
  readonly input: unknown;
}

export interface RecordedRoutesCall {
  readonly op: 'mount';
  readonly options: JsonObject | null;
}

export interface HttpFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Record<string, string>;
  json(): Promise<JsonObject>;
  text(): Promise<string>;
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

export interface TestCapabilitiesFacade {
  get(capability: string): Promise<unknown>;
  consume(capability: string): Promise<unknown>;
  provide(capability: string, handler: unknown): Disposable;
  register(capability: string, handler: unknown): Disposable;
}

export interface TestLocksFacade {
  acquire(name: string): Promise<Disposable>;
}

export type TestExtendFacade = Record<string, (...args: readonly unknown[]) => Disposable>;

export interface TestDataFacade {
  read(
    table: string,
    options?: { readonly limit?: number }
  ): Promise<{ readonly rows: readonly unknown[] }>;
  query(sql: string, params?: readonly unknown[]): Promise<{ readonly rows: readonly unknown[] }>;
  execute(sql: string, params?: readonly unknown[]): Promise<{ readonly count: number }>;
  transaction(
    statements: readonly { readonly op: 'query' | 'execute'; readonly sql: string; readonly params?: readonly unknown[] }[]
  ): Promise<{ readonly results: readonly unknown[] }>;
  $queryRaw(
    query: TemplateStringsArray,
    ...values: readonly (string | number | boolean | null | Date)[]
  ): Promise<readonly unknown[]>;
  $executeRaw(
    query: TemplateStringsArray,
    ...values: readonly (string | number | boolean | null | Date)[]
  ): Promise<number>;
  $transaction<T>(work: (tx: TestDataFacade) => Promise<T>): Promise<T>;
}

export interface CreateTestContextOptions {
  readonly addonId?: string;
  readonly version?: string;
  readonly tier?: 1 | 2;
  readonly tenantId?: string;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly manifest?: Readonly<Record<string, unknown>>;
  readonly manifestPath?: string;
}

export interface TestSettingsFacade {
  get(key: string): Promise<JsonPrimitive | JsonObject | null>;
  search(): Promise<{ readonly limitPerType: number }>;
}

export interface TestFlagsFacade {
  ensure(
    principal: TestPrincipal,
    input: {
      readonly ownerType: string;
      readonly ownerId: string | number;
      readonly flagType: string;
      readonly present: boolean;
      readonly autoAssigned?: boolean;
      readonly reason?: string;
      readonly metadata?: JsonObject;
    }
  ): Promise<{ readonly changed: boolean }>;
  has(
    principal: TestPrincipal,
    target: { readonly ownerType: string; readonly ownerId: string | number },
    flagType: string
  ): Promise<boolean>;
  list(
    principal: TestPrincipal,
    target: { readonly ownerType: string; readonly ownerId: string | number }
  ): Promise<
    readonly {
      readonly flagType: string;
      readonly autoAssigned: boolean;
      readonly assignedAt: string;
      readonly metadata: JsonObject | null;
    }[]
  >;
  evaluateRules(principal: TestPrincipal, event: JsonObject): Promise<void>;
}

export interface TestNotifyFacade {
  send(
    principal: TestPrincipal,
    notification: {
      readonly recipientUserId: number;
      readonly type: string;
      readonly title: string;
      readonly message: string;
      readonly priority?: 'low' | 'normal' | 'high';
      readonly link?: string;
      readonly payload?: JsonObject;
    }
  ): Promise<void>;
  registerType(
    type: string,
    options: { readonly category: string; readonly defaultChannels: readonly string[] }
  ): Disposable;
}

export interface TestRiskFacade {
  isLaneEnabled(lane: 'entity' | 'graph'): Promise<boolean>;
  submitAssessments(principal: TestPrincipal, submission: JsonObject): Promise<{
    readonly accepted: number;
    readonly snapshot: null;
  }>;
  submitScreeningFactors(principal: TestPrincipal, input: JsonObject): Promise<{
    readonly accepted: number;
    readonly snapshot: null;
  }>;
  submitProfileFactors(principal: TestPrincipal, input: JsonObject): Promise<{
    readonly accepted: number;
    readonly snapshot: null;
  }>;
  getSnapshot(
    principal: TestPrincipal,
    subject: JsonObject,
    domain?: string
  ): Promise<null>;
  evaluatePolicyRules(
    principal: TestPrincipal,
    input: JsonObject
  ): Promise<readonly JsonObject[]>;
}

export interface TestPromptsFacade {
  registerPack(pack: JsonObject): Disposable;
}

export interface TestCoreFacades {
  readonly cases: {
    get(principal: TestPrincipal, caseId: string): Promise<JsonObject | null>;
    create(
      principal: TestPrincipal,
      input: { readonly title: string; readonly fields?: JsonObject }
    ): Promise<JsonObject>;
    update(principal: TestPrincipal, caseId: string, changes: JsonObject): Promise<JsonObject>;
    attachEntity(principal: TestPrincipal, link: JsonObject): Promise<void>;
  };
  readonly approvals: {
    guard(principal: TestPrincipal, input: JsonObject): Promise<{ readonly status: 'allowed' }>;
    isEnforced(subjectType: string): Promise<boolean>;
    registerApplier(subjectType: string, applier: unknown): Disposable;
    applyRegistered(outcome: JsonObject): Promise<void>;
  };
  readonly parties: {
    findDuplicates(
      principal: TestPrincipal,
      candidate: JsonObject,
      options?: { readonly limit?: number }
    ): Promise<readonly JsonObject[]>;
    ensureRiskLaneSeeded(principal: TestPrincipal): Promise<void>;
  };
  readonly entities: {
    search(
      principal: TestPrincipal,
      query: { readonly text: string; readonly limit?: number }
    ): Promise<readonly JsonObject[]>;
    link(
      principal: TestPrincipal,
      input: JsonObject
    ): Promise<{ readonly entityId: string; readonly created: boolean }>;
  };
  readonly documents: {
    create(principal: TestPrincipal, input: JsonObject): Promise<JsonObject>;
    extractText(
      principal: TestPrincipal,
      source: JsonObject
    ): Promise<{ readonly text: string; readonly truncated: boolean }>;
    mapTags(
      principal: TestPrincipal,
      tags: readonly string[]
    ): Promise<readonly { readonly tag: string; readonly tagId: null }[]>;
    indexText(principal: TestPrincipal, input: JsonObject): Promise<void>;
  };
  readonly users: {
    get(principal: TestPrincipal, userId: number): Promise<JsonObject | null>;
    hasPermission(
      principal: TestPrincipal,
      userId: number,
      permission: string
    ): Promise<boolean>;
    getPreference(principal: TestPrincipal, key: string): Promise<JsonPrimitive | JsonObject | null>;
    setPreference(
      principal: TestPrincipal,
      key: string,
      value: JsonPrimitive | JsonObject
    ): Promise<{ readonly saved: true }>;
  };
  readonly communication: {
    send(principal: TestPrincipal, input: JsonObject): Promise<JsonObject>;
    list(principal: TestPrincipal, query: JsonObject): Promise<readonly JsonObject[]>;
    registerAccess(
      ownerType: string,
      canAccess: (principal: TestPrincipal, ownerId: string) => Promise<boolean>
    ): Disposable;
  };
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
  readonly config: Readonly<Record<string, unknown>>;
  readonly recorded: {
    readonly audit: RecordedAudit[];
    readonly events: RecordedEvent[];
    readonly jobs: RecordedJob[];
    readonly llm: RecordedLlmCall[];
    readonly secrets: RecordedSecretRead[];
    readonly http: RecordedHttpFetch[];
    readonly settings: RecordedSettingsCall[];
    readonly flags: RecordedFlagsCall[];
    readonly notify: RecordedNotifyCall[];
    readonly risk: RecordedRiskCall[];
    readonly core: RecordedCoreCall[];
    readonly prompts: RecordedPromptsCall[];
    readonly routes: RecordedRoutesCall[];
    readonly extend: RecordedExtendCall[];
  };
  readonly audit: {
    record(principal: TestPrincipal, action: string, detail: AuditDetailInput): Promise<void>;
    search(
      principal: TestPrincipal,
      query?: { readonly actions?: readonly string[] }
    ): Promise<AuditPage>;
  };
  readonly events: {
    publish(principal: TestPrincipal, name: string, payload: JsonObject): Promise<void>;
    subscribe(name: string): Disposable;
  };
  readonly jobs: {
    register(type: string): Disposable;
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
  readonly secrets: {
    get(key: string): Promise<string | null>;
  };
  readonly http: {
    fetch(url: string): Promise<HttpFetchResponse>;
  };
  readonly routes: {
    mount(
      router: unknown,
      options?: { readonly permission?: string; readonly path?: string }
    ): Disposable;
    principalOf(request: object): TestPrincipal;
  };
  readonly settings: TestSettingsFacade;
  readonly flags: TestFlagsFacade;
  readonly notify: TestNotifyFacade;
  readonly risk: TestRiskFacade;
  readonly core: TestCoreFacades;
  readonly prompts: TestPromptsFacade;
  readonly capabilities: TestCapabilitiesFacade;
  readonly locks: TestLocksFacade;
  readonly extend: TestExtendFacade;
  readonly data: TestDataFacade;
}

export function createTestContext(options?: CreateTestContextOptions): TestAddonContext;