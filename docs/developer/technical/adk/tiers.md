# Tiers

Tier 2 process isolation is accident isolation until the container runner is the production default. The process runner starts the child under the Node permission model so it cannot read host files outside its package and the modules it must load, and it cannot spawn a process, a worker, or a native addon. The image user `kassis-addon` is used only when the supervisor is root. On Node 24.18.1 there is no network permission flag, so the child can still open its own TCP socket, including to Postgres.

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

## Tier 1

A tier 1 addon is loaded in the host process. `initialize()` runs there. This is the right tier for the first-party addons that ship with Kassis.

## Tier 2

Set `"tier": 2` on the manifest. The host does not import the addon. `superviseTier2Addon()` starts a `Tier2Runner`. The process runner (`createProcessTier2Runner`) is the implementation that spawns one child under `--permission` (read paths only; no `--allow-child-process`, `--allow-worker`, or `--allow-addons`). The child environment is the declared values plus the egress proxy, not the host `process.env`, so `DATABASE_URL` is absent. The runner's `start`, `stop`, `call`, and `health` are the only process controls the supervisor uses. A direct TCP socket is still possible: Node 24.18.1 rejects `--allow-net`.

The process runner is the default. That default is accident isolation: the addon is a child process on the host, not a separate container. The container runner is the production isolation target. Set `KASSIS_TIER2_CONTAINER_RUNNERS` to a comma-separated `host:port` list of pre-started generic runner containers. The backend dials that TCP port. It does not receive a Docker socket and it does not start containers. Each container loads and drops one addon package. The same JSON-RPC is used, including `capability.invoke`. The egress proxy is published to those containers at `KASSIS_TIER2_EGRESS_ADVERTISE_HOST` on `KASSIS_TIER2_EGRESS_PORT` (7401). The required network policy is [tier2-runner-network-policy.yaml](../../../../deploy/k8s/production/tier2-runner-network-policy.yaml): ingress only from the API pods to RPC port 7400, egress only to the API pods on the proxy port. A local compose overlay with the same limits is [docker-compose.tier2-runner.yml](../../../../deploy/docker/docker-compose.tier2-runner.yml). `kassis-addon dev` starts one runner on an internal network and does not mount a Docker socket into either container.

The child speaks JSON-RPC. The host mounts HTTP at `/api/v1/addons/<id>` and `POST /_mcp/:tool`. MCP discovery synthesizes tools that call those URLs. A caller must be a host-issued principal who holds every gate permission, or `system.admin` when the manifest declares none.

The supervisor enforces:

- egress hosts from the manifest (`egress.hosts`)
- a heap cap from `resources.memoryMb`
- restart and health limits from Settings

When the restart limit or the health-failure limit is hit, the supervisor disables the addon in the registry. The host process keeps running.

## Facade bridge

The child does not import core and does not receive `DATABASE_URL` or the host environment. `initialize(ctx)` runs in the child. Calls shaped `ctx.<facade>.<method>` go over the same JSON-RPC line to the facade objects `createAddonContext` builds for tier 1. The manifest policy and `AddonAccessGuard` are unchanged. The host inserts the addon's service principal. The child cannot choose that principal or a schema or role name.

The host provisions one IAM user per addon, `addon.<id>@service.kassis.local`, with role `addon_service`. That role has no grants until an operator adds them. A call the account cannot make is refused (KADK-615). A route permission that is not in the manifest is refused (KADK-216). The child cannot call `ctx.core.approvals.applyRegistered`. That call would let it choose `decidedBy`. The host delivers `approval.apply` when the engine approves a record type the addon owns.

`ctx.events.subscribe`, `ctx.jobs.register`, and `ctx.jobs.schedule` are registered on the host during `initialize()`. The host delivers them with `event.deliver` and `job.run`. A failed event delivery is written to the existing domain-events queue and retried there. A failed job stays on the job queue that `ctx.jobs` already uses. A child crash does not drop that work.

`ctx.capabilities.provide` is allowed when the capability id is in the addon namespace (`<id>.` or the id with hyphens turned into underscores) and that id and version are listed in `provides`. The implementation stays in the child. A consumer's call is forwarded to that process. The wait is Settings `addons.capabilities.timeoutMs`. If the provider is disabled, crashed, or does not answer in time, the consumer gets `null`. `ctx.capabilities.register` stays refused.

