# Realistic multi-tenant acceptance implementation plan

**Goal:** Rehearse four complete QA businesses through the existing V3 scheduler, central login, auth broker, tenant repositories and Rules, with readable schedules and reusable local tooling.

**Architecture:** QA-only fixtures and Vite configuration, real Firebase Auth/Firestore/Storage/Functions emulators, existing production modules. Browser request routing maps the exact five HTTPS product hostnames to the local QA server without DNS changes. Credentials are generated at runtime outside Git. Hosted activation remains a documented later operation.

**Baseline:** `9c7e3a6bb658d3414a0c2d5b9f819bb7e25f9384`, branch `codex/scheduler-v3-simplification-correctness`. Preserve unfinished simplification docs and test artifacts.

**Constraints:** No scheduler redesign, new stress matrix, dependency/lockfile change, production seed, deploy, merge, DNS/IAM/global flag change. Reuse installed dependencies. QA writes only to the fixed demo project with loopback emulator endpoints. No credentials in source, reports, screenshots, traces or logs. User receives an external local credential-file link.

- [x] Create `qa/scheduler-v3/fixtures.ts`: fuel 6, café 8, salon 6, market 9; explicit profiles, operating windows, headcount coverage and absences. WEEK 2026-09-07..13; MONTH September 2026.
- [x] Create `qa/scheduler-v3/acceptance.mjs`: call real generation/analysis/edit/publication/PDF functions; assert expected business rules; write owner-readable schedules, weekly/monthly totals, deltas, warnings and Expected/Actual rows.
- [x] Create QA emulator settings/seed tooling with fail-closed fixed project and endpoint validation, random runtime OWNER credentials, non-destructive seed collision handling and reusable fixture manifest.
- [x] Create QA-only Firebase module substitution and Vite startup. Production config and flags remain unchanged. Use existing Functions broker with process-local configuration.
- [x] Create Playwright acceptance using real central login and broker, refresh/logout/direct-host cases, adversarial repository/Firestore/Storage checks, Preview edit, warnings publication v1/v2 and immutable PDF comparison. Route only explicit QA hosts; deny external traffic; no auth/repository mocks.
- [x] Run the four-tenant rehearsal, inspect actual schedules/screenshots, run affected regressions and build, and document hosted prerequisites and exact later activation procedure.

Expected assertions include: generated shifts never intersect fixed-off/absence dates; standard match wins when available; separate employees alternate according to their own anchor; targets may be exceeded without fabricated demand; explicit substitutes fill only NORMAL shortages; zero-hour active employees stay in summaries; manual edits change totals and warnings; warning acknowledgment permits publication; v1 snapshot and stored bytes survive v2 unchanged; every ordered pair of distinct tenants denies private repository reads/writes and publication/PDF access.

Completion marker is allowed only after generation, realistic cases, central-login routing and tenant isolation are complete in the local rehearsal. Hosted DNS/auth/deployment are explicitly unexecuted and reported as prerequisites.

Final evidence: 87 scheduler, 32 real broker and 56 real browser checks PASS. Actual Publish-button versions 1 and 2 verified in a fresh session; 84 ordered-pair private denial outcomes pass. A small auth-handoff race correction in AuthTicketCallback/TenantGate was required by the real login regression; backend authorization and global flags remain unchanged. Hosted operations remain prepared only. See docs/SCHEDULER_V3_REALISTIC_ACCEPTANCE_REPORT.md.
