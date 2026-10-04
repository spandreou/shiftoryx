# ShiftOryx — Phase 3B.2B-2 typed mutation cutover

Local/emulator evidence, 2026-10-02. The final fresh OWNER/browser/settings/reset/race rerun completed successfully.

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE=C:/Users/Spyros/.codex/worktrees/shiftoryx-public-demo
WORKTREE_CLEAN=NO
COMMIT_PUSH_MERGE=NONE
```

The pre-existing dirty baseline was preserved. In particular, the normal `firestore.rules` delta and unrelated earlier demo/scheduler work predate B2; B2 did not modify that normal Rules file. No hosted rollout is authorized by this phase.

## Result and architecture

The nine active demo collections are now server-written: employees, publicEmployees, absences, settings, scheduleDrafts, shifts, announcements, publicAnnouncements and auditLogs. The demo Rules preserve intended reads and the public reset fence, while denying every direct browser create/update/delete on these collections.

`mutatePublicDemo` accepts exactly `{operation, commandId, payload}`. The operation type is a closed discriminated union with dedicated validators. There is no client-selected tenant, collection, Firestore path, projection or arbitrary patch. Verified Firebase token claims determine tenant/generation; each admission transaction checks current demo state, active matching OWNER membership, platform-admin separation and the explicit tenant identity.

| Operation | Trusted effect |
| --- | --- |
| emp.create/update/active/delete | Private employee and sanitized same-ID public projection in one transaction; revision checks; delete rejects outstanding absence references |
| abs.create/update/delete | Exact resulting absence fields, same-tenant employee/replacement references, dates/enums/byte bounds, revision checks |
| ann.create/delete | Private/public same-ID pair, bounded title/body, server actor/time |
| set.save | Only settings/scheduler and validated version2 employee profiles; exact tenant and settings revision |
| drf.save | Technical V3 validation, trusted prior metadata and shift rows, deterministic document IDs, revision and byte/write limits |
| aud.export | Exact safe export enums; bounded server recent-activity ring |

Normal service/repository fallbacks remain intact. Demo projection sync and duplicate primary audit calls return without a browser write; the corresponding server operation supplies those effects. No Scheduler V3 scheduling rule was redesigned.

## Retry and persistence invariants

Each logical action uses a prefixed UUIDv4. At most16 pending records retain only operation, command ID, canonical business digest, generation and original numeric revision. Unrelated action B cannot discard ambiguous action A. Tokens and raw mutation payloads are not persisted. Definitive success removes only its own pending entry; reset/re-entry discards stale-generation entries.

Delete adapters can replay a committed deletion after a lost response and reload even when the document is absent, but only when a matching current-generation pending command exists. The server still authorizes the request and binds the receipt to its canonical input. Absence status/scope and text trimming are canonicalized before hashing.

Loaded drafts pass through `normalizePreviewV3` at the demo adapter boundary, dropping server-only metadata and stored shift `type`; revision is restored explicitly. The server continues to reject unknown input keys. Draft receipt results contain only status/revision, keeping the128-byte result and256-byte receipt caps; the server-derived draft ID goes into the atomic recent audit event.

## Draft geometry and maximum payload

All prior shift IDs must be the contiguous canonical sequence for the same draft. Missing metadata IDs, missing prior rows, foreign/noncanonical IDs and colliding orphan target rows fail closed. Quota deltas come from existence checks inside the transaction, not from caller-provided counts. Deletes never refund create quota.

```text
removedIds + incomingShifts + 1 <= 450
MAX_DRAFT_TRANSACTION_WRITES=449 shifts/deletes + 1 metadata + 3 admission/daily/audit = 453
TRANSACTION_WRITE_MARGIN=47
PERSISTED_SHIFT_MAX_UTF8_BYTES=768
DRAFT_METADATA_MAX_UTF8_BYTES=131072
HTTP_BODY_MAX_BYTES=524288
```

The final maximum-shape emulator gate used32 employees,64 absences,50 templates,449 shifts each exactly768 bytes and metadata exactly131072 bytes. Only approved scalar/zero-headcount coverage fields supplied padding. The actual HTTP request was422150 bytes and committed in1138 ms. The prior unoptimized run took5914 ms; save now calls the technical validator without expanding Preview warnings before admission.

The gate reloaded every stored shift, verified one receipt/quota/audit charge, replayed the same command without shift writes, and rejected both a769-byte shift and131073-byte metadata before primary mutation. A450-shift save is separately rejected before mutation. Client rate attempts are intentionally separate from successful primary quotas.

## Requested B2 acceptance fields

```text
ACTIVE_MUTATION_CALLSITE_INVENTORY=PASS
UNMIGRATED_REQUIRED_WRITE_CALLS=0
TYPED_MUTATION_API=PASS
ARBITRARY_PATH_INPUT=ABSENT
ARBITRARY_PATCH_INPUT=ABSENT
UNKNOWN_OPERATION_DENIED=PASS
DEMO_MUTATION_TRANSPORT=PASS
NORMAL_REPOSITORY_BEHAVIOR_UNCHANGED=PASS
COMMAND_ID_RETRY_STABILITY=PASS

