---
name: adk.add-job
description: >-
  Register a background job handler with kassis-addon scaffold job.
  Use when work must run asynchronously under a declared job type.
---

# Add a job

## When to use

A Must requirement needs work that must not run on the request path (retries, batching, deferred side effects). Declare the job type in the manifest and keep the handler idempotent.

## Steps

1. From the addon root: `kassis-addon scaffold --kind=job --name=<kebab-case>`.
2. Confirm `jobs.types` lists `<addon-id>.<name>`.
3. Implement `src/server/jobs/<name>.ts` and keep `register<Name>(ctx)` wired from `initialize`.
4. Make the handler safe to run twice. Give every outbound call a timeout from Settings or the existing caller pattern — do not hardcode AI model or provider choices.
5. Cover the requirement id in `test/` (or `GAPS.md`).
6. Run `kassis-addon check`, `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Enqueue a job type missing from the manifest.
- Rely on module-level mutable state (hot toggle must dispose cleanly).
- Skip audit when the job writes data.
