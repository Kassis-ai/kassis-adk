# ADK kit maintainers

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

This page is for people who build, verify, and ship the Addon Development Kit from the **kassis** repository. Addon developers who install `@kassis/addon-cli` from the registry should use the other ADK pages and [Install](./install.md).

## Workspace packages and CLI entry

Inside the kassis checkout, `kassis-addon` is `tools/adk/kassis-addon.mjs`. `npm run create-addon` forwards to `init`. The MCP server entry is `tools/adk/kassis-adk-mcp.mjs`.

Public workspaces live under `packages/`. Offline maintainer pack:

```bash
npm pack --pack-destination ./packs ./packages/addon-sdk
npm pack --pack-destination ./packs ./packages/addon-testkit
npm pack --pack-destination ./packs ./packages/addon-ui
npm pack --pack-destination ./packs ./packages/host-sdk
npm pack --pack-destination ./packs ./packages/agent-kit
npm pack --pack-destination ./packs ./packages/addon-cli
npm pack --pack-destination ./packs ./packages/mcp-contract
```

`@kassis/addon-sdk`, `@kassis/adk-core`, `@kassis/mcp-contract`, `@kassis/addon-cli`, and `@kassis/addon-testkit` are one changesets `fixed` group at `0.1.0`. `npm pack` of `@kassis/mcp-contract` runs its prepack and ships `dist`. `npm pack` of `@kassis/adk-core` still ships TypeScript sources. The air-gap bundle copies those sources and does not add an adk-core tarball. `HOST_API_VERSION` stays `1.0.0`. See the [semver policy](../addons/semver-policy.md).

`node scripts/pack-public-packages.mjs` builds the six dist packages, packs them, installs those tarballs in an empty folder, imports each entry with plain Node, and type-checks the public subpaths.

## API Extractor reports

```bash
node tools/adk/api-surface.mjs
node tools/adk/api-surface.mjs --write
```

The first command fails when `packages/addon-sdk/etc/addon-sdk.api.md` or `packages/host-sdk/etc/host-sdk.api.md` would change. `--write` updates those files.

## Signed npm tarballs

```bash
npm pack
node tools/adk/sign-tarball.mjs <file.tgz> --key=<private-key-hex-file>
```

## Kit SBOM and air-gap bundle

```bash
node tools/adk/package-sbom.mjs
node tools/adk/airgap-bundle.mjs --out=./airgap
```

The bundle contains the SDK, the testkit, the template, the public verification key, `sbom.json`, the six public package tarballs, `packages/adk-core` sources, the CLI entry `tools/adk/kassis-addon.mjs`, and `checksums.txt`. It refuses to include the private signing key.

## Clean-room verification

```bash
node scripts/adk-clean-room.mjs
node scripts/adk-clean-room.mjs --airgap --bundle=./airgap
```

The script builds the six dist packages, packs them, and installs those tarballs in an empty folder with `npm install --no-package-lock`. It then runs `kassis-addon init`, scaffolds every scaffold kind including tier 2 `capability`, reinstalls dependencies (including a packed `@kassis/mcp-contract` tarball), then `build`, `test`, `check`, `conformance`, and `package` on a tier 2 rung 3 addon with `signature` and `contentHash`. `@kassis/adk-core` is versioned with the kit and is not packed. The script does not deploy to an instance and does not approve a request.

`--airgap` runs only when the bundle directory is already populated. It checks `checksums.txt`, installs with `file:` tarballs from the bundle, and refuses the npm registry.

## Reference addon (repository CI)

`__tests__/fixtures/acme-swift-approval` is the BRD-ADK-001 Mode A addon (`acme-swift-approval`, publisher `acme`, tier 2). `node scripts/adk-reference-build.mjs` packs the public `@kassis` tarballs, copies the fixture outside the checkout, and certifies it twice. The second pass signs with `kassis-addon keys generate --publisher=acme` and packages. The private key stays in `~/.kassis/keys`. The script does not deploy and does not register the key.

