# Publishing @kassis packages to npm

This guide is for maintainers who publish the six kit packages from **kassis-adk** with one command instead of six separate `npm publish` runs (each asking for 2FA).

Packages (dependency order):

1. `@kassis/adk-protocol`
2. `@kassis/mcp-contract`
3. `@kassis/addon-sdk`
4. `@kassis/addon-testkit`
5. `@kassis/adk-core`
6. `@kassis/addon-cli`

The publisher script reads the changesets **fixed** group, orders packages by workspace dependencies, runs `npm run build`, `npm run test`, and `npm run gate`, then publishes anything whose `name@version` is not already on npm.

## 1. Create a granular npm token (bypass 2FA)

1. Sign in at [npmjs.com](https://www.npmjs.com/).
2. Avatar menu → **Access Tokens** → **Generate New Token** → **Granular Access Token**.
3. **Token name:** something like `kassis-adk publish`.
4. **Expiration:** pick a date; rotate before it expires.
5. **Packages and scopes:** choose **Select packages and scopes**, add the `@kassis` scope (or each of the six packages).
6. **Permissions:** **Read and write**.
7. Turn on **Bypass two-factor authentication (2FA)** for publish (required for non-interactive publish).
8. Generate and copy the token once (`npm_…`). npm does not show it again.

Revoke old tokens under **Access Tokens** when you rotate or when someone no longer needs publish access.

## 2. Set the token for one session (Windows PowerShell)

Do **not** save the token in the repo, in `.npmrc`, or in a file on disk.

```powershell
$env:NPM_TOKEN = "npm_xxxxxxxx"
```

The script writes the token only to a short-lived file under the OS temp folder and passes it with `npm --userconfig`. The file is deleted when the script exits.

## 3. Dry run first

From the repository root:

```powershell
npm install
npm run publish:packages:dry
```

This runs build, test, and gate, then `npm publish --dry-run` and pack checks for each package. Nothing is uploaded.

## 4. Publish for real

```powershell
npm run publish:packages
```

Optional flags (Node, works on PowerShell too):

```powershell
node tools/release/publish-packages.mjs --only=@kassis/addon-sdk
node tools/release/publish-packages.mjs --tag=next
```

If you prefer OTP instead of a bypass token (one code for the whole run; codes expire in about 30 seconds):

```powershell
node tools/release/publish-packages.mjs --otp=123456
```

## 5. GitHub Actions (optional)

Workflow [`.github/workflows/publish.yml`](../.github/workflows/publish.yml) runs on **workflow_dispatch** only (no automatic publish on push or tag).

1. Add repository secret **`NPM_TOKEN`** with the same granular token, **or**
2. On npmjs.com, configure **Trusted Publishing** for each package (GitHub Actions, this repo, workflow `publish.yml`) and you can remove the token after OIDC is proven.

In the GitHub UI: **Actions** → **Publish @kassis packages** → **Run workflow**. You can turn on **dry_run** to validate without uploading.

## 6. Tag-based kit release (separate path)

Pushing `adk/vX.Y.Z` still runs [`.github/workflows/adk-release.yml`](../.github/workflows/adk-release.yml), which stages signed tarballs for the air-gap bundle. That path is unrelated to `npm run publish:packages`. Use the command in this doc when you want direct registry publish without staged approval.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `NPM_TOKEN is not set` | Set `$env:NPM_TOKEN` or pass `--otp=…` |
| Gate fails | Fix locally with `npm run gate` before publish |
| Version already on npm | Safe to rerun; the script **skips** existing versions |
| OTP expired mid-run | Start again with a fresh code or use a bypass token |