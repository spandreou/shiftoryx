# ShiftOryx Public Demo — Phase 3B.2B-3

Completed local/emulator-only implementation and independent review. No hosted rollout is authorized.

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_CLEAN=NO (inherited dirty work preserved)
PHASE_3B_2B_3_READY=YES
PUBLIC_DEMO_RELEASE_READY=NO
```

## Implementation and root causes

The previous worker crossed the generation/membership boundary before validating retained intent counts and capacity. Real RED evidence: counter1/actual0 returned200, advanced generation2 and removed a tenant PDF sentinel. A separate fresh race reproduced200 +500/INTERNAL. The new implementation keeps the existing facade and demo project/Auth/tenant authorization model; it does not alter Scheduler V3, normal repositories, Rules or normal Functions entry.

The logical sequence is `OPEN(g) → PRECHECK(g,L) → DESTRUCTIVE(g+1,L) → FINALIZE(g+1,L) → OPEN(g+1)`. PRECHECK changes only the reset fence/lease and proven expired root tombstones with atomic exact decrement. It never deletes tenant documents or Storage, revokes Auth/membership, advances generation or replaces fixtures. A failed PRECHECK rolls back only its exact live phase/lease/generation/resetting state. A lost or expired lease cannot unlock a successor.

The irreversible transaction repeats bounded capacity/retention checks, advances generation once and revokes the old Firestore membership atomically. External Auth/Storage calls occur outside transactions and only afterward. Recovery preserves the persisted fixture date, reclaims only an expired explicit phase and completes the same new generation forward. It never restores old authority. Every cleanup page rereads the exact lease. Storage cleanup derives the exact tenant prefix and pins the listed object generation without a latest-object fallback.

FINALIZE stays fenced while verifying canonical tenant/employee/public-employee/settings/absence data, new OWNER membership and Auth claims, absence of old membership and active PDF control, exact retained count, reseeded admission/audit receipts, empty auxiliary collections/root exports and zero tenant Storage objects. Only the final Firestore transaction writes OPEN and clears the lease. New valid Auth is insufficient to read the fixture before this transition.

Concurrency also exposed a second root cause: a transaction retried against a newer snapshot while comparing timestamps with request-start time. The permanent RED→GREEN test proves this previously misclassified a live lease as corruption400. Acquisition now evaluates the authoritative snapshot with a fresh server clock after reads, returning the narrow409 contention/generation outcome. `verifyIdToken(...,true)` remains enforced, including re-verification before the destructive boundary; revoked/deleted/disabled old sessions are denied, not granted a fallback.

The real late-upload drain exposed the same temporal ordering issue in PDF validation: a valid heartbeat could advance after the sampled clock but before the asynchronous read. A separate deterministic RED→GREEN regression reproduces it. Control/record timestamps now use a fresh post-read server time, with the same sampled time used for exact TTL selection/decrement. Strict future timestamps, stale heartbeats, uncertain states and state/attempt/reservation mismatches remain rejected. The fresh real PDF race suite passed18 cases after this correction.

## Locked bounds and invariants

| Resource | Bounded read / accepted condition | Failure behavior |
| --- | --- | --- |
| Retained PDF intents | Query801, actual≤800 | Counter mismatch, malformed/missing control or unknown/uncertain intent blocks before boundary; no blind repair |
| Expired INVALIDATED tombstones | Strict seven-day expiry,≤200 actions/transaction | Exact deleted-document count decremented atomically; young ages preserved; replay does not double decrement |
| Tenant collections | Native limit10000 aggregate, require<10000 on each of25 explicit collections | PRECHECK rollback, zero partial tenant deletion |
| Root monthly exports | Native limit9750 aggregate filtered on stored exact tenantId, require<9750 | Same rollback; no document-name/prefix heuristic |
| Storage | Bounded list33, require≤32; exact tenant prefix and generation | Same rollback; never delete to make preflight pass |
| Cleanup |≤250 documents/page, bounded page fuse | Exact phase/lease/generation CAS on every page |
| Reset lease / cooldown | Existing eight-minute lease / ten-minute public cooldown | Live lease409; cooldown429; trusted expired recovery only |
| PDF drain | Valid authoritative control/intent/reservation, bounded heartbeat and60-second wait | Ambiguous/malformed/uncertain state preserved; no timeout takeover or control deletion |

Usable legacy OPEN records without explicit phase remain supported. Interrupted legacy resetting records without explicit phase fail closed: B3 does not guess whether destruction already began. Initial provisioning has explicit generation0 PRECHECK, no previous OWNER and boundary1; failed bootstrap restores prior absence. These are internal options and are not accepted by the public endpoint.

## Focused evidence

| Command | Current result |
| --- | --- |
| `node scripts/test-public-demo-reset-state.mjs` |7 groups PASS: phase/rollback, expiry/CAS, forward recovery, legacy compatibility, bootstrap rollback/root change, transaction retry clock |
| `node scripts/test-public-demo-reset-retention.mjs` |6 groups PASS: count/TTL/replay, malformed/mismatch/uncertain,800/801, tombstone idempotency, PDF classification and asynchronous-read clock |
| `node scripts/test-public-demo-reset-engine.mjs` |4 groups PASS: zero effects/rollback, canonical finalize, forward crash recovery, missing final invariant stays fenced |
| `node scripts/test-public-demo-reset-errors.mjs` |16 closed ResetError mappings plus revoked-token/transient/unknown redaction checks PASS |
| `verify.mjs b3-concurrency` |81 races:20 two-way per each tenant plus one4-caller race;81 winners/83 controlled losers/0 INTERNAL/0 foreign mutations |
| `verify.mjs b3-precheck` |10 endpoint cases PASS: high/malformed/missing/low counter, uncertain/malformed PDF control,801 intents,33 objects, tenant10000/root9750 ceilings; OWNER/Auth/data/PDF/foreign state unchanged |
| `verify.mjs b3-retention` |Actual native Firestore transactions PASS: exact/lower/higher counts, young/expired/replay,800/801 and four exact200-deletion pages |
| `verify.mjs b3-recovery` |PASS: same-generation PRECHECK expiry takeover, old worker rollback denial, read-only lease loss, post-cleanup injected worker failure, forward recovery, FINALIZE private/public fence, fresh OWNER usability and foreign preservation |
| `verify.mjs b3-adapter` |PASS: bounded native aggregate queries, exact stored root tenant filter, tenant/pinned-generation Storage cleanup |

The emulator cannot establish hosted GCS generation fidelity. `REAL_GCS_IMMUTABILITY_GATE=PREVIOUSLY_PASS`; no real-GCS mutation qualification was rerun. Worker-loss scenarios inject faults around actual emulator-backed operations rather than killing hosted workers.

## B2/general regressions

All eleven requested deterministic Node suites passed: typed core/HTTP/transport, admission primitives, retained-intent primitive, Rules boundary, package guard, policy75, PDF HTTP, PDF policy186 and local GCS harness19. Additional bucket boundary, route guard7 and client PDF transport24 tests passed. The449-shift unit proof remains453 writes.

All thirteen requested npm suites passed: V2 contract2118; V3 contract304/services17/corrective8/profiles6(employee assertions185)/employee-create assertions71/large-staff151; scheduler-engine; scheduler; repositories; public-readonly; tenant-authorization; auth-broker; central-portal-isolation; export-security; security-hardening; security-integrity; build. Existing large bundle/chunk warning remains. Normal Rules emulator regression passed the existing V3 settings/profile/shift/repository/version/snapshot/PDF/access-denial suite.

Fresh post-fix operational results so far: PDF44 checks/12 pairs and PDF-races18; typed449-shift path819ms; typed12 pairs48 denied attempts/0 foreign mutations; direct SDK27 denials on9 active collections; typed negative authorization/quota rollback; maximum payload449 shifts×768 bytes/128-KiB metadata/422150-byte request/1006ms; admission concurrency audit20/20, employee1/20; admission Rules4 fences/8 legacy creates/9 active write denials; settings54 malformed denials and atomic typed save; identity recovery; stale upload403/no orphan; isolation255 checks/12 pairs with200+409 concurrent resets; OWNER52 and full browser84 across all four tenants.

The full27-suite fresh operational chain completed with exit0: auth/reset races10, mutation retries8, PDF browser57/all12 pairs, visual5 viewports/keyboard/0 page errors and all final focused B3 reruns are GREEN. The final repeated reset suite again produced81 winners/83 controlled losers/0 INTERNAL/0 foreign changes. Independent read-only security review is **PASS**, with0 Critical/0 Important/0 Minor and1 inherited observation.

An additional error audit used the installed SDK definitions and RED→GREEN coverage to classify known Storage HTTP408/429/500/502/503/504 and Firebase network/quota failures as retryable503. This last classifier-only edit changes neither authorization nor rollback; its unit test/build passed, and all15 deterministic Node suites, package guards, build and diff-check passed again against the regenerated bundle. On continuation after the first review worker's usage limit, the four B3 unit suites were rerun GREEN and audit/protected hashes reconfirmed unchanged.

Current secret-free browser evidence is outside Git:

- OWNER receipts: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-0dbBex/results.json`.
- Full browser receipts/screenshots/fictional PDFs: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-zfgqEs` (`demo-{fuel,cafe,salon,market}-{week,month}.png`, publication PDFs and `results.json`). These are local emulator screenshots, not hosted HTTPS evidence.
- Auth/reset races: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-aXec0g/results.json`.
- Mutation retries/roundtrip: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-4b62nA/results.json`.
- PDF browser: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-pdf-browser-AFD0wE`.
- Visual smoke: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-visual-xxB321`.

## Files changed in B3

Relative to `C:/Users/Spyros/.codex/worktrees/shiftoryx-public-demo`, excluding inherited changes:

- Server: new `functions/src/public-demo/reset-state.ts`, `reset-retention.ts`, `reset-inventory.ts`, `reset-adapters.ts`, `reset-engine.ts`, `reset-errors.ts`; modified `service.ts`; regenerated `generated.js`.
- Unit tests: new `scripts/test-public-demo-reset-state.mjs`, `test-public-demo-reset-retention.mjs`, `test-public-demo-reset-engine.mjs`, `test-public-demo-reset-errors.mjs`.
- Emulator tests: new `qa/public-demo/reset-precheck.mjs`, `reset-retention.mjs`, `reset-recovery.mjs`, `reset-concurrency.mjs`, `reset-adapter.mjs`, `reset-test-support.mjs`; modified `verify.mjs`, `intent-retention.mjs`, `lease-recovery.mjs`, `auth-reset-races.mjs`, `pdf-races.mjs`, `reset-coverage.mjs`, `README.md`.
- Documentation: new `docs/superpowers/plans/2026-10-02-demo-reset-recovery.md`, `docs/PUBLIC_DEMO_B3_PROGRESS.md`, this report.

Existing QA fixtures were completed to valid retained records/explicit reset phases. Stale reset409 remains a denial, not weakened authorization. The uncertain-PDF assertion is strengthened to same-generation PRECHECK rollback with evidence preserved. Reset inventory evidence is strengthened from23 Rules surfaces to25 managed collections, including two reserved auxiliary collections; the previous report's22 count was stale.

## Security / deployment disposition

```text
NPM_AUDIT_HIGH=4
NPM_AUDIT_TOTAL=9 (4 high,4 moderate,1 low)
NPM_AUDIT_EXIT=1
DEPENDENCY_DISPOSITION=PENDING_SEPARATE_REVIEW
DEPENDENCY_CHANGES=0
DEPENDENCIES_CHANGED=NO
LOCKFILE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
NORMAL_FIRESTORE_RULES_NOT_TOUCHED=YES (B3 baseline hash)
PRODUCTION_SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
HOSTED_DEMO_DATA_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
```

Risk-bearing changes are confined to demo reset authorization/CAS/recovery, exact inventory/adapters and their tests. No replicated authorization projection, generic admin writer, client reset option or arbitrary client Storage path was introduced. Tests use fictional data and transient emulator tokens; no passwords/private keys/tokens were committed or written to reports. No telemetry service or dependency was added. Final comparison confirmed normal/demo Rules, normal/demo Functions entries, manifests and lockfiles byte-identical to the pre-B3 snapshot; GitHub Actions has no diff. Existing dirty changes remain preserved, not reverted.

## Independent security review

The first Sol reviewer failed at provider usage limit without delivering a verdict; that attempt is not counted as a review. A fresh GPT-6.1 Sol High reviewer then independently compared actual source/untracked files against the exact pre-B3 snapshot. It inspected all8 B3 server files, all4 new unit scripts, all13 changed/new QA files and supporting policy/admission/PDF/immutable/fixture/Rules boundaries. It independently reran the4 pure B3 unit suites and rebuilt the generated bundle entirely in memory (`write:false`), obtaining exact byte equality. Review file/config/Git/cloud mutations were0.

No demonstrated unresolved Critical, Important or Minor B3 defect was found. The single observation is inherited: `functions/src/public-demo/service.ts:75` aborts the daily tenant loop on an earlier tenant failure, so later tenants miss that run. This is unchanged from the backup; a separately scoped per-tenant operational improvement could address it. It was not silently changed in B3.

Declined coverage: hosted readiness, live IAM/deployment state, new real-GCS generation qualification and dependency exploitability. The reviewer did not restart the full operational/browser emulators; it assessed their source and the supplied fresh27-suite evidence, while independently rerunning the pure unit suites. Fault-injected emulator recovery is not actual hosted worker termination. These boundaries remain explicit, not a hosted security PASS.

## Final acceptance fields

```text
RESET_PHASE_MODEL=PASS
PRECHECK_GENERATION_STABLE=PASS
PRECHECK_ZERO_DESTRUCTIVE_SIDE_EFFECTS=PASS
PRECHECK_FAILURE_ROLLBACK=PASS
STALE_LEASE_CANNOT_UNLOCK=PASS
PRECHECK_AUTH_UNCHANGED=PASS
PDF_INTENT_ACTUAL_COUNT_BOUNDED=PASS
PDF_INTENT_COUNTER_ACTUAL_MATCH=PASS
PDF_INTENT_MISMATCH_FAILS_CLOSED=PASS
PDF_INTENT_EXPIRED_DELETE_ATOMIC_DECREMENT=PASS
PDF_INTENT_NO_BLIND_RECONCILIATION=PASS
PDF_RESET_CLASSIFICATION=PASS
PDF_UNCERTAIN_STATE_PRESERVED=PASS
DESTRUCTIVE_BOUNDARY_ATOMIC=PASS
DESTRUCTIVE_GENERATION_ADVANCE_ATOMIC=PASS
OLD_GENERATION_FENCED_AFTER_BOUNDARY=PASS
CONCURRENT_RESET_WINNER_COUNT=1
CONCURRENT_RESET_RACES=81
CONCURRENT_RESET_TOTAL_WINNERS=81
CONCURRENT_RESET_CONTROLLED_LOSERS=83
TWO_WAY_RACES_PER_TENANT=20
MULTI_CALLER_RACE_CALLERS=4
CONCURRENT_RESET_LOSER_5XX_INTERNAL=0
CONCURRENT_RESET_SAFE_CLASSIFICATION=PASS
PRECHECK_WORKER_LOSS_RECOVERY=PASS
DESTRUCTIVE_WORKER_LOSS_FORWARD_RECOVERY=PASS
OLD_GENERATION_NEVER_REACTIVATED=PASS
RESET_CAPACITY_PREFLIGHT=PASS
OVERCAP_PRECHECK_ROLLBACK=PASS
OVERCAP_PARTIAL_DELETE=NO
DESTRUCTIVE_CLEANUP_IDEMPOTENT=PASS
CROSS_TENANT_DELETE=NONE
FINALIZE_INVARIANTS=PASS
NEW_GENERATION_USABLE_ONLY_AFTER_FINALIZE=PASS
RESET_ERROR_CLASSIFICATION=PASS
EXPECTED_RESET_CONFLICT_INTERNAL_500=NONE
B3_RETAINED_INTENT_TESTS=PASS
B3_PRECHECK_ROLLBACK_TESTS=PASS
B3_CONCURRENT_RESET_TESTS=PASS
B3_DESTRUCTIVE_RECOVERY_TESTS=PASS
B3_CROSS_TENANT_RESET_TESTS=PASS
B2_TYPED_CUTOVER_REGRESSION=PASS
ACTIVE_DIRECT_BROWSER_WRITES=0
TYPED_MUTATION_ALL_12_PAIRS=PASS
DIRECT_SDK_BYPASS_DENIED=PASS
DRAFT_449_SHIFT_EMULATOR=PASS
MAX_DRAFT_TRANSACTION_WRITES=453
PDF_STATE_MACHINE_REGRESSION=PASS
REAL_GCS_IMMUTABILITY_GATE=PREVIOUSLY_PASS
REAL_GCS_RERUN_REQUIRED=NO
INDEPENDENT_SECURITY_REVIEW=PASS
CRITICAL_FINDINGS=0
IMPORTANT_FINDINGS=0
MINOR_FINDINGS=0
OBSERVATIONS=1
PHASE_3B_2B_3_READY=YES
PUBLIC_DEMO_RELEASE_READY=NO
BLOCKERS=NONE_IN_B3_LOCAL_SCOPE
```

The concurrency winner count is per race, not the total. Two complete81-race runs passed; the final accepted metrics above describe the latest full run rather than adding separate runs together. Current dependency4 HIGH remains outside the B3 gate with the explicitly required separate disposition.

One local run was interrupted by unexpected CLI exit/Storage ECONNRESET before exercising the recovery scenario; a following startup showed orphan Java listeners. Only exact verified task-owned Java PIDs were stopped, and the same recovery test passed on a fresh serial runtime. No fixture or assertion was weakened. Serial disposable runtimes remain required; no emulator debug logs are included in the report.

## Rollback and next boundary

Pre-B3 backup: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-b3-backup-571c5e220b4f4adc81abbe6b8efa6475`. Rollback is a reviewed reversal of only B3 edits/new files and regeneration of the demo bundle; preserve all earlier dirty work. Do not use reset/clean/stash. No hosted rollback is needed because B3 performs no deployment or hosted mutation.

Project Guardian: **NOT_READY for public release**. Hosted compatibility/migration/HTTPS acceptance and dependency disposition remain separate human-approved work. Do not automatically start B4 or deploy after this local phase.

Legacy interrupted hosted resets without an explicit phase require a separately approved recovery/migration inspection; B3 deliberately does not infer their irreversible boundary. Actual hosted Functions/client/Rules compatibility and live traffic were not tested in this phase. The smallest next action is human review/acceptance of this local B3 report, followed only by a separately approved hosted release/recovery gate. No merge, commit, push or deployment follows automatically.

SHIFTORYX_PUBLIC_DEMO_PHASE_3B_2B_3_RESET_RECOVERY_READY_FOR_REVIEW
