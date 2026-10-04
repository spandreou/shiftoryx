# Public Demo — Advisory-Specific CI Exception Gate Implementation

Review date: 2026-10-04. Scope: local implementation of the approved CI exception mechanism only.

## 1. Baseline

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_STATUS=DIRTY_INHERITED_PRESERVED
ROOT_CRITICAL_BEFORE=0
ROOT_HIGH_BEFORE=9
ROOT_MODERATE_BEFORE=0
ROOT_LOW_BEFORE=0
```

The active worktree is `C:/Users/Spyros/.codex/worktrees/shiftoryx-public-demo`, not the parent checkout. Baseline status, hashes, original workflow bytes and audit evidence were captured before mutation. Existing application, Functions, Rules, lockfile and untracked work was preserved.

Baseline/evidence directory: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-ci-gate-ef027c363bfa4753b885693a0a249466`. It is local temporary evidence, not committed or uploaded. No commit, push, merge, cloud authentication, deployment, IAM or DNS operation was performed.

Authoritative decisions: `PUBLIC_DEMO_ROOT_HIGH_CI_DISPOSITION.md`, accepted Functions/root remediation reports, and the supplied CI exception task. Previous audit counts were reproduced rather than assumed.

## 2. Implemented Policy

The only accepted HIGH identities are:

- `GHSA-m9gg-hp2v-232j`: temporary Firebase/Firestore/gRPC exception; the reviewed application creates no gRPC server and does not use the affected `getAuthContext()` server authorization path. The compatible upstream dependency remains outside the fixed line.
- `GHSA-vfj7-8cjw-p6xm`: Tailwind/braces build-only exception; repository-controlled patterns, not public runtime input. No Tailwind migration or forced transitive resolution is authorized.

These are the previous accepted reachability dispositions, not a new hosted security certification or an assertion that the vulnerabilities were patched.

| Exact package | Exact version | Reviewed surface |
| --- | --- | --- |
| firebase | 11.10.0 | production dependency branch |
| @firebase/firestore | 4.8.0 | production dependency branch |
| @firebase/firestore-compat | 0.3.53 | production dependency branch |
| @grpc/grpc-js | 1.9.16 | Node-only branch; reviewed vulnerable server API absent from browser artifact |
| tailwindcss | 3.4.19 | build-only |
| chokidar | 3.6.0 | build-only |
| fast-glob | 3.3.3 | build-only |
| micromatch | 4.0.8 | build-only |
| braces | 3.0.3 | build-only |

Every approved physical path is exactly `node_modules/<package>`, including scoped names. The registry pins complete npm vulnerability nodes, complete locked entries (version, dev state, resolved URL, integrity and dependency metadata), and 12 exact incoming dependency edges/ranges. Nested same-name copies, additional parents and changed nodes require review. No wildcard package/version/advisory acceptance exists.

The gRPC cluster includes `GHSA-f596-whhp-79r4` as an ancillary LOW identity in the native CVE baseline, not a third HIGH exception. If it becomes HIGH/CRITICAL or changes content the gate fails. CVE advisory ID, aliases, summary, severity and CVSS are pinned, including that ancillary record. Volatile EPSS metrics and non-authoritative upgrade suggestion text are not authorization fingerprints; they are never executed.

`reviewedOn=2026-10-03`; `reviewBy=2026-11-03`. The live UTC day must be strictly earlier than reviewBy. At **2026-11-03T00:00:00Z** the gate fails; there is no CLI clock override or automatic extension. A disappearing accepted cluster fails as stale; explicit reviewed removal of the registry entry permits a genuinely clean audit. Unknown exceptions are never accepted.

Reviewed-context fingerprints cover source/Functions trees, manifests, accepted Functions lock, Vite/Tailwind/PostCSS, Vercel/Firebase configuration, public-demo build/package helpers and their Rules generator, Rules, all workflows, Docker/build inclusion configuration and index.html. Text line endings are normalized for Windows/Linux compatibility. Source/build/packaging changes require renewed evidence, not automatic baseline capture. Gate code/registry are deliberately not self-hashed; their changes require code review. This is a static reviewed boundary for the current build entrypoints, not runtime exploitability analysis of future code.