`ctx.extend.*` is accepted only for a point named in manifest `extends`. The host calls the child back with `extend.callback`, the acting principal, and the same Settings timeout as a capability call (`addons.capabilities.timeoutMs`). A disabled, crashed, or slow addon fails closed: an access check is not an allow, an approval stays pending, a deletion is retried, and an automation step errors. Wave 1 points on the allow-list are `registerAuditSubject`, `registerRecordAccess`, `registerDeletable`, `registerDocumentable`, and `registerLinkable`. Wave 2 adds `registerApprovable`, `registerApprovableFields`, and `registerCommunicable`. Wave 3 adds `registerFlaggable`. Wave 4 adds `registerAutomationTrigger`, `registerAutomationAction`, and `registerAutomationFields`. `communicable` is a manifest extend id. The host admits automation on the Flag Automation catalog, and a trigger or action callback errors when the addon is down. Those registrations are removed on disable. Two addons cannot own the same name (KADK-223). `onApproved` and `onRejected` call the child with the deciding user and stay pending when the child is down. `registerCommunicable` stores the owner type `ctx.core.communication.send` and `list` require. `registerFlaggable` calls `findUnique` and `findMany` on the child and throws when the child is down so the flag layer does not invent or drop flags. `ctx.notify.registerType` is limited to the addon namespace and is removed on disable. `ctx.extend.registerLicenseFeatures` and `ctx.extend.registerShutdownHook` stay refused for tier 2 (decision D-S227 in the ADK consolidated plan). A shutdown hook is awaited with no timeout inside host shutdown, so a client handler could hold the process. License registration writes a process-wide catalog that replaces the platform keys `core`, `analytics`, `automation` and `integrations` and the same key from another addon, and `defaultAccess: true` is treated as allowed when the signed license does not name the key. It does not return the tenant's license. Still refused in tier 2: `capabilities.register`, `locks`, and the Prisma helpers `ctx.data.$queryRaw`, `ctx.data.$executeRaw` and `ctx.data.$transaction`. `ctx.data.read` accepts a table name. The host qualifies it with `data.schema` (or `addon_<id>` when the manifest omits the schema) and reads only `database.ownedTables`. Any other table, or a name that contains a schema, is refused.

`ctx.data.query`, `ctx.data.execute` and `ctx.data.transaction` send one parameterised statement, or a batch of them. Placeholders are `$1`, `$2`, and so on. The host binds the JSON values. The statement runs as `addon_<id>_runtime` (SELECT, INSERT, UPDATE, DELETE on that schema only). The database function refuses a second command in the same string. The child does not name the role or the schema. On the first call the host installs `kassis_data_statement` in the add-on schema; that needs `kassis_provision_addon_database` (S2.01) to have created the schema. Statement timeout is Settings `addons.data.statementTimeoutMs` (seed 5000). A query that would return more rows than Settings `addons.data.rowCap` (seed 100) is refused. Both limits are read on the call. `ctx.data.read` uses the same row cap. A batch runs in one transaction and rolls back if any statement fails. Structure changes stay on the migration role. Every `execute` in `ctx.data.execute` or `ctx.data.transaction` gets a host baseline row in `audit_logs` (`ADDON_DATA_WRITE`: add-on id, service principal, parsed table, operation, row count). The child cannot turn that off.

The tier 2 RPC allow-list is `TIER2_FACADE_METHODS` in `server/core/addon-platform/tier2/tier2RpcAllowlist.ts`. The same list, plus every other `ctx` facade method and its tier 1 availability, ships as `@kassis/addon-sdk/tier-matrix.json`. `npm run ci:adk:tier-matrix` fails when that file disagrees with the allow-list. Business meaning: [Addons overview](../../business/addons/overview.md).

`sample-tprm-check` is the fixture the tier 2 tests load. It is not a product addon. On a local backend, installing a signed copy started the child with no `DATABASE_URL`. `GET /api/v1/addons/sample-tprm-check/health` returned 204. `POST /_mcp/probe.env` returned the child pid. Killing the child restarted it. Further kills left that route at 503, and the rest of the API still answered. The fixture was removed afterwards. A tier 2 addon does not need its own entry file.

