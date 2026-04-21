## [Unreleased]

### Fixed

- **`MappingService` company cache was silently truncated to 25 entries** — `refreshCompanyCache()` called `searchCompanies({})` assuming "no pageSize = fetch all pages", but the underlying `searchCompanies` defaults to `pageSize: 25, page: 1` and returns only the first page. The cache was then logged as `"COMPLETE dataset"`, which was incorrect.
  - Effect: for any company whose ID wasn't on the first page (~everything past ID ~198 in a typical tenant), `getCompanyName()` fell through to a single-record `getCompany(id)` direct-lookup. When the Autotask REST direct-get returned a stale or renamed name (observed for at least one merged/renamed company in the wild), that wrong name was written into the cache and served to every downstream consumer — `autotask_search_tickets`, `autotask_search_projects`, notes, time entries, etc. — for a 30-minute cache window. Surface: the `company` field on enriched responses displayed the wrong tenant name, which looks like cross-tenant data leakage even though the underlying IDs and ownership were correct.
  - Fix: `refreshCompanyCache()` now actually paginates — loops `searchCompanies({page, pageSize: 200})` until a short page is returned, building a fresh `Map` and atomic-swapping it into the cache only after full success (partial failures keep the prior cache rather than replacing it with a shorter one). Safety cap of 100 pages (20k companies) logs a warning rather than running forever.
  - Hardening: `getCompanyName()` still falls back to single-record `getCompany(id)` for companies added between refresh windows, but the fallback result is no longer written to the cache. This prevents a stale/wrong direct-get from poisoning the cache and being served to every subsequent caller.
  - Added `tests/mapping.test.ts` coverage: multi-page pagination, early-stop on short page, and fallback-does-not-poison-cache.

# [2.18.0](https://github.com/wyre-technology/autotask-mcp/compare/v2.17.2...v2.18.0) (2026-04-08)


### Features

