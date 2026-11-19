# Operators

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

## Enable and disable

Enable and disable go through the platform lifecycle API (`system.admin`), not a Settings toggle. See [Addons overview](../../business/addons/overview.md).

The UI kill switch is `@kassis/addon-ui`. A killed addon renders the killed slot and does not mount its page. A thrown slot shows the failed-slot message and the rest of the host stays up.

Addon pages that set `ui.runtimeLoad` load from `/runtime-addons.json` (hashed files, not cached) or, in dev, from `/addons-ui/<id>/<file>?contentHash=<hash>`. The host serves that URL only after the addon passed the signature gate on its last load and is still enabled, and only while the content-hash and UI-hash fingerprints still match. First-party addons (`kassis`, `kassis-corp`, or an empty publisher) do not need `uiContentHash`. The browser imports addon entries by URL, so Vite does not link their CSS. Each `/runtime-addons.json` entry is `{ js, css }`, where `css` lists the stylesheets of the entry chunk and of the chunks it imports statically. In dev, the library build writes all addon CSS to `frontend/dist/index.css`, and the `addons/ui-catalog` endpoint lists the CSS files at the root of `frontend/dist` as `styleFiles`. The loader links those stylesheets and waits for them before it imports the entry. Unload removes them. The loader skips a disabled addon. Before it keeps a module, it runs the same license and health gates as `enableAddon`.

After the first boot load, the browser re-reads the UI catalog and `addons/frontend-catalog` when an addon is reported disabled or unknown, when `AddonGuard` unloads a disabled addon, and when the tab regains focus. Those refreshes are capped at one full cycle per minute (no faster polling loop).

Tier 1 server modules load with a `contentHash` query on the entry `import()` URL when the manifest carries `contentHash`, so an approved update with a new hash loads new server code without a backend restart. Disable then enable the same installed folder reuses the cached module for that hash. Each distinct hash stays in the process until the API restarts, so restart the API after a long run of tier 1 updates. Tier 1 addon authors must not keep mutable state at module scope (top-level `let`, caches, or singletons); use `initialize()` / disposers or per-request state instead.

Disable does not abort tier 1 work that has already started. That request, queue job, or event handler finishes. A request that arrives after the route is removed is not handled. A job or event that has not started is not delivered. A tier 2 call still inside the child is rejected. Its HTTP route answers **503** with `tier 2 addon <id> stopped`. A job or event delivery in flight fails the same way, and a later one is not sent to the child.

## Split workers

`RUN_MODE=all` registers and removes an addon's job handlers in the same process as the toggle. `RUN_MODE=workers` does not share that memory. That process reads `addon_configurations.is_enabled` at job time and again every 15 seconds. A disabled addon's handlers are removed, and a job for it is refused and not retried. A newly enabled addon's handlers are registered on that pass, after the same load the process uses at startup. If the enabled set cannot be read, addon jobs are refused and retried, and the handlers stay as they are. Core jobs are not checked. A worker restart is not required for a toggle. The 15-second window is `ADDON_JOB_ENABLEMENT_CACHE_MS` in `server/workers/addonJobEnablement.ts`.

## Release steps and seeds

Day-0 and later SQL are listed in [release steps](../deployment/release-steps.md). Apply them with `npm run release:apply` on a database that already exists. A rebuild does not re-run init scripts.

Seeds and migrations this kit depends on:

