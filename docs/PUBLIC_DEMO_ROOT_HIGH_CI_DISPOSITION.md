# ShiftOryx Public Demo — Root HIGH / CI Security Gate Disposition

Review date: 2026-10-03

Scope: read-only security and release-policy review of the accepted root dependency state on function raw() { [native code] }`codex/public-shiftoryx-demo`function raw() { [native code] }. This report is the only intended repository change. No exception, override, dependency, workflow or deployment change was implemented.

## 1. Executive summary

function raw() { [native code] }```textfunction raw() { [native code] }
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_STATUS=INHERITED_DIRTY_AND_UNTRACKED_BASELINE_PRESERVED

ROOT_CRITICAL=0
ROOT_HIGH=9
ROOT_MODERATE=0
ROOT_LOW=0

UNIQUE_ROOT_HIGH_ADVISORIES=2
PUBLIC_INPUT_REACHABLE_HIGH=0
PRODUCTION_RUNTIME_REACHABLE_HIGH=0
BUILD_ONLY_HIGH=1
NEW_SECURITY_FINDING_REQUIRES_REVIEW=NO
function raw() { [native code] }```function raw() { [native code] }

The reachability counts above are unique-advisory counts. npm reports nine HIGH package nodes because two direct advisories propagate through their parent/metavulnerability nodes:

- function raw() { [native code] }`GHSA-m9gg-hp2v-232j`function raw() { [native code] } -> four npm nodes: function raw() { [native code] }`firebase`function raw() { [native code] }, function raw() { [native code] }`@firebase/firestore`function raw() { [native code] }, function raw() { [native code] }`@firebase/firestore-compat`function raw() { [native code] }, function raw() { [native code] }`@grpc/grpc-js`function raw() { [native code] }.
- function raw() { [native code] }`GHSA-vfj7-8cjw-p6xm`function raw() { [native code] } -> five npm nodes: function raw() { [native code] }`tailwindcss`function raw() { [native code] }, function raw() { [native code] }`chokidar`function raw() { [native code] }, function raw() { [native code] }`fast-glob`function raw() { [native code] }, function raw() { [native code] }`micromatch`function raw() { [native code] }, function raw() { [native code] }`braces`function raw() { [native code] }.

Static triage verdicts for the current supported product surface:

| Input finding | Triage verdict | Confidence | Current surface |
| --- | --- | --- | --- |
| GHSA-m9gg-hp2v-232j | function raw() { [native code] }`not_actionable`function raw() { [native code] } for the browser deployment | High | Vulnerable gRPC server API absent from the production browser artifact and ShiftOryx server code |
| GHSA-vfj7-8cjw-p6xm | function raw() { [native code] }`not_actionable`function raw() { [native code] } for production runtime | High | Development/build-only path with repository-controlled patterns |

Release/security disposition:

function raw() { [native code] }```textfunction raw() { [native code] }
FIREBASE_GRPC_DISPOSITION=ACCEPT_TEMPORARILY_WITH_EXCEPTION
TAILWIND_BRACES_DISPOSITION=WAIT_FOR_UPSTREAM_NON_BLOCKING
ROOT_HIGH_SECURITY_GATE=PASS_WITH_EXPLICIT_EXCEPTIONS
CI_GATE_STRATEGY=ADVISORY_SPECIFIC_EXCEPTION_RECOMMENDED
function raw() { [native code] }```function raw() { [native code] }

These are recommendations pending human acceptance and implementation. The current raw npm-audit and CVE Lite gates remain red. Project Guardian decision: function raw() { [native code] }`NOT_READY`function raw() { [native code] } because the recommended CI policy has not been implemented and the hosted release gate has not started.

## 2. Cluster A — Firebase / Firestore / gRPC

### Dependency and affected behavior

function raw() { [native code] }```textfunction raw() { [native code] }
root
└── firebase@11.10.0
    ├── @firebase/firestore@4.8.0
    │   └── @grpc/grpc-js@1.9.16
    └── @firebase/firestore-compat@0.3.53
        └── @firebase/firestore@4.8.0
            └── @grpc/grpc-js@1.9.16
function raw() { [native code] }```function raw() { [native code] }