* **attachments:** add autotask_create_ticket_attachment tool ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#62](https://github.com/wyre-technology/autotask-mcp/issues/62)) ([8ff325e](https://github.com/wyre-technology/autotask-mcp/commit/8ff325e1f11d24097aab0f1a5c7a5968bc4d409d))
* **billing:** add invoice details tool and billing item filters ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#61](https://github.com/wyre-technology/autotask-mcp/issues/61)) ([cc9354f](https://github.com/wyre-technology/autotask-mcp/commit/cc9354f9703e23c9dde3eaed3dee0e9f065e3a88))
* **checklist:** add ticket checklist items CRUD tools ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#59](https://github.com/wyre-technology/autotask-mcp/issues/59)) ([78e0f78](https://github.com/wyre-technology/autotask-mcp/commit/78e0f7805e36ce9c69e0ecd3b6c7326e95d51615)), closes [#33](https://github.com/wyre-technology/autotask-mcp/issues/33) [#32](https://github.com/wyre-technology/autotask-mcp/issues/32)
* **config:** auto-detect Autotask API zone from username ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#60](https://github.com/wyre-technology/autotask-mcp/issues/60)) ([01a3bae](https://github.com/wyre-technology/autotask-mcp/commit/01a3bae888c6cb3cb45d91afb50e83b2f0eed6c1))
* **projects:** add autotask_update_project tool ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#57](https://github.com/wyre-technology/autotask-mcp/issues/57)) ([1efeead](https://github.com/wyre-technology/autotask-mcp/commit/1efeead572b60b1513bd7c773ca684eb774e36c0))
* **tickets:** expand create/update_ticket field coverage ([#55](https://github.com/wyre-technology/autotask-mcp/issues/55)) ([#58](https://github.com/wyre-technology/autotask-mcp/issues/58)) ([16614ff](https://github.com/wyre-technology/autotask-mcp/commit/16614ff2209e5b82d57fbc83bbfbef0cc8e24080))

## [Unreleased]

### Added

- **tickets:** expanded field coverage on `autotask_create_ticket` and `autotask_update_ticket`. Both tools now accept `ticketCategory`, `ticketType`, `issueType`, `subIssueType`, `source`, `billingCodeID`, `queueID`, `serviceLevelAgreementID`, `estimatedHours`, `projectID`, `ticketAdditionalContacts`, `resolution`, and `userDefinedFields` (REST-native `{name, value}[]` shape). `autotask_update_ticket` is now exposed as a first-class tool. (#55)

## [2.7.3](https://github.com/wyre-technology/autotask-mcp/compare/v2.7.2...v2.7.3) (2026-02-23)


### Bug Fixes

* rename duplicate step id 'version' to 'release-version' in docker job ([5e093cb](https://github.com/wyre-technology/autotask-mcp/commit/5e093cb019b5fdc457b91c67efb807ce00207cd2))

## [2.7.2](https://github.com/wyre-technology/autotask-mcp/compare/v2.7.1...v2.7.2) (2026-02-17)


### Bug Fixes

* **docker:** drop arm64 platform to fix QEMU build failures ([038f21c](https://github.com/wyre-technology/autotask-mcp/commit/038f21cfc547e3c915db6bb13f3324702f53b44b))

## [2.7.1](https://github.com/wyre-technology/autotask-mcp/compare/v2.7.0...v2.7.1) (2026-02-15)


### Bug Fixes

* use stateless per-request server pattern for HTTP transport ([e8c6326](https://github.com/wyre-technology/autotask-mcp/commit/e8c6326e3bc26aa6eba773b298ae4a72336b8ba5))

# [2.7.0](https://github.com/wyre-technology/autotask-mcp/compare/v2.6.0...v2.7.0) (2026-02-13)


### Features

* add DigitalOcean and Cloudflare deploy infrastructure and badges ([b68bad5](https://github.com/wyre-technology/autotask-mcp/commit/b68bad5b7406ea17a0de4fe16ce65d75f7cb14d0))

# [2.6.0](https://github.com/wyre-technology/autotask-mcp/compare/v2.5.3...v2.6.0) (2026-02-10)


### Bug Fixes

* **security:** address code scanning vulnerabilities ([9fba187](https://github.com/wyre-technology/autotask-mcp/commit/9fba1879186a4c4c31482776a9a26152e163d7fe))
* use autotask-node v2.1.0 parent-child URL pattern for note/time entry creates ([6397094](https://github.com/wyre-technology/autotask-mcp/commit/6397094fad52f2afef72f0f92d4e523af65b1f1a))
* use correct parent-child URL patterns for child entity creation ([#24](https://github.com/wyre-technology/autotask-mcp/issues/24)) ([47f2a75](https://github.com/wyre-technology/autotask-mcp/commit/47f2a75b16de3af6b0f7581079f22fde575fe9d9))


### Features

* Add gateway mode for hosted MCP deployments ([14d5682](https://github.com/wyre-technology/autotask-mcp/commit/14d568223c9269de2d5e3e2eba5056351ca3e82d))
* **billing:** Add BillingItems and BillingItemApprovalLevels support ([4c88034](https://github.com/wyre-technology/autotask-mcp/commit/4c880348d7a930b5277a810b89a3c54cddedb509)), closes [#21](https://github.com/wyre-technology/autotask-mcp/issues/21)
* **time-entries:** add approvalStatus filter for un-posted entries ([d27f0ab](https://github.com/wyre-technology/autotask-mcp/commit/d27f0ab1fe8ba169069e3fb7de7010ead4b26636)), closes [#21](https://github.com/wyre-technology/autotask-mcp/issues/21)

## [Unreleased] - Wyre Technology Fork

### Added

* **Gateway Mode**: Support for hosted MCP Gateway deployments with header-based credential injection
  - New `AUTH_MODE` environment variable (`env` or `gateway`)
  - Per-request credential extraction from `X-API-Key`, `X-API-Secret`, `X-Integration-Code` headers
  - Health endpoint now reports `authMode` in gateway mode
* **Migration Guide**: Documentation for migrating from local to hosted deployment (`docs/MIGRATION_GUIDE.md`)

### Changed

* Docker image registry changed to `ghcr.io/wyre-technology/autotask-mcp`
* GitHub repository moved to `wyre-technology/autotask-mcp`
* Container labels updated for Wyre Technology branding

---

## [2.7.2](https://github.com/asachs01/autotask-mcp/compare/v2.7.1...v2.7.2) (2026-02-10)


### Bug Fixes

* use autotask-node v2.1.0 parent-child URL pattern for note/time entry creates ([6397094](https://github.com/asachs01/autotask-mcp/commit/6397094fad52f2afef72f0f92d4e523af65b1f1a))

## [2.7.1](https://github.com/asachs01/autotask-mcp/compare/v2.7.0...v2.7.1) (2026-02-10)


### Bug Fixes

* use correct parent-child URL patterns for child entity creation ([#24](https://github.com/asachs01/autotask-mcp/issues/24)) ([47f2a75](https://github.com/asachs01/autotask-mcp/commit/47f2a75b16de3af6b0f7581079f22fde575fe9d9))

# [2.7.0](https://github.com/asachs01/autotask-mcp/compare/v2.6.1...v2.7.0) (2026-02-06)


### Features

* **time-entries:** add approvalStatus filter for un-posted entries ([d27f0ab](https://github.com/asachs01/autotask-mcp/commit/d27f0ab1fe8ba169069e3fb7de7010ead4b26636)), closes [#21](https://github.com/asachs01/autotask-mcp/issues/21)

## [2.6.1](https://github.com/asachs01/autotask-mcp/compare/v2.6.0...v2.6.1) (2026-02-05)


### Bug Fixes

* **security:** address code scanning vulnerabilities ([9fba187](https://github.com/asachs01/autotask-mcp/commit/9fba1879186a4c4c31482776a9a26152e163d7fe))

# [2.6.0](https://github.com/asachs01/autotask-mcp/compare/v2.5.3...v2.6.0) (2026-02-05)


### Features

* **billing:** Add BillingItems and BillingItemApprovalLevels support ([4c88034](https://github.com/asachs01/autotask-mcp/commit/4c880348d7a930b5277a810b89a3c54cddedb509)), closes [#21](https://github.com/asachs01/autotask-mcp/issues/21)

## [Unreleased]

### Features

* **time-entries:** Add `approvalStatus` filter to find un-posted time entries ([#21](https://github.com/asachs01/autotask-mcp/issues/21))
  - Use `approvalStatus: "unapproved"` to find labor items not yet posted
  - Use `approvalStatus: "approved"` to find already-posted entries
  - Also added `billable` filter for billable/non-billable filtering
  - Added `billingApprovalDateTime`, `billingApprovalLevelMostRecent`, `billingApprovalResourceID` to TimeEntry interface

### Security

* **deps:** Add npm override for @isaacs/brace-expansion@^5.0.1 to fix CVE-2026-25547
* **docker:** Add explicit npm update in Dockerfile to fix base image CVEs (CVE-2026-24842, CVE-2026-0775, CVE-2026-23950, CVE-2026-23745, CVE-2025-64756)

## [2.5.3](https://github.com/asachs01/autotask-mcp/compare/v2.5.2...v2.5.3) (2026-01-27)


### Security

* **deps:** Update @modelcontextprotocol/sdk to 1.25.3 for CVE-2026-0621 (ReDoS) and CVE-2025-66414 (DNS rebinding)
* **deps:** Add npm override for tar@^7.0.0 to fix CVE-2026-23950 and CVE-2026-23745 (arbitrary file overwrite)
* **deps:** Add npm override for lodash@^4.17.23 to fix CVE-2025-13465 (prototype pollution)
* **deps:** Add npm override for brace-expansion@^2.0.1 to fix CVE-2025-5889 (ReDoS)
* **deps:** Add npm override for diff@^7.0.0 to fix CVE-2026-24001 (jsdiff vulnerability)
* **docker:** Update base image from node:20-alpine to node:22-alpine for CVE-2025-64756 (glob) and CVE-2024-21538 (cross-spawn)

## [2.5.2](https://github.com/asachs01/autotask-mcp/compare/v2.5.1...v2.5.2) (2026-01-24)


### Bug Fixes

* **docs:** Use npx for Claude Code instructions instead of bundle extraction ([e5c7a01](https://github.com/asachs01/autotask-mcp/commit/e5c7a01937ba323ce2463c2ce3c9e9c6eae65bd3))

## [2.5.1](https://github.com/asachs01/autotask-mcp/compare/v2.5.0...v2.5.1) (2026-01-24)


### Bug Fixes

* **docs:** Add base path prefix to content links for GitHub Pages ([be4b661](https://github.com/asachs01/autotask-mcp/commit/be4b66172c2f000e09a8d887b051d4bd2bb8ad05))

# [2.5.0](https://github.com/asachs01/autotask-mcp/compare/v2.4.0...v2.5.0) (2026-01-24)


### Features

* **docs:** Add Astro Starlight documentation site with prompt examples and GitHub Pages deployment ([71a5a88](https://github.com/asachs01/autotask-mcp/commit/71a5a88))


### Code Refactoring

* Simplify codebase with dispatch table, schema extraction, and DRY patterns ([c1eff86](https://github.com/asachs01/autotask-mcp/commit/c1eff86))
  - Extract 39 tool schemas to declarative tool.definitions.ts
  - Replace 300-line switch with dispatch table Map
  - Merge enhanced handler into base handler (single class)
  - Generic note methods (9 methods → 3 generic + 9 thin wrappers)
  - Simplify MappingService singleton to cached-promise pattern
  - Delete unused wrapper.ts and dead code
  - tool.handler.ts reduced from 1,616 → 445 lines (72%)

# [2.4.0](https://github.com/asachs01/autotask-mcp/compare/v2.3.4...v2.4.0) (2026-01-24)


### Features

* **search:** Add compact response format, smart defaults, and pagination ([00aa4b9](https://github.com/asachs01/autotask-mcp/commit/00aa4b91e7329e833c60545d9d5e081f5a8f374c))

## [2.3.4](https://github.com/asachs01/autotask-mcp/compare/v2.3.3...v2.3.4) (2026-01-24)


### Bug Fixes

* **test:** Run all MCPB tests in single server session to avoid rate limits ([7b425cf](https://github.com/asachs01/autotask-mcp/commit/7b425cfbbba7a0ceeb0d6681dc84fb4a22ea421a))

## [2.3.3](https://github.com/asachs01/autotask-mcp/compare/v2.3.2...v2.3.3) (2026-01-24)


### Bug Fixes

* **mcpb:** Fix bundle runtime errors and add automated test harness ([c3beb22](https://github.com/asachs01/autotask-mcp/commit/c3beb221bdacf949aa543d846188ab1fb85639d2))

## [2.3.2](https://github.com/asachs01/autotask-mcp/compare/v2.3.1...v2.3.2) (2026-01-23)


### Bug Fixes

* **mcpb:** Add bundle signing, size reduction, and Claude Desktop compatibility ([89a4711](https://github.com/asachs01/autotask-mcp/commit/89a471172a7486f56aadffaa8881a7ff96c87930))

## [2.3.1](https://github.com/asachs01/autotask-mcp/compare/v2.3.0...v2.3.1) (2026-01-23)


### Bug Fixes

* **docker:** Fix build and runtime failures in Dockerfile ([c6e37e2](https://github.com/asachs01/autotask-mcp/commit/c6e37e266c1eccf531247bd6110bfc7e06f75819))

# [2.3.0](https://github.com/asachs01/autotask-mcp/compare/v2.2.13...v2.3.0) (2026-01-23)


### Features

* Add picklist discovery tools and elicitation support ([93c68f2](https://github.com/asachs01/autotask-mcp/commit/93c68f20acf31c0a8cc661689f820bf7e3518393))

## [2.2.13](https://github.com/asachs01/autotask-mcp/compare/v2.2.12...v2.2.13) (2026-01-23)


### Bug Fixes

* **deps:** Update package-lock.json with correct autotask-node v2.0.6 hash ([7c0ff90](https://github.com/asachs01/autotask-mcp/commit/7c0ff90eb5623734c9f09643cccd46582d8c9568))

## [2.2.12](https://github.com/asachs01/autotask-mcp/compare/v2.2.11...v2.2.12) (2026-01-23)


### Bug Fixes

* **deps:** Update autotask-node to v2.0.6 ([1a2e08e](https://github.com/asachs01/autotask-mcp/commit/1a2e08e3f9d808b0e424ea4c8bcc46a07727d784))

## [2.2.11](https://github.com/asachs01/autotask-mcp/compare/v2.2.10...v2.2.11) (2026-01-23)


### Bug Fixes

* upgrade autotask-node to v2.0.4 (graceful logger) ([213db40](https://github.com/asachs01/autotask-mcp/commit/213db40377852ab3dfe6971daf57cbf9f71f5e02))
* upgrade autotask-node to v2.0.5 (stderr-only logging) ([a01588b](https://github.com/asachs01/autotask-mcp/commit/a01588b1144bcb2adfae44c102dd7879225000c3))

## [2.2.10](https://github.com/asachs01/autotask-mcp/compare/v2.2.9...v2.2.10) (2026-01-23)


### Bug Fixes

* **ci:** add GITHUB_TOKEN to version detection step ([99e2b29](https://github.com/asachs01/autotask-mcp/commit/99e2b29c772e1fd80995888126b849629d8cb088))

## [2.2.9](https://github.com/asachs01/autotask-mcp/compare/v2.2.8...v2.2.9) (2026-01-23)


### Bug Fixes

* resolve .env relative to script location as fallback ([367eb0d](https://github.com/asachs01/autotask-mcp/commit/367eb0d9a4bbcf0ec2b73e95ab96737145f586ac))

## [2.2.8](https://github.com/asachs01/autotask-mcp/compare/v2.2.7...v2.2.8) (2026-01-23)


### Bug Fixes

* load .env file at startup for credential configuration ([192c52c](https://github.com/asachs01/autotask-mcp/commit/192c52c5b324ee485c07c73367f7d80da236f73d))

## [2.2.7](https://github.com/asachs01/autotask-mcp/compare/v2.2.6...v2.2.7) (2026-01-23)


### Bug Fixes

* don't crash on missing credentials, return tool-level errors instead ([cd9294c](https://github.com/asachs01/autotask-mcp/commit/cd9294c900350eab5f91ce6152121e5571abb88c))

## [2.2.6](https://github.com/asachs01/autotask-mcp/compare/v2.2.5...v2.2.6) (2026-01-23)


### Bug Fixes

* **ci:** pack MCPB bundle after semantic-release version bump ([53c952e](https://github.com/asachs01/autotask-mcp/commit/53c952ea61c6b3f16b5f4405d5b9143e214d4b53))

## [2.2.5](https://github.com/asachs01/autotask-mcp/compare/v2.2.4...v2.2.5) (2026-01-23)


### Bug Fixes

* sync manifest.json version from package.json at pack time ([c7a9724](https://github.com/asachs01/autotask-mcp/commit/c7a97241777c47f28bfcaf3cb4a4f6392d68d3b3))

## [2.2.4](https://github.com/asachs01/autotask-mcp/compare/v2.2.3...v2.2.4) (2026-01-23)


### Bug Fixes

* upgrade autotask-node to v2.0.3 (removes dotenv dependency) ([1a5727b](https://github.com/asachs01/autotask-mcp/commit/1a5727b709a84a3741adf15b51f26502d9a4c5c7))

## [2.2.3](https://github.com/asachs01/autotask-mcp/compare/v2.2.2...v2.2.3) (2026-01-23)


### Bug Fixes

* prevent stdout pollution from autotask-node's dotenv.config() ([abc61fd](https://github.com/asachs01/autotask-mcp/commit/abc61fdcd46f3891fe4501d226986163fe0dec95))

## [2.2.2](https://github.com/asachs01/autotask-mcp/compare/v2.2.1...v2.2.2) (2026-01-23)


### Bug Fixes

* prevent dotenv stdout pollution in MCP stdio transport ([8818749](https://github.com/asachs01/autotask-mcp/commit/8818749b2ec6979eddca0d45f7dd13a3c7c60756))

## [2.2.1](https://github.com/asachs01/autotask-mcp/compare/v2.2.0...v2.2.1) (2026-01-23)


### Bug Fixes

* **ci:** replace dist file uploads with MCPB bundle in releases ([280127f](https://github.com/asachs01/autotask-mcp/commit/280127f8f4541549b7f44fc68c0cd67807a91c5b))

# [2.2.0](https://github.com/asachs01/autotask-mcp/compare/v2.1.0...v2.2.0) (2026-01-23)


### Features

* add MCPB (MCP Bundle) packaging for desktop distribution ([e7601b1](https://github.com/asachs01/autotask-mcp/commit/e7601b1d158c261a6607530f59267dff99b06ba8))

# [2.1.0](https://github.com/asachs01/autotask-mcp/compare/v2.0.3...v2.1.0) (2026-01-23)


### Features

* add HTTP Streamable transport for remote MCP access ([2d31853](https://github.com/asachs01/autotask-mcp/commit/2d3185348cb4387c5726892bb15d9c432279afa3)), closes [#7](https://github.com/asachs01/autotask-mcp/issues/7)

## [2.0.3](https://github.com/asachs01/autotask-mcp/compare/v2.0.2...v2.0.3) (2026-01-23)


### Bug Fixes

* add CLI bin entry and enforce test failures in CI ([10ce1c7](https://github.com/asachs01/autotask-mcp/commit/10ce1c71324f5b301a6b41e151f187f377cd6793)), closes [#4](https://github.com/asachs01/autotask-mcp/issues/4) [#4](https://github.com/asachs01/autotask-mcp/issues/4)

## [2.0.2](https://github.com/asachs01/autotask-mcp/compare/v2.0.1...v2.0.2) (2026-01-23)


### Bug Fixes

* **tests:** Resolve ESM compatibility and rewrite mapping tests ([a294a7c](https://github.com/asachs01/autotask-mcp/commit/a294a7c390a5ae56b70c269f5f6aaf0c3ff224e5))

## [2.0.1](https://github.com/asachs01/autotask-mcp/compare/v2.0.0...v2.0.1) (2026-01-21)


### Bug Fixes

* **ci:** Add proper permissions for release and security scan jobs ([d60e138](https://github.com/asachs01/autotask-mcp/commit/d60e138684c214dcab6196cffe977fb581bc20eb))
* **ci:** Disable npm publishing in semantic-release ([ae11880](https://github.com/asachs01/autotask-mcp/commit/ae118800add292aaf5aa626aef29cc61e9d8cff9))
* **ci:** Replace local file dependency with git dependency for autotask-node ([828bf1a](https://github.com/asachs01/autotask-mcp/commit/828bf1abb4872ecc40c0b64ea080c6126ecee2ed)), closes [asachs01/autotask-node#v2](https://github.com/asachs01/autotask-node/issues/v2)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **License**: Changed from MIT to Apache 2.0

### Added
- **CLA**: Added Contributor License Agreement for contributors

## [2.0.0] - 2026-01-21

### Breaking Changes
- **Tool Namespacing**: All 35 MCP tools now use `autotask_` prefix to prevent naming collisions when multiple MCP servers are connected
  - `search_companies` → `autotask_search_companies`
  - `create_ticket` → `autotask_create_ticket`
  - `test_connection` → `autotask_test_connection`
  - All other tools follow the same pattern: `autotask_<original_name>`
- **Migration Required**: Update all tool calls in your MCP client configuration to use the new namespaced names

### Changed
- All tool definitions in `tool.handler.ts` updated with `autotask_` prefix
- Documentation updated to reflect new tool names

## [1.0.2] - 2026-01-21

### Fixed
- **Issue #9: Inaccurate Endpoints, Excessive Calls**: Upgraded to `autotask-node` v2.0.2 which fixes the critical `maxRecords` casing bug. The Autotask REST API is case-sensitive and was silently ignoring `MaxRecords` (uppercase M), causing all records to be returned instead of paginated results.
- **Issue #8: Claude Desktop and Docker unable to return results**: Added `searchTerm` → filter transformation for Companies, Contacts, and Resources
  - Company searches now filter on `companyName` field instead of fetching all companies
  - Contact searches now filter across `firstName`, `lastName`, and `emailAddress` fields
  - Resource searches now filter across `email`, `firstName`, and `lastName` fields
  - When searching with `searchTerm`, limits pagination to 100 results for efficiency
- **Issue #3: Autotask MCP out of sync with REST schema**: Fixed by upgrading to `autotask-node` v2.0.2 which corrects:
  - `MaxRecords` → `maxRecords` (lowercase m) across all 214 entity files
  - Proper POST `/query` endpoint usage for all list operations

### Changed
- **Dependency Upgrade**: Updated `autotask-node` to v2.0.2 with critical pagination fix
- **Search Efficiency**: When `searchTerm` is provided, searches return filtered results directly from API instead of paginating through all records

### Fixed (Previous)
- **🚨 CRITICAL DATA ACCURACY FIX**: Implemented pagination-by-default to eliminate massive ticket undercounts
  - **Root Cause**: Default page size was limited to 25-50 tickets, causing severe data accuracy issues
  - **Solution**: All search tools now paginate through ALL results by default for complete datasets
  - **Impact**: Fixes undercounting from 26 tickets to actual counts (e.g., 97+ tickets)
  - **User Control**: Only specify `pageSize` parameter when you actually want to limit results
- **CRITICAL: Massive Ticket Undercount**: Fixed automatic company filter that was severely limiting ticket search results (was showing only ~10 tickets instead of 97+)
- **Critical Unassigned Ticket Search Issue**: Fixed inability to search for unassigned tickets that was causing discrepancies between UI and API results
- **Parameter Mapping Issue**: Fixed `companyID` to `companyId` parameter mapping in `search_tickets` tool handler
- Enhanced ticket filtering logic to properly handle all filter parameters including assignment status

### Changed
- **Default Behavior**: `search_tickets` and all search tools now return complete datasets via automatic pagination
- **Performance**: Increased page size to 500 tickets per API request for efficiency while paginating
- **Safety**: Added pagination safety limit of 100 pages (50,000 tickets) to prevent infinite loops
- **Tool Descriptions**: Updated all search tool descriptions to clarify pagination-by-default behavior
- **Status Filtering**: Improved open ticket definition (status < 5) for accurate filtering

### Added
- **Data Accuracy Guarantee**: All search operations now provide complete, paginated results by default
- **Enhanced ID-to-Name Mapping**: Comprehensive mapping service with intelligent caching
  - New tools: `get_company_name`, `get_resource_name`, `get_mapping_cache_stats`, `clear_mapping_cache`, `preload_mapping_cache`
  - Automatic enhancement of search results with `_enhanced` field containing resolved names
  - 30-minute cache expiry with graceful fallback for missing data
- **Pagination Testing**: Added test scripts to verify complete data retrieval (`npm run test:pagination`)
- **Unassigned Ticket Support**: Added `unassigned` boolean parameter to `search_tickets` tool to search for tickets without assigned resources
- **Enhanced Tool Handler**: `EnhancedAutotaskToolHandler` with automatic ID-to-name resolution

### Fixed (Additional)
- **CRITICAL: Incomplete Company/Resource Mapping**: Fixed mapping cache that was limited to 500 records, causing "Customer 624" style names instead of proper company names
- **All Search Methods Now Complete**: Applied pagination-by-default to `searchCompanies`, `searchContacts`, and `searchResources` to ensure mapping cache includes ALL entities
- **Graceful Mapping Fallback**: Enhanced mapping service to not throw errors on cache failures, allowing direct API lookups as fallback

## [1.1.1] - 2025-06-10

### Fixed
- **Critical**: Resolved "result exceeds maximum length" errors in ticket searches by implementing aggressive data optimization
- Limited ticket search results to maximum 3 tickets per query to stay under 1MB MCP response limit
- Reduced ticket data from 76 fields (~2KB per ticket) to 18 essential fields (~685 characters per ticket)
- Added service-level result limiting as safety measure since Autotask API may ignore pageSize parameter
- Improved null handling in ticket data optimization to prevent runtime errors

### Changed
- Updated `search_tickets` tool description to clarify field limitations and recommend `get_ticket_details` for full data
- Reduced maximum pageSize for ticket searches from 100 to 3 due to API response size constraints
- Enhanced ticket data truncation with clear indicators to use `get_ticket_details` for full content

### Added
- N/A

### Fixed
- N/A

## [1.1.0] - 2024-12-10

### Added
**Phase 1: High-Priority Entity Support**
- **Notes Management**: Support for ticket, project, and company notes
  - New tools: `get_ticket_note`, `search_ticket_notes`, `create_ticket_note`
  - New tools: `get_project_note`, `search_project_notes`, `create_project_note`
  - New tools: `get_company_note`, `search_company_notes`, `create_company_note`
- **Attachments Management**: Support for ticket attachments
  - New tools: `get_ticket_attachment`, `search_ticket_attachments`
- **Expense Management**: Support for expense reports
  - New tools: `get_expense_report`, `search_expense_reports`, `create_expense_report`
- **Quotes Management**: Support for sales quotes
  - New tools: `get_quote`, `search_quotes`, `create_quote`
- **Extended Type Definitions**: New interfaces for all supported entities
  - `AutotaskNote`, `AutotaskTicketNote`, `AutotaskProjectNote`, `AutotaskCompanyNote`
  - `AutotaskAttachment`, `AutotaskTicketAttachment`
  - `AutotaskExpenseReport`, `AutotaskExpenseItem`
  - `AutotaskQuote`, `AutotaskBillingCode`, `AutotaskDepartment`
  - Extended query options with `AutotaskQueryOptionsExtended`
- **Comprehensive Testing**: Full test coverage for all new entity methods

### Enhanced
- **Tool Count**: Expanded from 18 to 27 total MCP tools
- **Entity Support**: Now supports 10+ Autotask entities with comprehensive CRUD operations
- **Error Handling**: Improved error messages for unsupported operations
- **API Coverage**: Enhanced coverage of autotask-node library capabilities

### Notes
- Expense items, billing codes, and departments marked as not directly supported in current autotask-node version
- All new tools follow existing pagination and optimization patterns
- Backward compatibility maintained with all existing functionality

## [1.0.4] - 2025-01-09

### Added
- **Data Optimization for Large Responses**: Implemented comprehensive data optimization to prevent "result exceeds maximum length" errors
  - Added field filtering for ticket searches to return only essential fields
  - Implemented automatic text truncation for large description fields (tickets: 500 chars, tasks: 400 chars)
  - Added pagination limits with sensible defaults (tickets/projects/tasks: 25 default, 100 max; companies/contacts: 50 default, 200 max)
  - Created `get_ticket_details` tool for retrieving full ticket data when needed
  - Added data optimization for projects and tasks with similar field filtering

### Changed
- **Ticket Search Optimization**: `search_tickets` now returns optimized data by default
  - Essential fields only: id, ticketNumber, title, description (truncated), status, priority, etc.
  - Removed large arrays like userDefinedFields
  - Truncated resolution and description fields to prevent oversized responses
- **Project and Task Search Optimization**: Applied similar optimization strategies
  - Field filtering for essential data only
  - Description truncation with "... [truncated]" indicators
  - Reduced pagination limits for better performance
- **Tool Descriptions**: Updated tool descriptions to clarify optimization behavior
- **Pagination Limits**: Reduced maximum page sizes across all entity searches for better performance

### Fixed
- **TypeScript Compilation**: Fixed type compatibility issues with optimization functions
- **Response Size Management**: Eliminated "result exceeds maximum length" errors for ticket searches

### Technical Details
- Added `optimizeTicketData()`, `optimizeProjectData()`, and `optimizeTaskData()` methods
- Implemented field filtering using `includeFields` parameter where supported
- Enhanced error handling and logging for optimization processes

## [1.0.3] - 2025-06-09

### Added
- **Major Entity Expansion**: Added support for 8 additional Autotask entities:
  - **Projects**: Search, create, and update project records
  - **Resources**: Search for users/employees in Autotask
  - **Configuration Items**: Search for managed assets and devices
  - **Contracts**: Search for service contracts (read-only)
  - **Invoices**: Search for billing invoices (read-only)
  - **Tasks**: Search, create, and update project tasks
- **Enhanced Tool Coverage**: Expanded from 9 to 17 available MCP tools
- **Comprehensive Type Definitions**: Added TypeScript interfaces for all new entities
- **Status Enums**: Added helpful enums for project, task, opportunity, and contract statuses

### Improved
- **Better Error Handling**: Enhanced type casting for compatibility with autotask-node library
- **Code Organization**: Structured service methods by entity type for better maintainability

## [1.0.2] - 2025-06-09

### Fixed
- **Critical MCP Protocol Fix**: Enhanced stdout wrapper to completely filter all non-JSON-RPC output, eliminating "invalid union" errors in Claude Desktop
- **Critical Authentication Fix**: Removed extra quotes from AUTOTASK_SECRET in .env file that were causing 401 Unauthorized errors
- **Environment Variable Loading**: Updated docker-compose.yml to explicitly use `env_file` directive for proper environment variable handling
- **Lazy Initialization**: Implemented lazy initialization of Autotask client to prevent MCP timeout issues during server startup
- **Container Restart Issues**: Fixed Docker container to start quickly without blocking on Autotask API connection
- **Winston Logger Output**: Fixed Winston logs leaking to stdout by implementing comprehensive stdout interception

### Improved
- **MCP Compliance**: Now fully compliant with JSON-RPC protocol - only valid MCP messages on stdout
- **Error Diagnostics**: Enhanced credential validation and error reporting
- **Development Experience**: Faster development iteration with immediate container startup

## [1.0.1] - 2024-12-09

### Fixed
- **Stdout Interference**: Added TypeScript wrapper script to redirect all non-MCP stdout output to stderr
- **Logger Output**: Fixed logging to use stderr instead of stdout for Claude Desktop compatibility  
- **Third-party Library Output**: Prevented autotask-node library output from interfering with MCP JSON-RPC protocol
- **Build Process**: Fixed wrapper compilation by converting to TypeScript (.ts) for proper build inclusion
- **Docker Image Tag**: Updated documentation to use correct Docker image tag
- **MCP Protocol**: Resolved JSON-RPC parsing errors when connecting to Claude Desktop

### Documentation
- Enhanced Quick Start guide with system-specific configuration examples
- Added troubleshooting section for common Claude Desktop connection issues

## [1.0.0] - 2024-12-09

### Added
- Initial project setup and architecture
- MCP server implementation with full protocol compliance
- Autotask service layer with comprehensive API coverage
- Docker and docker-compose configuration for easy deployment
- Comprehensive test suite with 80%+ coverage requirement
- Structured logging with configurable levels and formats
- TypeScript types for all Autotask entities and MCP protocol
- Complete CI/CD ready setup

### Changed
- N/A (initial release)

### Deprecated
- N/A (initial release)

### Removed
- N/A (initial release)

### Fixed
- N/A (initial release)

### Security
- Implemented secure credential handling through environment variables
- Added non-root user in Docker container for security
- Configured proper resource limits for container deployment

## [1.0.0] - 2024-12-09

### Added
- **🔌 MCP Protocol Compliance**: Full Model Context Protocol implementation
- **🛠️ Autotask Integration**: Complete integration with Kaseya Autotask PSA via autotask-node
- **📚 Resource Access**: Read-only access to companies, contacts, tickets, and time entries
- **🔧 Tool Operations**: CRUD operations for core Autotask entities
- **🔍 Advanced Search**: Powerful search capabilities with filters
- **🐳 Container Support**: Docker and docker-compose configuration
- **📊 Logging System**: Winston-based structured logging
- **🧪 Test Framework**: Jest-based testing with coverage requirements
- **📝 Documentation**: Comprehensive README and API documentation
- **⚙️ Configuration**: Environment-based configuration management

### Core Features
- **Autotask Entities**: Companies, Contacts, Tickets, Time Entries
- **MCP Resources**: Structured read access to Autotask data
- **MCP Tools**: Interactive operations for data manipulation
- **Authentication**: Secure API credential management
- **Error Handling**: Comprehensive error handling with proper MCP error codes
- **Type Safety**: Full TypeScript implementation

### Development Features
- **Hot Reload**: Development server with hot reload capability
- **Testing**: Unit, integration, and API tests
- **Linting**: ESLint configuration with TypeScript support
- **Building**: TypeScript compilation pipeline
- **Docker**: Multi-stage Dockerfile for optimized containers

### Security
- Non-root container execution
- Environment variable credential management
- Input validation and sanitization
- Resource limits and health checks

---

## Release Process

### Version Numbering
This project follows [Semantic Versioning](https://semver.org/):
- **MAJOR**: Incompatible API changes
- **MINOR**: New functionality in a backwards compatible manner
- **PATCH**: Backwards compatible bug fixes

### Release Notes Format
Each release includes:
- **NEW FEATURES**: Major new functionality
- **IMPROVEMENTS**: Enhancements to existing features
- **FIXES**: Bug fixes and stability improvements
- **BREAKING CHANGES**: Any breaking changes and migration guides

### Upcoming Features (Roadmap)
- HTTP transport option for MCP
- Additional Autotask entities (Projects, Assets, etc.)
- Webhook support for real-time updates
- Advanced filtering and sorting options
- Bulk operations for data manipulation
- Performance optimizations and caching
- GraphQL interface for advanced queries
