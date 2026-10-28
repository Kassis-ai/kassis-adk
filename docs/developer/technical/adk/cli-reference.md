# CLI reference

**Status:** GA
**Version checked:** 2026-10-28
**Technical owner:** Unassigned
**Last reviewed:** 2026-10-28


Run `npx kassis-addon <command>` after installing `@kassis/addon-cli`, or `node tools/adk/kassis-addon.mjs <command>` from this repository. An unknown command prints usage and exits 1. Exit 0 is success.

| Command | Flags | What it does |
| --- | --- | --- |
| `init` | `--id=<addon-id>` `--dir=<path>` | Copies `templates/kassis-addon`. `--id` is required. |
| `check` | | Validates `manifest.json` against manifest v2. |
| `conformance` | | Rejects host imports under `src/` and `frontend/`, and an up script with no down script. |
| `test` | | Runs `node --test` in `./test`. Prints `No test directory` and exits 0 when that folder is missing. |
| `dev` | | Prints the mount path and the UI URL. It does not start a server. |
| `migrate` | | Lists `migrations/*.sql`. It does not apply them. |
| `pack` | `--out=<dir>` | Writes an evidence pack after certify would pass. |
| `sign` | `--key=<path>` | Signs this addon. Inside the repo, without `--key`, uses the repo signer for the manifest id. Outside the repo, `--key` is required and the command exits 1 without it. That path writes `contentHash` before the signature, which is what the host checks on load. |
| `certify` | `--json` | Checks KADK-701 through KADK-711. `--json` prints `{ "ok", "issues" }` and still exits 1 when `ok` is false. |
| `attest` | | Writes `.kassis/attestation.json` from the lock when it is missing, then prints its path. It does not post to the registry. `certify` posts when the instance env vars are set. |
| `explain` | `<code>` | Prints the meaning of a KADK code. |
| `sync` | `--profile=<id>` `--instance=<url>` | Verifies the signed profile, or downloads `GET /api/v1/agent-registry/profiles/published/<id>`, then writes the lock and the rule files. |
| `rules` | | Rewrites `AGENTS.md` and the rule files from the lock. Fails if you have not run `sync`. |

`sync --instance` reads the published profile route. The id is a slug such as `addon-coding-agent`, not a database number. The response body is `{ success, data }`. The CLI uses `data`.

Example:

```bash
node tools/adk/kassis-addon.mjs init --id=sample-tprm-check --dir=../sample-tprm-check
node tools/adk/kassis-addon.mjs certify --json
```
