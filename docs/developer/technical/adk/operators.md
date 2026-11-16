# Operators

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-11-16

## Enable and disable

Enable and disable go through the platform lifecycle API (`system.admin`), not a Settings toggle. See [Addons overview](../../business/addons/overview.md).

The UI kill switch is `@kassis/addon-ui`. A killed addon renders the killed slot and does not mount its page. A thrown slot shows the failed-slot message and the rest of the host stays up.

Addon pages that set `ui.runtimeLoad` load from `/runtime-addons.json` (hashed files, not cached) or, in dev, from `/addons-ui/<id>/<file>?contentHash=<hash>`. The host serves that URL only after the addon passed the signature gate on its last load and is still enabled, and only while the content-hash and UI-hash fingerprints still match. First-party addons (`kassis`, `kassis-corp`, or an empty publisher) do not need `uiContentHash`. The browser imports addon entries by URL, so Vite does not link their CSS. Each `/runtime-addons.json` entry is `{ js, css }`, where `css` lists the stylesheets of the entry chunk and of the chunks it imports statically. In dev, the library build writes all addon CSS to `frontend/dist/index.css`, and the `addons/ui-catalog` endpoint lists the CSS files at the root of `frontend/dist` as `styleFiles`. The loader links those stylesheets and waits for them before it imports the entry. Unload removes them. The loader skips a disabled addon. Before it keeps a module, it runs the same license and health gates as `enableAddon`.

After the first boot load, the browser re-reads the UI catalog and `addons/frontend-catalog` when an addon is reported disabled or unknown, when `AddonGuard` unloads a disabled addon, and when the tab regains focus. Those refreshes are capped at one full cycle per minute (no faster polling loop).

Tier 1 server modules load with a `contentHash` query on the entry `import()` URL when the manifest carries `contentHash`, so an approved update with a new hash loads new server code without a backend restart. Disable then enable the same installed folder reuses the cached module for that hash. Tier 1 addon authors must not keep mutable state at module scope (top-level `let`, caches, or singletons); use `initialize()` / disposers or per-request state instead.

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

**Prod empty volume.** Prod compose does not load the full schema on an empty volume. Only the roles script runs. Restore a backup or apply the release ledger. On-prem does load the day-0 schema, because that file is the new-site install. Details are in the release steps.

## On-prem and air-gapped

On-prem uses `docker-compose.onprem.yml`. Air-gapped install uses the bundle from [Install](./install.md). The bundle has the public verification key and does not have the private key.

## Troubleshooting

| What you see                                                         | What to do                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Addon page is blank and the console says `register` is missing       | Export `register` from `frontend/index.ts`.                                                                                                                                                                                                          |
| `{"ok":false,"issues":[...]}` from `certify --json`                  | The `issues` array names the KADK codes. KADK-709 is a missing lock (`sync` first). KADK-701 is a missing attestation (`attest`, then fill the answers).                                                                                             |
| Tier 2 addon does not start                                          | Check `addons.tier2.*` and `addons.egress.*` in Settings, including `addons.tier2.stopTimeoutMs`. An invalid or missing value refuses the start.                                                                                                     |
| Tier 2 child still running after disable                             | Disable, update and uninstall signal the child through the host disposer and kill it if it has not exited within `addons.tier2.stopTimeoutMs`. Host shutdown waits for that stop.                                                                  |
| Revoked key still in `previous`                                      | Revoke it with `POST /api/v1/platform/addon-publishers/:id/keys/:fp/revoke`, or set status `revoked` in `KASSIS_PUBLISHER_TRUST_FILE`. A revoked row in either source wins. Listing it as `previous` does not keep it trusted.                       |
| Fresh prod database has roles and no tables                          | Expected. Restore or run `npm run release:apply`. Do not expect the prod compose file to create the schema.                                                                                                                                          |
| Agent tool returns an approval id instead of changing the case       | The tool is a final decision and the run is not attested, or autonomy is not `act`. Approve it in the Approvals UI.                                                                                                                                  |
| Bank addon does not load                                             | The publisher must be approved, the key must be `current` or `previous`, the addon id must start with one of that publisher's prefixes, and the tier must be 2. Tier 1 is only for kassis.                                                           |
| Upload returns 503                                                   | Apply `20261028-addon-deployment-staged` and publish an `addon_deployment` policy. A missing policy does not install the package. Key add 503 is the missing `addon_publisher_key` / `add` policy — apply `20261028-addon-publisher-key-add-policy`. |
| Backend crash: `Cannot find module '/tools/adk/evidenceSummary.mjs'` | The production image must copy `tools/adk/evidenceSummary.mjs` and symlink `/tools` to `/app/tools`. Rebuild the backend.                                                                                                                            |
| MCP HTTP crash: `Cannot find module '/app/server/prisma.js'`         | The MCP image does not ship Prisma. Publisher trust then uses the seeded file. Rebuild MCP.                                                                                                                                                          |

## Uninstall retention

Uninstall reads `data.retention` on a v2 manifest (`retain`, `archive`, `purge`). When that field is absent it still reads v1 `database.dataRetentionPolicy` (`retain`, `archive`, `delete`). `retain` and `archive` leave prefixed tables in place. `delete` and `purge` report leftover prefixed tables as residuals. `purge` writes one `retention_purge` audit row. Exporting or dropping the addon schema is the migration runner, not this check.

## Package deploy

`POST /api/v1/addon-security/deploy` accepts `.addon` (zip) and `.tar.gz`. The upload temp file often has no extension; the host sniffs zip (`PK`) and gzip magic when the name is not `.addon`, `.zip`, or `.tar.gz`. It checks the signature and recomputes `contentHash` on the extracted folder before anything is copied. `manifest.checksum` is not compared. An optional `archiveSha256` field is compared to the uploaded bytes and protects the transfer only.

