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
