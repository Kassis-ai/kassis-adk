#!/usr/bin/env node
/**
 * kassis-adk MCP server. Stdio transport is newline-delimited JSON.
 * The command work is in @kassis/adk-core.
 */
import { startAdkMcpServer } from '../../packages/adk-core/src/mcpServer.ts';

await startAdkMcpServer();