## 3. Files Changed

Only these current-phase deltas are intended; inherited changes are not attributed to this phase.

| File | Purpose |
| --- | --- |
| .github/workflows/security-scan.yml | MODIFY: invoke npm/CVE wrappers and deterministic tests; all other jobs unchanged. |
| security/npm-audit-exceptions.json | CREATE: single reviewed registry, exact fingerprints/edges/context and expiry. |
| scripts/lib/auditExceptionPolicy.ts | CREATE: pure typed schema, graph, advisory, inventory and fail-closed validation. |
| scripts/lib/auditGateRuntime.ts | CREATE: safe process transport, bounded JSON and source/build context checks. |
| scripts/validate-npm-audit-exceptions.mjs | CREATE: live npm audit wrapper; separate clearly labelled offline mode. |
| scripts/validate-cve-audit-exceptions.mjs | CREATE: pinned existing CVE Lite raw/native-ratchet/raw integration. |
| scripts/test-npm-audit-exceptions.mjs | CREATE: deterministic positive/negative policy and transport assertions. |
| scripts/test-audit-gate-runtime.mjs | CREATE: context mutation, offline CLI and safe subprocess tests. |
| scripts/test-fixtures/audit-exception-current.json | CREATE: synthetic npm/lock fixture; no real lockfile mutation. |
| scripts/test-fixtures/cve-exception-current.json | CREATE: public advisory/scanner fixture; local path replaced by fixture-root. |
| docs/PUBLIC_DEMO_CI_EXCEPTION_GATE_IMPLEMENTATION.md | CREATE: implementation/evidence/security/rollback report. |

No package manifest, dependency resolution, existing application/test file, Functions source, Rules or Firebase configuration was changed.

## 4. Validator Behavior

- Only complete npm audit v2 JSON is accepted, with strict expected keys, dependency inventory, vulnerability category counts and node/advisory structure.
- Metavulnerability `via` references are resolved recursively; missing references, cycles, misleading node severity and CRITICAL leaf advisories fail.
- Every HIGH node must exactly match the reviewed package/graph and advisory fingerprints. New/unknown HIGH and every CRITICAL fail.
- npm exit 1 is accepted only after the entire audited result matches. Exit 0 with HIGH, exit 2, transport error, signal, timeout, missing/invalid/truncated/oversized JSON and registry error payload fail.
- Strict JSON rejects duplicate decoded keys, dangerous prototype keys, excessive depth and inputs over 4 MiB.
- CVE Lite's pinned raw schema, finding schema, complete status, empty diagnostics/warnings/skipped/alternate finding collections, unsafe-source flags, exact lock-derived inventory and findings/counts are enforced before accepting exceptions.
- CVE inventory independently follows the inspected 1.37.0 package-lock parser's `name@version` de-duplication: current 289 physical dependency nodes yield 286 identities. A reduced report inventory fails. Registry-source package schema drift fails closed.
- Processes use argv with `shell:false`, a bounded buffer/timeout, and a reduced environment. Failure output contains deterministic sanitized `GATE_*` codes; raw stderr, secrets and request payloads are not dumped.
- CI invokes fixed `--run` commands. `--input` is explicitly offline structural validation, not proof of a fresh audit or successful process execution.
- Success/failure exit codes are 0/nonzero; no generic ignore-HIGH switch or `|| true` is introduced.

## 5. Test Matrix

Final command:

```text
node --test scripts/test-npm-audit-exceptions.mjs scripts/test-audit-gate-runtime.mjs
tests=99 pass=99 fail=0 skipped=0 cancelled=0
```

