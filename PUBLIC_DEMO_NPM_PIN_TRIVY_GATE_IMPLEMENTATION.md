# ShiftOryx Public Demo — npm Pin + Trivy Exception Gate Implementation

Date: 2026-10-04. Local implementation and independent review only.

## 1. Executive Summary

The actual audit execution helper now resolves and proves npm **10.9.4** before each operation. Its version probe and audited command execute the same canonical CLI through the same Node executable; explicit resolution failure cannot fall back to ambient npm 11.

The tested toolchain is **Node 24.19.0 + npm 10.9.4**. The existing hosted job continues to request Node 24. The accepted npm advisory/node fingerprints remain byte-identical, including effects and fixAvailable.

The new Trivy gate validates fresh Trivy **0.70.0** JSON and permits exactly one instance of **CVE-2026-101916 / @grpc/grpc-js@1.9.16 / root package-lock.json**, in the exact reviewed dependency/source context, before **2026-11-03T00:00:00Z**.

Independent review identified that inherited ignore-unfixed could conceal an unfixed HIGH/CRITICAL. The correction retains the inherited scan and requires a second complete all-status scan. Both independently pass strict JSON validation; a missing, reused, filtered or unsafe second report fails.

Final evidence: **182/182 deterministic tests**, live npm and CVE Lite PASS, paired real Trivy PASS, security checks/build PASS. Independent review: **PASS; 0 Critical / 0 Important / 0 Minor**.

No commit, push, hosted CI rerun, deployment, IAM, DNS or production change occurred. The old remote qualification remains BLOCKED.

## 2. Starting Repository State

```text
CURRENT_BRANCH=codex/public-shiftoryx-demo
CURRENT_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
END_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
INITIAL_TRACKED_DIFF=NONE
```

Inherited untracked files were preserved:

- PUBLIC_DEMO_NPM11_TRIVY_DISPOSITION.md
- docs/PUBLIC_DEMO_HOSTED_CI_QUALIFICATION.md

Before changes, 455 file hashes covered all 453 tracked files plus those two reports. A local backup also preserved the workflow, runtime helper, npm/CVE entry wrappers and original npm registry.

Evidence/backup directory:

`C:/Users/Spyros/AppData/Local/Temp/shiftoryx-npm-trivy-gate-GN5DhD`

Only these phase deltas exist:

| File | Change / purpose |
| --- | --- |
| .github/workflows/security-scan.yml | MODIFY: npm pin/assertion, expanded tests, pinned Trivy setup and raw validator |
| scripts/lib/auditGateRuntime.ts | MODIFY: exact npm resolution/probe and executable/manifest seals |
| scripts/validate-npm-audit-exceptions.mjs | MODIFY: report actual proven npm version |
| security/npm-audit-exceptions.json | MODIFY: only the explicitly reviewed workflow context hash |
| scripts/assert-pinned-npm.mjs | CREATE: fail-closed toolchain assertion |
| scripts/lib/trivyAuditPolicy.ts | CREATE: typed raw report, exception, pair and context validation |
| scripts/lib/trivyGateRuntime.ts | CREATE: fixed scanner execution, fresh outputs and pre/post seals |
| scripts/validate-trivy-audit-exceptions.mjs | CREATE: fixed --run entrypoint |
| scripts/test-pinned-npm-runtime.mjs | CREATE: 12 executable/version/fallback/TOCTOU tests |
| scripts/test-trivy-audit-exceptions.mjs | CREATE: 71 schema/security/coverage/freshness/pair tests |
| scripts/test-fixtures/trivy-0.70.0-current.json | CREATE: sanitized actual scanner corpus |
| security/trivy-audit-exception.json | CREATE: one scanner-specific bounded exception |
| PUBLIC_DEMO_NPM_PIN_TRIVY_GATE_IMPLEMENTATION.md | CREATE: this report |

## 3. npm Pin Design

The security workflow retains Node 24 and runs:

