# Quickstart

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


These steps were run in a folder outside the repository. Replace `<repo>` with the checkout path and `<scratch>` with an empty directory that is not inside the checkout.

## Create

```bash
node <repo>/tools/adk/kassis-addon.mjs init --id=sample-tprm-check --dir=<scratch>
```

Exit 0. `<scratch>/manifest.json` exists.

## Check and conformance

From `<scratch>`:

```bash
node <repo>/tools/adk/kassis-addon.mjs check
node <repo>/tools/adk/kassis-addon.mjs conformance
```

Both exit 0 and print nothing when the template is valid.

## Profile, certify, pack

```bash
node <repo>/tools/adk/kassis-addon.mjs sync --profile=addon-coding-agent
```

Prints the path of `.kassis/agent-profile.lock.json` and writes `AGENTS.md` plus the rule files. Then write `.kassis/attestation.json` with one `followed` answer per guardrail in the lock (machine checks set `evidence.checkId`).

```bash
node <repo>/tools/adk/kassis-addon.mjs certify --json
```

Expected when the attestation matches the lock:

```json
{"ok":true,"issues":[]}
```

Exit 0. A failing certify still prints JSON and exits 1.

```bash
node <repo>/tools/adk/kassis-addon.mjs pack --out=evidence
```

Prints `evidence` and exits 0.

## Dev and test

```bash
node <repo>/tools/adk/kassis-addon.mjs dev
node <repo>/tools/adk/kassis-addon.mjs test
```

`dev` prints:

```text
Routes mount at /api/v1/addons/sample-tprm-check
UI loads from /addons-ui/sample-tprm-check/index.js
```

`test` prints `No test directory` when `./test` is absent. When `./test` exists it runs `node --test` there and uses that exit code.

## Sign

`sign` without `--key` uses the repo signer for this addon id. Outside the repository, `sign` without `--key` exits 1. `sign --key=<path>` writes `contentHash` and signs with that publisher key file. Do not commit the private key.

## Frontend build

`init` copies `vite.config.mjs`. From the addon directory, after installing `@kassis/addon-sdk` and `vite`:

```bash
npx vite build
```

This writes `dist/index.js`. Imports of `@kassis/host-sdk` and `@kassis/addon-ui` stay bare. The host resolves them from the import map.
