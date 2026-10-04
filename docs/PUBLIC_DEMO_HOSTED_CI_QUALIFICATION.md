# ShiftOryx Public Demo — Hosted CI Qualification

Date: 2026-10-04  
Scope: qualification of the reviewed public-demo checkpoint on the real GitHub-hosted security workflow. This is not a deployment or release approval.

## 1. Executive Summary

```text
PRE_COMMIT_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
QUALIFICATION_COMMIT_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
WORKFLOW_RUN_ID=37202453378
CI_TRIGGER_TYPE=workflow_dispatch
WORKFLOW_COMMIT_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069

COMMIT_BOUNDARY_PROVEN=YES
REMOTE_GITHUB_ACTIONS_GATE=BLOCKED
TRIVY_GATE=BLOCKED_REQUIRES_HUMAN_DISPOSITION
```

The bounded checkpoint was pushed without force to `origin/codex/public-shiftoryx-demo`. It did not update `main`, create or merge a pull request, or deploy an application. The real [Security Scan run 37202453378](https://github.com/spandreou/shiftoryx/actions/runs/37202453378) executed against the exact checkpoint SHA.

Hosted qualification is blocked for two independent reasons:

1. Node/npm compatibility drift: GitHub used Node 24.21.0 with npm 11.19.0, while the reviewed local evidence used Node 22.21.0 with npm 10.9.4. The strict npm wrapper failed closed with `GATE_ADVISORY_OR_NODE_DRIFT`. It did not reach CVE Lite or its 99 regression tests.
2. Trivy 0.70.0 detected one HIGH: `CVE-2026-101916` in `@grpc/grpc-js@1.9.16`, fixed by 1.13.6 or 1.14.5. This maps to reviewed `GHSA-m9gg-hp2v-232j`, but no Trivy-specific exception is authorized. The required disposition is therefore blocked, not silently inherited from npm/CVE Lite.

No new advisory exception, date extension, fingerprint update, dependency override, workflow correction, rerun, deployment or cloud mutation was performed.

Project Guardian: **NOT_READY** for hosted release. The remote CI evidence is conclusive and failed a mandatory security gate.

## 2. Commit Boundary

Initial worktree state:

```text
CURRENT_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
CURRENT_BRANCH=codex/public-shiftoryx-demo
REMOTE_NAME=origin
REMOTE_URL=https://github.com/spandreou/shiftoryx.git
UPSTREAM_BRANCH=NONE_BEFORE_PUSH
WORKTREE_STATUS=DIRTY_INHERITED_PRESERVED
GITHUB_AUTHENTICATED_ACCOUNT=spandreou
```

Authentication was tested with a user-identity API read. No token, scope value, environment secret or credential material was printed.

The initial inventory contained 153 status entries: 20 real modified tracked files, 132 untracked files and one stat-only `functions/src/index.js` entry. That entry's working-tree object ID was exactly equal to the index/HEAD object ID (`fd31bda9adfb8a2b12a8d8d98119399f444db9cf`) and created no commit delta.

```text
TOTAL_STATUS_ENTRIES=153
TOTAL_CHANGED_PATHS=152
REVIEWED_CHANGED_PATHS=152
UNRELATED_CHANGED_PATHS=0
UNKNOWN_PROVENANCE_PATHS=0
COMMIT_BOUNDARY_PROVEN=YES

COMMITTED_REVIEWED_PATHS=152
COMMITTED_UNREVIEWED_PATHS=0
COMMITTED_UNKNOWN_PATHS=0
STAGED_UNREVIEWED_PATHS=0
STAGED_UNKNOWN_PATHS=0
```

The provenance rules were derived from the six authoritative reports plus the accepted public-demo B2/B3 reports/plans they reference. B3 revalidated the inherited demo boundaries with full local/emulator regressions and independent security review; the dependency and CI reports identify their exact deltas.

All committed paths and provenance:

### REVIEWED_CI_EXCEPTION_GATE_IMPLEMENTATION (11)

- `.github/workflows/security-scan.yml`
- `docs/PUBLIC_DEMO_CI_EXCEPTION_GATE_IMPLEMENTATION.md`
- `scripts/lib/auditExceptionPolicy.ts`
- `scripts/lib/auditGateRuntime.ts`
- `scripts/test-audit-gate-runtime.mjs`
- `scripts/test-fixtures/audit-exception-current.json`
- `scripts/test-fixtures/cve-exception-current.json`
- `scripts/test-npm-audit-exceptions.mjs`
- `scripts/validate-cve-audit-exceptions.mjs`
- `scripts/validate-npm-audit-exceptions.mjs`
- `security/npm-audit-exceptions.json`

### REVIEWED_B3_IMPLEMENTATION (120)

- `firestore.demo.rules`
- `firestore.rules`
- `functions/src/public-demo/admission.ts`
- `functions/src/public-demo/entry.js`
- `functions/src/public-demo/fixtures.json`
- `functions/src/public-demo/fixtures.ts`
- `functions/src/public-demo/gcs-immutable-primitives.ts`
- `functions/src/public-demo/gcs-qualification-guard.ts`
- `functions/src/public-demo/generated.js`
- `functions/src/public-demo/mutation-adapters.ts`
- `functions/src/public-demo/mutation-http.ts`
- `functions/src/public-demo/mutations-core.ts`
- `functions/src/public-demo/pdf-adapters.ts`
- `functions/src/public-demo/pdf-authorization.ts`
- `functions/src/public-demo/pdf-coordinator.ts`
- `functions/src/public-demo/pdf-download.ts`
- `functions/src/public-demo/pdf-http.ts`
- `functions/src/public-demo/pdf-renderer.cjs`
- `functions/src/public-demo/pdf-transport.ts`
- `functions/src/public-demo/policy.ts`
- `functions/src/public-demo/reset-adapters.ts`
- `functions/src/public-demo/reset-engine.ts`
- `functions/src/public-demo/reset-errors.ts`
- `functions/src/public-demo/reset-inventory.ts`
- `functions/src/public-demo/reset-retention.ts`
- `functions/src/public-demo/reset-state.ts`
- `functions/src/public-demo/service.ts`
- `qa/public-demo/README.md`
- `qa/public-demo/admission-concurrency.mjs`
- `qa/public-demo/admission-rules.mjs`
- `qa/public-demo/auth-reset-races.mjs`
- `qa/public-demo/browser-route-guard.mjs`
- `qa/public-demo/browser.mjs`
- `qa/public-demo/direct-sdk-bypass.mjs`
- `qa/public-demo/entry-recovery.mjs`
- `qa/public-demo/firebaseClient.js`
- `qa/public-demo/hosted-browser.mjs`
- `qa/public-demo/hosted-isolation.mjs`
- `qa/public-demo/intent-retention.mjs`
- `qa/public-demo/isolation.mjs`
- `qa/public-demo/lease-recovery.mjs`
- `qa/public-demo/mutation-browser-retries.mjs`
- `qa/public-demo/normal-rules-regression.mjs`
- `qa/public-demo/owner-workflows.mjs`
- `qa/public-demo/pdf-browser.mjs`
- `qa/public-demo/pdf-race-support.mjs`
- `qa/public-demo/pdf-races.mjs`
- `qa/public-demo/pdf-storage-capabilities.mjs`
- `qa/public-demo/pdf-transport.mjs`
- `qa/public-demo/reset-adapter.mjs`
- `qa/public-demo/reset-concurrency.mjs`
- `qa/public-demo/reset-coverage.mjs`
- `qa/public-demo/reset-precheck.mjs`
- `qa/public-demo/reset-recovery.mjs`
- `qa/public-demo/reset-retention.mjs`
- `qa/public-demo/reset-test-support.mjs`
- `qa/public-demo/runtime.mjs`
- `qa/public-demo/settings-regression.mjs`
- `qa/public-demo/storage-reset-race.mjs`
- `qa/public-demo/test-support.mjs`
- `qa/public-demo/typed-cross-tenant.mjs`
- `qa/public-demo/typed-max-payload.mjs`
- `qa/public-demo/typed-mutations.mjs`
- `qa/public-demo/typed-negative.mjs`
- `qa/public-demo/verify.mjs`
- `qa/public-demo/visual.mjs`
- `qa/public-demo/vite.config.mjs`
- `qa/scheduler-v3/fixtures.ts`
- `rules/demo/firestore.template.rules`
- `rules/demo/firestore.validators.rules`
- `scripts/build-public-demo.mjs`
- `scripts/demo-firestore-rules.mjs`
- `scripts/demo-package-rules.mjs`
- `scripts/package-public-demo.mjs`
- `scripts/prepare-demo-cloud.mjs`
- `scripts/qualify-public-demo-gcs-immutability.mjs`
- `scripts/test-demo-package-guard.mjs`
- `scripts/test-public-demo-admission-primitives.mjs`
- `scripts/test-public-demo-client-transport.mjs`
- `scripts/test-public-demo-gcs-harness.mjs`
- `scripts/test-public-demo-intent-retention.mjs`
- `scripts/test-public-demo-mutation-http.mjs`
- `scripts/test-public-demo-mutation-transport.mjs`
- `scripts/test-public-demo-pdf-http.mjs`
- `scripts/test-public-demo-pdf-policy.mjs`
- `scripts/test-public-demo-policy.mjs`
- `scripts/test-public-demo-reset-bucket.mjs`
- `scripts/test-public-demo-reset-engine.mjs`
- `scripts/test-public-demo-reset-errors.mjs`
- `scripts/test-public-demo-reset-retention.mjs`
- `scripts/test-public-demo-reset-state.mjs`
- `scripts/test-public-demo-route-guard.mjs`
- `scripts/test-public-demo-rules-boundary.mjs`
- `scripts/test-public-demo-typed-core.mjs`
- `scripts/validate-export-audit-security.mjs`
- `src/App.jsx`
- `src/components/demo/DemoBanner.tsx`
- `src/components/demo/DemoLanding.tsx`
- `src/components/demo/demo.css`
- `src/components/scheduler/EmployeeProfileModal.jsx`
- `src/components/scheduler/MainDashboard.jsx`
- `src/components/scheduler/SchedulerWorkspaceV3.jsx`
- `src/demo/PublicDemoApp.tsx`
- `src/demo/browserMutationTransport.ts`
- `src/demo/browserPublicationTransport.ts`
- `src/demo/config.ts`
- `src/demo/mutationTransport.ts`
- `src/demo/publicationTransport.ts`
- `src/firebase/absenceService.js`
- `src/firebase/announcementService.js`
- `src/firebase/auditLogService.js`
- `src/firebase/config.js`
- `src/firebase/employeeService.js`
- `src/firebase/exportAuditService.js`
- `src/firebase/publishedScheduleService.js`
- `src/hooks/useSchedulerStore.js`
- `src/repositories/schedulePublicationsRepository.ts`
- `src/services/publicationIntentV3.ts`
- `src/services/schedulePublicationPdf.ts`
- `storage.demo.rules`

### REVIEWED_FUNCTIONS_DEPENDENCY_REMEDIATION (2)

- `docs/PUBLIC_DEMO_FUNCTIONS_DEPENDENCY_REMEDIATION.md`
- `functions/package-lock.json`

### REVIEWED_ROOT_DEPENDENCY_REMEDIATION (2)

- `docs/PUBLIC_DEMO_ROOT_PATCHABLE_DEPENDENCY_REMEDIATION.md`
- `package-lock.json`

### DOCUMENTATION_FROM_ACCEPTED_PHASE (16)

- `docs/PUBLIC_DEMO_B2_MUTATION_INVENTORY.md`
- `docs/PUBLIC_DEMO_B2_TYPED_CUTOVER_REPORT.md`
- `docs/PUBLIC_DEMO_B3_HANDOFF.md`
- `docs/PUBLIC_DEMO_B3_PROGRESS.md`
- `docs/PUBLIC_DEMO_B3_RESET_RECOVERY_REPORT.md`
- `docs/PUBLIC_DEMO_BLOCKER_REVIEW.md`
- `docs/PUBLIC_DEMO_DEPENDENCY_SECURITY_REVIEW.md`
- `docs/PUBLIC_DEMO_HOSTED_STORAGE_GATE.md`
- `docs/PUBLIC_DEMO_LOCAL_QA_HANDOFF.md`
- `docs/PUBLIC_DEMO_LUNA_SAFE_CLOSEOUT.md`
- `docs/PUBLIC_DEMO_PREFLIGHT.md`
- `docs/superpowers/plans/2026-09-14-public-demo.md`
- `docs/superpowers/plans/2026-09-25-demo-pdf-phase-1-design.md`
- `docs/superpowers/plans/2026-09-30-demo-admission-primitives.md`
- `docs/superpowers/plans/2026-10-01-demo-typed-cutover.md`
- `docs/superpowers/plans/2026-10-02-demo-reset-recovery.md`

### REVIEWED_ROOT_HIGH_DISPOSITION_REPORT (1)

- `docs/PUBLIC_DEMO_ROOT_HIGH_CI_DISPOSITION.md`

The staged set and commit tree were independently compared to the provenance list: 152 expected, 152 committed, zero missing and zero extra paths.

The full cached whitespace check reported trailing whitespace only inside third-party license/comment blocks of the already reviewed generated `pdf-renderer.cjs`, plus one final blank line in the generated Rules fragment. Handwritten application/security source had no whitespace finding. Those generated bytes were deliberately preserved because B3 had verified the renderer byte-for-byte and the CI policy pins the Functions/source context. No fingerprint was regenerated to hide this diagnostic.

## 3. Local Preflight

| Check | Result |
| --- | --- |
| `node --test scripts/test-npm-audit-exceptions.mjs scripts/test-audit-gate-runtime.mjs` | PASS — 99 tests, 99 pass, 0 fail |
| `node scripts/validate-npm-audit-exceptions.mjs --run` | PASS — exact two reviewed GHSA clusters, 9 package nodes |
| `node scripts/validate-cve-audit-exceptions.mjs --run` | PASS — CVE Lite 1.37.0, raw/native-ratchet/raw sequence |
| `npm run security:hardening` | PASS |
| `npm run security:integrity` | PASS |
| `npm run build` | PASS — 1,992 modules; existing chunk/plugin warnings only |
| Raw `npm audit --json` | 0 Critical / 9 High / 0 Moderate / 0 Low; expected exit 1 |
| Raw `npm audit --audit-level=high --json` | 0 / 9 / 0 / 0; expected exit 1 |
| Raw `npm audit --omit=dev --json` | 0 / 4 / 0 / 0; expected exit 1 |
| Pre-stage `git diff --check` | PASS for tracked deltas |
| Secret signature scan | PASS — no private-key/GitHub-token/AWS-key signature found |

```text
DETERMINISTIC_TESTS=PASS_99_OF_99
NPM_EXCEPTION_GATE=PASS_LOCAL
CVE_LITE_GATE=PASS_LOCAL
SECURITY_HARDENING=PASS_LOCAL
SECURITY_INTEGRITY=PASS_LOCAL
BUILD=PASS_LOCAL
LOCAL_SECURITY_REGRESSION_GATE=PASS
```

The largest committed file is the reviewed generated PDF renderer (2,832,323 bytes); its B3 review regenerated it in memory and obtained exact byte equality. No new binary or dependency was introduced.

## 4. Commit and Push

```text
PRE_COMMIT_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
QUALIFICATION_COMMIT_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
COMMIT_MESSAGE=chore(security): qualify public demo CI gates
COMMIT_PATHS=152
PUSH_TARGET=origin/codex/public-shiftoryx-demo
PUSH_COMMIT=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
PUSH_RESULT=PASS_NEW_BRANCH
FORCE_PUSH_USED=NO
DEFAULT_BRANCH_MODIFIED=NO
PULL_REQUEST_CREATED=NO
```

The branch did not previously exist remotely. It now tracks `origin/codex/public-shiftoryx-demo`. Local HEAD and the remote tracking ref both resolve to the qualification SHA.

## 5. Hosted Environment

```text
RUNNER_OS=ubuntu-24.04
NODE_VERSION=v24.21.0
NPM_VERSION=11.19.0
CVE_LITE_VERSION=NOT_OBSERVED_HOSTED
CVE_LITE_PINNED_EXPECTATION=1.37.0
TRIVY_VERSION=0.70.0
WORKFLOW_CONCLUSION=FAILURE
```

The workflow's existing `actions/setup-node@v7` configuration requested Node 24. The hosted cache resolved it to 24.21.0 with npm 11.19.0. The local implementation evidence used Node 22.21.0/npm 10.9.4. GitHub also announced an upcoming `ubuntu-latest` move to Ubuntu 26 on 2026-10-19; the actual run remained Ubuntu 24.04.

## 6. Hosted npm Audit Gate

```text
NPM_EXCEPTION_STEP=FAIL
FAILURE_CODE=GATE_ADVISORY_OR_NODE_DRIFT
HOSTED_NPM_COUNTS=NOT_EMITTED_BY_FAIL_CLOSED_WRAPPER
HOSTED_NEW_HIGH=UNVERIFIED_DUE_EARLY_DRIFT_FAILURE
HOSTED_NEW_CRITICAL=UNVERIFIED_DUE_EARLY_DRIFT_FAILURE
CLASSIFICATION=TOOL_VERSION_DRIFT_AND_AUDIT_CONTENT_DRIFT
```

The wrapper successfully executed and parsed enough of the npm output to reach its exact advisory/node fingerprint comparison. It then rejected the hosted representation. The sanitized failure code does not reveal which field changed, and raw audit JSON was intentionally not emitted to logs.

This is not a network/unavailable failure and is not evidence that the exception passed. The material environment difference is npm 11.19.0 versus the reviewed npm 10.9.4. A separate review must capture and compare sanitized npm 11 audit structure before any policy decision. The registry was not updated automatically.

```text
NPM_AUDIT_EXCEPTION_GATE_PASS=NOT_OBSERVED
NPM_HOSTED_GATE=FAIL
```

## 7. Hosted CVE Lite Gate

The npm step failed first in the same job, so GitHub skipped the CVE Lite step and the deterministic test step.

```text
CVE_LITE_EXECUTED=NO
CVE_LITE_VERSION_MATCH=NOT_VERIFIED
CVE_LITE_COMPLETE=NOT_VERIFIED
CVE_LITE_NEW_HIGH=NOT_VERIFIED
CVE_LITE_NEW_CRITICAL=NOT_VERIFIED
CVE_LITE_EXCEPTION_GATE_PASS=NOT_OBSERVED
CVE_LITE_HOSTED_GATE=NOT_RUN
HOSTED_DETERMINISTIC_TESTS=NOT_RUN
```

The local CVE Lite 1.37.0 gate remains PASS evidence only; it does not substitute for the missing hosted execution.

## 8. Hosted Trivy

```text
TRIVY_EXECUTED=YES
TRIVY_RESULT=FAIL
TRIVY_CRITICAL=0
TRIVY_HIGH=1
TRIVY_GATE=BLOCKED_REQUIRES_HUMAN_DISPOSITION

TRIVY_FINDING_ID=CVE-2026-101916
PACKAGE=@grpc/grpc-js
VERSION=1.9.16
SEVERITY=HIGH
STATUS=fixed
FIXED_VERSION=1.13.6_OR_1.14.5
MATCHES_EXISTING_REVIEWED_GHSA=YES
MATCHED_GHSA=GHSA-m9gg-hp2v-232j
```

Scanner coverage summary:

- `functions/package-lock.json`: 0 vulnerabilities.
- root `package-lock.json`: 1 HIGH vulnerability.
- `Dockerfile`: 0 misconfigurations.
- secret scanning executed; no secret finding was reported.

The workflow retained `severity: CRITICAL,HIGH`, `exit-code: "1"` and `ignore-unfixed: true`. No `.trivyignore`, VEX document, ignore rule, threshold change or Trivy-specific advisory exception was created. Although this is the same underlying reviewed gRPC advisory, scanner-specific suppression semantics require separate explicit human approval.

## 9. Other Hosted Jobs

| Job / step | Hosted result | Contract |
| --- | --- | --- |
| Node dependency scan | FAIL | npm fingerprint drift; later steps skipped |
| npm audit HIGH/CRITICAL gate | FAIL | blocking |
| OWASP CVE Lite gate | NOT RUN | skipped after blocking npm failure |
| Audit exception regression tests | NOT RUN | skipped after blocking npm failure |
| Trivy repository scan | FAIL | blocking; one known HIGH |
| Semgrep static analysis report | PASS | report-only because job has `continue-on-error: true` |
| Security hardening | NOT PRESENT IN HOSTED WORKFLOW | local PASS |
| Security integrity | NOT PRESENT IN HOSTED WORKFLOW | local PASS |
| Production build | NOT PRESENT IN HOSTED WORKFLOW | local PASS |

```text
SEMGREP_HOSTED_STEP=PASS
SEMGREP_POLICY=REPORT_ONLY
SEMGREP_HOSTED_RESULT=REPORT_ONLY
REQUIRED_HOSTED_SECURITY_JOBS=FAIL
```

Triggers, permissions, Trivy severity/exit behavior and Semgrep report-only behavior were unchanged from the captured workflow baseline.

## 10. Fail-Closed Hosted Proof

Positive evidence:

- The hosted npm validator failed closed on an unreviewed node/advisory representation rather than silently accepting it.
- Trivy executed with its real vulnerability database and blocked the known gRPC HIGH.
- Semgrep completed according to its unchanged report-only contract.
- The workflow ran against the exact qualification commit.

Incomplete/failed requirements:

```text
KNOWN_ACCEPTED_HIGH_HANDLED=NO
NEW_HIGH_FAILS_CI=YES_BY_DESIGN_AND_LOCAL_SYNTHETIC_EVIDENCE
NEW_CRITICAL_FAILS_CI=YES_BY_DESIGN_AND_LOCAL_SYNTHETIC_EVIDENCE
UNKNOWN_HIGH_FAILS_CI=YES_BY_DESIGN_AND_LOCAL_SYNTHETIC_EVIDENCE
GLOBAL_HIGH_THRESHOLD_WEAKENED=NO

NPM_EXCEPTION_GATE=FAIL
CVE_LITE_GATE=NOT_RUN
TRIVY_GATE=BLOCKED_REQUIRES_HUMAN_DISPOSITION
REQUIRED_HOSTED_SECURITY_JOBS=FAIL
```

The hosted run is environment/integration evidence, while negative paths remain supported by the 99 deterministic tests. No real vulnerable dependency was injected.

## 11. Security Review and Post-Run Integrity

Before creating this report, the worktree was clean and local HEAD equaled the remote qualification branch. The hosted run did not modify the checkout.

```text
DEPENDENCIES_CHANGED_BY_QUALIFICATION=NO
LOCKFILES_CHANGED_BY_QUALIFICATION=NO
PACKAGE_MANIFESTS_CHANGED_BY_QUALIFICATION=NO
APPLICATION_SOURCE_CHANGED_BY_QUALIFICATION=NO
RULES_CHANGED_BY_QUALIFICATION=NO
FIREBASE_CONFIG_CHANGED_BY_QUALIFICATION=NO

NEW_DEPENDENCIES_ADDED=NO
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO
GITHUB_ACTIONS_TRIGGER_MODEL_CHANGED=NO
PULL_REQUEST_TARGET_USED=NO
OIDC_ADDED=NO
GLOBAL_AUDIT_THRESHOLD_WEAKENED=NO

SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
PRODUCTION_DATA_TOUCHED=NO
```

The qualification commit includes previously reviewed dependency lockfile updates; the fields above mean that qualification execution itself introduced no new dependency/lockfile mutation beyond committing those accepted bytes. This report is the only post-run worktree addition and remains intentionally uncommitted/unpushed because the hosted gate is blocked.

## 12. Remaining Risks

- Both temporary security exceptions require review by 2026-11-03 UTC; expiry remains fail-closed.
- The HIGH packages remain physically installed. The npm/CVE Lite exploitability disposition does not automatically authorize suppression in another scanner.
- npm 11.19.0 produces a representation that does not match the npm 10.9.4 reviewed fingerprint. The exact field-level drift remains undetermined because the fail-closed wrapper does not leak raw audit JSON.
- CVE Lite and its hosted deterministic tests did not run.
- Trivy found the known gRPC HIGH and remains blocking until a dedicated Trivy disposition or dependency remediation is explicitly approved.
- Hosted CI qualification is not production deployment qualification. Real GCS, HTTPS/browser, environment isolation and deployment rollback remain separate.
- Functions retain the previously accepted MODERATE Storage/UUID chain disposition.
- Any package, architecture, advisory, scanner-schema or source-context drift invalidates current evidence.
- The runner warned that `ubuntu-latest` will move to Ubuntu 26 on 2026-10-19; future qualification must record the actual runner image.
- Semgrep is report-only and its green step is not a blocking security certification.

## 13. Bounded Rollback

No rollback was executed.

If the qualification checkpoint must later be removed, use a new, explicitly approved revert commit on `codex/public-shiftoryx-demo`:

```text
git revert 0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
```

Before doing so, require a clean/known worktree, inspect the generated revert, run the applicable gates and push the new revert commit without force. Do not use reset, clean, stash, history rewriting or force push. Do not merge or revert on `main` as part of this phase.

## 14. Final Gate

```text
HOSTED_CI_QUALIFICATION_COMPLETE=NO

COMMIT_BOUNDARY_PROVEN=YES

NPM_HOSTED_GATE=FAIL
CVE_LITE_HOSTED_GATE=NOT_RUN
TRIVY_GATE=BLOCKED_REQUIRES_HUMAN_DISPOSITION
SEMGREP_HOSTED_RESULT=REPORT_ONLY

REMOTE_GITHUB_ACTIONS_GATE=BLOCKED

NEW_HIGH_DETECTED=NO
NEW_CRITICAL_DETECTED=NO
HOSTED_ABSENCE_OF_NEW_HIGH=UNVERIFIED
HOSTED_ABSENCE_OF_NEW_CRITICAL=UNVERIFIED

GLOBAL_HIGH_THRESHOLD_WEAKENED=NO
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO

HOSTED_RELEASE_GATE=NOT_STARTED
PUBLIC_DEMO_RELEASE_READY=NO

NEXT_ACTION=Human security review of npm 11 audit-fingerprint drift and a separate explicit Trivy disposition for CVE-2026-101916 before any workflow change or hosted CI rerun
```

No hosted application deployment, merge or production mutation follows from this blocked qualification.