## Settings

These keys are read from Settings. A missing or invalid value refuses to start the child. The two `addons.data` keys are read on each data call and refuse that call instead.

| Key                               | Meaning                               |
| --------------------------------- | ------------------------------------- |
| `addons.tier2.restartBackoffMs`   | Delay before a restart                |
| `addons.tier2.maxRestarts`        | Restarts before the addon is disabled |
| `addons.tier2.healthIntervalMs`   | Time between health probes            |
| `addons.tier2.healthFailureLimit` | Consecutive failures before disable   |
| `addons.egress.timeoutMs`         | Fetch timeout                         |
| `addons.egress.maxResponseBytes`  | Fetch response cap                    |
| `addons.capabilities.timeoutMs`   | Capability call and extension callback timeout |
| `addons.data.statementTimeoutMs`  | Timeout for one `ctx.data` statement  |
| `addons.data.rowCap`              | Most rows one `ctx.data` query may return |

## Changelog

| Date       | Change                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Wave 4 opens automation trigger, action, and fields for tier 2. Catalog rows leave on disable. A callback step errors when the addon is down. |
| 2026-11-16 | Tier 2 `registerLicenseFeatures` and `registerShutdownHook` stay closed. A shutdown hook can delay host shutdown. A license registration can overwrite catalog keys and mark `defaultAccess`. |
| 2026-11-16 | Wave 3 opens `registerFlaggable` for tier 2. `findUnique` and `findMany` call the child and throw when the child is down. |
| 2026-11-16 | Wave 2 opens approvable, approvable fields, and communicable for tier 2. `communicable` is a manifest extend id. Send and list use that owner. An unanswered approval callback stays pending. |
| 2026-11-16 | Wave 1 opens audit subject, record access, deletable, documentable, and linkable for tier 2. Notification types stay in the addon namespace. `registerCommunicable` stays refused. |
| 2026-11-16 | Tier 2 may call `ctx.core.communication.send`, `list` and `registerAccess`. Record access calls the child with `communication.access` and fails closed. |
| 2026-11-16 | Host writes `ADDON_DATA_WRITE` on every tier 2 `ctx.data.execute` and on each execute statement in `ctx.data.transaction`.                                              |
| 2026-11-16 | Tier 2 `ctx.extend.*` registers only points named in manifest `extends`. Callbacks use `extend.callback`, the acting principal, and `addons.capabilities.timeoutMs`. A disabled, crashed, or slow child fails closed. |
| 2026-11-16 | Container runner dials pre-started containers over TCP. No Docker socket. Network policy allows only RPC port 7400 and the egress proxy on 7401. The process runner stays the default until `KASSIS_TIER2_CONTAINER_RUNNERS` is set. |
| 2026-11-16 | Process runner uses the Node permission model. Isolation is accident isolation: secret reads and spawn are denied; a TCP socket stays open on Node 24. `kassis-addon` is used only when the supervisor is root. |
| 2026-11-16 | Tier 2 `ctx.data.query`, `ctx.data.execute` and `ctx.data.transaction` run parameterised SQL as `addon_<id>_runtime`. Timeout and row cap come from Settings.            |
| 2026-11-16 | `@kassis/addon-sdk` types `ctx.data` as `AddonTier2DataClient` or `AddonTier1DataClient` from manifest `tier`; Prisma helpers are tier 1 only.                            |
| 2026-11-16 | Tier 2 supervision goes through `Tier2Runner` (`start`, `stop`, `call`, `health`). The current child process is the process runner.                                      |
| 2026-11-16 | Tier 2 may provide a namespaced capability declared in `provides`. Consumer calls are forwarded to the provider child with `addons.capabilities.timeoutMs`. A down provider returns null. |
| 2026-11-16 | Documented `@kassis/addon-sdk/tier-matrix.json` as the packaged tier capability matrix; CI checks it against `TIER2_FACADE_METHODS`.                                      |
| 2026-11-16 | `kassis-addon doctor --requirements` scans addon source for `ctx` calls the manifest tier cannot use and reports KADK-219 before build.                                    |
| 2026-10-28 | Tier 2 calls the host facades over RPC. Events and jobs are delivered to the child and retried on the existing queues. The child cannot call `approvals.applyRegistered`. |
