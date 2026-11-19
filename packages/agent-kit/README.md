# @kassis/agent-kit

Pure decision helpers for **task agents** that call MCP tools on the host. The host loads settings (autonomy mode, attestation failure threshold, spend limits) and calls these functions; the package does not talk to the database, registry, or network.

**Stability:** `0.1.0` — minimal, intentional surface. Treat exported names and semantics as stable within the `0.x` line; breaking changes wait for `1.0.0` and a host API major bump. The package name suggests a full agent SDK; today it is only the effect and budget rules below.

## Public API

| Export | Kind | Role |
| ------ | ---- | ---- |
| `AgentAutonomy` | type | `'act'` or `'suggest'`. |
| `AgentEffect` | type | `'apply'`, `'approval'`, or `'suggest'`. |
| `AgentKitManifest` | type | `{ id, profileCode, autonomy }` — documentation shape only; nothing in this package validates or loads manifests. |
| `decideAgentAction(input)` | function | Maps run state, attestation failures, `finalDecision`, and autonomy to an `AgentEffect`. |
| `withinBudget(spent, cost, limit)` | function | Returns whether `spent + cost <= limit` for finite non‑negative numbers; otherwise `false`. |

### `decideAgentAction` behaviour

1. `autonomy === 'suggest'` → `'suggest'`.
2. `attestationFailures >= failureThreshold` when `failureThreshold > 0` → `'suggest'`.
3. No run, `runStatus === 'missing'`, or `runStatus === 'failed'` → `'approval'`.
4. `finalDecision === true` and `runStatus !== 'attested'` → `'approval'`.
5. Otherwise → `'apply'`.

The host (`server/mcp/core/runtime/runtimeExecute.ts`) applies this on mutating MCP tools for `principalKind === 'agent'`. Budget reservation, attestation gates, audit, and settings live in server code, not in this package.

## Supported today

- Shared rules for agent MCP mutating calls so the host and published kit agree on when to apply, hold for approval, or downgrade to suggest.
- Zero runtime dependencies; safe to import from Node in the server image and from addon TypeScript (allowed by `@kassis/addon-testkit` import checks).
- `npm run build` emits `dist/` for `prepack` / GitHub Packages (`publishConfig` on the tarball).

## Not covered (by design in 0.1.0)

- Agent manifest JSON Schema, registration, or `validateManifest`-style helpers.
- Principal creation, API key scopes, or MCP transport wiring.
- Approval UX, four-eyes workflows, or attestation record types.
- Eval harness, golden vectors, or profile-specific tool allow lists.
- Run lifecycle types beyond the string union passed into `decideAgentAction`.
- Token or call-count budgeting beyond the simple `withinBudget` arithmetic (the host combines this with `readAgentAutonomy` / `reserveAgentBudget`).

Addons may depend on this package for tests or future client-side agents; production usage in this repository is the MCP runtime only.

## Workspace vs published

Inside the monorepo, `package.json` `exports` point at `src/index.ts` for TypeScript. The published tarball uses `dist/index.js` and `dist/index.d.ts` after `prepack`. The server still imports via a workspace-relative path in some places; package-name imports are tracked under ADK kit extraction (S3.03).

## Boundary

The package must stay self-contained (no `@/`, `server/`, or sibling `@kassis/*` imports). It is not yet listed in `SELF_CONTAINED_KASSIS_PACKAGES` in `tools/ci/check-addon-sdk-boundary.mjs`; add it there only after confirming boundary CI passes.