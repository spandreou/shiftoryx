# Public Demo Root Patchable Dependency Remediation

Date: 2026-10-03

## 1. Baseline and scope

This phase refreshed only the five approved patchable root dependency nodes. The accepted Functions remediation, inherited public-demo work, application/test source, configuration, Rules and GitHub Actions were preserved.

Only intended repository deltas:

- `package-lock.json`
- `docs/PUBLIC_DEMO_ROOT_PATCHABLE_DEPENDENCY_REMEDIATION.md`

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_STATUS=INHERITED_DIRTY_AND_UNTRACKED_BASELINE_PRESERVED
NODE_VERSION=22.21.0
NPM_VERSION=10.9.4
ROOT_CRITICAL_BEFORE=0
ROOT_HIGH_BEFORE=9
ROOT_MODERATE_BEFORE=4
ROOT_LOW_BEFORE=1
NEW_CRITICAL_ADVISORY=NO
NEW_HIGH_ADVISORY=NO
```

Two independent npm projects were identified: root and Functions. Fresh root audits matched the historical full-audit counts. Production-only baseline was 0 Critical / 4 High / 3 Moderate / 0 Low. npm audit counts refer to affected package nodes, not unique advisories.

The pre-phase root lockfile was backed up before any mutation. Baseline status and SHA-256 snapshots for 329 source/test/script/Rules files and 13 protected files were retained outside Git at:

`C:\Users\Spyros\AppData\Local\Temp\shiftoryx-root-patches-faa7066599f04fc3b0813f1c5b4e2163\baseline.json`

## 2. Dependency resolution and existing ranges

| Package | Before | Final after | Dependency chain | Existing parent range(s) | Allowed |
| --- | --- | --- | --- | --- | --- |
| DOMPurify | 3.4.11 | 3.4.16 | jsPDF 4.2.1 -> DOMPurify | jsPDF optional dependency: ^3.3.1 | YES |
| fflate | 0.8.2 | 0.8.3 | jsPDF 4.2.1 -> fflate | ^0.8.1 | YES |
| PostCSS | 8.5.18 | 8.5.23 | root dev dependency; Tailwind 3.4.19; Vite 8.0.16 | root ^8.5.18; Tailwind ^8.4.47; Vite ^8.5.15 | YES |
| postcss-selector-parser | 6.1.2 | 6.1.3 | Tailwind 3.4.19 directly and through postcss-nested 6.2.0 | Tailwind ^6.1.2; postcss-nested ^6.1.1 | YES |
| protobufjs | 7.6.4 | 7.6.5 | Firebase 11.10.0 -> Firestore 4.8.0 -> proto-loader 0.7.15 -> protobufjs; also via grpc-js 1.9.16 | proto-loader ^7.2.5 | YES |

All five final versions satisfy the existing root manifest/parent ranges. No manifest minimum, override, forced resolution, package replacement or parent upgrade was needed.

```text
PACKAGE=dompurify
BEFORE=3.4.11
AFTER=3.4.16
DEPENDENCY_CHAIN=jspdf@4.2.1 -> dompurify
PARENT_RANGE=^3.3.1
EXISTING_RANGE_ALLOWED_UPDATE=YES
SAFE_VERSION_ALLOWED_BY_EXISTING_RANGE=YES

PACKAGE=fflate
BEFORE=0.8.2
AFTER=0.8.3
DEPENDENCY_CHAIN=jspdf@4.2.1 -> fflate
PARENT_RANGE=^0.8.1
EXISTING_RANGE_ALLOWED_UPDATE=YES
SAFE_VERSION_ALLOWED_BY_EXISTING_RANGE=YES

PACKAGE=postcss
BEFORE=8.5.18
AFTER=8.5.23
DEPENDENCY_CHAIN=root dev; tailwindcss@3.4.19; vite@8.0.16
PARENT_RANGE=^8.5.18; ^8.4.47; ^8.5.15
EXISTING_RANGE_ALLOWED_UPDATE=YES
SAFE_VERSION_ALLOWED_BY_EXISTING_RANGE=YES