| Script                                                            | Why                                                                                                                                                                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database/seeds/overlays/20261027_agent_autonomy.sql`             | `agents.autonomy.*` settings. An agent call fails closed when the threshold is missing.                                                                                                                 |
| Tier 2 settings in the day-0 schema                               | `addons.tier2.*` and the egress limits. A tier 2 child will not start without them.                                                                                                                     |
| `database/migrations/20261027_audit_logs_append_only.sql`         | Audit rows cannot be updated or deleted.                                                                                                                                                                |
| `database/migrations/20261028_addon_publisher_trust.sql`          | Publisher trust tables, the kassis key, and the approval policies for adding or rotating a key and for changing tiers or prefixes. The add-policy id is `…026`; `…021` is already `mcp_final_decision`. |
| `database/migrations/20261028_addon_publisher_key_add_policy.sql` | Existing databases that applied the first seed still need this row. Without it, key add returns 503.                                                                                                    |
| `database/migrations/20261028_addon_deployment_staged.sql`        | `DeploymentState.staged`, and the approval policies for an addon install and for a rollback that widens access.                                                                                         |
| `database/migrations/20261026_db_roles_audit_owner.sql`           | `kassis_app` and the audit owner.                                                                                                                                                                       |
| `database/migrations/20261116_addon_database_roles.sql`           | Per-addon migration role and run-time role for schema `addon_<id>`. Apply with the release ledger. Tier 2 install calls it.                                                                              |
| `database/migrations/20261116_addon_schema_migrations.sql`        | Ledger and apply function for tier 2 package up scripts. Apply after the roles step, before a backend that installs those packages.                                                                     |
| `database/migrations/20261116_addon_schema_migration_revert.sql`  | Revert function for tier 2 down scripts. Apply after the schema-migration step, before a backend that rolls those packages back.                                                                        |

**Prod empty volume.** Prod compose does not load the full schema on an empty volume. Only the roles script runs. Restore a backup or apply the release ledger. On-prem does load the day-0 schema, because that file is the new-site install. Details are in the release steps.

## On-prem and air-gapped

On-prem uses `docker-compose.onprem.yml`. Air-gapped install uses the bundle from [Install](./install.md). The bundle has the public verification key and does not have the private key.

## Troubleshooting

| What you see                                                         | What to do                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Addon page is blank and the console says `register` is missing       | Export `register` from `frontend/index.ts`.                                                                                                                                                                                                          |
| `{"ok":false,"issues":[...]}` from `certify --json`                  | The `issues` array names the KADK codes. KADK-709 is a missing lock (`sync` first). KADK-701 is a missing attestation (`attest`, then fill the answers).                                                                                             |
| Tier 2 addon does not start                                          | Check `addons.tier2.*`, `addons.egress.*`, and `addons.capabilities.timeoutMs` in Settings, including `addons.tier2.stopTimeoutMs`. An invalid or missing value refuses the start. The same capability timeout bounds extension callbacks. Apply release step `20261116-tier2-capability-timeout` when the capability timeout is missing. |
| Tier 2 child still running after disable                             | Disable, update and uninstall signal the child through the host disposer and kill it if it has not exited within `addons.tier2.stopTimeoutMs`. Host shutdown waits for that stop.                                                                  |
| Revoked key still in `previous`                                      | Revoke it with `POST /api/v1/platform/addon-publishers/:id/keys/:fp/revoke`, or set status `revoked` in `KASSIS_PUBLISHER_TRUST_FILE`. A revoked row in either source wins. Listing it as `previous` does not keep it trusted.                       |
| Fresh prod database has roles and no tables                          | Expected. Restore or run `npm run release:apply`. Do not expect the prod compose file to create the schema.                                                                                                                                          |
| Agent tool returns an approval id instead of changing the case       | The tool is a final decision and the run is not attested, or autonomy is not `act`. Approve it in the Approvals UI.                                                                                                                                  |
| Bank addon does not load                                             | The publisher must be approved, the key must be `current` or `previous`, the addon id must start with one of that publisher's prefixes, and the tier must be 2. Tier 1 is only for kassis.                                                           |
| Upload returns 503                                                   | Apply `20261028-addon-deployment-staged` and publish an `addon_deployment` policy. A missing policy does not install the package. Key add 503 is the missing `addon_publisher_key` / `add` policy — apply `20261028-addon-publisher-key-add-policy`. |
| Backend crash: missing approval evidence module on startup           | Rebuild the backend image from a current kassis release. If you maintain the image Dockerfile, see [Maintainers](./maintainers.md).                                                                                                                     |
| MCP HTTP crash: `Cannot find module '/app/server/prisma.js'`         | The MCP image does not ship Prisma. Publisher trust then uses the seeded file. Rebuild MCP.                                                                                                                                                          |

## ADK catalog

`GET /api/v1/adk/catalog` needs a signed-in user with `system.admin`. `GET /api/v1/adk/version` stays open and still returns only `hostApi`.

The catalog is built from `@kassis/addon-sdk` tier-matrix data and the host registries. It lists facade method names with tier flags and the permission each call needs, capability ids with version and owning addon, event names with their JSON schemas, host slot, deep-link and source names, and reserved permission namespaces. It does not return capability implementations, settings values, tenant rows, or secrets.

## Process packs (kind 1)

Installing or updating a package that lists `process.packs[]` creates case templates, flow templates and lifecycle policies as drafts. The host calls the existing template and lifecycle services. A case template's `linked_flow_key` and `lifecycle_policy_key` are pack keys and are stored as the ids created for those packs. `source_addon`, `source_key` and `source_version` record the package. Drafts stay unpublished, and a lifecycle pack is not made the default. A listed kind other than those three stops the install. A `source_key` that is already present is left unchanged. Apply release step `20261116-process-pack-provenance` on a database that does not already have those columns.

## Tier 2 package migrations

Installing or updating a tier 2 package applies `migrations/*.up.sql` from that package. The host provisions schema `addon_<id>` (hyphens in the id become underscores), then runs each pending up script as role `addon_<id>_migrate` inside the install or update lease. The script and its checksum row commit together. A script that fails leaves that script unapplied; scripts that already committed stay applied, and the install or update stops. A script whose file changed after it was applied is refused. The same file name in two packages is two rows. The app role is not a member of the migration role.

Each script must be ordinary SQL that can run in one transaction. It cannot contain psql commands, its own `COMMIT`, or the text `$kassis_mig$`. One script has to finish within the server's interactive transaction timeout (`PRISMA_TX_TIMEOUT_MS`, 30 seconds by default). There is no schema dump before the run; a failed script rolls back with its ledger row. Down scripts are not run on install or update.

Rolling back a tier 2 package runs `migrations/*.down.sql` for each applied script the target version does not contain, newest name first, as `addon_<id>_migrate`. The down script and the deletion of its ledger row commit together. A script marked `irreversible: true` in its `<name>.json` marker blocks that rollback before any down script runs. The install approval shows those migration names and `automaticRollback: blocked`. Apply release step `20261116-addon-schema-migration-revert` before rolling a package back. Uninstall does not export or drop the schema.

Tier 1 packages are not migrated by this path.

## Uninstall retention

Uninstall reads `data.retention` on a v2 manifest (`retain`, `archive`, `purge`). When that field is absent it still reads v1 `database.dataRetentionPolicy` (`retain`, `archive`, `delete`). `retain` and `archive` leave prefixed tables in place. `delete` and `purge` report leftover prefixed tables as residuals. `purge` writes one `retention_purge` audit row. Exporting or dropping the addon schema is the migration runner, not this check.

## Package deploy

`POST /api/v1/addon-security/deploy` accepts `.addon` (zip) and `.tar.gz`. The upload temp file often has no extension; the host sniffs zip (`PK`) and gzip magic when the name is not `.addon`, `.zip`, or `.tar.gz`. It checks the signature and recomputes `contentHash` on the extracted folder before anything is copied. `manifest.checksum` is not compared. An optional `archiveSha256` field is compared to the uploaded bytes and protects the transfer only.

`GET /api/v1/platform/addons/installations` lists each addon id, the active version, the publisher, and pending staged versions. It uses the same `system.admin` token as deploy. It does not return secrets. `kassis-addon status` calls this route.

A valid package creates a `platform_addon_deployments` row in `staged` and an `addon_deployment` approval. On approval the host copies the package to `addons-installed/<id>/<version>/` and keeps older version folders. Tier 2 is then enabled through the lifecycle API, and the supervisor starts the child without a process restart. Enable of a manifest v2 addon refuses `MANDATORY_CONTRACT` (HTTP 409) when a record access check returns true or only throws, when a deletion handler is empty or only throws, when a declared record type has no access check, or when owned tables have no deletion handler. The same rules are KADK-729 to KADK-732 on `kassis-addon check` and `certify`. v1 addons are not part of that check. A tier 1 package from a publisher other than `kassis` is refused. A `kassis` tier 1 package is stored and is not hot-started; enable and disable stay on the lifecycle API.

The version must be higher than the installed one, and the addon id must match the manifest id pattern. An id already owned by another publisher is refused. `hostApi` must accept this instance's host API (`1.0.0`).

`POST /api/v1/platform/addons/:id/rollback` with `{ "targetVersion": "<version>" }` switches `active.json` back to a kept folder and is audited. It asks for approval only when that version adds permissions, egress hosts, or data access. `addons-installed` is a volume on the compose stacks and a persistent volume claim in `deploy/k8s/production/deployment.yaml`. The loader looks in `addons/` first, then the active folder under `addons-installed`.

`kassis-addon dev` publishes the container on `127.0.0.1`. It also starts a pre-started tier 2 runner on an internal network (`kassis-tier2-<id>`) and points the backend at it. Neither container receives a Docker socket. The runner can reach the backend egress proxy and nothing else. Set `KASSIS_DEVHOST_ATTACH` to a running backend container name when that image needs the stack network and secrets. The dev process uses `RUN_MODE=api`, so it does not take the background jobs.

A production instance uses the same shape. Leave `KASSIS_TIER2_CONTAINER_RUNNERS` unset to keep the process runner (accident isolation). Set it to `host:port` pairs the orchestrator already started, one per addon, and set `KASSIS_TIER2_EGRESS_ADVERTISE_HOST` to the name those containers use for the API. Apply [tier2-runner-network-policy.yaml](../../../../deploy/k8s/production/tier2-runner-network-policy.yaml). The local overlay is `docker compose -f docker-compose.yml -f deploy/docker/docker-compose.tier2-runner.yml`. Do not mount `/var/run/docker.sock` or `/run/secrets` into the runner. The addon package directory must be visible at the same path in the runner as the path the backend sends.

MCP discovery lists a tier 2 tool from `contributions.mcp` on an active installed addon when that addon's signature still verifies. A revoked signing key removes the tool from the next discovery load. The MCP container image does not ship a database client, so that load on the MCP container still reads the trust file. The backend discovery load reads the database.

Enable and disable reach MCP without a process restart. List and call read `GET /api/v1/addons/status` and keep that result for `MCP_ADDON_STATUS_CACHE_MS` (five seconds when unset). A disabled addon's tools are left off the list, and a call returns `Addon <id> is disabled`. A newly enabled addon's tools are loaded on the next list or call after the cache expires, through the same signature and trust gate as startup. If that status read fails or the body is not a list, addon tools are withheld and a call returns `Addon <id> tools are unavailable because addon state could not be read`. Core tools stay listed. An addon that is not in the status list is still offered.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Live lab and backend image kit paths moved to [Maintainers](./maintainers.md).                                                                                                                          |
| 2026-11-16 | The live lab workflow runs `--only=H` after L1–L22. That step hot-toggles `acme-swift-approval` against `GET /api/v1/adk/version` and trusts the lab acme key only through `KASSIS_PUBLISHER_TRUST_FILE`. |
| 2026-11-16 | MCP status poll sends the first `CORS_ORIGIN` (default `http://localhost`) and `Authorization` when `KASSIS_MCP_STATUS_BEARER` is set. One addon whose MCP contribution fails to load is skipped; other tools stay listed. Lab secret files are mode 0644. A mode switch clears a leftover `KASSIS_PUBLISHER_TRUST_FILE`. |
| 2026-11-16 | Install and update also draft list, entity, dashboard and data-flow templates, policy, flag, QA and compliance rules, and questionnaire, prompt and email templates. They are not published. Apply `20261116-process-pack-provenance` first. Questionnaire packs also need `20261114-questionnaire-hardening`. |
| 2026-11-16 | Install and update create kind-1 process packs (case template, flow template, lifecycle policy) as drafts and set provenance. Apply `20261116-process-pack-provenance` first on a database that lacks the columns.                                                     |
| 2026-11-16 | Tier 2 container runner is opt-in via `KASSIS_TIER2_CONTAINER_RUNNERS`. `kassis-addon dev` starts that runner on an internal network. Apply `deploy/k8s/production/tier2-runner-network-policy.yaml` on the cluster.                                                  |
| 2026-11-16 | Disable lets in-flight tier 1 requests, jobs, and event handlers finish, and does not start new ones. An in-flight tier 2 call is rejected; the HTTP route answers 503 `tier 2 addon <id> stopped`.                                                                    |
| 2026-11-16 | Tier 2 rollback runs down scripts as `addon_<id>_migrate`. An irreversible migration blocks that rollback and is named on the install approval. Apply `20261116-addon-schema-migration-revert` first. |
| 2026-11-16 | Tier 2 install and update apply package up scripts as `addon_<id>_migrate`, one transaction per script with its checksum. Apply release step `20261116-addon-schema-migrations` first. Tier 1 is unchanged. Uninstall does not drop the schema. |
| 2026-11-16 | `GET /api/v1/adk/catalog` returns facade names, event schemas, capability ids, host slot names and reserved permission namespaces for `system.admin`. It does not return implementations or secrets.                                                                   |
| 2026-11-16 | Enable of a manifest v2 addon returns `MANDATORY_CONTRACT` when canAccess returns true or only throws, or onDelete is empty or only throws (KADK-729 to KADK-732). v1 addons are unchanged. |
| 2026-11-16 | Runtime-load UIs re-read `addons/ui-catalog` and `addons/frontend-catalog` on disable, unknown enablement, and tab focus (at most once per minute).                                                                                                                      |
| 2026-11-16 | Tier 1 `import()` is keyed by manifest `contentHash` so hot updates load new server code; disable then enable of the same hash reuses the module. Authors must avoid module-level mutable state.                                                                       |
| 2026-11-16 | Uninstall applies v2 `data.retention` (`retain`, `archive`, `purge`) and still accepts v1 `delete`. `purge` adds one `retention_purge` audit row. Prefixed tables left behind fail the residual check for `delete` and `purge`.                                        |
| 2026-11-16 | MCP list and call follow addon enablement from `GET /api/v1/addons/status`, cached for `MCP_ADDON_STATUS_CACHE_MS` (default five seconds). A failed read withholds addon tools. Core tools stay. A process restart is not required.                                      |
| 2026-11-16 | Release step `20261116-addon-database-roles` adds the per-addon migration and run-time database roles. Apply it with `npm run release:apply`.                                                                                                                          |
| 2026-11-16 | Tier 2 extension callbacks wait the same `addons.capabilities.timeoutMs`. A disabled, crashed, or slow addon fails closed. No new setting.                                                                                                                                |
| 2026-11-16 | Tier 2 capability calls wait `addons.capabilities.timeoutMs` (release step `20261116-tier2-capability-timeout`). A missing value refuses the child start.                                                                                                               |
| 2026-11-16 | Split workers follow addon enablement from `addon_configurations` within 15 seconds. A disabled addon's jobs are refused without retry. A worker restart is not required for a toggle.                                                                                 |
| 2026-11-14 | `KASSIS_DEVHOST_ATTACH` makes `kassis-addon dev` join that container's network and secrets and run as `RUN_MODE=api`.                                                                                                                                                    |
| 2026-11-14 | Installed tier 2 MCP tools are listed only while the signing key still verifies. A revoked key drops the tool on the next discovery load.                                                                                                                              |
| 2026-11-14 | Disable, update and uninstall stop a tier 2 child. The wait before the process is killed is `addons.tier2.stopTimeoutMs` (release step `20261114-tier2-stop-timeout`). Host shutdown waits for the same stop.                                                          |
| 2026-11-03 | Runtime addon CSS loads again. `/runtime-addons.json` entries are `{ js, css }`, the ui-catalog lists `styleFiles`, and the loader links them before the import. Addon settings pages had rendered without their stylesheets since the 2026-10-27 runtime-load change. |
| 2026-10-28 | The `addon_publisher_key` add policy uses id `…026` so it does not collide with `mcp_final_decision`. Existing databases apply `20261028-addon-publisher-key-add-policy`. Deploy sniffs zip/gzip magic when the upload temp file has no extension.                     |
| 2026-10-28 | The production backend image ships approval evidence helpers so host approval evidence can load after the server tree is flattened onto `/app`. MCP HTTP falls back to the seeded publisher-trust file when Prisma is not in the image.                                 |
| 2026-10-28 | `GET /api/v1/platform/addons/installations` returns the active version, publisher, and pending staged versions for each addon id.                                                                                                                                      |
| 2026-10-28 | Package upload stages an `addon_deployment` approval and installs to `addons-installed/<id>/<version>/`. Tier 2 enables without a restart. Rollback is `POST /api/v1/platform/addons/:id/rollback`.                                                                    |
| 2026-10-28 | Runtime UI requests include `contentHash`. The host serves `/addons-ui/<id>/*` only after the signature gate, while the addon is enabled and the content-hash and UI-hash fingerprints still match. First-party publishers do not need `uiContentHash`.                |
| 2026-10-28 | Apply `20261028_addon_publisher_trust` before a bank signing key can be stored. Revocation is immediate.                                                                                                                                                               |