Each negative test's PASS means the invalid request was rejected, not accepted. Mutations use synthetic input or owned temporary copies; the real dependency lockfiles remain unchanged.

The initial implementation was tested RED before implementation. Independent review then found three Important gaps; seven additional regressions reproduced them against the old guard (85/92 passed, seven failed as expected). The final strict guard resolves them. A transient test failure caused by changed ordering of the real ancillary LOW fixture was corrected by selecting its exact advisory ID; its denial assertion was preserved.

| # | Test | Outcome |
| --- | --- | --- |
| 1 | reviewed source/build context passes without executing project code | PASS |
| 2 | source, packaging and newly added server code invalidate the reviewed context | PASS |
| 3 | CLI rejects empty/malformed/unreviewed input and unsupported clock overrides | PASS |
| 4 | subprocess transport uses argv without shell interpretation | PASS |
| 5 | accepts only the two reviewed clusters inside their review window | PASS |
| 6 | fails closed: missing dependency metadata fields | PASS |
| 7 | fails closed: partial dependency inventory | PASS |
| 8 | fails closed: unrelated HIGH | PASS |
| 9 | fails closed: unrelated CRITICAL | PASS |
| 10 | fails closed: known GHSA CRITICAL | PASS |
| 11 | fails closed: version drift | PASS |
| 12 | fails closed: same version changed tarball URL | PASS |
| 13 | fails closed: same version changed integrity | PASS |
| 14 | fails closed: same version changed dependency metadata | PASS |
| 15 | fails closed: missing package version | PASS |
| 16 | fails closed: audit node path drift | PASS |
| 17 | fails closed: missing audit node path | PASS |
| 18 | fails closed: new same-name nested vulnerable copy | PASS |
| 19 | fails closed: changed incoming dependency range | PASS |
| 20 | fails closed: additional parent reaches accepted package | PASS |
| 21 | fails closed: changed manifest without matching lock metadata | PASS |
| 22 | fails closed: accepted severity decreased | PASS |
| 23 | fails closed: accepted advisory content drift | PASS |
| 24 | fails closed: missing audit version | PASS |
| 25 | fails closed: unexpected audit version | PASS |
| 26 | fails closed: missing audit metadata | PASS |
| 27 | fails closed: lying metadata hides HIGH | PASS |
| 28 | fails closed: downgraded node still resolves HIGH advisory | PASS |
| 29 | fails closed: expired gRPC entry | PASS |
| 30 | fails closed: expired braces entry | PASS |
| 31 | fails closed: future review date | PASS |
| 32 | fails closed: invalid calendar date | PASS |
| 33 | fails closed: extended unapproved review window | PASS |
| 34 | fails closed: duplicate exception | PASS |
| 35 | fails closed: duplicate package entry | PASS |
| 36 | fails closed: wildcard package version | PASS |
| 37 | fails closed: wildcard advisory | PASS |
| 38 | fails closed: new exception cannot extend reviewed advisory set | PASS |
| 39 | fails closed: unknown package node under accepted GHSA | PASS |
| 40 | fails closed: additional metavulnerability node | PASS |
| 41 | fails closed: dangling via reference | PASS |
| 42 | fails closed: cycle in via graph | PASS |
| 43 | fails closed: stale exceptions after clean audit | PASS |
| 44 | fails closed: stale one-cluster exception | PASS |
| 45 | fails closed: registry/network error payload | PASS |
| 46 | fails closed: empty vulnerabilities with malformed counts | PASS |
| 47 | fails closed: unexpected exception key | PASS |
| 48 | fails closed: wrong exception schema | PASS |
| 49 | strict JSON rejects empty | PASS |
| 50 | strict JSON rejects truncated | PASS |
| 51 | strict JSON rejects invalid | PASS |
| 52 | strict JSON rejects duplicate object key | PASS |
| 53 | strict JSON rejects escaped duplicate object key | PASS |
| 54 | strict JSON rejects prototype key | PASS |
| 55 | strict JSON rejects oversized | PASS |
| 56 | strict JSON reads ordinary legitimate audit data | PASS |
| 57 | npm process exit1 is accepted only after complete policy validation | PASS |
| 58 | npm transport failure cannot accept JSON: {"status":null,"error":true} | PASS |
| 59 | npm transport failure cannot accept JSON: {"status":null,"error":false,"signal":"SIGTERM"} | PASS |
| 60 | npm transport failure cannot accept JSON: {"status":2,"error":false} | PASS |
| 61 | npm transport failure cannot accept JSON: {"status":0,"error":false} | PASS |
| 62 | npm transport failure cannot accept JSON: {"status":1,"error":false} | PASS |
| 63 | npm transport failure cannot accept JSON: {"status":1,"error":false} | PASS |
| 64 | expiry boundary is UTC and not controlled by audit JSON | PASS |
| 65 | explicit exception cleanup allows a genuinely clean audit | PASS |
| 66 | CVE raw report and projected native baseline contain exactly reviewed identities | PASS |
| 67 | CVE fails closed: reduced scanner inventory | PASS |
| 68 | CVE fails closed: unexpected error field | PASS |
| 69 | CVE fails closed: advisory summary drift | PASS |
| 70 | CVE fails closed: advisory aliases drift | PASS |
| 71 | CVE fails closed: advisory CVSS drift | PASS |
| 72 | CVE fails closed: alternate override finding | PASS |
| 73 | CVE fails closed: alternate maintenance finding | PASS |
| 74 | CVE fails closed: unsafe source flag | PASS |
| 75 | CVE fails closed: unverifiable source flag | PASS |
| 76 | CVE fails closed: pinned malicious source flag | PASS |
| 77 | CVE fails closed: unknown severity hidden alongside LOW | PASS |
| 78 | CVE fails closed: incomplete | PASS |
| 79 | CVE fails closed: error | PASS |
| 80 | CVE fails closed: detection diagnostic | PASS |
| 81 | CVE fails closed: missing findings | PASS |
| 82 | CVE fails closed: count mismatch | PASS |
| 83 | CVE fails closed: new HIGH id on same package | PASS |
| 84 | CVE fails closed: known id becomes CRITICAL | PASS |
| 85 | CVE fails closed: ancillary LOW becomes HIGH | PASS |
| 86 | CVE fails closed: known id different version | PASS |
| 87 | CVE fails closed: path differs | PASS |
| 88 | CVE fails closed: missing path | PASS |
| 89 | CVE fails closed: unknown package known advisory | PASS |
| 90 | CVE fails closed: stale cluster | PASS |
| 91 | CVE fails closed: unresolved advisory | PASS |
| 92 | native ratchet filtered report accepts an empty complete result | PASS |
| 93 | native ratchet result fails: new HIGH | PASS |
| 94 | native ratchet result fails: known CRITICAL | PASS |
| 95 | native ratchet result fails: incomplete | PASS |
| 96 | native ratchet result fails: missing count | PASS |
| 97 | native ratchet result fails: inventory drift | PASS |
| 98 | native ratchet result fails: error field | PASS |
| 99 | native ratchet result fails: alternate finding | PASS |