```text
npm install --global --ignore-scripts npm@10.9.4
node scripts/assert-pinned-npm.mjs
npm ci
node scripts/validate-npm-audit-exceptions.mjs --run
node scripts/validate-cve-audit-exceptions.mjs --run
```

The global installation applies only to the ephemeral hosted toolchain. It was not executed on the user's installed Node runtime. Local qualification used the existing installed npm 10.9.4 CLI with bundled Node 24.

A failed pin operation blocks the job. The assertion is independent of whichever npm command happens to be in PATH. Existing npm severity thresholds, advisory fields, expiry and graph checks are unchanged.

## 4. Actual npm Executable Resolution

The runtime helper:

1. Resolves an explicit absolute SHIFTORYX_AUDIT_NPM_CLI when provided; otherwise checks the npm CLI adjacent to the active Node installation.
2. Rejects missing, relative, unexpected-entrypoint and symlink/changed-resolution paths.
3. Requires package metadata name npm and exact version 10.9.4.
4. Executes that exact CLI's --version using process.execPath, shell:false and bounded subprocess options.
5. Requires successful exact numeric output 10.9.4.
6. Verifies CLI/metadata hashes around the probe and again after the requested command.
7. Executes the audit with the same executable and a reduced environment; child Node commands resolve to the active Node runtime.

There is no fallback after an explicit invalid override. Unexpected metadata, actual version, execution error, banner output or executable drift throws a sanitized GATE_NPM_* error.

Final live output:

```text
NPM_TOOLCHAIN_ASSERTED expected=10.9.4 actual=10.9.4 node=v24.19.0
NPM_AUDIT_EXCEPTION_GATE_PASS mode=live highPackages=9
```

The accepted exceptions array, including every auditFingerprint and lockFingerprint, was compared byte-for-byte with its before-change text. Only reviewedContext['.github/workflows'] changed:

```text
BEFORE=A230393A8E475BA5D4362547A26350DE6EBA55ADD5D4C6EC6037847EA47CF95B
AFTER=024639A6F1C51E04B94849951FAF4AD7B14C9A47BDCB375F2E9AB0CC403A51C2
OTHER_CONTEXT_FIELDS_UNCHANGED=23
```

This was a one-time explicit review of the authorized workflow diff. No gate automatically regenerates source hashes or advisory fingerprints.

## 5. Node 24 + npm 10.9.4 Qualification

```text
NODE_LOCAL_VERSION=v24.19.0
NPM_ACTUAL_AUDIT_VERSION=10.9.4
NODE_NPM_PAIR_QUALIFIED=YES
```

The bundled runtime path is:

`C:/Users/Spyros/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe`

The qualified npm CLI is:

`C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js`

All deterministic/security checks, the live npm/CVE gates and production build ran with Node 24.19.0. npm live JSON matched the existing reviewed fingerprints, reporting nine HIGH nodes representing the same two approved advisories.

Hosted Node 24.21.0 was not executed locally. The task permits Node 24.x; 24.19.0 was already available and avoided installing another Node runtime. Linux and the exact hosted patch version remain separate remote qualification requirements.

## 6. Trivy Raw JSON Evidence

The official portable Windows 0.70.0 release was downloaded outside Git, verified against its published checksum, and extracted without an installer:

```text
TRIVY_VERSION=0.70.0
ARCHIVE_SHA256=eea5442eab86f9e26cd718d7618d43899e72a83767619e8bee47911bddbfb825
```

Docker was unavailable; the portable CLI provided the required real scanner execution. No project dependency or lockfile was modified.

Initial capture scanned a clean git archive of qualification commit 0f06e70...:

- trivy-qualification-raw.json: inherited status-filtered configuration.
- trivy-all-status-raw.json: complete HIGH/CRITICAL view without ignore-unfixed.
- Both are in the task evidence directory; neither uses exception suppression.

Observed schema:

