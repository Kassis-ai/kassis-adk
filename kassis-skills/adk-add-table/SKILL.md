---
name: adk.add-table
description: >-
  Add an owned table and reversible migration with kassis-addon scaffold migration.
  Use when the addon must store its own rows and declare data.schema, ownedTables,
  and retention.
---

# Add a table with a migration

## When to use

A Must requirement needs persistent data that core tables cannot hold. Prefer a core record type or extension point first. Own a table only when the process data is this addon's.

## Steps

1. From the addon root: `kassis-addon scaffold --kind=migration --name=<kebab-case>`.
2. Confirm the manifest sets `data.schema`, a qualified `database.ownedTables` entry, and `data.retention` (`retain` / `archive` / `purge`).
3. Fill `migrations/<nnnn>_<name>.up.sql` and the matching `.down.sql`. Mark irreversible only with an `irreversible:` reason comment when a down script is impossible.
4. Keep queries bounded (pagination / `take`). Do not create private copies of core approval, audit, notification, or user tables.
5. Name the requirement id in a test under `test/` or record the gap in `GAPS.md`.
6. Run `kassis-addon conformance` (checks up/down pairing), `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Leave `ownedTables` empty while creating tables.
- Ship an up script without a down script and without an irreversible reason.
- Expect tier 2 install-time migration runs before host work S2.02; scaffold warns when that applies.