EMPLOYEE_TYPED_CREATE=PASS
EMPLOYEE_TYPED_UPDATE=PASS
EMPLOYEE_TYPED_DELETE=PASS
EMPLOYEE_PUBLIC_PROJECTION_1_TO_1=PASS
EMPLOYEE_DIRECT_BROWSER_WRITE=DENIED
EMPLOYEE_BOUND=32
ABSENCE_TYPED_CREATE=PASS
ABSENCE_TYPED_UPDATE=PASS
ABSENCE_TYPED_DELETE=PASS
ABSENCE_FOREIGN_EMPLOYEE_DENIED=PASS
ABSENCE_DIRECT_BROWSER_WRITE=DENIED
ABSENCE_BOUND=64
ANNOUNCEMENT_TYPED_FLOW=PASS
ANNOUNCEMENT_PUBLIC_PROJECTION_1_TO_1=PASS
ANNOUNCEMENT_DIRECT_BROWSER_WRITE=DENIED
ANNOUNCEMENT_BOUND=32
SETTINGS_TYPED_SAVE=PASS
SETTINGS_CANONICAL_ID_ONLY=PASS
SETTINGS_DIRECT_BROWSER_WRITE=DENIED
SETTINGS_MAX_LIVE_DOCS=1

DRAFT_TYPED_SAVE=PASS
DRAFT_REVISION_CONFLICT=PASS
DRAFT_SHIFT_IDS_SERVER_DERIVED=PASS
DRAFT_FOREIGN_PRIOR_ID_DENIED=PASS
DRAFT_TRANSACTION_WRITE_COUNT_MAX=453
DRAFT_TRANSACTION_WRITE_BUDGET=PASS
DRAFT_DIRECT_BROWSER_WRITE=DENIED
SHIFT_DIRECT_BROWSER_WRITE=DENIED
DRAFT_449_SHIFT_EMULATOR=PASS
DRAFT_MAX_PAYLOAD_EMULATOR=PASS
DRAFT_MAX_RUNTIME_MS=1138
AUDIT_TYPED_FLOW=PASS
AUDIT_DIRECT_BROWSER_WRITE=DENIED
AUDIT_RING_MAX_LIVE_DOCS=512

ACTIVE_WRITE_CUTOVER_PENDING=NO
ACTIVE_DIRECT_BROWSER_WRITES=0
DIRECT_SDK_BYPASS_DENIED=PASS
TYPED_SERVER_EQUIVALENT_FLOW=PASS
DEMO_NORMAL_REPOSITORY_SEPARATION=PASS
NORMAL_PRODUCT_REGRESSION=PASS
OWNER_TYPED_MUTATION_FLOW=PASS
BROWSER_TYPED_MUTATION_FLOW=PASS
TYPED_MUTATION_ALL_12_PAIRS=PASS

