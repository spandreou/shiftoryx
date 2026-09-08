# Scheduler V3 continuation — 8 September 2026

## Scope and base

Branch: `antigravity/scheduler-v3-standard-architecture`.
Base: `5edabcae33653c93abc51ad035c058807ca08199`.
Initial A–D checkpoint: `99c47a108b693127d6053aaec79e0a4f3344b54e`.
V2 engine and adapter remain unchanged. The separate lifecycle branch is preserved.

## Changes

Completed barrel exports, validated the supplied engine with new tests, corrected full-result determinism, malformed configuration handling, night intervals and missing warnings. Added V3 settings/profiles, quarter-hour draft editing, live warnings and zero-hour statistics, versioned draft storage, immutable publication/PDF history, public week/month synchronization, and offline migration preview.

The app routes to V3 only with both the default-off global flag and tenant version 3. OWNER membership remains the authorization boundary; Platform Admin does not gain tenant access. Draft data is excluded from legacy schedule reads and bulk date/employee removal. V3 publication snapshots/PDFs are create-only.

## Verification

| Command/check | Result |
| --- | --- |
| `npm run test:scheduler-contract-v3` | PASS: 304 engine cases + 17 service cases |
| `npm run test:scheduler-contract-v2` | PASS: 2,118 assertions |
| `npm run qa:scheduler` | PASS, including legacy employee regressions and build |
| `npm run qa:scheduler-engine` | PASS |
| `npm run qa:repositories` | PASS |
| `npm run qa:public-readonly` | PASS |
| `npm run qa:tenant-authorization` | PASS |
| `npm run qa:auth-broker` | PASS |
| `npm run qa:export-security` | PASS |
| `npm run security:hardening` | PASS |
| `npm run security:integrity` | PASS |
| `npm run build` | PASS; existing large-chunk warnings |
| `npm audit --audit-level=high` | PASS threshold: 4 moderate, 1 low; initial DNS failure recovered |
| `npm audit --prefix functions --audit-level=high` | PASS threshold: 8 moderate |
| Playwright V2 + V3 | PASS: 5 tests; V3 at 390×900 and 1440×900; screenshots inspected |
| V3 Firebase emulator | PASS: actual repository settings/draft read-write, stale revision rejection, concurrent unique versions, latest pointer ordering, month-to-week projection replacement, immutable publication/PDF, cross-tenant/Platform Admin/anonymous denials |
| Separate lifecycle matrix (152) | NOT RUN: file absent from this branch |
| Standalone TypeScript check | NOT RUN: no configured compiler; Vite does not type-check |

Browser command: `E2E_BASE_URL=http://127.0.0.1:5187 node node_modules/playwright/cli.js test tests/scheduler-v3.e2e.spec.js tests/scheduler-roles.e2e.spec.js --workers=1` (PowerShell environment assignment used).

Emulator command: Firebase CLI `emulators:exec --project demo-shiftoryx-v3 --config firebase.json --only auth,firestore,storage "node <repo>/scripts/run-scheduler-v3-emulator.mjs"`, from a dedicated temporary directory. The temporary config references this checkout's Rules and uses loopback ports Auth 9299, Firestore 8188 and Storage 9399. The runner compiles the actual repository with demo-only configuration and refuses non-loopback emulator variables. Logs remain outside the checkout. Expected permission denials are assertions; the Storage runtime printed a shutdown exception after the successful test process exited 0.

## Review and limits

Independent engine review found reproducible defects addressed by the V3 tests. Integration review identified weekly Rules payload mismatch and stale public weekly data after month publication; both were fixed and verified in the emulator. That reviewer hit a usage limit before its final review, so no complete independent final security-scan certification is claimed. Primary review and executable authorization/immutability checks cover the changed paths.

Draft transaction size is bounded to 450 operations. Interrupted publication can retain a reserved version or orphaned immutable PDF. Civil-clock interval arithmetic does not implement DST elapsed-time adjustment. Migration conversion is preview-only with explicit unconverted semantics. Browser tests cover editing and warning acceptance; actual persistence and security are exercised separately in the emulator, not via a signed-in production browser.

## Security, deployment and rollback

New dependencies: 0. Lockfiles and GitHub Actions unchanged. No credentials were read or modified. No production data, Firebase deployment, DNS, IAM or Vercel production configuration was changed. The original protected log and `.serena/` were not inspected.

The delivery is a Draft PR for review, not production activation. Rollback is to leave/restore the global V3 flag off; V2 data and code remain available. Any future production Rules rollout and tenant activation require separate approval. Preserve publication history and PDFs during rollback.