`node scripts/adk-reference-build.mjs --check-fixture` only checks the fixture id, publisher, tier and that `GAPS.md` names FR-57 and FR-60.

## ADK live lab

The ADK live lab workflow (`.github/workflows/adk-live-lab.yml`) runs every day at 05:30 UTC and when someone starts it by hand. It does not expect a stack that is already up, and it does not deploy to the cloud demo.

`node scripts/adk-live-lab-stack.mjs` builds `kassis-backend:prod`, the `devhost` image from this commit (`KASSIS_DEVHOST_IMAGE`, default `kassis-devhost:commit`), the nginx image and the MCP image. It starts postgres, redis, backend, nginx and mcp-http from `docker-compose.yml` plus `deploy/docker/adk-live-lab.compose.yml`. Postgres loads the day-0 schema and `database/seeds/core`. `npm run release:apply` then applies the release ledger. Optional demo seeds stay skipped. The live checks run after that, with `KASSIS_DEVHOST_IMAGE` set to the image just built and `KASSIS_LAB_URL` set to `http://localhost`.

`node scripts/adk-live-lab.mjs --only=H` then deploys the reference addon `acme-swift-approval` and disables and enables it while `GET /api/v1/adk/version` is in a loop. The signing key for that run is generated in the lab and written only to `KASSIS_PUBLISHER_TRUST_FILE` (`/addons-installed/lab-hot-toggle-trust.json`). The step removes that file and recreates the backend without it when it finishes. The workflow runs this after the L1–L22 checks. Packing `@kassis/host-sdk` falls back to a resolve stub when prepack stops because `packages/host-sdk/etc/host-sdk.api.md` is stale, and does not rewrite that report. Packing `@kassis/addon-cli` uses `--ignore-scripts` when prepack stops because the staged bundle still points at the repository.

The override lowers Postgres memory, gives schema init a longer health start period, and turns `TF_SERVICE_ENABLED` off. Backend, nginx and mcp-http start with `--no-deps`, so the runner does not start GPU Ollama, TensorFlow or the frontend image. Compose marks `kassis-network` external, so the starter creates that bridge network when it is missing and does not delete it on `--down`. Strict and non-strict mode, and the trust-file check, recreate only the backend with the same two compose files, `--no-build` and `--no-deps`. `METRICS_KEY` and `SYSTEM_API_TOKEN` come from the environment or from `secrets/metrics_key.txt` and `secrets/system_api_token.txt`. `node scripts/adk-live-lab-stack.mjs --down` stops the project and does not delete volumes. The release seed imports `pg` from `server/node_modules`, so the workflow runs `npm ci` in `server/` first.

## Host image troubleshooting

| What you see                                                         | What to do                                                                                                                                                                      |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend crash: `Cannot find module '/tools/adk/evidenceSummary.mjs'` | The production image must copy `tools/adk/evidenceSummary.mjs` and symlink `/tools` to `/app/tools`. Rebuild the backend image from this repository.                              |

## Coding-agent profile sources

The signed profile is `tools/adk/profiles/addon-coding-agent.json` (version 2). Version 1 stays at `tools/adk/profiles/addon-coding-agent.v1.json`. The unsigned version 3 draft is `tools/adk/profiles/addon-coding-agent.v3.draft.json` (awaiting sign/publish, decision D7).

## Changelog

| Date       | Change                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | Client ADK pages no longer name repository paths. Maintainer-only commands and live-lab detail live on this page.                                                                                                              |
| 2026-11-16 | Live lab workflow runs `--only=H` after L1–L22; host-sdk prepack may fall back to a resolve stub when the API report is stale; addon-cli may pack with `--ignore-scripts` when prepack still points at the repository.             |
| 2026-10-28 | Clean room and air-gap bundle verify published tarballs without the kassis checkout. The production backend image copies `tools/adk/evidenceSummary.mjs` and links `/tools` for approval evidence after `server/` is flattened. |