PDF_RETAINED_INTENT_OPERATIONAL_RECONCILIATION=PENDING_B3
CONCURRENT_RESET_SAFE_CLASSIFICATION=PENDING_B3
INDEPENDENT_REVIEW=PASS
NEW_CRITICAL_FINDINGS=0
NEW_IMPORTANT_FINDINGS=0
INHERITED_B3_BLOCKERS=2
PHASE_3B_2B_2_READY=YES
PUBLIC_DEMO_RELEASE_READY=NO
BLOCKERS=Inherited B3 blockers remain; npm audit has 4 high findings and hosted deployment is intentionally out of scope
```

## Verification evidence

| Exact command / suite | Result |
| --- | --- |
| node scripts/test-public-demo-typed-core.mjs | PASS: CRUD/profile/config/draft lifecycle, corrupt IDs, explicit profile writes, calendar range, scalar/enum/UTF8 limits and453-write geometry |
| node scripts/test-public-demo-mutation-http.mjs | PASS: exact envelope, method/query/type/body caps |
| node scripts/test-public-demo-mutation-transport.mjs | PASS: immediate/revision/interleaved/delete replay and16-pending bound |
| node scripts/test-public-demo-admission-primitives.mjs | PASS: commands/auth/schemas/quotas/audit/transaction-derived delta |
| node scripts/test-public-demo-intent-retention.mjs | PASS; operational reconciliation remains B3 |
| node scripts/test-public-demo-rules-boundary.mjs | PASS: normal Rules not a demo generation/package dependency |
| node scripts/test-demo-package-guard.mjs | PASS: wrong project rejected; both server flags; normal package entry unchanged |
| node scripts/test-public-demo-policy.mjs |75 PASS |
| node scripts/test-public-demo-pdf-http.mjs |9 PASS |
| node scripts/test-public-demo-pdf-policy.mjs |186 PASS,0 FAIL |
| node scripts/test-public-demo-gcs-harness.mjs |19 local checks PASS; no real GCS invocation in B2 |
| npm run test:scheduler-contract-v2 |2118 PASS, unchanged expected count |
| npm run test:scheduler-contract-v3 |304 engine checks;17 services;8 corrective;6 profile groups/185 assertions;71 creation assertions;151 existing large-staff groups — PASS |
| npm run qa:scheduler-engine |PASS |
| npm run qa:scheduler |PASS, including its production build |
| npm run qa:repositories |PASS |
| npm run qa:public-readonly |PASS |
| npm run qa:tenant-authorization |PASS |
| npm run qa:auth-broker |PASS |
| npm run qa:central-portal-isolation |PASS |
| npm run qa:export-security |PASS; normal-mode audit assertions retained with explicit demo import stubs |
| npm run security:hardening |PASS |
| npm run security:integrity |PASS |
| npm run build |PASS; existing large-chunk warning remains |
| npm audit --audit-level=high |FAIL:9 findings,4 high/4 moderate/1 low/0 critical; manifests/lockfiles unchanged |
| node qa/public-demo/normal-rules-regression.mjs |PASS: normal V3 settings/drafts/reservations/PDF/authorization and100-profile batch/101 rejection |
| verify.mjs typed-negative |PASS: anonymous, malformed, revoked membership, platform-admin, resetting, stale generation and quota rollback |
| verify.mjs typed-max |PASS: exact449×768-byte shifts,128-KiB metadata,422150-byte request,1138 ms, +1 rejects and single replay charge |
| verify.mjs typed-isolation |PASS:12 ordered pairs,48 foreign attempts,0 primary mutations |
| verify.mjs sdk-bypass |PASS:27 create/update/delete denials across9 active collections |
| verify.mjs mutation-retries |8 browser checks PASS, including real adapters and loaded draft shrink/resave |
| verify.mjs admission-concurrency |PASS: bounded concurrent audit/employee admission and atomic charge |
| verify.mjs admission-rules |PASS:4 public reset fences,8 legacy creates denied,9 active writes denied |
| verify.mjs retention |PASS basic retained-intent emulator behavior; B3 operational gate unchanged |
| verify.mjs identity / lease / upload / visual |PASS: identity recovery, trusted expired-lease recovery, stale upload403/no orphan,5 viewports/keyboard/0 page errors |
| verify.mjs pdf |44 PASS with12 ordered pairs |
| verify.mjs pdf-races |18 PASS |
| verify.mjs pdf-browser |57 PASS with12 ordered pairs, actual WEEK/MONTH publications, replay/reset/PDF and zero direct publication Storage traffic |
| verify.mjs owners / browser / settings / reset / races |PASS: OWNER52, full browser84, settings54 invalid denials, reset coverage, auth/reset races10 |
| verify.mjs isolation |Foreign denials reached all12 pairs; suite FAIL at inherited concurrent-reset200+500/INTERNAL classification |
| git diff --check |PASS; inherited CRLF notices only |

Every stateful suite uses a fresh disposable runtime. Test changes migrate positive direct-SDK writes to the typed contract and retain negative/security assertions. The intentional broken cases were observed RED before correction; no assertion was relaxed to admit forbidden behavior.

## Independent review

The separate read-only reviewer checked the actual source rather than treating author-run tests as its only evidence. Seven Important source issues were corrected: interleaved pending-command loss; missing-target delete replay; config scalar/publication-schema mismatch; multi-month MONTH ranges; coerced array enums; long draft IDs exceeding receipt limits; and loaded-draft metadata leaking into the wire payload. Subsequent reinspection confirmed the byte contract, technical-only pre-admission validation, canonical client fields and explicit version2 profile writes. Final unresolved Critical/Important/Minor counts are0/0/0. The reviewer made no file or cloud changes.

The full isolation suite still reproduces the exact accepted B3 concurrent-reset failure: one200 winner plus one500/INTERNAL loser. It was not waived, caught as a false PASS or relabeled as a new B2 issue. Retained-intent operational reconciliation is also still pending B3.

## Files changed in B2

Paths below are relative to the stated isolated worktree and exclude unrelated inherited dirty files.

| Area | Files |
| --- | --- |
| Server | functions/src/public-demo/admission.ts; mutations-core.ts; mutation-adapters.ts; mutation-http.ts; service.ts; entry.js; generated.js |
| Client transport | src/demo/mutationTransport.ts; browserMutationTransport.ts |
| Demo adapters | src/firebase/employeeService.js; absenceService.js; announcementService.js; publishedScheduleService.js; auditLogService.js; exportAuditService.js |
| Repository/UI | src/repositories/schedulePublicationsRepository.ts; src/hooks/useSchedulerStore.js; src/components/scheduler/SchedulerWorkspaceV3.jsx |
| Demo Rules/package | rules/demo/firestore.template.rules; scripts/demo-firestore-rules.mjs; firestore.demo.rules; scripts/package-public-demo.mjs |
| Unit/policy QA | scripts/test-public-demo-admission-primitives.mjs; test-public-demo-typed-core.mjs; test-public-demo-mutation-http.mjs; test-public-demo-mutation-transport.mjs; test-demo-package-guard.mjs; validate-export-audit-security.mjs |
| Emulator/browser QA | qa/public-demo/runtime.mjs; verify.mjs; admission-concurrency.mjs; admission-rules.mjs; isolation.mjs; settings-regression.mjs; lease-recovery.mjs; auth-reset-races.mjs; owner-workflows.mjs; browser.mjs; typed-mutations.mjs; typed-cross-tenant.mjs; typed-negative.mjs; typed-max-payload.mjs; direct-sdk-bypass.mjs; mutation-browser-retries.mjs; README.md |
| Documentation | docs/PUBLIC_DEMO_B2_MUTATION_INVENTORY.md; docs/superpowers/plans/2026-10-01-demo-typed-cutover.md; this report |

`storage.demo.rules` was regenerated byte-identically with its existing deny-all direct-client posture. The normal Functions entry, normal Rules, production data and protected real tenants were not changed by B2.

## Security and deployment review

Project Guardian: NOT_READY for public release. B2 is a local implementation review gate; both inherited B3 blockers remain mandatory, and no hosted verification is claimed.

```text
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
HOSTED_DEMO_DATA_CHANGED=NO
DEPENDENCIES_CHANGED=NO
LOCKFILE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
PRODUCTION_SECRETS_TOUCHED=NO
NORMAL_FIRESTORE_RULES_NOT_TOUCHED=YES
```

Risk-bearing changes are confined to demo authorization/admission/validators, demo handlers/Rules, and the demo branches of shared adapters. Emulator Auth tokens are transient memory values; no credentials, private keys, raw HTTP headers or tokens were written to source, logs, screenshots or reports. No new telemetry/service/dependency was added.

The high audit package entries are `@grpc/grpc-js`, `@firebase/firestore`, `@firebase/firestore-compat` and direct `firebase`. All are runtime dependency-chain entries (`firebase` → Firestore/compat → gRPC); `npm audit` reports 4 high,4 moderate,1 low and0 critical. The suggested fix is a semver-major Firebase9.14.0 change. Direct exploit reachability in this application was not assessed in this phase; dependency changes remain0 and no automatic upgrade was attempted. Safe disposition for Luna: `UNKNOWN`, requiring Sol High dependency/security review.

Shared demo quotas and the512-slot recent-activity ring are intentional bounded resources, not immutable security-grade audit history. A removed employee with old saved draft references requires a fresh/updated draft; outstanding absence references must be deleted first. The frontend bundle still emits the existing large-chunk warning. No hosted/IAM/DNS claim follows from emulator PASS results.

No intermediate B1/B2/B3 deployment is permitted. A later hosted rollout must atomically deploy the compatible demo client, typed handlers, server flags and deny-direct-write Rules after the B3/B4 gates are approved.

## Evidence and rollback

Secret-free browser receipts/screenshots/PDFs are retained outside Git under local Temp. Current evidence includes:

- Mutation retry/roundtrip: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-8pHUi4/results.json`.
- PDF browser: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-pdf-browser-Vt5n5b`.
- Visual: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-visual-ojK2eD`.
- Final OWNER/full-browser evidence: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-icmRsX` and `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-demo-browser-eWEF6S`.\n- Final settings/reset/races evidence is in the fresh-suite output: `mLPkTe`, `PXGGWt`, and `7sALjX`.

Representative pre-B2 source/Rules backups are at `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-3b2b2-backup-7d8f8ca8a211493aa0cb7d7bc41958d7`. Rollback is a reviewed reversal of only B2 edits and new files, restoring those exact backed-up targets and regenerating the demo artifacts; preserve all earlier dirty work. Do not use a broad reset/clean. The fresh-suite runner stops only its directly spawned emulator/Vite process tree. No hosted rollback is required because this phase performed no deployment.

Recommended next phase is the separately approved B3 reset PRECHECK/DESTRUCTIVE and retained-intent operational work. B3 was not started.
