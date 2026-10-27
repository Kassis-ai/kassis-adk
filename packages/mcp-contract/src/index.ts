export type McpJson =
  | string
  | number
  | boolean
  | null
  | McpJson[]
  | { [key: string]: McpJson };

/** JSON Schema object used as an MCP tool input or output schema. */
export type McpJsonSchema = { [key: string]: McpJson | McpJsonSchema };

export type McpToolAccess = {
  anyOf: readonly string[];
  mutating: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  /** When true, the call is applied only after the agent run is attested. */
  finalDecision?: boolean;
};

export type McpPrincipalKind = 'user' | 'apiKey' | 'plugin' | 'agent';

export type McpPrincipal = {
  id: string;
  kind: McpPrincipalKind;
  permissions: readonly string[];
};

export type McpApiClient = {
  get: (path: string, query?: Record<string, string | number | boolean>) => Promise<McpJson>;
  post: (path: string, body?: McpJson) => Promise<McpJson>;
  put: (path: string, body?: McpJson) => Promise<McpJson>;
  patch: (path: string, body?: McpJson) => Promise<McpJson>;
  delete: (path: string) => Promise<McpJson>;
};

export type McpLog = {
  info: (message: string, detail?: { [key: string]: McpJson }) => void;
  warn: (message: string, detail?: { [key: string]: McpJson }) => void;
  error: (message: string, detail?: { [key: string]: McpJson }) => void;
};

export type McpContext = {
  api: McpApiClient;
  principal: McpPrincipal;
  paths: {
    api: (relativePath: string) => string;
    addon: (id: string, relativePath?: string) => string;
  };
  log: McpLog;
  audit: (event: string, detail?: { [key: string]: McpJson }) => void;
};

export type McpToolOutcome<TOutput> =
  | { summary: string; data?: TOutput }
  | { error: string; hint?: string };

export type McpToolDefinition<TInput, TOutput> = {
  name: string;
  title: string;
  description: string;
  input: McpJsonSchema;
  output?: McpJsonSchema;
  access: McpToolAccess;
  cacheTtlMs?: number;
  handler: (args: TInput, ctx: McpContext) => Promise<McpToolOutcome<TOutput>>;
};

/**
 * Reserved tool argument that carries an agent-registry run id.
 *
 * Stdio and HTTP only forward `params.arguments` into the runtime, so the
 * MCP request `_meta` field never arrives. Callers set this argument on a
 * tool call that belongs to a run. The runtime removes it before JSON Schema
 * validation and before the handler. A mutating tool is refused until that
 * run is acknowledged. A call that omits it is unchanged (Phase 9 makes a
 * run mandatory for agent principals).
 */
export const MCP_AGENT_RUN_ID_ARGUMENT = 'agentRunId';

const TOOL_NAME = /^[A-Za-z0-9_.-]{1,128}$/;

export function defineMcpTool<TInput, TOutput>(
  definition: McpToolDefinition<TInput, TOutput>
): McpToolDefinition<TInput, TOutput> {
  if (!TOOL_NAME.test(definition.name)) {
    throw new Error(`MCP tool name "${definition.name}" is not a valid MCP name`);
  }
  if (definition.access.anyOf.length === 0) {
    throw new Error(`MCP tool "${definition.name}" must declare access.anyOf`);
  }
  return definition;
}
