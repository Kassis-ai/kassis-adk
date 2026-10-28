/**
 * Read-only dev MCP. Tools describe KADK codes, the pinned profile, and the local manifest.
 * Framed with Content-Length headers on stdin/stdout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { kadkIssue } from './certifyAttestation.mjs';

const root = process.cwd();

function toolResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError };
}

function callTool(name, args) {
  if (name === 'kadk_explain') {
    try {
      const issue = kadkIssue(String(args.code ?? ''));
      return toolResult(`${issue.code} ${issue.message}\n${issue.fix}`);
    } catch (error) {
      return toolResult(error instanceof Error ? error.message : String(error), true);
    }
  }
  if (name === 'profile_lock_read') {
    const file = path.join(root, '.kassis', 'agent-profile.lock.json');
    if (!fs.existsSync(file)) return toolResult('No pinned profile. Run kassis adk sync.', true);
    return toolResult(fs.readFileSync(file, 'utf8'));
  }
  if (name === 'manifest_summary') {
    const file = path.join(root, 'manifest.json');
    if (!fs.existsSync(file)) return toolResult('manifest.json is missing', true);
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    const permissions = Array.isArray(manifest.permissions)
      ? manifest.permissions.map((item) => item.name).filter((item) => typeof item === 'string')
      : [];
    return toolResult(
      JSON.stringify(
        {
          id: manifest.id ?? null,
          version: manifest.version ?? null,
          tier: manifest.tier ?? null,
          permissions,
        },
        null,
        2
      )
    );
  }
  return toolResult(`Unknown tool ${name}`, true);
}

const tools = [
  {
    name: 'kadk_explain',
    description: 'Explain one KADK code.',
    inputSchema: {
      type: 'object',
      properties: { code: { type: 'string' } },
      required: ['code'],
    },
  },
  {
    name: 'profile_lock_read',
    description: 'Read the pinned agent profile lock. Does not change it.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'manifest_summary',
    description: 'Read the addon id, version, tier, and permission names from manifest.json.',
    inputSchema: { type: 'object', properties: {} },
  },
];

function handle(message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'kassis-adk', version: '0.1.0' },
    };
  }
  if (message.method === 'tools/list') return { tools };
  if (message.method === 'tools/call') {
    return callTool(message.params?.name, message.params?.arguments ?? {});
  }
  return { error: `Unsupported method ${message.method}` };
}

function write(payload) {
  const body = JSON.stringify(payload);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
}

let buffer = Buffer.alloc(0);
process.stdin.on('end', () => process.exit(0));
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) return;
    const header = buffer.subarray(0, headerEnd).toString('utf8');
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) return;
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);
    const message = JSON.parse(body);
    const result = handle(message);
    if (message.id !== undefined) {
      if (result && result.error && message.method !== 'tools/call') {
        write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: result.error } });
      } else {
        write({ jsonrpc: '2.0', id: message.id, result });
      }
    }
  }
});
