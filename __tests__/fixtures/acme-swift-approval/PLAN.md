# Plan — BRD-ADK-001 Mode A

Lowest rung for each requirement. `gap` means the addon does not pretend the platform already does it.

| Id | Rung | Why |
| --- | --- | --- |
| FR-01 | facade | `ctx.routes.mount` exposes POST `/messages`. |
| FR-02 | own-code | The body parser accepts the section 6.1 fields, including `rawText`. |
| FR-03 | own-code | Field rules return 422 and store nothing. |
| FR-04 | own-code | Unique `(sender_bic, reference)` plus `ON CONFLICT DO NOTHING`. |
| FR-05 | facade | A held `ctx.core.approvals.guard` result is stored as `PENDING_APPROVAL` and returned as 202. |
| FR-06 | own-code | `highValue` compares cents with the threshold map, and is true when the currency is missing. |
| FR-07 | own-code | `maxAmountPerMessage` is a 422 before anything is stored. |
| FR-08 | facade | `ctx.audit.record` writes received and refused, with no raw text. |
| FR-10 | configuration | The manifest nav entry is section Payments, name SWIFT approvals, permission view. |
| FR-11 | own-code | The list query returns the BRD columns, newest first. |
| FR-12 | own-code | Status defaults to `PENDING_APPROVAL`; type, currency and value-date filters are optional. |
| FR-13 | own-code | The list limit is 25. |
| FR-14 | own-code | Amounts are locale digits plus the currency code. |
| FR-15 | own-code | The empty state uses the catalog sentence. |
| FR-16 | own-code | The detail response includes every parsed field and `rawText`. |
| FR-17 | extension-point | The page renders `ApprovalStatusPanel` from `@kassis/host-sdk`. |
| FR-18 | own-code | The copy button writes `rawText` to the clipboard. |
| FR-20 | facade | `guard` uses subject `acme-swift-approval.message`, action `release`, and the message id. |
| FR-21 | extension-point | Approve and Reject call `useApprovalInbox().decide`. |
| FR-22 | own-code | Reject needs 10 characters. Approve needs them only when the setting says so. |
| FR-23 | extension-point | `resolveMakers` returns `submittedBy`. The page hides buttons for `inbox.requested`. |
| FR-24 | facade | `registerApplier` and the approvable outcome handlers set APPROVED or REJECTED. |
| FR-25 | gap | Two approvers are an operator policy. The condition language for `highValue` is not confirmed. |
| FR-26 | own-code | The status update matches `PENDING_APPROVAL`, so a second decision changes nothing. |
| FR-30 | facade | `ctx.jobs.schedule` runs `acme-swift-approval.expire` every 15 minutes. |
| FR-35 | gap | The waiting notification type is registered. There is no facade to list users by permission, so `notify.send` has no recipients. |
| FR-36 | gap | Not built. Could. |
| FR-40 | facade | `ctx.events.publish` emits the two declared events, without `rawText`. |
| FR-41 | configuration | The five audit actions are declared on the manifest. |
| FR-50 | configuration | `allowedMessageTypes` defaults to MT103 and MT202. |
| FR-51 | configuration | `highValueThresholds` defaults to CHF, EUR and USD at 1000000. |
| FR-52 | configuration | `maxAmountPerMessage` defaults to null. |
| FR-53 | configuration | `expiryHours` defaults to 24. |
| FR-54 | configuration | `requireApproveComment` defaults to false. |
| FR-55 | configuration | `notifyApprovers` defaults to true. |
| FR-56 | extension-point | The UI calls `settingsTabSlot('acme-swift-approval')`. The manifest tab has no permission field. |
| FR-57 | gap | `ctx.config` is frozen at initialize. Saving configuration does not push a new snapshot into the child. |
| FR-60 | gap | `health.path` is answered by the tier 2 runner, not by addon code. |
| FR-61 | gap | No MCP tool. `kassis-addon build` emits the server and UI bundles only. |
| NFR-01 | configuration | Tier 2, 256 MB, no egress hosts. |
| NFR-02 | own-code | Logs, audit metadata, events and notifications omit raw text and the customer fields. |
| NFR-03 | gap | One catch-all route is gated by the addon's first permission (`view`). The child cannot require `ingest` on POST `/messages` alone. |
| NFR-04 | gap | No running stack, so the timing targets are not measured. |
| NFR-05 | own-code | Page and settings chrome use `useAddonTranslation`, with en and fr catalogs. |
| NFR-06 | own-code | Buttons and filters are native controls. The high-value badge is the words "High value". |
| NFR-07 | facade | Imports are `@kassis/*`, Node built-ins, and this addon's own files. |
| NFR-08 | own-code | Unit tests cover validation, de-duplication, high value, the applier and expiry through `createTestContext()`. |