| Field | Actual emitted value/shape |
| --- | --- |
| SchemaVersion | 2 |
| Trivy | {Version: "0.70.0"} |
| ReportID | Opaque per-run UUID-shaped identifier |
| CreatedAt | Timestamp including timezone |
| ArtifactName | Exact scanned temporary tree path |
| ArtifactType | filesystem |
| Results | Three expected target records |
| root lock result | Target package-lock.json; Class lang-pkgs; Type npm; Packages and Vulnerabilities |
| Functions lock result | Target functions/package-lock.json; Class lang-pkgs; Type npm; Packages; no vulnerabilities |
| Dockerfile result | Class config; Type dockerfile; MisconfSummary |
| Metadata | Not emitted in this filesystem corpus |
| Secrets / Misconfigurations / ModifiedFindings | Omitted when empty; absence alone is not scanner-coverage proof |

Observed inventory: root **139** packages; Functions **263** packages; Docker **20 successes / 0 failures**. Both raw modes contain exactly one HIGH and zero Critical, secret or misconfiguration findings.

The exact vulnerability emits:

```text
VulnerabilityID=CVE-2026-101916
VendorIDs=[GHSA-m9gg-hp2v-232j]
PkgID=@grpc/grpc-js@1.9.16
PkgName=@grpc/grpc-js
InstalledVersion=1.9.16
PkgIdentifier.PURL=pkg:npm/%40grpc/grpc-js@1.9.16
PkgIdentifier.UID=232e79735b43575a
Severity=HIGH
SeveritySource=ghsa
FixedVersion=1.13.6, 1.14.5
Status=fixed
```

No PkgPath is emitted. Instance binding instead uses the actual PURL/UID/package ID, unique scanned package record, exact root target and the independently pinned physical lock entry node_modules/@grpc/grpc-js. Package locations identify root lock lines 1193–1205; no dependency path was invented from nonexistent scanner fields.

The deterministic fixture preserves the complete actual package/results corpus. Only the temporary artifact path and CreatedAt were replaced with test literals.

Final live paired evidence:

`C:/Users/Spyros/AppData/Local/Temp/shiftoryx-trivy-gate-t9KdFf`

It contains fresh-report.json, all-status-report.json and execution-receipt.json.

## 7. Trivy Exception Contract

The only exception is the conjunction of:

- Trivy 0.70.0, report schema 2 and filesystem artifact.
- CVE-2026-101916 with its exact GHSA-m9gg-hp2v-232j mapping.
- root package-lock.json / npm / @grpc/grpc-js / installed 1.9.16 / HIGH.
- Exact fixed-version, narrative, severity-source, CVSS and other captured vulnerability metadata.
- Unique physical node_modules/@grpc/grpc-js and matching raw package identifier.
- Whole semantic root/Functions locks, root manifest and npm-policy fingerprints.
- Existing exact dependency edges and source/build context.
- Full root/Functions package inventory fingerprints.
- Expiry strictly before 2026-11-03T00:00:00Z.
- Three complete expected result surfaces and both mandatory scan modes.

Another CVE/package/version/path, CRITICAL promotion, another blocking result, malformed policy, altered graph/context/scanner/report or a stale exception fails. Neither a package wildcard nor a global CVE/HIGH ignore exists.

Canonical JSON hashes normalize object-key formatting only. They do not remove effects, fixAvailable, advisory fields or dependency metadata. File byte hashes additionally seal the exact scan input before/after execution.

## 8. Validator Implementation

The typed policy validates raw JSON before making any acceptance decision. It uses the existing strict parser for empty/truncated/duplicate-key/dangerous-key/oversized JSON denial.

The runtime:

1. Checks the existing reviewed source context.
2. Reads a bounded inventory of tracked and nonignored repository files, rejecting unsafe paths/symlinks and uncontrolled Trivy configuration.
3. Copies captured bytes into an owned temporary scan tree, excluding ignored local dependencies/env state.
4. Binds the actual scanner executable/version and seals its bytes.
5. Generates a new output filename in a new owned directory; no old report can be reused.
6. Executes both fixed commands against the same sealed snapshot.
7. Validates complete JSON, actual receipt times, report IDs, inventories, target/category/finding content and unique package identity.
8. Rechecks root files, snapshot bytes, policy/context, binary and the empty no-suppression file before acceptance.

