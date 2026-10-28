# CLI reference

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


Run `npx kassis-addon <command>` after installing `@kassis/addon-cli`, or `node tools/adk/kassis-addon.mjs <command>` from this repository. An unknown command prints usage and exits 1. Exit 0 is success.

| Command | Flags | What it does |
| --- | --- | --- |
| `init` | `--id` `--dir` `--publisher` `--tier` `--rung` | Copies `templates/kassis-addon`. `--id` is required. Publisher defaults to `kassis`, tier to 2, rung to 1. Tier 1 is refused unless the publisher is `kassis`. Any other publisher gets an id prefix of `<publisher>-` when the id does not already start with it. Rung 1 is server only. Rung 2 adds UI. Rung 3 adds UI and migrations. |
| `build` | `--only=server` or `--only=ui` | Writes `dist/server/index.js`. Also writes `frontend/dist/index.js` when `src/ui/index.ts` exists. Prints each path. Exits 1 when `initialize` is missing, or when the UI was built and `register` is missing. |
| `check` | | Validates `manifest.json` against manifest v2. |
| `conformance` | | Rejects host imports under `src/` and `frontend/`, and an up script with no down script. |
| `test` | | Runs `node --test` in `./test`. Prints `No test directory` and exits 0 when that folder is missing. |
| `dev` | | Prints the mount path and the UI URL. It does not start a server. |
| `migrate` | | Lists `migrations/*.sql`. It does not apply them. |
| `pack` | `--out=<dir>` | Writes an evidence pack after certify would pass: attestation, lock, certify result, `index.json` and `README.md`. |
| `sign` | `--key=<path>` | Signs this addon. With `--key`, writes `contentHash` and `signing.keyId`, then the signature. Refuses a key file inside the addon folder. Inside the repo, without `--key`, uses the repo signer for the manifest id and does not add `signing`. Outside the repo, `--key` is required. |
| `keys generate` | `--publisher=<id>` | Writes an Ed25519 private key to `~/.kassis/keys/<fingerprint>.key` (mode 0600; on Windows, only the current user). Prints the fingerprint and the public key. The private key is not written into the addon folder. |
| `keys export-public` | `--key=<path>` `--out=<path>` | Writes the SPKI DER hex of that private key. |
| `keys register` | `--instance=<url>` `--publisher=<id>` `--key=<path>` | POSTs the public key to `/api/v1/platform/addon-publishers/<id>/keys`. Token: `KASSIS_ADK_TOKEN`. The instance still has to approve the key. |
| `certify` | `--json` | Runs check, conformance, build and test, writes `.kassis/evidence/checks.json`, then checks the attestation. KADK-714 blocks a blank outcome. KADK-715 warns when machine evidence is typed in. `--json` prints `{ "ok", "issues" }` and still exits 1 when `ok` is false. |
| `attest` | | Writes `.kassis/attestation.json` from the lock when it is missing, then prints its path. It does not post to the registry. `certify` posts when the instance env vars are set. |
| `explain` | `<code>` | Prints the meaning of a KADK code. |
| `sync` | `--profile=<id>` `--instance=<url>` | Verifies the signed profile, or downloads `GET /api/v1/agent-registry/profiles/published/<id>`, then writes the lock and the rule files. |
| `rules` | | Rewrites `AGENTS.md` and the rule files from the lock. Fails if you have not run `sync`. |

`sync --instance` reads the published profile route. The id is a slug such as `addon-coding-agent`, not a database number. The response body is `{ success, data }`. The CLI uses `data`.

Example:

```bash
node tools/adk/kassis-addon.mjs init --id=sample-tprm-check --publisher=kassis --dir=../sample-tprm-check
node tools/adk/kassis-addon.mjs certify --json
```

## Changelog

| Date | Change |
| --- | --- |
| 2026-10-28 | `keys generate`, `keys export-public`, and `keys register`. `sign --key` writes `signing.keyId` and refuses a key inside the addon folder. |
| 2026-10-28 | `init` accepts `--publisher`, `--tier`, and `--rung`. `build` writes the server bundle and, when the addon has a UI, the frontend bundle. |
| 2026-10-28 | `certify` records check, conformance, build and test. `pack` writes `index.json` and `README.md`. |
