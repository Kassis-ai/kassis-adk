# ADK kit maintainers

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Platform Engineering (ADK)
**Last reviewed:** 2026-11-19

This page is for people who build, verify, and ship the Addon Development Kit from the **kassis** repository. Addon developers who install `@kassis/addon-cli` from the registry should use the other ADK pages and [Install](./install.md).

## Workspace packages and CLI entry

Inside the kassis checkout, `kassis-addon` is `tools/adk/kassis-addon.mjs`. `npm run create-addon` forwards to `init`. The MCP server entry is `tools/adk/kassis-adk-mcp.mjs`. Those two files are wrappers. `@kassis/addon-cli` bin and prepack load `@kassis/adk-core/cli/kassis-addon` and `@kassis/adk-core/cli/kassis-adk-mcp`. They do not resolve `tools/adk`. Prepack copies client docs from the package mirror. Refresh that mirror with `node tools/adk/sync-client-docs.mjs` before packing when the client pages changed. Prepack also copies `server/core/addon-platform/trust/publisher-trust.json` and `templates/kassis-addon` from the checkout, and the public key from `packages/adk-core/keys/addon_verification_public.key`. That file must stay byte-identical to `server/keys/addon_verification_public.key` (`npm run ci:packages:addon-sdk-boundary`). `npm run ci:adk:extraction-manifest` lists every relative import into a moving path and every checkout file the kit still opens (`docs/plans/remediation/adk-extraction-manifest.json`). It does not scan `packages/addon-cli/lib`. That folder is gitignored prepack output, and the same reads are already recorded from the source files.

Public workspaces live under `packages/`. Offline maintainer pack:

```bash
npm pack --pack-destination ./packs ./packages/addon-sdk
npm pack --pack-destination ./packs ./packages/addon-testkit
npm pack --pack-destination ./packs ./packages/addon-ui
npm pack --pack-destination ./packs ./packages/host-sdk
npm pack --pack-destination ./packs ./packages/agent-kit
npm pack --pack-destination ./packs ./packages/addon-cli
npm pack --pack-destination ./packs ./packages/mcp-contract
npm pack --pack-destination ./packs ./packages/adk-protocol
```

`@kassis/addon-sdk`, `@kassis/adk-core`, `@kassis/adk-protocol`, `@kassis/mcp-contract`, `@kassis/addon-cli`, and `@kassis/addon-testkit` are one changesets `fixed` group at `0.1.0`. `npm pack` of `@kassis/mcp-contract`, `@kassis/adk-protocol`, and `@kassis/adk-core` runs prepack and ships `dist`. Inside this checkout the package entry stays `src/` so Node can run the TypeScript. The maintainer air-gap bundle below copies adk-core sources and does not add an adk-core tarball. The tag release bundle is separate: it packs every package in the fixed group. `HOST_API_VERSION` stays `1.0.0`. See the [semver policy](../addons/semver-policy.md).

Canonical JSON, content hash (`contentHash` and `uiContentHash`), Ed25519 verify, publisher trust evaluation, and the deployment evidence summary are `@kassis/adk-protocol` (`packages/adk-protocol/src`). The content-hash scope file is `packages/adk-protocol/src/addonContentHash.config.json`. The seeded publisher file stays at `server/core/addon-platform/trust/publisher-trust.json`. The server trust barrel and the `tools/adk` barrel point the package at that file. Do not edit it when moving code. `server/core/addon-deployment/addonContentHash.mjs` and `server/core/addon-platform/trust/publisherTrust.mjs` re-export the package. The host imports `@kassis/adk-protocol` by name. Enable imports the mandatory contract from `@kassis/adk-core/mandatory-contract`.

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

The bundle contains the SDK, the testkit, the template, the public verification key, `sbom.json`, the six public package tarballs, `packages/adk-core` sources, the CLI entry `tools/adk/kassis-addon.mjs`, and `checksums.txt`. It refuses to include the private signing key. `tools/adk/kassis-addon.mjs` is a wrapper. The command script and the engine modules live in `packages/adk-core`. `tools/adk` keeps that wrapper, the MCP wrapper, API surface, the air-gap bundle, package SBOM, client-doc sync, and tarball signing. Coding profiles live only in `packages/adk-core/profiles`.

## Clean-room verification

```bash
node scripts/adk-clean-room.mjs
node scripts/adk-clean-room.mjs --airgap --bundle=./airgap
```

The script builds the six dist packages, packs them, and installs those tarballs in an empty folder with `npm install --no-package-lock`. It then runs `kassis-addon init`, scaffolds every scaffold kind including tier 2 `capability`, reinstalls dependencies (including a packed `@kassis/mcp-contract` tarball), then `build`, `test`, `check`, `conformance`, and `package` on a tier 2 rung 3 addon with `signature` and `contentHash`. `@kassis/adk-core` is versioned with the kit and is not packed. The script does not deploy to an instance and does not approve a request.

`--airgap` runs only when the bundle directory is already populated. It checks `checksums.txt`, installs with `file:` tarballs from the bundle, and refuses the npm registry.

## Kit release

A tag `adk/vX.Y.Z` runs `.github/workflows/adk-release.yml`. The version after `adk/v` must match every package in the single changesets `fixed` group. The workflow reads that group from `.changeset/config.json`. It does not keep a second package list, so a package added to the group is built, tested, and published with the rest.