Firestore declares function raw() { [native code] }`@grpc/grpc-js: ~1.9.0`function raw() { [native code] }. GHSA-m9gg-hp2v-232j affects versions below 1.13.6 and 1.14.0 through 1.14.4. The defect requires a gRPC server configured with optional client certificates (function raw() { [native code] }`requireClientCertificate: false`function raw() { [native code] }) and an authorization decision based on function raw() { [native code] }`getAuthContext()`function raw() { [native code] }. Patched versions are 1.13.6 and 1.14.5.

Primary advisory: [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j).

### Source, control, sink and boundary

function raw() { [native code] }```textfunction raw() { [native code] }
Public/authenticated browser data
→ ShiftOryx imports firebase/firestore
→ Vite resolves @firebase/firestore browser export
→ Firestore WebChannel/browser implementation
→ no gRPC server / ServerCredentials / getAuthContext sink
function raw() { [native code] }```function raw() { [native code] }

- Product surface: browser SPA.
- Source trust: public and authenticated tenant inputs reach normal Firebase browser APIs.
- Vulnerable sink: gRPC server certificate authorization context.
- Control/boundary evidence: package exports select function raw() { [native code] }`dist/index.esm2017.js`function raw() { [native code] } for function raw() { [native code] }`browser`function raw() { [native code] }; only the Node entry function raw() { [native code] }`dist/index.node.mjs`function raw() { [native code] } imports function raw() { [native code] }`@grpc/grpc-js`function raw() { [native code] }.
- Repository searches found no ShiftOryx use of function raw() { [native code] }`ServerCredentials`function raw() { [native code] }, function raw() { [native code] }`getAuthContext`function raw() { [native code] }, function raw() { [native code] }`requireClientCertificate`function raw() { [native code] } or function raw() { [native code] }`grpc.Server`function raw() { [native code] }.

### Production artifact evidence

A clean disposable install and Vite 8 production build completed on 2026-10-03:

- 1,992 modules transformed.
- Manifest: function raw() { [native code] }`C:/Users/Spyros/AppData/Local/Temp/shiftoryx-high-ci-e1bdecce89854d3ebaf40cfec48f8e67/dist/.vite/manifest.json`function raw() { [native code] }, SHA-256 function raw() { [native code] }`ECC443A61905BE1B9B0452616F77A28D2A70A19DDFCBCA491EF5E358E2D7209B`function raw() { [native code] }.
- Firebase chunk: function raw() { [native code] }`assets/firebase-DhiNRpdE.js`function raw() { [native code] }, SHA-256 function raw() { [native code] }`1352376264C5E93F90D91A07B029D1346BC2EA6C45364AC806912688CBF30774`function raw() { [native code] }.
- No built file contained function raw() { [native code] }`@grpc/grpc-js`function raw() { [native code] }, function raw() { [native code] }`ServerCredentials`function raw() { [native code] }, function raw() { [native code] }`getAuthContext`function raw() { [native code] }, function raw() { [native code] }`requireClientCertificate`function raw() { [native code] } or function raw() { [native code] }`grpc.Server`function raw() { [native code] }.
- The Vite manifest includes the Firebase browser chunk but no gRPC module.
- A text search is corroborated by Firebase/Firestore conditional exports and the explicit gRPC import in the Node entry only.

Therefore:

function raw() { [native code] }```textfunction raw() { [native code] }
LOCKFILE_PRESENT=YES
PRODUCTION_ARTIFACT_PRESENT=NO
RUNTIME_REACHABILITY=NOT_REACHABLE
PUBLIC_INPUT_REACHABLE=NO
AUTHENTICATED_INPUT_REACHABLE=NO
function raw() { [native code] }```function raw() { [native code] }

Root Node-side test/emulator tooling can select the Node entry, but no repository code creates a gRPC server or performs certificate authorization. This does not create the advisory's required source-to-sink path.

### Functions boundary

The separately packaged Functions project resolves function raw() { [native code] }`@grpc/grpc-js@1.14.5`function raw() { [native code] }, SHA-protected by the accepted Functions remediation. Its lockfile is independent from the root lockfile and already contains the patched version.

### Exploit prerequisites

Exploitation would require all of the following, none of which exists in the reviewed product:

1. A ShiftOryx-owned gRPC server.
2. function raw() { [native code] }`ServerCredentials`function raw() { [native code] } configured with optional client certificates.
3. Attacker-supplied unauthorized certificates reaching that server.
4. ShiftOryx authorization based on function raw() { [native code] }`getAuthContext()`function raw() { [native code] }.
5. The root Node gRPC branch packaged into that server.

### Recommendation

Release disposition: function raw() { [native code] }`ACCEPT_TEMPORARILY_WITH_EXCEPTION`function raw() { [native code] }.

The installed vulnerable package remains a supply-chain fact and could become relevant if architecture changes. An explicit, expiring advisory exception is therefore safer than silently declaring the package harmless.

## 3. Cluster B — Tailwind / braces

### Dependency and affected behavior

function raw() { [native code] }```textfunction raw() { [native code] }
root devDependency tailwindcss@3.4.19
├── chokidar@3.6.0
│   └── braces@3.0.3
├── micromatch@4.0.8
│   └── braces@3.0.3
└── fast-glob@3.3.3
    └── micromatch@4.0.8
        └── braces@3.0.3
function raw() { [native code] }```function raw() { [native code] }

GHSA-vfj7-8cjw-p6xm affects every published function raw() { [native code] }`braces`function raw() { [native code] } release through 3.0.3. Deeply nested patterns can exhaust the Node stack. The current npm latest remains 3.0.3 and the advisory lists no patched version.

Primary advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

### Source, control, sink and boundary

function raw() { [native code] }```textfunction raw() { [native code] }
Repository-controlled Tailwind content config
→ Tailwind/PostCSS build
→ chokidar or micromatch/fast-glob
→ braces recursive parser
function raw() { [native code] }```function raw() { [native code] }

Current inputs are fixed in function raw() { [native code] }`tailwind.config.js`function raw() { [native code] }:

function raw() { [native code] }```textfunction raw() { [native code] }
./index.html
./src/**/*.{js,jsx}
function raw() { [native code] }```function raw() { [native code] }

- Product surface: local/CI frontend build.
- Source trust: repository/developer configuration.
- Sink: recursive braces parsing during build tooling.
- function raw() { [native code] }`npm audit --omit=dev`function raw() { [native code] } removes all five propagated Tailwind/braces nodes.
- No browser artifact contains Tailwind, chokidar, fast-glob, micromatch, braces or brace-expansion.
- No application/runtime source imports these packages.
- No public or authenticated request field becomes a Tailwind content pattern.

An attacker would need repository/build-input control or another way to modify the branch/config being built. The checked-in security workflow runs install and scanners on pull requests but does not run the Tailwind/Vite production build. Live Vercel external-PR policy was not inspected in this read-only local review. Even if an untrusted branch receives a preview build, that contributor already controls executable build/source content; the advisory would add a build-worker availability primitive, not a public ShiftOryx runtime path. Production branch protection and external preview policy remain operational controls requiring human verification.

Therefore:

function raw() { [native code] }```textfunction raw() { [native code] }
TAILWIND_CHAIN_PRODUCTION_RUNTIME_PRESENT=NO
TAILWIND_CHAIN_BUILD_ONLY=YES
PUBLIC_INPUT_TO_BRACES=NO
RUNTIME_REACHABILITY=BUILD_ONLY
function raw() { [native code] }```function raw() { [native code] }

### Recommendation

Release disposition: function raw() { [native code] }`WAIT_FOR_UPSTREAM_NON_BLOCKING`function raw() { [native code] }.

The package has no patched release. Continue on the approved Tailwind 3 line and review monthly or when an upstream fix appears. The advisory still needs an explicit CI exception because raw scanners correctly report the vulnerable build dependency.

## 4. Override feasibility

### Candidate A — gRPC override