The context test additionally mutates new server code, Vite, both manifests, the Functions lock, demo build/Rules packaging helpers, workflow configuration and Dockerfile. Every mutation denies and is confined to temporary copies.

## 6. Live Audit Verification

Fresh before and final audits agree:

| Command | Before (C/H/M/L) | Final (C/H/M/L) | Raw exit |
| --- | --- | --- | --- |
| `npm audit --json` | 0/9/0/0 | 0/9/0/0 | 1 |
| `npm audit --audit-level=high --json` | 0/9/0/0 | 0/9/0/0 | 1 |
| `npm audit --omit=dev --json` | 0/4/0/0 | 0/4/0/0 | 1 |

Nine HIGH package/metavulnerability nodes represent two unique HIGH advisories, not nine independent vulnerabilities. The raw audit remains nonzero; the wrapper does not conceal that fact.

```text
node scripts/validate-npm-audit-exceptions.mjs --run
NPM_AUDIT_EXCEPTION_GATE_PASS mode=live highPackages=9
CURRENT_ROOT_AUDIT_EXCEPTION_VALIDATION=PASS
```

Structured evidence: `audit-before-0/1/2.json` and `audit-final-full/high/prod.json` in the baseline directory. Live advisory data remains time-sensitive.

## 7. Existing CVE Lite Integration

