# Tiers

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Tier 1

A tier 1 addon is loaded in the host process. `initialize()` runs there. This is the right tier for the first-party addons that ship with Kassis.

## Tier 2

Set `"tier": 2` on the manifest. The host does not import the addon. `superviseTier2Addon()` starts one child process. The child environment is the declared values plus the egress proxy, not the host `process.env`, so `DATABASE_URL` is absent.

The child speaks JSON-RPC. The host mounts HTTP at `/api/v1/addons/<id>` and `POST /_mcp/:tool`. MCP discovery synthesizes tools that call those URLs. A caller must be a host-issued principal who holds every gate permission, or `system.admin` when the manifest declares none.

The supervisor enforces:

- egress hosts from the manifest (`egress.hosts`)
- a heap cap from `resources.memoryMb`
- restart and health limits from Settings

When the restart limit or the health-failure limit is hit, the supervisor disables the addon in the registry. The host process keeps running.

## Facade bridge

The child does not import core and does not receive `DATABASE_URL` or the host environment. `initialize(ctx)` runs in the child. Calls shaped `ctx.<facade>.<method>` go over the same JSON-RPC line to the facade objects `createAddonContext` builds for tier 1. The manifest policy and `AddonAccessGuard` are unchanged. The host inserts the addon's service principal. The child cannot choose that principal, send SQL, or choose the schema prefix.

The host provisions one IAM user per addon, `addon.<id>@service.kassis.local`, with role `addon_service`. That role has no grants until an operator adds them. A call the account cannot make is refused (KADK-615). A route permission that is not in the manifest is refused (KADK-216). The child cannot call `ctx.core.approvals.applyRegistered`. That call would let it choose `decidedBy`. The host delivers `approval.apply` when the engine approves a record type the addon owns.

`ctx.events.subscribe`, `ctx.jobs.register`, and `ctx.jobs.schedule` are registered on the host during `initialize()`. The host delivers them with `event.deliver` and `job.run`. A failed event delivery is written to the existing domain-events queue and retried there. A failed job stays on the job queue that `ctx.jobs` already uses. A child crash does not drop that work.

Still refused in tier 2: `extend.*`, `capabilities.register`, `capabilities.provide`, and `locks`. `ctx.data.read` accepts a table name. The host qualifies it with `data.schema` (or `addon_<id>` when the manifest omits the schema) and reads only `database.ownedTables`. Any other table, or a name that contains a schema, is refused.

The method list is `TIER2_FACADE_METHODS` in `server/core/addon-platform/tier2/tier2RpcAllowlist.ts`. Business meaning: [Addons overview](../../business/addons/overview.md).

`sample-tprm-check` is the fixture the tier 2 tests load. It is not a product addon. On a local backend, installing a signed copy started the child with no `DATABASE_URL`. `GET /api/v1/addons/sample-tprm-check/health` returned 204. `POST /_mcp/probe.env` returned the child pid. Killing the child restarted it. Further kills left that route at 503, and the rest of the API still answered. The fixture was removed afterwards. A tier 2 addon does not need its own entry file.

## Settings

These keys are read from Settings. A missing or invalid value refuses to start the child.

| Key | Meaning |
| --- | --- |
| `addons.tier2.restartBackoffMs` | Delay before a restart |
| `addons.tier2.maxRestarts` | Restarts before the addon is disabled |
| `addons.tier2.healthIntervalMs` | Time between health probes |
| `addons.tier2.healthFailureLimit` | Consecutive failures before disable |
| `addons.egress.timeoutMs` | Fetch timeout |
| `addons.egress.maxResponseBytes` | Fetch response cap |

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | Tier 2 calls the host facades over RPC. Events and jobs are delivered to the child and retried on the existing queues. The child cannot call `approvals.applyRegistered`. |
