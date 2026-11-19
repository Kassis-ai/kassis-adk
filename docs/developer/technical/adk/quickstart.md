# Quickstart

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

These steps were run in a folder outside any kassis checkout. Replace `<scratch>` with an empty directory. Install the CLI first ([Install](./install.md)).

## Create

```bash
npx kassis-addon init --id=sample-tprm-check --publisher=kassis --dir=<scratch>
```

Exit 0. `<scratch>/manifest.json` exists. `--publisher` defaults to `kassis`. `--tier` defaults to 2. Publisher `kassis` may pass `--tier=1`. Any other publisher is tier 2, and `--tier=1` exits 1. `--rung` defaults to 1.

| Rung | What init writes                               |
| ---- | ---------------------------------------------- |
| 1    | Server only. No `src/ui` and no `migrations/`. |
| 2    | Server and UI. No `migrations/`.               |
| 3    | Server, UI, and `migrations/`.                 |

A publisher other than `kassis` gets an id prefix. `--publisher=acme --id=widget` writes id `acme-widget`. An id that already starts with `acme-` is kept. `kassis` keeps the id you pass. `hostApi` is `^1.0.0`. `entrypoints.main` is `dist/server/index.js`. `signing` is omitted until `sign`. When the rung has a UI, `ui.entryFile` is `index.js`, relative to `frontend/dist`.

## Build and test

From `<scratch>`, after init:

```bash
npm install
npm run build
npm test
```

`npm run build` prints `dist/server/index.js`. It exits 1 when that file does not export `initialize`. For rung 2 or 3 it also prints `frontend/dist/index.js` and exits 1 when that file does not export `register`. The server bundle is ESM and leaves `@kassis/*` external. The UI bundle leaves the modules in `@kassis/addon-sdk/browser-externals.json` external.

`npm test` runs `test/server.test.ts`. That test calls `createTestContext()` and does not need a database. `build:server` and `build:ui` build one output. `check` and `certify` run the CLI commands below.

## Check and conformance

From `<scratch>`:

```bash
npx kassis-addon check
npx kassis-addon conformance
```

Both exit 0 and print nothing when the template is valid. `check --json` prints `{ "ok", "issues", "data" }`. A schema failure includes a KADK-1xx code.

## Profile, certify, pack

```bash
npx kassis-addon sync --profile=addon-coding-agent
```

Prints the path of `.kassis/agent-profile.lock.json` and writes `AGENTS.md` plus the rule files. Then write `.kassis/attestation.json` with one `followed` answer per guardrail in the lock (machine checks set `evidence.checkId`).

```bash
npx kassis-addon certify --json
```

Expected when the attestation matches the lock:

```json
{ "ok": true, "issues": [] }
```

Exit 0. A failing certify still prints JSON and exits 1.

```bash
npx kassis-addon pack --out=evidence
```

Prints `evidence` and exits 0.

## Dev and test

`dev` starts a container only when a dev host image is already configured and already present locally. Set `KASSIS_DEVHOST_IMAGE`, pass `--image`, or write `{ "image": "<name>" }` to `~/.kassis/devhost.json`. The command uses Docker or Podman. It does not build an image and does not pull one unless the CLI resolves a published default image tag. The addon directory is mounted read-only at `/opt/kassis/dev-addon`. It also starts a tier 2 runner container on an internal network and does not mount a Docker socket into the backend. It prints a `http://127.0.0.1` URL and follows the container logs. If the runtime or the image is missing, it exits 1 with an issue.

`migrate up`, `migrate down`, `migrate status` and `migrate claim` run only against that dev host database. With no dev host, they exit 1.

History is kept per addon id from `manifest.json`, so two addons can both ship `001_init.up.sql`. Each script runs in one transaction together with its history row: a failing script leaves no schema change and no row, and `up` can simply run again. Runs for the same addon wait for each other. A script edited after it was applied stops `up` and `down`; restore it or add a new migration. A script may contain its own `BEGIN;` … `COMMIT;`, but not statements that cannot run in a transaction (`CREATE INDEX CONCURRENTLY`, `VACUUM`).

A dev host database used with an older ADK has history rows without an addon id. `status` lists them as `unclaimed`, and `up` stops on them because they could belong to another addon. In the addon that owns them, run `migrate claim`.

```bash
npx kassis-addon dev
npx kassis-addon test
```

Use `npm test` for the template. The CLI `test` command runs `node --test` in `./test`. It prints `No test directory` and exits 0 when that folder is missing.

## Sign

`sign` without `--key` uses the host signer only when the CLI is wired to one (first-party publish flows). Outside that setup, `sign` without `--key` exits 1. `sign --key=<path>` writes `contentHash` and signs with that publisher key file. Do not commit the private key.

## Changelog

| Date       | Change                                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-11-19 | Quickstart uses `npx kassis-addon` only; repository entry points moved to [Maintainers](./maintainers.md).                                                                             |
| 2026-11-16 | `dev` starts a tier 2 runner container on an internal network. The backend container does not receive a Docker socket.                                                                |
| 2026-11-11 | `migrate` keeps history per addon, applies each script with its history row in one transaction, detects edited scripts, and adds `claim` (F024, F025).                               |
| 2026-10-28 | The template `.npmrc` points `@kassis` at GitHub Packages and reads `NODE_AUTH_TOKEN`. The certify workflow uses Node 24 and that secret.                                            |
| 2026-10-28 | `dev` starts a configured local image and does not pull or build. `migrate` targets that dev host only. `check --json` includes KADK codes. `--id value` and `--id=value` both work. |
| 2026-10-28 | `init` accepts `--publisher`, `--tier`, and `--rung`. `npm run build` writes `dist/server/index.js` and, for a rung with UI, `frontend/dist/index.js`.                               |