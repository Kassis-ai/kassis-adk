# SWIFT Message Approval

BRD-ADK-001 Mode A reference addon. Publisher `acme`, id `acme-swift-approval`, tier 2, version 0.1.0.

The addon owns schema `addon_acme_swift_approval` and the queue of outgoing SWIFT messages. Approvals, audit, events and the expiry schedule come from the host facades. It does not open a database connection of its own and it does not import host code.

## Operator setup

The addon does not create the approval policy. Before acceptance, a Kassis administrator publishes this policy in Approvals settings:

- Subject type `acme-swift-approval.message`, action `release`.
- One step: one approver in the role chosen for the test, with `makerExcluded: true`.
- A second step for high-value messages only if the policy editor can express that condition. If it cannot, leave the gap in `GAPS.md` (FR-25).

Grant the four addon permissions to the roles that need them:

- `acme-swift-approval.view` — operators who open the queue.
- `acme-swift-approval.ingest` — the payment system that POSTs messages.
- `acme-swift-approval.approve` — approvers.
- `acme-swift-approval.admin` — people who should change settings and see the Settings tab (`ui.contributions.settingsTabs[].permissions`).

Install the signed package with `kassis-addon deploy --instance=<lab>` after the `acme` publisher key is registered and approved. Toggle the installed addon with:

- `POST /api/v1/addons/acme-swift-approval/enable`
- `POST /api/v1/addons/acme-swift-approval/disable`

Until the tier 2 route bridge forwards the HTTP body, the live probe that does not need a body is `GET /api/v1/addons/acme-swift-approval/release-policy`. `POST /messages` answers 503 `tier2-route-body-not-forwarded` on the current runner.

## Develop

From this folder, after the public packages are installed:

```bash
kassis-addon check
kassis-addon test
kassis-addon certify
```

`scripts/adk-reference-build.mjs` in the Kassis repo copies this folder outside the checkout, installs packed `@kassis/*` tarballs, and certifies twice.
