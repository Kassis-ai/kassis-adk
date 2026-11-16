# AI agents

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

## Coding-agent profile

The signed profile is `tools/adk/profiles/addon-coding-agent.json` (version 2). `sync --profile=addon-coding-agent` checks that signature and writes:

- `.kassis/agent-profile.lock.json`
- `AGENTS.md`
- `.cursor/rules/adk-guardrails.mdc`
- `.claude/CLAUDE.md`
- `.github/copilot-instructions.md`

Version 1 stays readable at `tools/adk/profiles/addon-coding-agent.v1.json`. Its signature still verifies. The version 2 document also keeps that version on `previousVersion`, which is what `GET /api/v1/agent-registry/profiles/published/addon-coding-agent` returns.

Version 2 replaces the machine check `kassis-addon-certify` on `adk.certify` with `kassis-addon-check`, `kassis-addon-conformance`, `kassis-addon-build` and `kassis-addon-test`. Certify runs those checks and writes the only copy of the results. An agent does not type them into the attestation.

An unsigned version 3 draft lives at `tools/adk/profiles/addon-coding-agent.v3.draft.json`. It adds the blocking machine guardrail `adk.requirements-traced` (check id `adk.requirements-traced`, backed by `kassis-addon requirements` / KADK-718 and KADK-719) and six coding skills (`adk.add-route`, `adk.add-table`, `adk.add-event`, `adk.add-job`, `adk.add-ui-page`, `adk.add-mcp-tool`) whose bodies also live under `kassis-skills/adk-add-*/SKILL.md`. Do not point `sync` at the draft until a person signs it (decision D7). Certify already records `adk.requirements-traced` in `.kassis/evidence/checks.json` so the guardrail has machine evidence when version 3 is signed.

`sync --instance=<url>` downloads `GET /api/v1/agent-registry/profiles/published/<id>` instead of the bundled file.

The guardrail catalogue is `@kassis/addon-sdk/guardrails.json` (group, level, check, KADK code, fix hint). `kassis adk sync` writes catalogue metadata into `AGENTS.md` and related agent rule files. `kassis-addon certify` uses the catalogue fix hint when a guardrail fails with its primary KADK code.

`node tools/adk/kassis-adk-mcp.mjs` is a stdio MCP server. Messages are newline-delimited JSON. Project tools: `validate_manifest`, `run_checks`, `explain_error`, and `scaffold`. Offline discovery tools (packaged data, no network): `list_facades`, `get_facade`, `list_extension_points`, `list_events`, `get_event_schema`, `get_tier_matrix`, `list_guardrails`, `get_guardrail`, `search_docs`, `get_example`, and `find_core_feature` (maps a common need to the core feature, facade or extension point, and an example). Optional live mode against `GET /api/v1/adk/catalog` waits on that catalog route (S2.36).

## Registry, runs, and attestation

An API key whose scopes include `agent.service` is an agent principal. Mutating MCP tools require a run id. `certify` can start a run and post attestation answers when `KASSIS_ADK_INSTANCE`, `KASSIS_ADK_TOKEN`, and `KASSIS_ADK_AGENT_ID` are set.

Audit rows for an agent call include `agentId`, `runId`, `model`, `promptKey`, and `promptVersion` on both the success path and the rejection path.

## Final decisions

The hidden investigation update tool is marked `finalDecision`. When the agent's autonomy says the call must be approved, or the run is not attested, the runtime does not execute the tool. It creates an approval request through the existing approvals path and returns that request id. The maker sees it in Atelier under Your requests. Approving the request does not apply the tool: the `mcp_final_decision` record type has an empty `onApproved` handler.

Autonomy is read from the agent profile. If it cannot be read, the level is the most restrictive one (`suggest`).

## Settings

| Key                                           | Meaning                                                                                      |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `agents.autonomy.levels`                      | Per-agent autonomy. Unreadable values fall back to suggest.                                  |
| `agents.autonomy.attestationFailureThreshold` | Failures inside the window that downgrade the agent to suggest.                              |
| `agents.autonomy.windowMinutes`               | Window for the failure count. The count is stored in the agent registry, not in one process. |
| `agents.autonomy.budgetLimit`                 | Spend limit for an agent principal.                                                          |
| `agents.autonomy.callCost`                    | Cost reserved before a tool call.                                                            |

`agent_config_draft` returns a proposed settings change with `applied: false`. It does not write. A person publishes configuration.

## Changelog

| Date       | Change                                                                                                                                        |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Core feature map MCP tool `find_core_feature` (packaged `core-features.json`: need → feature, facade/extension, example). |
| 2026-11-16 | Guardrail catalogue `guardrails.json` in the SDK; MCP `list_guardrails` / `get_guardrail`; certify and sync read catalogue metadata. |
| 2026-11-16 | Unsigned coding profile v3 draft: `adk.requirements-traced` machine guardrail and six `adk.add-*` coding skills. Signing remains D7 / human-only. |
| 2026-11-16 | Offline discovery tools: `list_facades`, `get_facade`, `list_extension_points`, `list_events`, `get_event_schema`, `get_tier_matrix`, `search_docs`, `get_example`. |
| 2026-10-28 | The dev MCP server speaks newline-delimited JSON and exposes `validate_manifest`, `run_checks`, `explain_error`, and `scaffold`.              |
| 2026-10-28 | Coding profile version 2 replaces the `kassis-addon-certify` machine check with check, conformance, build and test. Version 1 stays readable. |
