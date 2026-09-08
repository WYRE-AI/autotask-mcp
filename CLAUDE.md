# autotask-mcp

Task management: Task Master (`task-master` CLI; config in `.taskmaster/`).
Workflow defaults (commits, changelog, memory) come from the global `~/.claude/CLAUDE.md`.

## Learnings
<!-- Record non-obvious discoveries as dated entries: "## Learnings - YYYY-MM-DD" -->

## Learnings - 2026-08-10

- Issue asks can be stale: #237 claimed "no Contracts tools" but search/create/update already existed (added after the issue was filed). Always scope against `src/handlers/tool.definitions.ts` before implementing "missing" tools.
- `TOOL_CATEGORIES` in `tool.definitions.ts` is hand-maintained and drifts from `TOOL_DEFINITIONS` — nothing enforces parity (the contract write tools were absent from `financial` for months). A parity test would prevent this class of drift.
- The intent router's entity regexes (`tool.handler.ts` `routeIntent`) matched only singular nouns (`\bcontract\b` missed "contracts") until #238 added `s?`; check the other entity branches if router misses are reported.
- `exactOptionalPropertyTypes` is on: optional result-object fields need explicit `| undefined` in their type when assigned from possibly-undefined sources.

## Learnings - 2026-09-07

- **Auditing `childCreate()` call sites:** every Autotask entity doc page carries a **Parent Entity** field, and the Tasks page states the rule — *"If this entity has a Parent relationship, you must perform all Create, Update, and Delete actions on the parent entity."* That field is the discriminator for whether `POST /{Parent}/{id}/{Child}` exists. TimeEntries says **Parent: None**, so its child routes never existed and every ticket-scoped time entry 404'd (#277). Audited all other `childCreate` callers at that time — all have documented parents.
- **Never add a 404 → `POST /{Child}` fallback inside `childCreate()`.** On a write, a 404 is ambiguous between "route doesn't exist" and "parent id doesn't exist", so a silent retry turns *"project 12345 doesn't exist"* into a successfully created, mis-scoped record. `childQuery`'s 404 → GET fallback is safe only because it's an idempotent read; do not extend that precedent to writes.
- **Removing a parameter from a tool's `inputSchema` does not stop callers sending it.** There is no zod/ajv layer, `additionalProperties` is always `true`, and `tool.handler.ts` passes the whole args object into the service. Deprecating a parameter needs an explicit guard at the top of the handler closure (before any network call). Two now exist (`projectID` on create, `projectId` on search time entries) — if a third becomes necessary, that's the signal to add `additionalProperties: false` plus real validation instead of another `if`.
- **A bad query clause fails differently depending on which half is wrong**, and the difference decides how dangerous it is:
  - **Bad operator → silently dropped.** `{ op: 'ne', … }` (no such operator; it's `noteq`) was discarded and the call returned *everything*, reading as a filtered result. That's #193 — wrong data, no error.
  - **Bad field name → hard error.** `{ op: 'eq', field: 'projectID' }` against `TimeEntries` returns `HTTP 500: Unable to find projectID in the TimeEntry Entity`. That's #277 — loud, and comparatively safe.

  Verified live against production on 2026-09-07, correcting an earlier version of this entry that generalized #193's silent-drop behaviour to unknown field names too. Either way the filter is broken, so when touching one, assert on the **query body actually sent** rather than on the return value — a test that only checks results passes against both failure modes.