function raw() { [native code] }```textfunction raw() { [native code] }
OVERRIDE_TARGET=@grpc/grpc-js
CURRENT_VERSION=1.9.16
PROPOSED_VERSION=1.13.6
PARENT_DECLARED_RANGE=~1.9.0
OUTSIDE_PARENT_RANGE=YES
API_COMPATIBILITY_CONFIDENCE=MEDIUM
PACKAGE_MANAGER_RESOLUTION_IMPACT=replace grpc node; add @js-sdsl/ordered-map; current proto-loader 0.7.15 satisfies the proposed ^0.7.13 range
EXPECTED_LOCKFILE_CHURN=LOW_BUT_NONZERO
TEST_SCOPE_REQUIRED=clean install, Vite build, all Firebase Node/emulator tests, auth, repositories, tenant isolation, public demo browser/PDF, publication/reset races
SECURITY_VALUE=removes four npm HIGH nodes and protects future Node use; no present browser-runtime risk reduction
REGRESSION_RISK=MEDIUM because the latest Firestore still deliberately declares ~1.9.0
RECOMMENDATION=DO_NOT_OVERRIDE_SOLELY_FOR_THIS_RELEASE
function raw() { [native code] }```function raw() { [native code] }

1.13.6 is the minimal fixed line. 1.14.5 is also fixed but requires a newer proto-loader range and adds more compatibility distance. Same-major semver is favorable evidence, but it does not replace upstream compatibility validation. No dependency mutation was performed to test either candidate.

### Candidate B — braces override

function raw() { [native code] }```textfunction raw() { [native code] }
OVERRIDE_TARGET=braces
CURRENT_VERSION=3.0.3
PROPOSED_VERSION=NONE_PUBLISHED
PARENT_DECLARED_RANGE=~3.0.2 and ^3.0.3
OUTSIDE_PARENT_RANGE=NOT_APPLICABLE
API_COMPATIBILITY_CONFIDENCE=NOT_APPLICABLE
PACKAGE_MANAGER_RESOLUTION_IMPACT=NO_PATCHED_TARGET_EXISTS
EXPECTED_LOCKFILE_CHURN=NOT_APPLICABLE
TEST_SCOPE_REQUIRED=full frontend build/visual/browser regression if a future patched version appears
SECURITY_VALUE=NONE_AVAILABLE_TODAY
REGRESSION_RISK=UNDEFINED_WITHOUT_A_TARGET
RECOMMENDATION=WAIT_FOR_UPSTREAM
function raw() { [native code] }```function raw() { [native code] }

## 5. Parent/framework upgrade analysis

### Firebase upgrade

Current root Firebase is 11.10.0. Registry metadata on 2026-10-03 shows latest Firebase 12.19.0 using Firestore 4.17.2; that Firestore release still declares function raw() { [native code] }`@grpc/grpc-js: ~1.9.0`function raw() { [native code] }. A major Firebase upgrade therefore does not remove this advisory.

function raw() { [native code] }```textfunction raw() { [native code] }
MIGRATION_SCOPE=Firebase 11 to 12 major, Node/ES target and removed/deprecated API review
BREAKING_CHANGE_RISK=MEDIUM
EXPECTED_CODE_CHANGES=possibly none for used modular APIs, but package/tooling compatibility and all Firebase flows require review
EXPECTED_TEST_SCOPE=complete auth, Firestore, Storage, Functions-client, repositories, tenant/security emulator and browser suites
SECURITY_BENEFIT=NONE_FOR_GHSA-m9gg-hp2v-232j while Firestore retains ~1.9.0
PROPORTIONATE_NOW=NO
function raw() { [native code] }```function raw() { [native code] }

