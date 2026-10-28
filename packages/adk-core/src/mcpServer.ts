import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { CommandResult } from './types.ts';
import { cliVersion, failure, isRecordValue } from './issues.ts';
import { checkProject, conformanceProject, explainProject } from './projectCommands.ts';
import { scaffoldProject } from './scaffoldFeature.ts';

const TOOLS = [
  {
    name: 'validate_manifest',
    description: 'Validate manifest.json and return KADK issues.',
    inputSchema: {
      type: 'object' as const,
      properties: { dir: { type: 'string' } },
    },
  },
  {
    name: 'run_checks',
    description: 'Run manifest check and conformance. Does not need a running Kassis instance.',
    inputSchema: {
      type: 'object' as const,
      properties: { dir: { type: 'string' } },
    },
  },
  {
    name: 'explain_error',
    description: 'Explain one KADK code from the catalog.',
    inputSchema: {
      type: 'object' as const,
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
  {
    name: 'scaffold',
    description: 'Create an addon or add a route, capability, event, job, migration, or UI slot.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        kind: { type: 'string' },
        id: { type: 'string' },
        dir: { type: 'string' },
        name: { type: 'string' },
        publisher: { type: 'string' },
        tier: { type: 'string' },
        rung: { type: 'string' },
      },
      required: ['kind'],
    },
  },
];

function argString(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function toolArguments(value: unknown): Record<string, unknown> {
  if (isRecordValue(value)) return value;
  return {};
}

function runChecks(dir: string): CommandResult {
  const checked = checkProject(dir);
  const conformance = conformanceProject(dir);
  return {
    ok: checked.ok && conformance.ok,
    issues: [...checked.issues, ...conformance.issues],
    data: { dir },
  };
}

function callTool(name: string, args: Record<string, unknown>): CommandResult {
  const dir = argString(args, 'dir') || process.cwd();
  if (name === 'validate_manifest') return checkProject(dir);
  if (name === 'run_checks') return runChecks(dir);
  if (name === 'explain_error') return explainProject(argString(args, 'code'));
  if (name === 'scaffold') {
    return scaffoldProject({
      dir,
      kind: argString(args, 'kind'),
      id: argString(args, 'id'),
      name: argString(args, 'name'),
      publisher: argString(args, 'publisher'),
      tier: argString(args, 'tier'),
      rung: argString(args, 'rung'),
    });
  }
  return failure(`Unknown tool ${name}`, 'Use validate_manifest, run_checks, explain_error, or scaffold.');
}

function toolPayload(result: CommandResult): { content: { type: 'text'; text: string }[]; isError: boolean } {
  return {
    content: [{ type: 'text', text: JSON.stringify(result) }],
    isError: !result.ok,
  };
}

/** Stdio MCP server. Messages are newline-delimited JSON. */
export async function startAdkMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'kassis-adk', version: cliVersion() },
    { capabilities: { tools: { listChanged: false } } }
  );
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, (request) => {
    const result = callTool(request.params.name, toolArguments(request.params.arguments));
    return toolPayload(result);
  });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await new Promise<void>((resolve) => {
    if (process.stdin.readableEnded) {
      resolve();
      return;
    }
    process.stdin.once('end', () => resolve());
    process.stdin.once('close', () => resolve());
  });
}
