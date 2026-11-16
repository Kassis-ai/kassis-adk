# Gaps — BRD-ADK-001 Mode A

The addon does not work around these. Each one needs a platform change or an operator decision.

## GAP FR-57

`ctx.config` is the snapshot taken at `initialize`. `PUT /api/v1/addons/:name/configuration` updates the stored row and does not restart the child or push the new document. A settings save therefore does not affect the next message until the addon is loaded again.

Check: `server/core/addon-platform/context/createAddonContext.ts` freezes `validatedConfig`. `AddonConfigurationController` writes the database row only.

Needed: the host re-reads configuration into the running child when the row is saved, without a package redeploy.

## GAP FR-60

`health.path` (`/health`) is answered by the tier 2 runner (`{ ok, ready, initError }`). Addon code does not see that request, so it cannot return 503 when `ctx.core.approvals.isEnforced` is false.

The addon does expose `GET /release-policy`, which returns 200 or 503 from `isEnforced`. That route is not `health.path`.

Needed: the runner calls an addon health handler, or the host health check includes the approval-policy result.

## GAP NFR-03 and live HTTP

`forwardTier2Route` forwards `{ method, path }` after the host has parsed the body. The child does not receive the body, the query string, or the user principal. `principalOf` in the child is a service principal.

The host gate for the addon uses the first manifest permission. That is `acme-swift-approval.view`, so POST `/messages` is not limited to `acme-swift-approval.ingest`.

AT-01 through AT-14 on a live stack stay blocked until the child receives the body, the query and the caller. The domain functions are covered by `createTestContext()` in `test/`.

Needed: the route bridge forwards body, query and the authenticated principal, and applies the permission declared for that path.

## GAP FR-35

`ctx.notify.registerType('acme-swift-approval.message.waiting')` runs at initialize. `ctx.notify.send` is not called. The users facade has no list-by-permission, so there is no recipient list for `acme-swift-approval.approve`.

Needed: a host call that returns the user ids holding a permission, or a notification audience of "holders of this permission".

## GAP FR-25

Two approvers for a high-value message belong to the approval policy (section 7 of the BRD), which the addon must not create. Whether a policy condition can read `highValue` is not confirmed.

Needed: an operator publishes the policy, including a second step when the product can express it.

## GAP FR-36

A rejected message does not notify the operators who viewed it. Could.

## GAP FR-61

`acme-swift-approval.list_pending` is not implemented. The addon build does not emit an MCP bundle. AT-17 is blocked. Could.

## GAP NFR-04

Accept latency and the 5,000-row list target were not measured. This environment has no Docker stack.

## GAP FR-56 visibility

`ui.contributions.settingsTabs` has no permission field. Omitted tabs are shown to system administrators. The BRD asks for `acme-swift-approval.admin`. The slot is still registered with `settingsTabSlot('acme-swift-approval')`.

Needed: a permission field on the settings tab contribution, or a documented rule that system-admin visibility satisfies AT-15.