Primary scan preserves inherited ignore-unfixed=true. A mandatory second scan uses ignore-unfixed=false. Both retain vuln,misconfig,secret scanners, os,library package types, HIGH,CRITICAL and exit-code 1. The pair requires distinct report IDs, sequential receipt windows and the same artifact. Every finding in both reports is traversed; the second proof is not a count-only comparison.

Native Trivy omits empty finding arrays. A trusted internal execution receipt binds the actual fixed scanner configuration, while all three known targets and full package inventory prove expected result coverage. The CLI accepts only --run, never a user-supplied receipt, root path or prior JSON.

The explicitly selected ignore file is an owned **zero-byte no-suppression.txt**, outside Git. No rule is written. Trivy's option parser requires the explicitly selected file to exist; an initial missing-file execution failed closed and was corrected by creating that empty file. Its size is checked again after scans.

Exit 1 is accepted only after complete validation proves the one allowed HIGH. A scanner/process error, missing output, mismatched exit status, signal, timeout, stale timestamp, reused report or changed input fails. Logs expose only sanitized GATE_* codes and concise success metadata.

TOCTOU checks cover all inventoried source/manifests/locks/policies and the copied scan tree. No policy or source-context hash is updated by runtime code.

## 9. Deterministic Tests

Final total:

```text
EXISTING_NPM_EXCEPTION_TESTS=99/99
NEW_NPM_PIN_TESTS=12/12
NEW_TRIVY_TESTS=71/71
TOTAL_TESTS=182
PASS=182
FAIL=0
```

TDD evidence:

- New npm resolution behavior: **0/10 RED** against old ambient resolution; then GREEN.
- Trivy validation: **0/62 RED** before the typed validator; then GREEN.
- Independent-review correction: **62 PASS / 9 RED** before mandatory all-status pair validation; then **71/71 GREEN**.
- No original npm test or assertion was deleted or modified.

Coverage includes all required CVE/package/version/severity/expiry/target/lock/edge/source/duplicate-instance/schema/scanner/process/stale-output/missing-category/advisory-metadata/ambiguity cases. Additional tests deny suppression/ModifiedFindings, missing PURL, hidden misconfiguration failures, secret findings and unknown result categories.

Pair regressions explicitly reject an unfixed unknown HIGH, an unfixed CRITICAL, a still-filtered second scan, missing full coverage, reused report, changed target, out-of-order timestamps and partial results.

npm tests reject missing/relative/unexpected CLI resolution, lying metadata/probes, npm 11, probe failure/banner, malformed metadata and changed CLI/manifest during execution.

Final test review tightened both TOCTOU assertions to the exact GATE_NPM_EXECUTABLE_DRIFT code. This exposed a temporary CLI fixture escaping error (11/12 PASS): it had caused a probe syntax failure rather than an executable mutation. The fixture generation was corrected; the production guard was unchanged. The final suite rerun confirms the intended mutation is detected.

## 10. Workflow Integration

Only the security workflow changed:

- Node dependency job: exact npm 10.9.4 pin, actual-CLI assertion, existing npm/CVE gates and all 182 tests.
- Trivy job: existing Node setup action requesting Node 24, exact setup-trivy commit already used inside the previous trivy-action composite, explicit v0.70.0, then the strict raw gate.
- Triggers, contents:read permission and Semgrep report-only job remain byte/structure-equivalent.

The direct setup-trivy reference is:

`aquasecurity/setup-trivy@3fb12ec12f41e471780db15c232d5dd185dcb514`

No new security service, write permission, OIDC, pull_request_target, deployment or branch-protection change was introduced. The scanner's severity and native exit code remain blocking; the project validator owns the narrowly reviewed exception decision.

The workflow YAML and trust sections were validated using an already cached YAML parser. No parser dependency was added.