PACKAGE=postcss-selector-parser
BEFORE=6.1.2
AFTER=6.1.3
DEPENDENCY_CHAIN=tailwindcss@3.4.19 -> postcss-nested@6.2.0 -> postcss-selector-parser; tailwind direct
PARENT_RANGE=^6.1.1; ^6.1.2
EXISTING_RANGE_ALLOWED_UPDATE=YES
SAFE_VERSION_ALLOWED_BY_EXISTING_RANGE=YES

PACKAGE=protobufjs
BEFORE=7.6.4
AFTER=7.6.5
DEPENDENCY_CHAIN=firebase@11.10.0 -> @firebase/firestore@4.8.0 -> @grpc/proto-loader@0.7.15 -> protobufjs; also grpc-js parent
PARENT_RANGE=^7.2.5
EXISTING_RANGE_ALLOWED_UPDATE=YES
SAFE_VERSION_ALLOWED_BY_EXISTING_RANGE=YES
```

### DOMPurify correction based on fresh evidence

The originally specified 3.4.13 removed the original MODERATE/LOW findings, but the intermediate audit exposed LOW [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p), affecting 3.4.13–3.4.15 and patched in 3.4.16. It was absent from the original installed-state audit because 3.4.11 lies outside that advisory's range; this is not evidence that the advisory was newly published during execution.

The final same-package patch was advanced to 3.4.16 within jsPDF's unchanged ^3.3.1 range. The affected IN_PLACE/node-removing-hook API is not used by ShiftOryx. No source compatibility change was introduced. The final audit removes this newly observed finding as well as both original DOMPurify findings.

### Package-manager procedure

A generic targeted npm update was rehearsed only in a disposable directory. It selected newer patches than the stated targets. A second no-save rehearsal produced no lockfile update. Neither rehearsal changed the repository.

The accepted exact-resolution procedure used official npm operations in isolated staging:

```powershell
npm install --package-lock-only --ignore-scripts --no-audit --fund=false --save-exact dompurify@3.4.13 fflate@0.8.3 postcss@8.5.23 postcss-selector-parser@6.1.3 protobufjs@7.6.5
# Restore only the staging manifest from the exact original manifest copy.
npm install --package-lock-only --ignore-scripts --no-audit --fund=false
```

After detecting the additional DOMPurify advisory, the same staging method selected DOMPurify 3.4.16, then reconciled with the exact original manifest again.

The temporary version-selection manifest existed only outside Git. The canonical final lockfile's root metadata matches the original repository manifest and contains no added direct dependencies. The complete reviewed npm-generated artifact was copied to the exact root lockfile target, followed by the same package-lock-only npm validation in the real root. The repository manifest was never modified; no lockfile JSON was manually edited.

## 3. Complete lockfile delta

| Package node | Before | After | Classification | Reason |
| --- | --- | --- | --- | --- |
| node_modules/dompurify | 3.4.11 | 3.4.16 | APPROVED_SECURITY_TARGET | Original MODERATE/LOW fixes plus the 3.4.13–3.4.15 LOW fix |
| node_modules/fflate | 0.8.2 | 0.8.3 | APPROVED_SECURITY_TARGET | GHSA-px8p-9vwx-vf98 |
| node_modules/postcss | 8.5.18 | 8.5.23 | APPROVED_SECURITY_TARGET | GHSA-fxqj-rqcc-2cmp |
| node_modules/postcss-selector-parser | 6.1.2 | 6.1.3 | APPROVED_SECURITY_TARGET | GHSA-w9m9-85wc-3x92 |
| node_modules/protobufjs | 7.6.4 | 7.6.5 | APPROVED_SECURITY_TARGET | GHSA-j3f2-48v5-ccww |

Each node changed version/resolved/integrity. PostCSS additionally changed its published nanoid dependency declaration from ^3.3.12 to ^3.3.16: REQUIRED_TRANSITIVE_METADATA. Resolved nanoid 3.3.18 already satisfies that range and remained unchanged.

There are five changed package nodes, 16 changed JSON leaves and 16 insertions/16 deletions. Package node count remained 290; no package was added or removed. Root metadata and every other package entry remained unchanged.

```text
UNEXPECTED_LOCKFILE_CHANGES=0
ROOT_PACKAGE_JSON_CHANGED=NO
FUNCTIONS_PACKAGE_JSON_CHANGED=NO
FUNCTIONS_LOCKFILE_CHANGED=NO
```

## 4. Audit results

Fresh final audits were rerun after functional verification:

| Command | Before C/H/M/L | Final C/H/M/L | Exit | Disposition |
| --- | --- | --- | --- | --- |
| npm audit --json | 0 / 9 / 4 / 1 | 0 / 9 / 0 / 0 | 1 | Known deferred HIGH nodes only |
| npm audit --omit=dev --json | 0 / 4 / 3 / 0 | 0 / 4 / 0 / 0 | 1 | Known Firebase/gRPC HIGH nodes only |
| npm audit --audit-level=high --json | Not separately measured before | 0 / 9 / 0 / 0 | 1 | Existing HIGH policy remains red and unchanged |

```text
ROOT_CRITICAL_AFTER=0
ROOT_HIGH_AFTER=9
ROOT_MODERATE_AFTER=0
ROOT_LOW_AFTER=0
DOMPURIFY_FINDING_FIXED=YES
FFLATE_FINDING_FIXED=YES
POSTCSS_FINDING_FIXED=YES
SELECTOR_PARSER_FINDING_FIXED=YES
PROTOBUFJS_FINDING_FIXED=YES
```

The intermediate 3.4.13 audit was 9 HIGH / 0 MODERATE / 1 LOW. Advancing only DOMPurify to 3.4.16 removed that LOW finding. No new HIGH or Critical finding was observed. The npm HIGH audit policy was neither weakened nor suppressed.

## 5. Regression evidence

All dependency-sensitive tests used a clean disposable npm-ci installation of the final lockfile. The repository node_modules junction was untouched. The verification mirror used the accepted clean Functions installation without resolving Functions dependencies again.

Generated frontend, renderer, Functions and demo Rules outputs were produced only in the temporary mirror or test output directories. The server renderer was rebuilt there with fflate 0.8.3 before PDF tests.

| Command/suite | Final result | Exact evidence |
| --- | --- | --- |
| npm ci --no-audit --fund=false | PASS | Clean final root install; 233 platform-applicable packages |
| node scripts/build-public-demo.mjs --renderer-only | PASS | Local server renderer rebuilt from updated root dependencies |
| node scripts/build-public-demo.mjs | PASS | Temporary demo Functions/Rules generated |
| npm run build | PASS | 1,992 modules; normal Vite production build |
| npm run test:scheduler-contract-v2 | PASS | 2,118 tests; 0 invariant failures |
| npm run test:scheduler-contract-v3 | PASS | Engine 304; services 17; corrective 8; profiles 6/185 assertions; create/export 71 assertions; large-staff 151/126,730 assertions |
| npm run qa:scheduler-engine | PASS | Existing engine stress QA |
| npm run qa:scheduler | PASS | Scheduler/legacy-role/export regressions and another production build |
| npm run qa:repositories | PASS | Repository boundary checks |
| npm run qa:public-readonly | PASS | Public read-only tenant checks |
| npm run qa:tenant-authorization | PASS | Tenant authorization checks |
| npm run qa:auth-broker | PASS | Auth broker validation |
| npm run qa:auth-broker-negative | PASS | 16 negative auth/origin/ticket checks |
| npm run qa:central-portal-isolation | PASS | Host resolution and component isolation |
| npm run qa:export-security | PASS | Export audit/security checks |
| npm run security:hardening | PASS | Existing hardening checks |
| npm run security:integrity | PASS | Firestore integrity checks |
| node scripts/test-public-demo-policy.mjs | PASS | 75 checks |
| node scripts/test-demo-package-guard.mjs | PASS | Wrong project rejected; normal/demo Rules and runtime flags separated |
| node scripts/test-public-demo-client-transport.mjs | PASS | 24 client/retry/download checks |
| node scripts/test-public-demo-pdf-http.mjs | PASS | 9 HTTP request-policy checks |
| node scripts/test-public-demo-pdf-policy.mjs | PASS | 186 passed / 0 failed; deterministic real PDF bytes and immutable v1/v2 |
| Existing run-scheduler-v3-emulator.mjs through installed Firebase CLI | PASS | 89 negative profile writes, 13 controls, 100-profile batch/101 rejection, 182 invalid shifts, transactions/version allocation/PDF/OWNER/public isolation |
| node qa/public-demo/verify.mjs settings | PASS | Typed atomic settings/profiles; 54 malformed direct-write denials |
| node qa/public-demo/verify.mjs isolation | PASS | 255 checks; all 12 ordered foreign pairs; reset cleanup and foreign preservation |
| node qa/public-demo/verify.mjs typed-isolation | PASS | 48 foreign attempts; 0 mutations |
| node qa/public-demo/verify.mjs pdf | PASS | 44 server checks; 12 pairs; exact bytes, HTTP headers, immutability, quotas and direct Storage denial |
| node qa/public-demo/verify.mjs typed | PASS | Typed endpoint/449-shift atomic transaction; foreign Origin denied |
| node qa/public-demo/verify.mjs pdf-browser | PASS, final third attempt | 57 checks; 12 ordered pairs; all four WEEK/MONTH flows, real browser PDF downloads, v1/v2 immutability, bounded errors/retries, reset/history/old PDF invalidation and re-entry |
| git diff --check -- package-lock.json | PASS | No whitespace errors |

The fresh runner starts a separate local demo runtime for every named stateful suite. Actual batch commands and outcomes included:

```powershell
node qa/public-demo/verify.mjs settings pdf-browser isolation typed-isolation pdf typed
# This first batch stopped at its failed browser attempt; only settings completed.
node qa/public-demo/verify.mjs pdf-browser isolation typed-isolation pdf typed
# The second batch also stopped at its browser failure.
node qa/public-demo/verify.mjs isolation typed-isolation pdf typed pdf-browser
# All five suites completed, exit 0.
```

QA_FIREBASE_CLI pointed to the existing installed CLI; no Firebase CLI package or browser binary was added. Playwright 1.59.1 used the already installed Chromium 1217.

### Failed attempts and classification

Failures were retained as failures, not substituted with unrelated GREEN checks:

- Initial auth/export/hardening/integrity static runs: FAIL / ENVIRONMENTAL. The temporary mirror omitted .env.example, vercel.json, README.md and SECURITY.md. Copying the unchanged required files resolved the same suites; no assertion or source edit occurred. Only the empty public .env.example template was copied, never production .env files.
- Initial package guard positive control: FAIL / ENVIRONMENTAL. The same omitted vercel.json prevented package completion. Wrong-project rejection already passed; after copying the existing file the complete unchanged guard passed.
- Initial normal Rules harness: FAIL / ENVIRONMENTAL. Ports 8207/9271 were occupied before its Firestore emulator could start. The existing process was preserved. The unchanged run-scheduler-v3-emulator.mjs suite then passed with a separate temporary loopback-only config using free ports 60021–60026 and project demo-shiftoryx-v3. No Rules or test source changed.
- Browser attempt 1: FAIL. Firebase CLI/emulator terminated unexpectedly; Café PDF download timed out. The remaining orphan Java child was verified against the exact failed runtime's process ancestry/project/mirror path and stopped.
- Browser attempt 2: FAIL. A local proxy request failed before the next Salon landing loaded; the failure screenshot was blank. All four WEEK/MONTH/PDF flows and 12 foreign pairs had completed, but the full suite did not pass.
- Browser attempt 3: PASS, unchanged assertions/timeouts/dependencies. All 57 checks completed on a fresh runtime. The first two failures are classified as observed local transport/runtime instability; their underlying intermittency was not repaired in this phase and remains an operational QA risk.

No dependency behavioral regression requiring application/test compatibility changes was demonstrated.

```text
ROOT_BUILD=PASS
PDF_REGRESSION=PASS
FIREBASE_BROWSER_REGRESSION=PASS
ROOT_REGRESSION_GATE=PASS
SOURCE_CHANGE_REQUIRED=NO
```

The known >500-kB chunk warning remains: largest chunks are approximately 636.48, 708.72, 1,394.66 and 1,496.07 kB, matching the previously observed sizes. The DOMPurify chunk is now 28.07 kB and CSS 74.16 kB. A cold build also printed a plugin-timing advisory; the subsequent build completed in 2.58 seconds with the usual large-chunk warning. No warning threshold/configuration was changed.

### Local browser evidence

Successful final evidence directory:

`C:\Users\Spyros\AppData\Local\Temp\shiftoryx-pdf-browser-vjeu7R`

It contains results.json, four fictional v1 PDFs and four MONTH screenshots. Browser URLs were fulfilled from loopback Vite/emulators. These are local real-browser tests, not hosted HTTPS acceptance.

## 6. Security review and integrity

```text
DEPENDENCIES_CHANGED=YES (five root resolutions only)
DEPENDENCY_MANIFESTS_CHANGED=NO
ROOT_PACKAGE_JSON_CHANGED=NO
ROOT_LOCKFILE_CHANGED=YES
FUNCTIONS_PACKAGE_JSON_CHANGED=NO
FUNCTIONS_LOCKFILE_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
TEST_SOURCE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
FIREBASE_CONFIG_CHANGED=NO
FIRESTORE_RULES_CHANGED=NO
STORAGE_RULES_CHANGED=NO
SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
PRODUCTION_DATA_TOUCHED=NO
PRODUCTION_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
```

The accepted Functions lock remains byte-identical with SHA-256 C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487. Its approved resolutions remain Busboy 3.2.2, grpc-js 1.14.5, brace-expansion 2.1.7 and qs 6.16.0. Functions dependency resolution was not rerun.

Only the root resolution lockfile is a changed supply-chain artifact. No package/native dependency was added. protobufjs retains its existing postinstall script; inspection found only version-scheme/local-manifest checks. No new project telemetry, lifecycle hook or executable application capability was introduced.

### Protected hashes

| File | SHA-256 before and after unless noted |
| --- | --- |
| firestore.demo.rules | 33941DB2170C3BE408D586955AA985B65D54B383E64D9812ADB440FD5A101B49 |
| firebase.json | 3EBF643444C57B4E479F3609436E24704924D57B047917AEB7BBDE384D3EEEA3 |
| functions/package.json | EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F |
| .github/dependabot.yml | D69D208C3E285E5096467E4C5B90C422B034AEE8CA8233CC60CC2EE3D581BF10 |
| storage.rules | DED3DC8A5C5FD5C20D583A9EBDD93B9182521C76FF7E427A2604579A388DAB0B |
| functions/package-lock.json | C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487 |
| .github/workflows/security-scan.yml | C5831EEBE3A296A633725547894062CDEF78E0A7D1E8012260108E37042156E3 |
| docs/PUBLIC_DEMO_DEPENDENCY_SECURITY_REVIEW.md | 7956A809D81526F1B43390373AF935308CFDDD027FAAFFE51DB7FF77655AC753 |
| package.json | C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E |
| docs/PUBLIC_DEMO_FUNCTIONS_DEPENDENCY_REMEDIATION.md | 41DA3BAB0F7EE1F1BAF29EF48C68F5534354312D2BA7ED05AA8325640C4DEACA |
| firestore.rules | DF2F111C1F1B9DE6B874E37A3C2F5A92DF5BCC7D7608DB57F3D0A37CE1456F1F |
| storage.demo.rules | BD95635BC59DC8A67F2DA75B6FAFB4449CF7289F82189ED185F07D18EE562C40 |
| package-lock.json before | 3F5C5E927E9DAA89840A60699C1846BE5F494605E6B054B6D99BFC9A7672F563 |
| package-lock.json after | 85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438 |

The 329 source/test/script/Rules hashes have zero changes. No inherited status entry was removed. Relative to the phase baseline, only the root lockfile modification and this new report are added.

Independent read-only review: PASS for the dependency delta, with zero Critical or Important findings. Two documentation-only Minor findings (rollback line endings and batch-outcome wording) were corrected in this report. The reviewer independently verified the five-node diff, compatible parent ranges, official package integrity metadata, all protected/source hashes, and the browser receipt's 57 PASS results / 12 pairs / zero application Storage traffic. Functional suites were not independently rerun; this is no merge or release approval.

## 7. Remaining HIGH findings and limits

Nine root HIGH package nodes remain unchanged:

- Firebase 11.10.0, Firestore 4.8.0, Firestore compat 0.3.53 and grpc-js 1.9.16 derive from GHSA-m9gg-hp2v-232j. The prior disposition remains: gRPC server code is not part of the production browser artifact and ShiftOryx does not authorize a gRPC server from getAuthContext. No Firebase upgrade/downgrade or gRPC override was introduced.
- Tailwind 3.4.19, chokidar 3.6.0, fast-glob 3.3.3, micromatch 4.0.8 and braces 3.0.3 derive from GHSA-vfj7-8cjw-p6xm. The prior build-only/trusted-input disposition remains. No Tailwind migration, forced brace version or advisory suppression was performed.

The root HIGH/CI gate remains pending. Functions' accepted six MODERATE Storage/uuid nodes remain a separate unchanged disposition. Audits are time-sensitive and must be repeated at later gates.

Local emulator/browser transport showed intermittency in the first two full-browser attempts. The final unchanged suite passed, but that does not certify hosted reliability. Real GCS generation fidelity and hosted acceptance were not rerun.

Inherited checked-in generated Functions/renderer files were deliberately preserved. Updated renderer and package behavior were validated in the temporary build only. A later separately authorized release must generate and review deployment artifacts from the accepted dependency inputs; this phase does not claim an existing hosted or embedded artifact has already been replaced.

## 8. Bounded rollback

No rollback was executed.

1. Resolve only the exact target: C:\Users\Spyros\.codex\worktrees\shiftoryx-public-demo\package-lock.json. Require current SHA-256 85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438; stop on drift.
2. Verify the complete pre-phase backup at C:\Users\Spyros\AppData\Local\Temp\shiftoryx-root-patches-faa7066599f04fc3b0813f1c5b4e2163\package-lock.before.json has SHA-256 3F5C5E927E9DAA89840A60699C1846BE5F494605E6B054B6D99BFC9A7672F563.
3. Restore only that complete verified root lockfile artifact to the exact target. Do not manually edit entries or re-resolve dependencies; do not touch Functions, manifests or inherited work.
4. Recheck protected/source hashes and baseline status. Record that the root patches were rolled back and that their original advisories return. Retain the report as the audit trail.

If the temporary backup is unavailable, recover the original blob from b23d6bd2d575d6e1680c848c91325c0ad392d8bd:package-lock.json into a separate recovery file. The raw Git blob uses LF (SHA-256 16549E91B12BB8C2DCEA5C41C8E6BD333FBB84D59B3288A61EBDDA5F90522ECD), whereas the captured pre-phase checkout uses CRLF. Recreate that checkout representation as UTF-8 without BOM with CRLF line endings, without editing JSON entries, then require the exact original SHA-256 3F5C5E927E9DAA89840A60699C1846BE5F494605E6B054B6D99BFC9A7672F563 before replacing the target. Stop if the hash differs. No broad Git reset/clean/stash/restore operation or cloud rollback is part of this procedure.

## 9. Final gate

```text
ROOT_PATCHABLE_DEPENDENCY_REMEDIATION_COMPLETE=YES
UNEXPECTED_LOCKFILE_CHANGES=0

DOMPURIFY_FINDING_FIXED=YES
FFLATE_FINDING_FIXED=YES
POSTCSS_FINDING_FIXED=YES
SELECTOR_PARSER_FINDING_FIXED=YES
PROTOBUFJS_FINDING_FIXED=YES

ROOT_REGRESSION_GATE=PASS
ROOT_PATCHABLE_DEPENDENCY_SECURITY_GATE=PASS

ROOT_HIGH_GATE=STILL_PENDING
CI_AUDIT_GATE=STILL_PENDING
HOSTED_RELEASE_GATE=NOT_STARTED

PUBLIC_DEMO_RELEASE_READY=NO

NEXT_ACTION=Human review followed by a separate explicit root-HIGH/CI-gate disposition phase
```