`GET /api/v1/platform/addons/installations` lists each addon id, the active version, the publisher, and pending staged versions. It uses the same `system.admin` token as deploy. It does not return secrets. `kassis-addon status` calls this route.

A valid package creates a `platform_addon_deployments` row in `staged` and an `addon_deployment` approval. On approval the host copies the package to `addons-installed/<id>/<version>/` and keeps older version folders. Tier 2 is then enabled through the lifecycle API, and the supervisor starts the child without a process restart. A tier 1 package from a publisher other than `kassis` is refused. A `kassis` tier 1 package is stored and is not hot-started; enable and disable stay on the lifecycle API.

The version must be higher than the installed one, and the addon id must match the manifest id pattern. An id already owned by another publisher is refused. `hostApi` must accept this instance's host API (`1.0.0`).

`POST /api/v1/platform/addons/:id/rollback` with `{ "targetVersion": "<version>" }` switches `active.json` back to a kept folder and is audited. It asks for approval only when that version adds permissions, egress hosts, or data access. `addons-installed` is a volume on the compose stacks and a persistent volume claim in `deploy/k8s/production/deployment.yaml`. The loader looks in `addons/` first, then the active folder under `addons-installed`.

`kassis-addon dev` publishes the container on `127.0.0.1`. Set `KASSIS_DEVHOST_ATTACH` to a running backend container name when that image needs the stack network and secrets. The dev process uses `RUN_MODE=api`, so it does not take the background jobs.

MCP discovery lists a tier 2 tool from `contributions.mcp` on an active installed addon when that addon's signature still verifies. A revoked signing key removes the tool from the next discovery load. The MCP container image does not ship a database client, so that load on the MCP container still reads the trust file. The backend discovery load reads the database.

Enable and disable reach MCP without a process restart. List and call read `GET /api/v1/addons/status` and keep that result for `MCP_ADDON_STATUS_CACHE_MS` (five seconds when unset). A disabled addon's tools are left off the list, and a call returns `Addon <id> is disabled`. A newly enabled addon's tools are loaded on the next list or call after the cache expires, through the same signature and trust gate as startup. If that status read fails or the body is not a list, addon tools are withheld and a call returns `Addon <id> tools are unavailable because addon state could not be read`. Core tools stay listed. An addon that is not in the status list is still offered.

## Changelog

| Date       | Change                                                                                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-16 | Runtime-load UIs re-read `addons/ui-catalog` and `addons/frontend-catalog` on disable, unknown enablement, and tab focus (at most once per minute).                                                                                                                      |
| 2026-11-16 | Tier 1 `import()` is keyed by manifest `contentHash` so hot updates load new server code; disable then enable of the same hash reuses the module. Authors must avoid module-level mutable state.                                                                       |
| 2026-11-16 | Uninstall applies v2 `data.retention` (`retain`, `archive`, `purge`) and still accepts v1 `delete`. `purge` adds one `retention_purge` audit row. Prefixed tables left behind fail the residual check for `delete` and `purge`.                                        |
| 2026-11-16 | MCP list and call follow addon enablement from `GET /api/v1/addons/status`, cached for `MCP_ADDON_STATUS_CACHE_MS` (default five seconds). A failed read withholds addon tools. Core tools stay. A process restart is not required.                                      |
| 2026-11-14 | `KASSIS_DEVHOST_ATTACH` makes `kassis-addon dev` join that container's network and secrets and run as `RUN_MODE=api`.                                                                                                                                                    |
| 2026-11-14 | Installed tier 2 MCP tools are listed only while the signing key still verifies. A revoked key drops the tool on the next discovery load.                                                                                                                              |
| 2026-11-14 | Disable, update and uninstall stop a tier 2 child. The wait before the process is killed is `addons.tier2.stopTimeoutMs` (release step `20261114-tier2-stop-timeout`). Host shutdown waits for the same stop.                                                         |
| 2026-11-03 | Runtime addon CSS loads again. `/runtime-addons.json` entries are `{ js, css }`, the ui-catalog lists `styleFiles`, and the loader links them before the import. Addon settings pages had rendered without their stylesheets since the 2026-10-27 runtime-load change. |
| 2026-10-28 | The `addon_publisher_key` add policy uses id `…026` so it does not collide with `mcp_final_decision`. Existing databases apply `20261028-addon-publisher-key-add-policy`. Deploy sniffs zip/gzip magic when the upload temp file has no extension.                     |
| 2026-10-28 | The production backend image copies `tools/adk/evidenceSummary.mjs` and links `/tools` so host approval evidence can load after `server/` is flattened onto `/app`. MCP HTTP falls back to the seeded publisher-trust file when Prisma is not in the image.            |
| 2026-10-28 | `GET /api/v1/platform/addons/installations` returns the active version, publisher, and pending staged versions for each addon id.                                                                                                                                      |
| 2026-10-28 | Package upload stages an `addon_deployment` approval and installs to `addons-installed/<id>/<version>/`. Tier 2 enables without a restart. Rollback is `POST /api/v1/platform/addons/:id/rollback`.                                                                    |
| 2026-10-28 | Runtime UI requests include `contentHash`. The host serves `/addons-ui/<id>/*` only after the signature gate, while the addon is enabled and the content-hash and UI-hash fingerprints still match. First-party publishers do not need `uiContentHash`.                |
| 2026-10-28 | Apply `20261028_addon_publisher_trust` before a bank signing key can be stored. Revocation is immediate.                                                                                                                                                               |
