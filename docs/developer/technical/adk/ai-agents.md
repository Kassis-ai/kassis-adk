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

An unsigned version 3 draft lives at `tools/adk/profiles/addon-coding-agent.v3.draft.json`. Every blocking guardrail in that draft names a machine check. `adk.requirements-traced` is backed by `kassis-addon requirements` (KADK-718 and KADK-719). `adk.requirement-plan-mapped` is backed by `kassis-addon plan` (KADK-720, KADK-721, and KADK-722). `adk.sdk-imports-only` and `adk.reversible-migrations` use `kassis-addon conformance`. `adk.event-schemas-and-null-capabilities` uses `kassis-addon check` for schema paths (KADK-406); that command does not scan source for a null capability. `adk.attest-pinned-profile` reads the lock and `.kassis/attestation.json`. `adk.certify` still names check, conformance, build, and test. Guardrails with no machine check are advisory: `adk.work-in-own-repo`, `adk.declared-permissions-and-audit`, `adk.declare-widened-access` (the evidence pack still shows the change summary), `adk.no-unrequested-refactors`, `adk.lowest-rung`, and `adk.document-changes`. The draft also has six coding skills (`adk.add-route`, `adk.add-table`, `adk.add-event`, `adk.add-job`, `adk.add-ui-page`, `adk.add-mcp-tool`) whose bodies live under `kassis-skills/adk-add-*/SKILL.md`. Do not point `sync` at the draft until a person signs it (decision D7). The signed version 2 profile is unchanged and still self-attests those blocking rules. Certify records the machine check ids in `.kassis/evidence/checks.json`.

`sync --instance=<url>` downloads `GET /api/v1/agent-registry/profiles/published/<id>` instead of the bundled file.

Group A reuse checks run inside `kassis-addon check`: banned packages are listed in `@kassis/addon-sdk/banned-dependencies.json` (KADK-221), and approval, notification, audit, user, and role tables fail unless `REUSE.md` explains them (KADK-310, warning KADK-311). Each other owned table needs `database.tableNotes` (warning KADK-312).

The guardrail catalogue is `@kassis/addon-sdk/guardrails.json` (group, level, check, KADK code, fix hint). `kassis adk sync` writes catalogue metadata into `AGENTS.md` and related agent rule files. `kassis-addon certify` uses the catalogue fix hint when a guardrail fails with its primary KADK code.

Group D soft budgets (`adk.thin-addon-budgets`) are machine-checked by `kassis-addon budgets` (KADK-723 when over a limit without a `BUDGETS.md` reason). Group E engineering checks (`adk.outbound-timeouts`, `adk.pagination-and-query-caps`, `adk.ui-i18n`, `adk.idempotent-handlers`, `adk.no-module-state`) are machine-checked by `kassis-addon engineering` (KADK-724–728). Certify records those check ids in `.kassis/evidence/checks.json`. They are not yet on the signed coding profile or the unsigned v3 draft (`inProfile: false`); adding them is a human profile update (D7).

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
| 2026-11-16 | Group D/E machine checks: `kassis-addon budgets` (KADK-723) and `kassis-addon engineering` (KADK-724–728); catalogue rows flipped/added with `inProfile: false` pending D7 profile update. |
| 2026-11-16 | Unsigned profile v3: every blocking guardrail names a machine check. `adk.work-in-own-repo`, `adk.declared-permissions-and-audit`, `adk.declare-widened-access`, and `adk.no-unrequested-refactors` are advisory. Signing remains D7. |
| 2026-11-16 | Core feature map MCP tool `find_core_feature` (packaged `core-features.json`: need → feature, facade/extension, example). |
| 2026-11-16 | Group A reuse checks in `kassis-addon check`: banned dependencies (KADK-221), private mechanism tables (KADK-310/311), owned-table notes (KADK-312). |
| 2026-11-16 | Guardrail catalogue `guardrails.json` in the SDK; MCP `list_guardrails` / `get_guardrail`; certify and sync read catalogue metadata. |
| 2026-11-16 | Unsigned coding profile v3 draft: `adk.requirements-traced` machine guardrail and six `adk.add-*` coding skills. Signing remains D7 / human-only. |
| 2026-11-16 | Offline discovery tools: `list_facades`, `get_facade`, `list_extension_points`, `list_events`, `get_event_schema`, `get_tier_matrix`, `search_docs`, `get_example`. |
| 2026-10-28 | The dev MCP server speaks newline-delimited JSON and exposes `validate_manifest`, `run_checks`, `explain_error`, and `scaffold`.              |
| 2026-10-28 | Coding profile version 2 replaces the `kassis-addon-certify` machine check with check, conformance, build and test. Version 1 stays readable. |