The existing CLI remains the scanner and native baseline matcher; no replacement scanner, dependency or separate conflicting allowlist was added. Its reviewed version is pinned at **1.37.0** for explicit schema compatibility.

Sequence:

1. Verify CLI version and copy only public npm manifest/lock metadata into an owned temporary directory.
2. Run complete unfiltered `cve-lite . --all --json --fail-on high`; strictly validate the two accepted package findings (both transitive) and ancillary LOW.
3. Project the native baseline format from the single reviewed registry (never from arbitrary new findings).
4. Execute the actual CLI again with its native baseline matcher; require exit 0 and a complete filtered result with no HIGH/CRITICAL or unsafe/alternate findings.
5. Remove only that temporary baseline and scan again without suppression; validate full content/severity/path/inventory against the registry.
6. Recheck current context, date and real manifest/lock bytes before reporting success.

Final live result:

```text
node scripts/validate-cve-audit-exceptions.mjs --run
CVE_LITE_EXCEPTION_GATE_PASS version=1.37.0 acceptedPackages=2 nativeRatchet=PASS
```

Final evidence: `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-cve-exception-Y3C3Iv`, with raw-before/native-ratchet/raw-after reports. Actual raw reports contain two package findings; the native filtered report contains zero. The independent reviewer tested existing real raw/filtered reports and rejected summary/aliases/CVSS/schema/inventory/error/alternate-finding mutations.

Existing package scripts `security:audit` and `security:cve` remain byte-identical and strict. Only CI invocation uses the reviewed wrappers. Native baseline matching alone is not sufficient to authorize a changed finding.

## 8. GitHub Actions Review and Regression Evidence

Workflow edits: replace two audit step commands and add the deterministic test step. YAML was parsed using the already cached scanner's YAML dependency; no parser was installed or added to the project. Parsed triggers, permissions, Trivy and Semgrep jobs were compared to the captured original and match exactly.

```text
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO
GITHUB_ACTIONS_TRIGGER_MODEL_CHANGED=NO
PULL_REQUEST_TARGET_USED=NO
OIDC_ADDED=NO
GLOBAL_AUDIT_THRESHOLD_WEAKENED=NO
```

| Command/check | Result |
| --- | --- |
| 99 deterministic tests | PASS |
| Live npm exception wrapper | PASS |
| Live CVE raw/native-ratchet/raw wrapper | PASS |
| `npm run security:hardening` | PASS |
| `npm run security:integrity` | PASS |
| `npm run build` in isolated verification mirror | PASS — 1992 modules; 13.92 s |
| `node --check scripts/validate-npm-audit-exceptions.mjs` | PASS |
| `node --check scripts/validate-cve-audit-exceptions.mjs` | PASS |
| Native import of both typed helper modules | PASS |
| Plain `node --check scripts/lib/auditExceptionPolicy.ts` under local Node 22.21.0 | FAIL — this check path parsed TypeScript as JavaScript; runtime native TS imports and tests pass |
| Parsed workflow syntax/trust comparison | PASS |
| `git diff --check` | PASS |
| All protected dependency/config hashes; 329 pre-existing source/test/script/Rules hashes | PASS; workflow is the sole authorized protected-file change |
| Real GitHub Actions/Linux Node 24 run | NOT RUN — no push authorized |
| Current Trivy / Semgrep scans | NOT RUN — Trivy is not locally available; jobs unchanged |
| Hosted HTTPS/GCS acceptance | NOT RUN — separate authorization required |

