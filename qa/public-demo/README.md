# Public demo local verification

These commands target only the local `demo-shiftoryx-public` Firebase emulator. Browser HTTPS hostnames are routed to local Vite; they are **not hosted HTTPS acceptance**. Do not use their results as authorization to deploy.

Use the already-installed Firebase CLI, without installing project dependencies:

```powershell
$env:QA_FIREBASE_CLI='<installed firebase-tools>/lib/bin/firebase.js'
node qa/public-demo/runtime.mjs
```

Wait for `PUBLIC_DEMO_EMULATOR_READY`. In a second terminal, run **one** stateful suite. Stop that runtime with Ctrl+C and start a new runtime before the next stateful suite. The fixtures are deliberately disposable; process output/artifacts are placed outside the checkout.

Alternatively, the bounded runner starts and stops a fresh runtime for each named suite, stops on the first failure, and does not construct shell commands:

```powershell
node qa/public-demo/verify.mjs races
node qa/public-demo/verify.mjs owners browser
```

Supported suite names include `races`, `owners`, `browser`, `isolation`, `reset`, `settings`, `identity`, `lease`, `upload`, `visual`, `pdf`, `pdf-races`, `pdf-browser`, `typed`, `typed-max`, `typed-isolation`, `typed-negative`, `sdk-bypass`, and `mutation-retries`. Existing runtime ports must be free before starting it.

The runtime allows120 seconds for local cold worker startup using the installed CLI's `FUNCTIONS_DISCOVERY_TIMEOUT` override. It probes entry, broker, reset and typed mutation handlers with requests that must be rejected (503/401/400), so no credentials or successful operations are used for warmup. This is local worker readiness; deployed authorization assertions are unchanged.

| Command | Purpose | State changed |
| --- | --- | --- |
| `node qa/public-demo/isolation.mjs` | All12 foreign pairs, private reads/writes/PDF/membership denial, reset concurrency/cooldown | Visitor employees on4 tenants; fuel reset |
| `node qa/public-demo/reset-coverage.mjs` | All22 tenant collections, root export metadata, both PDF families, foreign preservation | Explicit fictional foreign/non-demo sentinels; fuel reset |
| `node qa/public-demo/settings-regression.mjs` | Typed atomic settings/profile save; valid direct write denied; all54 malformed direct-write denials retained | Canonical settings/profile writes |
| `node qa/public-demo/browser.mjs` | Four tenant UI generation/edit/publication/history/PDF/reset/login workflows | Publications, drafts, all4 resets |
| `node qa/public-demo/browser.mjs --owners-only` | Employee/profile/settings/absence UI persistence, delete flows and paired announcements | Fictional CRUD/profile data |
| `node qa/public-demo/browser.mjs --races-only` | Reset/auth handoff, two tabs, stale writes and Storage | Market reset and generation changes |
| `node qa/public-demo/entry-recovery.mjs` | Shared Auth UID deletion/recovery and membership preconditions | Auth identity and membership test fixtures |
| `node qa/public-demo/lease-recovery.mjs` | Interrupted reset lease and trusted recovery | Salon reset-control fixture and recovery |
| `node qa/public-demo/storage-reset-race.mjs` | Resumable upload finalization after reset | Café reset and upload attempt |
| `node qa/public-demo/visual.mjs` | Landing layout/keyboard/page errors, five viewports | No business writes |
| `node qa/public-demo/typed-mutations.mjs` | Actual typed HTTP operations and449-shift transaction/replay | Fictional CRUD/draft data |
| `node qa/public-demo/typed-max-payload.mjs` |449 exact768-byte shifts and128-KiB metadata, +1 rejection, single receipt/quota/audit | Replaces only fictional emulator roster/config |
| `node qa/public-demo/typed-cross-tenant.mjs` | All12 ordered pairs,48 typed foreign assertions | No primary mutation |
| `node qa/public-demo/typed-negative.mjs` | Anonymous/member/admin/reset/generation/malformed/quota rollback negatives | Temporary emulator control fixtures, restored |
| `node qa/public-demo/direct-sdk-bypass.mjs` | Create/update/delete denied on all9 active client collections | Temporary server-seeded fictional probes |
| `node qa/public-demo/browser.mjs --mutation-retries-only` | Lost response + unrelated action + reload + same receipt; actual delete adapters; draft load/shrink/resave | Fictional CRUD/draft/activity data |

Phase3B.2B-2 makes the nine active demo collection writers server-only. Older positive direct-SDK scenarios now invoke the typed API; their foreign/malformed denial assertions remain. Phase3B.2B-3 adds explicit reset phases and controlled contention outcomes; its focused/full/security gates are recorded in `docs/PUBLIC_DEMO_B3_PROGRESS.md` until the final report is available.

The B3 suites run with the same fresh-fixture runner:

```powershell
node qa/public-demo/verify.mjs b3-precheck b3-retention b3-recovery b3-concurrency b3-adapter
```

- `b3-precheck`: real endpoint mismatch/missing/malformed/uncertain/over-cap rollback; unchanged OWNER/Auth/roster/PDF/foreign state.
- `b3-retention`: native transactions prove exact counter/actual count,800/801,200-record expiry pages and replay without double decrement.
- `b3-recovery`: exact expired PRECHECK takeover and stale rollback denial; read-only lease loss; forward DESTRUCTIVE recovery and FINALIZE Rules fence.
- `b3-concurrency`:20 two-way races per each of four tenants plus one4-caller race; exactly one winner, controlled losers, foreign state/roster unchanged. Only emulator fixture cooldown timestamps are cleared between rounds.
- `b3-adapter`: native bounded aggregate queries, exact stored tenantId root filter and exact-path/pinned-generation Storage cleanup. Emulator generation behavior is not a new real-GCS qualification.

Reset cleanup covers25 explicit tenant collections (23 Rules surfaces and2 reserved auxiliary collections), exact tenant-filtered root monthly exports, and the entire exact demo tenant Storage prefix. The existing normal Rules and production entry are not changed by B3. Legacy usable OPEN records are supported; interrupted legacy resets without an explicit phase require separate recovery instead of an unsafe guessed boundary.

Do not run these sequentially on one shared fixture and interpret a roster or cooldown failure as a product regression. In particular, an isolation test has already reset fuel; a following fuel race test will hit the ten-minute reset cooldown before reaching its intended interleaving. Do not disable or reduce cooldown to repair the harness.

`node qa/public-demo/normal-rules-regression.mjs` manages separate ports and runs the existing V3 emulator suite with normal Rules. `QA_FIREBASE_CLI` must be configured. It does not use the public-demo runtime.

Policy and package guard tests are standalone:

```powershell
node scripts/test-public-demo-policy.mjs
node scripts/test-demo-package-guard.mjs
```

Never record Auth tokens, custom tokens, ticket URLs or resumable-upload session URLs. Test receipts retain scenario results, screenshots and fictional PDFs only. Do not inspect or commit emulator debug logs.