The official [Firebase JS release notes](https://firebase.google.com/support/release-notes/js) document the v12 Node 20/ES2020 floor and removed APIs. The current project already uses Node 22/Vite 8, but a major migration with no advisory benefit is still disproportionate.

### Tailwind 4 migration

The official [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide) requires a real major migration: dedicated PostCSS/Vite plugins, CSS import changes, browser floors and multiple utility/default semantic changes.

function raw() { [native code] }```textfunction raw() { [native code] }
MIGRATION_SCOPE=Tailwind/PostCSS or Vite plugin, CSS entry/configuration, utility semantics, browser baseline and visual output
BREAKING_CHANGE_RISK=HIGH
EXPECTED_CODE_CHANGES=package manifest/lock, PostCSS or Vite config, CSS directives/theme/config and potentially class usage
EXPECTED_TEST_SCOPE=full build, responsive/visual/a11y/browser matrix and every owner/public/demo view
SECURITY_BENEFIT=removes a trusted-input build-only dependency chain
PROPORTIONATE_NOW=NO
function raw() { [native code] }```function raw() { [native code] }

## 6. CI policy options

The current workflow has three blocking dependency/repository scanners:

1. function raw() { [native code] }`npm run security:audit`function raw() { [native code] } -> function raw() { [native code] }`npm audit --audit-level=high`function raw() { [native code] }.
2. function raw() { [native code] }`npm run security:cve`function raw() { [native code] } -> function raw() { [native code] }`npx --yes cve-lite-cli@1 ... --fail-on high`function raw() { [native code] }.
3. Trivy HIGH/CRITICAL with function raw() { [native code] }`ignore-unfixed: true`function raw() { [native code] }.

Semgrep remains report-only.

Current observed behavior:

- npm audit exits 1 on the two accepted HIGH clusters.
- The exact existing CVE Lite command resolved v1.22.0 locally and exited 1, reporting function raw() { [native code] }`@grpc/grpc-js`function raw() { [native code] } and function raw() { [native code] }`braces`function raw() { [native code] }.
- A separate exact v1.37.0 JSON run also exited 1 with function raw() { [native code] }`status: ok`function raw() { [native code] }, function raw() { [native code] }`complete: true`function raw() { [native code] }, two package findings and three advisory IDs (the gRPC package includes the related LOW GHSA-f596-whhp-79r4).
- function raw() { [native code] }`@1`function raw() { [native code] } is not reproducible: it resolved an older CLI locally while the registry latest was 1.37.0. A later implementation should pin the reviewed scanner version or action commit.
- Trivy was unavailable locally, so its current result is function raw() { [native code] }`UNVERIFIED`function raw() { [native code] }. No Trivy exception is assumed.

| Option | Security behavior | Operational behavior | Decision |
| --- | --- | --- | --- |
| 1. Keep CI red | Maximum literal adherence; no exceptions | Blocks every PR/main push and encourages bypass pressure; known unreachable findings obscure new findings | Safe but not sustainable |
| 2. Lower global threshold to Critical | Suppresses these findings and every future HIGH | Green CI with unacceptable loss of detection | REJECT |
| 3. Advisory-specific exception gate | Accepts only exact reviewed GHSA/package/version/path tuples; every unknown/new HIGH/CRITICAL fails | Small reviewable implementation and monthly maintenance | RECOMMEND |
| 4. Dependency override | Can make raw npm audit greener | gRPC override is outside upstream range; braces has no target; adds risk without current runtime security benefit | REJECT |

## 7. Recommended CI security policy

Implement in a separately approved phase, using existing Node and current scanner capabilities without a new runtime dependency.

### npm audit gate

Replace the raw exit-code-only gate with a native Node wrapper that:

1. Executes function raw() { [native code] }`npm audit --json`function raw() { [native code] } and captures stdout even when npm exits 1.
2. Requires valid JSON, function raw() { [native code] }`auditReportVersion: 2`function raw() { [native code] }, complete metadata and known schema.
3. Recursively resolves npm metavulnerability function raw() { [native code] }`via`function raw() { [native code] } strings to direct advisory objects.
4. Loads a committed exception registry containing only the two reviewed GHSAs and exact package/version/path chains.
5. Verifies the current lockfile independently; audit output alone is not authority for installed versions or parent paths.
6. Fails on any Critical, any unrecognized HIGH, any unknown function raw() { [native code] }`via`function raw() { [native code] } relationship, any package/path/version drift, any expired exception, any audit/network failure, empty output, malformed JSON or unknown schema.
7. Fails on an unused/stale exception so a fixed advisory cannot leave a dormant broad allowance.
8. Emits the full finding inventory and a concise accepted/new summary without hiding the accepted risks.

### CVE Lite gate

CVE Lite already provides advisory-aware ratcheting: same package/version/advisory may be baselined, while a new advisory ID on that same package surfaces as new. Use that existing feature only with these extra controls:

- Pin the exact reviewed v1 CLI version instead of floating function raw() { [native code] }`@1`function raw() { [native code] }.
- Commit a baseline generated from the exact accepted lockfile.
- Require the same external exception registry and expiration check before the ratcheted scan.
- Include both observed gRPC IDs in the CVE Lite package baseline: HIGH GHSA-m9gg-hp2v-232j and related LOW GHSA-f596-whhp-79r4. Only the HIGH advisory receives this release disposition.
- Fail if CVE Lite returns incomplete diagnostics, unknown IDs, package/version drift, a changed dependency path or a new HIGH/CRITICAL.
- Preserve a full unratcheted JSON scan as CI evidence; do not rely only on hidden/suppressed output.

Official behavior reference: [CVE Lite Ratcheting Mode](https://owasp.org/cve-lite-cli/docs/ratcheting).

### Trivy and other jobs

Keep Trivy HIGH/CRITICAL blocking and Semgrep behavior unchanged. Before implementing the policy, run the real CI Trivy job against the exact branch. If Trivy reports either accepted advisory, define an equally exact ID/package/version/path exception only after confirming its supported ignore semantics; otherwise CI remains blocked. Never add a broad severity or unfixed-vulnerability suppression for gRPC.

### Required invariant

function raw() { [native code] }```textfunction raw() { [native code] }
KNOWN_ACCEPTED_HIGH_CAN_BE_DOCUMENTED=YES
NEW_HIGH_FAILS_CI=YES
NEW_CRITICAL_FAILS_CI=YES
UNKNOWN_HIGH_FAILS_CI=YES
EXCEPTION_SCOPE=ADVISORY_SPECIFIC
GLOBAL_HIGH_THRESHOLD_WEAKENED=NO
function raw() { [native code] }```function raw() { [native code] }

### Implementation test matrix for the later CI phase

- Exact reviewed audit -> PASS with two explicit accepted advisories.
- New HIGH/CRITICAL advisory -> FAIL.
- New advisory ID on an accepted package -> FAIL.
- Changed package version/path/parent -> FAIL.
- Added gRPC server indicator -> static guard FAIL plus mandatory human security review.
- Expired exception -> FAIL.
- Malformed/empty/unavailable npm audit -> FAIL.
- Unknown npm audit schema/metavulnerability graph -> FAIL.
- Clean audit with stale exception -> FAIL until exception removal.
- CVE Lite complete ratchet with exact IDs -> PASS.
- CVE Lite new ID/incomplete diagnostics/version drift -> FAIL.
- Trivy mandatory job -> PASS independently.

## 8. Exception specifications and invalidation

Exception owner: function raw() { [native code] }`ShiftOryx repository owner / security maintainer`function raw() { [native code] }.

Review/expiration date for both exceptions: function raw() { [native code] }`2026-11-03`function raw() { [native code] }. CI must fail on or after that UTC date until the exception is reviewed and renewed or removed.

### Exception A

function raw() { [native code] }```textfunction raw() { [native code] }
ADVISORY=GHSA-m9gg-hp2v-232j
PACKAGE_PATH=firebase@11.10.0 -> @firebase/firestore@4.8.0 -> @grpc/grpc-js@1.9.16; compat path through @firebase/firestore-compat@0.3.53
JUSTIFICATION=affected gRPC server certificate-auth API is absent from the Vite browser artifact and ShiftOryx server source
REACHABILITY=NOT_REACHABLE
REVIEW_TRIGGER=monthly, before hosted rollout, on any Firebase/Firestore/gRPC or server packaging change
INVALIDATION_CONDITIONS=gRPC server introduced; ServerCredentials/getAuthContext/requireClientCertificate/certificate authorization used; server-side root Firebase SDK packaging changes; package/path/version changes; advisory severity/content/exploit evidence changes; compatible upstream parent fix becomes available
EXPIRATION_OR_REVIEW_DATE=2026-11-03
function raw() { [native code] }```function raw() { [native code] }

Exact npm propagated nodes allowed only for this GHSA:

function raw() { [native code] }```textfunction raw() { [native code] }
firebase@11.10.0
@firebase/firestore@4.8.0
@firebase/firestore-compat@0.3.53
@grpc/grpc-js@1.9.16
function raw() { [native code] }```function raw() { [native code] }

### Exception B

function raw() { [native code] }```textfunction raw() { [native code] }
ADVISORY=GHSA-vfj7-8cjw-p6xm
PACKAGE_PATH=tailwindcss@3.4.19 -> chokidar@3.6.0 -> braces@3.0.3; tailwindcss -> micromatch@4.0.8 -> braces; tailwindcss -> fast-glob@3.3.3 -> micromatch -> braces
JUSTIFICATION=development/build-only chain; fixed repository-controlled patterns; absent from browser/Functions runtime artifacts; no patched braces release
REACHABILITY=BUILD_ONLY
REVIEW_TRIGGER=monthly, before hosted rollout, on Tailwind/build pipeline/input changes or a new braces release
INVALIDATION_CONDITIONS=attacker/user-controlled glob or brace patterns; remote build inputs; runtime Tailwind compilation; dependency path/version changes; advisory severity/content/exploit evidence changes; patched compatible release; external-preview trust policy change
EXPIRATION_OR_REVIEW_DATE=2026-11-03
function raw() { [native code] }```function raw() { [native code] }

Exact npm propagated nodes allowed only for this GHSA:

function raw() { [native code] }```textfunction raw() { [native code] }
tailwindcss@3.4.19
chokidar@3.6.0
fast-glob@3.3.3
micromatch@4.0.8
braces@3.0.3
function raw() { [native code] }```function raw() { [native code] }

Automatically detectable invalidations include audit IDs/severity/range fields, lockfile package/path/version drift, exception expiry, scanner/schema/network failure, new findings and registry version availability. Human review remains required for architecture, authorization semantics, new server packaging, public-input provenance, external-preview trust policy and advisory narrative/exploit evidence changes. String searches may be used as guards but cannot certify the absence of arbitrary architecture changes.

## 9. Hosted release impact

This review says that the two remaining unique HIGH advisories do not currently create a public-demo runtime attack path. It does not make the demo ready to release.

Before hosted rollout:

1. A human must accept or reject both exception specifications.
2. The separately approved CI implementation must be reviewed and tested against the fail-closed matrix above.
3. npm audit, CVE Lite and Trivy mandatory jobs must be green under that narrow policy; no global threshold weakening is allowed.
4. Exceptions must be unexpired on the release commit.
5. Fresh audit, lockfile-chain and production-artifact evidence must still match this review.
6. Any relevant architecture or build-input change requires re-triage.
7. All independent hosted gates, including real GCS, isolated deployment, HTTPS browser acceptance and rollback readiness, must pass separately.

Until then:

function raw() { [native code] }```textfunction raw() { [native code] }
CI_POLICY_IMPLEMENTED=NO
HOSTED_RELEASE_GATE=NOT_STARTED
PUBLIC_DEMO_RELEASE_READY=NO
function raw() { [native code] }```function raw() { [native code] }

## 10. Security review, commands and integrity

### Repository integrity

function raw() { [native code] }```textfunction raw() { [native code] }
DEPENDENCIES_CHANGED=NO
LOCKFILES_CHANGED=NO
PACKAGE_MANIFESTS_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
TEST_SOURCE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
function raw() { [native code] }```function raw() { [native code] }

Protected baseline hashes:

| Path | SHA-256 |
| --- | --- |
| `firebase.json` | `3EBF643444C57B4E479F3609436E24704924D57B047917AEB7BBDE384D3EEEA3` |
| `storage.demo.rules` | `BD95635BC59DC8A67F2DA75B6FAFB4449CF7289F82189ED185F07D18EE562C40` |
| `functions/package-lock.json` | `C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487` |
| `storage.rules` | `DED3DC8A5C5FD5C20D583A9EBDD93B9182521C76FF7E427A2604579A388DAB0B` |
| `firestore.rules` | `DF2F111C1F1B9DE6B874E37A3C2F5A92DF5BCC7D7608DB57F3D0A37CE1456F1F` |
| `functions/package.json` | `EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F` |
| `.github/dependabot.yml` | `D69D208C3E285E5096467E4C5B90C422B034AEE8CA8233CC60CC2EE3D581BF10` |
| `package-lock.json` | `85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438` |
| `firestore.demo.rules` | `33941DB2170C3BE408D586955AA985B65D54B383E64D9812ADB440FD5A101B49` |
| `package.json` | `C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E` |
| `.github/workflows/security-scan.yml` | `C5831EEBE3A296A633725547894062CDEF78E0A7D1E8012260108E37042156E3` |

A snapshot of 329 source/test/script/Rules files was recorded before inspection. Disposable install/build/CVE output stayed under function raw() { [native code] }`C:/Users/Spyros/AppData/Local/Temp/shiftoryx-high-ci-e1bdecce89854d3ebaf40cfec48f8e67`function raw() { [native code] } and did not overwrite inherited repository artifacts.

### Exact checks and outcomes

| Check | Outcome |
| --- | --- |
| function raw() { [native code] }`npm audit --json`function raw() { [native code] } | exit 1; 0 Critical / 9 High / 0 Moderate / 0 Low |
| function raw() { [native code] }`npm audit --omit=dev --json`function raw() { [native code] } | exit 1; 0 / 4 / 0 / 0; Tailwind/braces removed |
| function raw() { [native code] }`npm audit --audit-level=high --json`function raw() { [native code] } | exit 1; same nine HIGH nodes |
| Disposable function raw() { [native code] }`npm ci --no-audit --fund=false`function raw() { [native code] } | PASS; 233 platform-applicable packages |
| First disposable Vite build | FAIL / environmental: Functions policy source was omitted from the copy |
| Same Vite build after copying unchanged function raw() { [native code] }`functions/src`function raw() { [native code] } | PASS; 1,992 modules |
| Production artifact string scan | No gRPC server or Tailwind/braces terms |
| Firestore export inspection | Browser export is function raw() { [native code] }`dist/index.esm2017.js`function raw() { [native code] }; Node export alone imports grpc-js |
| Repository source scan | No ServerCredentials/getAuthContext/requireClientCertificate/grpc.Server |
| function raw() { [native code] }`npm explain @grpc/grpc-js`function raw() { [native code] } | exact two Firebase/Firestore paths |
| function raw() { [native code] }`npm explain braces`function raw() { [native code] } | exact three Tailwind build paths |
| npm registry metadata | latest Firestore 4.17.2 still declares grpc-js function raw() { [native code] }`~1.9.0`function raw() { [native code] }; braces latest remains 3.0.3 |
| Existing CVE Lite command | resolved v1.22.0; exit 1; two packages/three advisories |
| Exact CVE Lite 1.37.0 JSON | exit 1; function raw() { [native code] }`complete: true`function raw() { [native code] }; same two packages; no unresolved IDs |
| Local Trivy / Semgrep | UNVERIFIED: CLIs unavailable; workflow configuration inspected only |

Primary sources verified 2026-10-03:

- [gRPC advisory GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j)
- [braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- [Firebase JavaScript SDK release notes](https://firebase.google.com/support/release-notes/js)
- [Tailwind v4 upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [CVE Lite ratcheting documentation](https://owasp.org/cve-lite-cli/docs/ratcheting)
- npm registry metadata retrieved through function raw() { [native code] }`npm view`function raw() { [native code] }

### Proof gaps and remaining risks

- Live Vercel external-preview build policy was not inspected.
- Trivy's current branch result was not reproduced locally.
- No override candidate was installed or dynamically compatibility-tested, by task design.
- Registry/advisory state and artifact reachability must be refreshed before rollout.
- A future server build could select Firestore's Node entry; the exception must invalidate if that happens.
- A future runtime compiler or remote build-input feature could make braces reachable.
- The current workflow remains red until an exception policy is separately approved and implemented.

Project Guardian: function raw() { [native code] }`NOT_READY`function raw() { [native code] }.

## 11. Final gate

function raw() { [native code] }```textfunction raw() { [native code] }
ROOT_HIGH_DISPOSITION_COMPLETE=YES

FIREBASE_GRPC_DISPOSITION=ACCEPT_TEMPORARILY_WITH_EXCEPTION
TAILWIND_BRACES_DISPOSITION=WAIT_FOR_UPSTREAM_NON_BLOCKING

ROOT_HIGH_SECURITY_GATE=PASS_WITH_EXPLICIT_EXCEPTIONS
CI_GATE_STRATEGY=ADVISORY_SPECIFIC_EXCEPTION_RECOMMENDED

CI_POLICY_IMPLEMENTED=NO
ROOT_OVERRIDE_IMPLEMENTED=NO
TAILWIND_MIGRATION_IMPLEMENTED=NO

HOSTED_RELEASE_GATE=NOT_STARTED
PUBLIC_DEMO_RELEASE_READY=NO

NEXT_ACTION=Human review and explicit acceptance of the two time-bounded exceptions, followed by a separate approved fail-closed CI exception implementation phase
function raw() { [native code] }```function raw() { [native code] }
