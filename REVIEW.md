# AI review instructions

Instructions for automated PR reviewers (CodeRabbit, Claude reviewers, any other
bot). Humans may ignore this file. Pilot of the same brief used in
`WYRE-AI/conduit` (`REVIEW.md`).

## Three passes

Run every review as three tagged passes. Prefix each finding with its pass:

1. **Bugs** — logic errors, edge cases, regressions, broken control flow,
   wrong Autotask query shape (operators, field names, parent/child routes).
2. **Security** — credential or PII leakage (including in logs), auth and
   header handling, tenant isolation, injection, anything that widens what an
   unauthenticated caller can reach.
3. **Matches PR intent/scope** — the change does what the PR description says
   and nothing more; no unrelated edits; follows the conventions in
   `CLAUDE.md`.

## Severity

- **Important** — would break behavior, leak data, cross tenants, or breach a
  policy. May block merge.
- **Nit** — style, naming, wording, optional refactors. **Nits must never
  block.** Cap nits at **five per review**; summarize any further nits as a
  count only (e.g. "12 additional nits omitted").

## Do not report

- Requests to add top-level `anyOf` / `oneOf` / `allOf` to tool input schemas.
  Anthropic's API rejects those shapes.
- Generated files, lockfiles and build output: `src/generated/`,
  `package-lock.json`, `dist/`.
- `CHANGELOG.md` and version edits (`package.json`, `manifest.json`,
  `server.json`). semantic-release owns them (`.releaserc.json` runs
  commit-analyzer, changelog and npm version plugins); do not ask for manual
  entries or bumps.
- Anything CI already enforces: lint (`npm run lint`), build/typecheck
  (`npm run build`), tests (`npm run test:coverage`) — see
  `.github/workflows/test.yml`.

## Repo-specific must-checks

Flag as **Important** when any of these fail:

1. **Tool schemas** — no top-level `anyOf` / `oneOf` / `allOf` in a tool's
   `inputSchema` (`src/handlers/tool.definitions.ts`).
2. **Commit/PR title prefix** — `feat:` / `fix:` (and `!` / `BREAKING CHANGE`)
   trigger a release; docs, chore, test, ci and refactor do not. The prefix must
   match the real impact of the change.
3. **No customer names** in code, tests, fixtures, commits or PR text. Use
   neutral placeholders.
4. **Writes use the documented parent route** — never add a 404 fallback that
   retries a write against another route (see `CLAUDE.md` learnings).
