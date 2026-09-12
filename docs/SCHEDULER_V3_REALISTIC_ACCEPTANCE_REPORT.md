# Scheduler V3 realistic multi-tenant acceptance

Date: 13 September 2026. Result: **local emulator acceptance complete; hosted rollout prepared, not executed**.

Base: `9c7e3a6bb658d3414a0c2d5b9f819bb7e25f9384`. Branch: `codex/scheduler-v3-simplification-correctness`.

## Owner-readable output

The [complete schedules and Expected/Actual report](SCHEDULER_V3_REALISTIC_SCHEDULES.md) contains all four actual WEEK timetables, every employee profile, fixed day off, standard/alternate times, target, rotation anchor, absence, coverage requirement, monthly totals, weekly deltas and warnings. Complete machine-readable assignments, PDF artifacts and screenshots are retained in the local QA output directory.

| QA business / hostname | Active staff | WEEK shifts / hours | MONTH shifts / hours | WEEK / MONTH warnings |
| --- | ---: | ---: | ---: | ---: |
| Fuel Station / qa-fuel.shiftoryx.gr | 6 | 26 / 208 | 112 / 896 | 6 / 32 |
| Café / qa-cafe.shiftoryx.gr | 8 | 36 / 288 | 155 / 1,240 | 10 / 38 |
| Hair Salon / qa-salon.shiftoryx.gr | 6 | 20 / 136 | 86 / 584 | 6 / 30 |
| Mini Market / qa-market.shiftoryx.gr | 9 | 31 / 248 | 132 / 1,056 | 8 / 37 |

WEEK is 7–13 September 2026; MONTH is September 2026. These are generated results, not hand-assigned timetables.

- Fuel: 06–14 / 14–22, one weekly rotation, mixed targets and fixed days off, leave on 9–11 September. The explicitly configured substitute works Wednesday and Thursday, 16h total. Anna and Petros work 48h against 40h soft targets; those deviations are visible.
- Café: three demand periods and weekday-specific headcounts. Sofia's leave plus Saturday demand produces a **10–18 shortage of one employee on 12 September**. Generation still succeeds. Standard-time matches are 33 of 36 weekly assignments.
- Salon: Tuesday–Saturday, six-hour early/late shifts plus 10–18 appointments. Christina and Vasilis have separate rotating profiles and alternate independently across the two tested weeks. Lower-than-target hours reflect configured demand, not fabricated work.
- Market: seven-day operation, higher Saturday and different Sunday coverage, staggered fixed days off and Stelios's leave. Standard-time matches are 30 of 31 weekly assignments.

The fuel and salon WEEK schedules match their effective standards on all assignments. Warnings include coverage shortage, standard deviations and weekly target under/over; manual scenarios additionally create visible fixed-off/coverage warnings. No automatic fixed-off or absence violations occurred. Partial boundary weeks are labelled; their targets are not silently prorated.

## Authentication and isolation evidence

The QA Vite config substitutes only the Firebase adapter and uses process-local QA flags. All application login, membership resolution, ticket creation/exchange, authenticated subscriptions, repository operations and Rules are the existing real implementations. Functions source is copied into the temporary emulator workspace, using installed dependencies and the SDK's generated manifest.

The isolated Playwright browser routes static application requests for the five exact HTTPS hostnames to loopback, grants local-network access only to those origins, and blocks unrelated requests/WebSockets. Auth, Firestore, Storage and Functions requests go to real loopback emulators. No auth or repository responses are mocked. This proves the application flow and origin binding locally; it does not test live DNS/TLS or a hosted deployment.

Final checks:

- **87 scheduler checks** across four realistic tenants and eight baseline periods, plus explicit quiet-week, hiring and manual-override cases.
- **32 broker checks**: four real OWNER logins, all 12 ordered cross-tenant ticket requests denied, correct-origin binding, foreign-origin rejection and single-use replay rejection.
- **56 browser checks**: central login, matching redirect, refresh, direct authorized visit, logout/re-login, WEEK/MONTH UI generation, real Preview edits, actual Publish-button warnings acknowledgment and original v1/PDF preservation after v2.
- All **12 ordered foreign-tenant pairs** deny private employee read/write, history, draft, PDF, publication reservation and host-based authorization: **84 checked denial outcomes**, inside the browser checks above.
- A separately authenticated OWNER A at tenant B's origin still sees access denied. Changing the hostname or passing B's ID to a repository does not create membership.
- Stored PDF bytes equal the bytes rendered from the supplied publication snapshot. Snapshot and PDF overwrites are denied; downloaded v1 bytes remain unchanged after v2.
- The UI creates initial versions 1/2; the additional real repository exercise creates versions 3/4. All four remain visible in the final manual-QA history.
- Five negative QA safety-guard checks plus a valid demo configuration passed. Credentials-file access protection was verified on Windows.

## Defect found and fixed

The real central-login test initially returned to the portal after reaching the correct tenant. `AuthTicketCallback` removed the fragment before its asynchronous exchange completed, allowing `TenantGate` to treat the in-progress handoff as an unauthenticated direct visit. React development remounts also abandoned the first single-use exchange's navigation handler.

The callback now retains one exchange promise across remounts, and the gate retains the initial handoff state until navigation. The same real login test failed before the correction and passed afterward for all four owners, including re-login and foreign-host denial. Backend membership enforcement and Firestore/Storage Rules were not changed.

## Verification and limitations

Passed: `qa:auth-broker`, `qa:tenant-authorization`, `qa:central-portal-isolation`, `qa:public-readonly`, `qa:repositories`, `qa:export-security`, `security:hardening`, `security:integrity`, and production `build`. The real emulator/browser runs used `acceptance.mjs`, `broker.mjs` and `browser.mjs` as documented in the [QA guide](../qa/scheduler-v3/README.md). Build retained its existing large-chunk warning. V2 and V3 scheduling algorithms were not modified in this phase.

The current approximately 449-shift transaction boundary remains. These months contain 86–155 shifts and were actually saved/reloaded within it. No large-staff stress matrix, chunked persistence, finalizer, timezone/DST redesign or global domain/auth rollout was introduced.

Hosted QA is blocked until the target project, shared app revision, domain/TLS routing, Auth authorized domains and QA-only activation are explicitly approved and performed. The [hosted activation procedure](../qa/scheduler-v3/README.md#later-hosted-activation--explicit-authorization-required) gives the ordered steps. `prepare-hosted.mjs` generates a complete credential-free manifest; the emulator seed deliberately refuses a hosted project.

No production accounts/data, real-tenant activation, deployment, merge, DNS, IAM or global flags changed. No dependencies, lockfiles or GitHub Actions changed. Runtime QA passwords were generated outside Git and are not in this report, screenshots or source. The current user's credential file uses a restrictive Windows ACL; other platforms use mode 0600. Existing unrelated simplification docs/artifacts were preserved.

## Files in this phase

- `src/components/auth/AuthTicketCallback.jsx`
- `src/components/auth/TenantGate.jsx`
- `qa/scheduler-v3/fixtures.ts`
- `qa/scheduler-v3/environment.mjs`
- `qa/scheduler-v3/firebaseClient.js`
- `qa/scheduler-v3/vite.config.mjs`
- `qa/scheduler-v3/credentials.mjs`
- `qa/scheduler-v3/seed.mjs`
- `qa/scheduler-v3/runtime.mjs`
- `qa/scheduler-v3/acceptance.mjs`
- `qa/scheduler-v3/broker.mjs`
- `qa/scheduler-v3/browser.mjs`
- `qa/scheduler-v3/prepare-hosted.mjs`
- `qa/scheduler-v3/README.md`
- `docs/superpowers/plans/2026-09-12-realistic-multi-tenant-acceptance.md`
- `docs/SCHEDULER_V3_REALISTIC_SCHEDULES.md`
- `docs/SCHEDULER_V3_REALISTIC_ACCEPTANCE_REPORT.md`

For manual local testing, open the interactive QA browser as documented and use the external `credentials.json`. Those credentials are emulator-only; the ordinary public domains have not been activated by this task. Keep the runtime open during testing. The earlier failed harness attempts and their artifacts remain separate from the final successful session.

SHIFTORYX_V3_REALISTIC_MULTI_TENANT_ACCEPTANCE_READY_FOR_HUMAN_REVIEW