The workflow builds those packages, runs the kit unit tests (not the full monorepo suite), packs each one, writes a CycloneDX SBOM (`sbom.cdx.json`), and signs the tarballs and `checksums.txt` with the Stage A cosign key. It then stages those exact tarballs on npmjs.com under the `@kassis` org (`npm stage publish --access public`). Nothing is live until a maintainer approves each staged version with 2FA on npmjs.com (Staged Packages) or with `npm stage approve`. It adds `--provenance` only when the repository is public and the runner is GitHub-hosted, because npm refuses provenance from a private repository. It then attaches `kassis-adk-X.Y.Z-airgap.zip`, its `.sha256`, and its `.sig` to the GitHub release for the tag. `verify.sh` inside the zip checks `checksums.txt` with the bundled `cosign.pub`. Compare that public key with the copy distributed on a separate channel before trusting the bundle. The workflow does not create or push the tag.

Repository secrets, set in GitHub and not committed:

| Secret | Role |
| --- | --- |
| `NPM_TOKEN` | npmjs.com granular access token, **Read and write (stage only)**, on the `@kassis` packages. The workflow passes it as `NODE_AUTH_TOKEN` for `https://registry.npmjs.org`. After the first release, add a stage-only trusted publisher (this repository, `adk-release.yml`) to each package and delete the token. |
| `COSIGN_PRIVATE_KEY` | Same key as the [client release pipeline](../deployment/release-pipeline.md). |
| `COSIGN_PASSWORD` | Password for that key. |

`deploy/release/cosign.pub` is the matching public key. The first publish is a person pushing the tag. Do not publish from a workstation with a copied token in the repo.

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
| Backend crash: `Cannot find module '@kassis/adk-protocol'` | The host imports that package for canonical JSON, content hash, trust, and evidence. `Dockerfile.server` copies and links `packages/adk-protocol` in every stage that copies `packages/addon-sdk`; production runs `node build.mjs` because `.dockerignore` drops `dist`. Rebuild the backend image when an old layer predates that change. |
| MCP crash: `Cannot find module '@kassis/adk-protocol'` | The MCP image loads the same signature and trust modules. `Dockerfile.mcp` copies `packages/adk-protocol`, runs `node build.mjs`, and links `node_modules/@kassis/adk-protocol`. Rebuild the MCP image when an old layer predates that change. |
| Enable crash: `Cannot find module '@kassis/adk-core/mandatory-contract'` | `Dockerfile.server` production and development copy `packages/adk-core` and link `@kassis/adk-core`. The workspace export points at `src/engine`, which is plain ESM, so the image does not compile `adk-core` dist. The dev entrypoint links the package when a node_modules volume is stale. |

## Coding-agent profile sources

The signed profile is `packages/adk-core/profiles/addon-coding-agent.json` (version 2). Version 1 stays at `packages/adk-core/profiles/addon-coding-agent.v1.json`. The unsigned version 3 draft is `packages/adk-core/profiles/addon-coding-agent.v3.draft.json` (awaiting sign/publish, decision D7). That directory is the only copy. `packages/adk-core/build.mjs` copies it into `dist/engine/profiles`, and the CLI pack copies the same files beside `lib/`. Do not add a second copy under `tools/adk`. Signing replaces these bytes; do not hand-edit the JSON.

## Changelog

| Date       | Change                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-19 | The extraction manifest check skips `packages/addon-cli/lib`. A local `npm pack` of the CLI no longer fails the gate on reads the source files already list. |
| 2026-11-19 | Prepack and the air-gap bundle read the public key from `packages/adk-core/keys`. CI fails if those bytes differ from `server/keys`. The extraction manifest lists the checkout files the kit still opens, including `publisher-trust.json` and `templates/kassis-addon`. |
| 2026-11-19 | Coding profiles live only in `packages/adk-core/profiles`. The package build copies that directory into dist. Packed `init` writes the `kassis-addon` command. |
| 2026-11-19 | `@kassis/addon-cli` bin and prepack load `@kassis/adk-core` CLI entries and kit files from package exports. Prepack does not resolve `tools/adk`. The pack reads `packages/adk-core/profiles`. |
| 2026-11-19 | `Dockerfile.mcp` copies and links `@kassis/adk-protocol`. The backend image copies and links `@kassis/adk-core` for `@kassis/adk-core/mandatory-contract` and no longer copies `tools/adk` evidence or contract wrappers. |
| 2026-11-19 | ADK engine and the two CLI scripts live in `packages/adk-core`. `npm pack` of that package ships `dist`. `tools/adk` keeps repo maintenance and thin wrappers. The publisher seed file stays under `server/core/addon-platform/trust/`. |
| 2026-11-19 | `Dockerfile.server` copies and builds `packages/adk-protocol` and links `@kassis/adk-protocol` for production and development targets (S3.07). Dev entrypoint links the package when node_modules volumes are stale.             |
| 2026-11-19 | `@kassis/adk-protocol` is in the kit group at `0.1.0`. Content-hash scope and canonical JSON live in that package. The publisher seed file stays under `server/core/addon-platform/trust/`.                                   |
| 2026-11-19 | Tag `adk/v*` runs the kit release workflow: build, kit unit tests, provenance publish of the changesets fixed group, SBOM, and a cosign-signed air-gap zip on the GitHub release.                                              |
| 2026-11-19 | Client ADK pages no longer name repository paths. Maintainer-only commands and live-lab detail live on this page.                                                                                                              |
| 2026-11-16 | Live lab workflow runs `--only=H` after L1–L22; host-sdk prepack may fall back to a resolve stub when the API report is stale; addon-cli may pack with `--ignore-scripts` when prepack still points at the repository.             |
| 2026-10-28 | Clean room and air-gap bundle verify published tarballs without the kassis checkout. The production backend image copies `tools/adk/evidenceSummary.mjs` and links `/tools` for approval evidence after `server/` is flattened. |