## 11. Local Verification Results

All Node commands below used Node 24.19.0; audit/CVE operations used the proven npm 10.9.4 CLI.

| Command/check | Result |
| --- | --- |
| node scripts/assert-pinned-npm.mjs | PASS: actual 10.9.4 |
| node --test scripts/test-npm-audit-exceptions.mjs scripts/test-audit-gate-runtime.mjs scripts/test-pinned-npm-runtime.mjs scripts/test-trivy-audit-exceptions.mjs | PASS: 182/182 |
| node scripts/validate-npm-audit-exceptions.mjs --run | PASS: 9 HIGH nodes, exact accepted advisories |
| node scripts/validate-cve-audit-exceptions.mjs --run | Final PASS: version 1.37.0, complete raw/native/raw cycle |
| node scripts/validate-trivy-audit-exceptions.mjs --run | PASS: two real scans, sole accepted finding |
| security:hardening | PASS |
| security:integrity | PASS |
| npm 10.9.4 run build under Node 24 | PASS: 1,992 modules / 10.29s |
| New mjs entrypoint syntax checks | PASS |
| Workflow syntax / trigger / permission / Semgrep comparison | PASS |
| git diff --check | PASS |
| Protected-file and exact advisory-fingerprint comparison | PASS |

The build ran in an isolated verification mirror with the accepted clean root installation from the prior dependency phase. Outputs stayed outside Git. Existing large-chunk/plugin timing warnings remain.

One final CVE repetition initially failed with **GATE_CVE_INCOMPLETE**: native-ratchet was partial because two PACKUMENT_FETCH_FAILURE requests failed. Raw-before remained complete with two known findings. No assertion, scanner, policy or metadata was changed. One bounded unchanged rerun completed all three stages successfully.

Failed transient evidence: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-cve-exception-AnAwKv`.

Final complete CVE evidence: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-cve-exception-XDya5z`.

This failure remains documented; the final PASS is based on complete fresh evidence rather than the earlier successful run.

## 12. Independent Review

```text
INDEPENDENT_REVIEW=PASS
CRITICAL_FINDINGS=0
IMPORTANT_FINDINGS=0
MINOR_FINDINGS=0
PREVIOUS_IMPORTANT_FINDINGS_RESOLVED=1
INDEPENDENT_TESTS=182/182_PASS
```

The reviewer independently inspected the implementation, actual raw corpus, paired runtime evidence, workflow trust model and deterministic tests. It identified the ignore-unfixed gap; the required second all-status proof and nine RED/GREEN tests resolved it.

The reviewer made no edits, live scans/audits, installations or external writes. Declined scope: hosted Linux execution, commit/push/merge, deployment and release approval. The final review is for this local implementation only.

## 13. Security Review

The 455-file snapshot shows exactly four authorized pre-existing file changes: workflow, npm runtime helper, npm entrypoint and the single workflow context hash in the npm registry. All application/Functions/Rules/manifests/locks and inherited reports match their initial bytes.

The full exceptions array and every npm advisory/node fingerprint remain byte-identical. Source-context review changed only the authorized workflow leaf, with 23 other context entries preserved.

```text
DEPENDENCIES_CHANGED=NO
LOCKFILES_CHANGED=NO
PACKAGE_MANIFESTS_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
FUNCTIONS_SOURCE_CHANGED=NO
RULES_CHANGED=NO
FIREBASE_CONFIG_CHANGED=NO
GITHUB_ACTIONS_CHANGED=YES
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO
GITHUB_ACTIONS_TRIGGER_MODEL_CHANGED=NO
PULL_REQUEST_TARGET_USED=NO
OIDC_ADDED=NO
SECRETS_TOUCHED=NO
DEPLOYMENT_PERFORMED=NO
IAM_CHANGED=NO
DNS_CHANGED=NO
PRODUCTION_DATA_TOUCHED=NO
COMMIT_CREATED=NO
PUSH_PERFORMED=NO
HOSTED_CI_RERUN=NO
```

