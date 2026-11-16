---
name: adk.add-event
description: >-
  Publish a domain event with a JSON schema using kassis-addon scaffold event.
  Use when other addons or core must react to a change this addon owns.
---

# Add an event with a schema

## When to use

A Must requirement needs a named domain event other code can subscribe to. Every published event must have a schema; undeclared names are refused by the host and the testkit.

## Steps

1. From the addon root: `kassis-addon scaffold --kind=event --name=<kebab-case>`.
2. Confirm `events.publishes` lists `<addon-id>.<name>` with `schemas/<name>.schema.json`.
3. Tighten the schema required fields if the stub (`subjectId`, `summary`) is not enough.
4. Use the generated `publish<Name>` helper from `src/server/events/<name>.ts` — do not call undeclared event names.
5. Add a test that publishes through the testkit and names the requirement id.
6. Run `kassis-addon check`, `kassis-addon requirements`, then `kassis-addon certify`.

## Do not

- Publish an event name missing from the manifest.
- Omit a schema file or leave `additionalProperties` as a way to skip validation.
- Swallow a missing optional capability without handling null when you consume events or capabilities.