The build used a disposable verification mirror and the already prepared clean root install from the accepted dependency phase, not a new resolution. Outputs stayed outside Git. Existing large-chunk and plugin-timing warnings remain; no thresholds were changed.

## 9. Security Review / Integrity

```text
DEPENDENCIES_CHANGED=NO
LOCKFILES_CHANGED=NO
PACKAGE_MANIFESTS_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
FUNCTIONS_SOURCE_CHANGED=NO
TEST_SOURCE_CHANGED=YES_NEW_GATE_TESTS_ONLY
EXISTING_TEST_SOURCE_CHANGED=NO
RULES_CHANGED=NO
FIREBASE_CONFIG_CHANGED=NO
GITHUB_ACTIONS_CHANGED=YES
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO
GITHUB_ACTIONS_TRIGGER_MODEL_CHANGED=NO
NEW_DEPENDENCIES_ADDED=NO
SECRETS_TOUCHED=NO
IAM_CHANGED=NO
FUNCTIONS_DEPLOYED=NO
RULES_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
PRODUCTION_DATA_TOUCHED=NO
PRODUCTION_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
```

Risky modified/new surfaces are only security validation scripts, registry and workflow invocation. No commands from audit suggestion text are executed. No install/postinstall change or source telemetry was introduced. Public package metadata requests are the existing explicitly requested audit/CLI operations, not uploads of application code, private data or environment variables.

Protected hashes:

| File | Baseline SHA-256 | Final SHA-256 |
| --- | --- | --- |
| .github/dependabot.yml | D69D208C3E285E5096467E4C5B90C422B034AEE8CA8233CC60CC2EE3D581BF10 | D69D208C3E285E5096467E4C5B90C422B034AEE8CA8233CC60CC2EE3D581BF10 |
| .github/workflows/security-scan.yml | C5831EEBE3A296A633725547894062CDEF78E0A7D1E8012260108E37042156E3 | 3C04E2A2DA7CEE507F584753BB390D0DB1C201FD40A56EC9D00D762150D69BB1 |
| firebase.json | 3EBF643444C57B4E479F3609436E24704924D57B047917AEB7BBDE384D3EEEA3 | 3EBF643444C57B4E479F3609436E24704924D57B047917AEB7BBDE384D3EEEA3 |
| storage.rules | DED3DC8A5C5FD5C20D583A9EBDD93B9182521C76FF7E427A2604579A388DAB0B | DED3DC8A5C5FD5C20D583A9EBDD93B9182521C76FF7E427A2604579A388DAB0B |
| package-lock.json | 85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438 | 85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438 |
| functions/package-lock.json | C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487 | C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487 |
| package.json | C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E | C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E |
| firestore.demo.rules | 33941DB2170C3BE408D586955AA985B65D54B383E64D9812ADB440FD5A101B49 | 33941DB2170C3BE408D586955AA985B65D54B383E64D9812ADB440FD5A101B49 |
| firestore.rules | DF2F111C1F1B9DE6B874E37A3C2F5A92DF5BCC7D7608DB57F3D0A37CE1456F1F | DF2F111C1F1B9DE6B874E37A3C2F5A92DF5BCC7D7608DB57F3D0A37CE1456F1F |
| storage.demo.rules | BD95635BC59DC8A67F2DA75B6FAFB4449CF7289F82189ED185F07D18EE562C40 | BD95635BC59DC8A67F2DA75B6FAFB4449CF7289F82189ED185F07D18EE562C40 |
| functions/package.json | EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F | EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F |

Independent read-only reviewer:

```text
INDEPENDENT_REVIEW=PASS
CRITICAL_FINDINGS=0
IMPORTANT_FINDINGS=0
MINOR_FINDINGS=0
PREVIOUS_IMPORTANT_FINDINGS_RESOLVED=3
```

