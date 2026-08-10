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
