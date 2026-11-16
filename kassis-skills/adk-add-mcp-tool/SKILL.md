---
name: adk.add-mcp-tool
description: >-
  Declare an MCP tool contribution with kassis-addon scaffold mcp-tool.
  Use when agents must call this addon through the host MCP surface.
---

# Add an MCP tool

## When to use

A Must requirement needs a tool agents can call through MCP. The contribution is gated by enablement and signatures; keep the handler thin and permission-aware.

## Steps

1. From the addon root: `kassis-addon scaffold --kind=mcp-tool --name=<kebab-case>`.
2. Confirm `contributions.mcp` points at `dist/mcp/contribution.js` and `src/mcp/tools/<name>.ts` uses `@kassis/mcp-contract`.
3. Implement the handler; refuse when the caller lacks the declared permission.
4. Keep `test/mcp/<name>.mcp.test.ts` green and name the requirement id.
5. Ensure the build emits `dist/mcp/contribution.js` before deploy (default `kassis-addon build` may only bundle `src/server/index.ts` — extend the build when needed).
6. Run `kassis-addon check`, `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Register a tool outside the addon id namespace.
- Skip the offline MCP test scaffold writes.
- Assume a disabled addon still exposes the tool — the host fails closed on toggle.