Initial FAIL identified (1) partial/erroneous CVE reports, (2) advisory content drift, (3) missing executable build/context inputs. All were fixed with regression evidence and independently retested. The reviewer made no checkout edits, live audits, installs or cloud calls. Reviewer PASS is bounded to this mechanism, not release/merge approval.

## 10. Remaining Risks

- Review is mandatory by 2026-11-03 UTC; expiry blocks even unchanged accepted findings.
- Advisory content, npm/CVE schema, registry availability or graph/context drift can intentionally fail CI. No automatic fingerprint renewal is provided.
- HIGH packages remain installed; accepted exposure evidence is not a patch.
- Full Actions status is **unverified**, particularly existing Trivy and Linux runner behavior. The local `CI_SECURITY_GATE=PASS` below refers to the implemented npm/CVE exception gate and deterministic/security/build checks, not a remotely completed multi-job workflow.
- Real hosted release and real GCS qualification remain separate; no demo readiness marker is issued.
- The accepted Functions report retains six MODERATE Storage/uuid-chain nodes; that prior disposition is unchanged and was not rescanned/remediated here.
- npm/CVE auditing relies on upstream registry/advisory services and the existing scanner's completeness claims. Strict inventory/schema checks detect accidental partial output, not a malicious scanner fabricating a valid audit. A pinned CLI package and read-only metadata inputs do not replace supply-chain review.
- Source-context fingerprints are deliberately conservative. Even harmless workflow/build edits require review; do not bypass the guard or auto-recapture hashes to make CI green.

## 11. Bounded Rollback

Do not use broad reset/clean/stash/restore operations.

1. Save current phase files for review in a new explicitly named local archive directory.
2. Restore **only** `.github/workflows/security-scan.yml` from `C:/Users/Spyros/AppData/Local/Temp/shiftoryx-ci-gate-ef027c363bfa4753b885693a0a249466/security-scan.before.yml`, after verifying that backup SHA-256 is `C5831EEBE3A296A633725547894062CDEF78E0A7D1E8012260108E37042156E3`.
3. Verify the restored workflow SHA-256 matches that same value.
4. Move only the ten explicitly listed new gate/registry/test/report files above to the archive. Do not recursively remove `scripts`, `security`, `docs`, the worktree or any inherited file. There are nine new implementation/test/registry files plus this report; the workflow is existing.
5. Recompare protected hashes and the captured inherited status/snapshot. Raw npm/CVE audit commands will again fail on the still-installed HIGH advisories; that is expected strict baseline behavior.

The original workflow byte backup, rather than a broad Git checkout, preserves the exact pre-phase file. Rollback has not been executed.

## 12. Final Gate

```text
CI_EXCEPTION_GATE_IMPLEMENTATION_COMPLETE=YES

FIREBASE_GRPC_EXCEPTION_ENFORCED=YES
TAILWIND_BRACES_EXCEPTION_ENFORCED=YES

NEW_HIGH_FAILS_CI=YES
NEW_CRITICAL_FAILS_CI=YES
UNKNOWN_HIGH_FAILS_CI=YES
EXPIRED_EXCEPTION_FAILS_CI=YES
PACKAGE_VERSION_DRIFT_FAILS_CI=YES
PACKAGE_PATH_DRIFT_FAILS_CI=YES
AUDIT_SCHEMA_FAILURE_FAILS_CI=YES
AUDIT_UNAVAILABLE_FAILS_CI=YES

GLOBAL_HIGH_THRESHOLD_WEAKENED=NO
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO

CURRENT_ROOT_AUDIT_EXCEPTION_VALIDATION=PASS
CI_SECURITY_GATE=PASS

HOSTED_RELEASE_GATE=NOT_STARTED
PUBLIC_DEMO_RELEASE_READY=NO

NEXT_ACTION=Human review of the CI exception gate followed by a separately approved hosted-release readiness phase
```
