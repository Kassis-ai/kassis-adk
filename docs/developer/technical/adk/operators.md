# Operators

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


## Enable and disable

Enable and disable go through the platform lifecycle API (`system.admin`), not a Settings toggle. See [Addons overview](../../business/addons/overview.md).

The UI kill switch is `@kassis/addon-ui`. A killed addon renders the killed slot and does not mount its page. A thrown slot shows the failed-slot message and the rest of the host stays up.

Addon pages that set `ui.runtimeLoad` load from `/runtime-addons.json` (hashed files, not cached) or, in dev, from `/addons-ui/<id>/<file>?contentHash=<hash>`. The host serves that URL only after the addon passed the signature gate on its last load and is still enabled, and only while the content-hash fingerprint still matches. The loader skips a disabled addon. Before it keeps a module, it runs the same license and health gates as `enableAddon`.

## Release steps and seeds

Day-0 and later SQL are listed in [release steps](../deployment/release-steps.md). Apply them with `npm run release:apply` on a database that already exists. A rebuild does not re-run init scripts.

Seeds and migrations this kit depends on:

| Script | Why |
| --- | --- |
| `database/seeds/overlays/20261027_agent_autonomy.sql` | `agents.autonomy.*` settings. An agent call fails closed when the threshold is missing. |
| Tier 2 settings in the day-0 schema | `addons.tier2.*` and the egress limits. A tier 2 child will not start without them. |
| `database/migrations/20261027_audit_logs_append_only.sql` | Audit rows cannot be updated or deleted. |
| `database/migrations/20261028_addon_publisher_trust.sql` | Publisher trust tables, the kassis key, and the approval policies for adding or rotating a key and for changing tiers or prefixes. |
| `database/migrations/20261026_db_roles_audit_owner.sql` | `kassis_app` and the audit owner. |

**Prod empty volume.** Prod compose does not load the full schema on an empty volume. Only the roles script runs. Restore a backup or apply the release ledger. On-prem does load the day-0 schema, because that file is the new-site install. Details are in the release steps.

## On-prem and air-gapped

On-prem uses `docker-compose.onprem.yml`. Air-gapped install uses the bundle from [Install](./install.md). The bundle has the public verification key and does not have the private key.

## Troubleshooting

| What you see | What to do |
| --- | --- |
| Addon page is blank and the console says `register` is missing | Export `register` from `frontend/index.ts`. |
| `{"ok":false,"issues":[...]}` from `certify --json` | The `issues` array names the KADK codes. KADK-709 is a missing lock (`sync` first). KADK-701 is a missing attestation (`attest`, then fill the answers). |
| Tier 2 addon does not start | Check `addons.tier2.*` and `addons.egress.*` in Settings. An invalid value refuses the start. |
| Revoked key still in `previous` | Revoke it with `POST /api/v1/platform/addon-publishers/:id/keys/:fp/revoke`, or set status `revoked` in `KASSIS_PUBLISHER_TRUST_FILE`. A revoked row in either source wins. Listing it as `previous` does not keep it trusted. |
| Fresh prod database has roles and no tables | Expected. Restore or run `npm run release:apply`. Do not expect the prod compose file to create the schema. |
| Agent tool returns an approval id instead of changing the case | The tool is a final decision and the run is not attested, or autonomy is not `act`. Approve it in the Approvals UI. |
| Bank addon does not load | The publisher must be approved, the key must be `current` or `previous`, the addon id must start with one of that publisher's prefixes, and the tier must be 2. Tier 1 is only for kassis. |

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | Runtime UI requests include `contentHash`. The host serves `/addons-ui/<id>/*` only after the signature gate, while the addon is enabled and the content-hash fingerprint still matches. |
| 2026-10-28 | Apply `20261028_addon_publisher_trust` before a bank signing key can be stored. Revocation is immediate. |