The portable Trivy executable is test tooling outside Git, not an application dependency. npm pinning in the future hosted job changes its ephemeral toolchain only. No local global npm installation was performed.

Subprocesses use fixed argv, shell:false, bounded execution/output and a reduced environment. Scanner suggestion text and policy content are never executed. Ignored .env/dependency state is excluded from the clean scan snapshot; no customer/private payload is copied to an external service. Only ordinary registry/advisory/Trivy database requests required by the authorized scanners occurred.

Bounded rollback, if later explicitly requested: use the exact before-file backups in the task evidence directory for the four modified paths, verifying hashes first; archive only the explicitly listed new phase files. Preserve both inherited reports. No rollback or broad reset/clean/stash was performed.

## 14. Remaining Risks

- The two existing npm exceptions and the single Trivy exception expire at the existing 2026-11-03 UTC boundary.
- HIGH packages remain physically installed; this is an exact reviewed exposure exception, not remediation.
- Linux/actual hosted Node 24.21.0 behavior remains unverified in this task. Local qualification uses Node 24.19.0.
- Strict package inventories and vulnerability metadata can intentionally fail on upstream DB/schema/advisory changes. Human review is required; no automatic refresh exists.
- Registry/network failures produce incomplete CVE reports and block the gate, as the observed transient failure demonstrated.
- File hashes before/after protect practical drift; they do not defend against a malicious privileged runner capable of transiently replacing tools and restoring bytes. Trusted runner/tool bootstrap remains part of the CI trust boundary.
- Trivy's existing development-dependency scope is unchanged; npm audits still cover the full root graph and reject new HIGH/CRITICAL there.
- Functions retain the separately accepted MODERATE Storage/UUID disposition.
- No hosted HTTPS/GCS/browser/runtime/deployment readiness is established.

## 15. Hosted Qualification Preconditions

Before a new remote attempt:

1. Human review/acceptance of this report and the exact new workflow context/scanner exception.
2. Fresh provenance inventory including the two inherited reports and these uncommitted implementation files.
3. Fresh local npm/CVE/Trivy gates on the intended pair, with unexpired exceptions and unchanged context.
4. A separately authorized bounded qualification commit/push; no automatic staging here.
5. One real workflow run on its exact commit; inspect npm, CVE, tests, Trivy and report-only Semgrep independently.
6. Keep hosted release/deployment/GCS/HTTPS/browser/rollback qualification separate.

```text
NPM_EXPECTED_VERSION=10.9.4
NPM_ACTUAL_GATE_VERSION=10.9.4
NODE_NPM_PAIR_QUALIFIED=YES
QUALIFIED_NODE_VERSION=24.19.0

NPM_EXCEPTION_TESTS=PASS
NPM_LIVE_GATE=PASS
CVE_LITE_GATE=PASS

TRIVY_VERSION=0.70.0
TRIVY_RAW_JSON_CAPTURED=YES
TRIVY_SCHEMA_VALIDATED=YES
TRIVY_EXCEPTION_GATE=PASS
TRIVY_NEGATIVE_TESTS=PASS
TRIVY_ALL_STATUS_PROOF_REQUIRED=YES

UNKNOWN_HIGH_FAILS=YES
CRITICAL_ALWAYS_FAILS=YES
EXPIRED_EXCEPTION_FAILS=YES
CONTEXT_DRIFT_FAILS=YES
SCANNER_DRIFT_FAILS=YES

DEPENDENCIES_CHANGED=NO
LOCKFILES_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
FUNCTIONS_SOURCE_CHANGED=NO
RULES_CHANGED=NO
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO

COMMIT_CREATED=NO
PUSH_PERFORMED=NO
HOSTED_CI_RERUN=NO
DEPLOYMENT_PERFORMED=NO

LOCAL_IMPLEMENTATION_GATE=PASS
REMOTE_GITHUB_ACTIONS_GATE=BLOCKED
PUBLIC_DEMO_RELEASE_READY=NO
```
