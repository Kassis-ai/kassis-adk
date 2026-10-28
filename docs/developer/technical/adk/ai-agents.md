# AI agents

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Coding-agent profile

The signed profile is `tools/adk/profiles/addon-coding-agent.json`. `sync --profile=addon-coding-agent` checks that signature and writes:

- `.kassis/agent-profile.lock.json`
- `AGENTS.md`
- `.cursor/rules/adk-guardrails.mdc`
- `.claude/CLAUDE.md`
- `.github/copilot-instructions.md`

`sync --instance=<url>` downloads `GET /api/v1/agent-registry/profiles/published/<id>` instead of the bundled file.

`node tools/adk/kassis-adk-mcp.mjs` is a read-only stdio MCP server with `kadk_explain`, `profile_lock_read`, and `manifest_summary`.

## Registry, runs, and attestation

An API key whose scopes include `agent.service` is an agent principal. Mutating MCP tools require a run id. `certify` can start a run and post attestation answers when `KASSIS_ADK_INSTANCE`, `KASSIS_ADK_TOKEN`, and `KASSIS_ADK_AGENT_ID` are set.

Audit rows for an agent call include `agentId`, `runId`, `model`, `promptKey`, and `promptVersion` on both the success path and the rejection path.

## Final decisions

The hidden investigation update tool is marked `finalDecision`. When the agent's autonomy says the call must be approved, or the run is not attested, the runtime does not execute the tool. It creates an approval request through the existing approvals path and returns that request id. The maker sees it in Atelier under Your requests. Approving the request does not apply the tool: the `mcp_final_decision` record type has an empty `onApproved` handler.

Autonomy is read from the agent profile. If it cannot be read, the level is the most restrictive one (`suggest`).

## Settings

| Key | Meaning |
| --- | --- |
| `agents.autonomy.levels` | Per-agent autonomy. Unreadable values fall back to suggest. |
| `agents.autonomy.attestationFailureThreshold` | Failures inside the window that downgrade the agent to suggest. |
| `agents.autonomy.windowMinutes` | Window for the failure count. The count is stored in the agent registry, not in one process. |
| `agents.autonomy.budgetLimit` | Spend limit for an agent principal. |
| `agents.autonomy.callCost` | Cost reserved before a tool call. |

`agent_config_draft` returns a proposed settings change with `applied: false`. It does not write. A person publishes configuration.
