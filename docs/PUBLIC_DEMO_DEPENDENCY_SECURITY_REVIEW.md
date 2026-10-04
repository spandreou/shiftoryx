# ShiftOryx Public Demo — Dependency Security Review

Review date: 2026-10-03

Scope: `codex/public-shiftoryx-demo`, local source/lockfiles and generated production artifacts only

Baseline SHA: `b23d6bd2d575d6e1680c848c91325c0ad392d8bd`

This was a read-only dependency security disposition. No package, lockfile, application source, GitHub Actions, cloud resource or deployment was changed. This report is the only intended repository delta.

## 1. Executive Summary

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_STATUS=DIRTY_BASELINE_PRESERVED

B3_ROOT_BASELINE_HIGH=4
B3_ROOT_BASELINE_MODERATE=4
B3_ROOT_BASELINE_LOW=1

CURRENT_ROOT_HIGH=9
CURRENT_ROOT_MODERATE=4
CURRENT_ROOT_LOW=1
CURRENT_FUNCTIONS_HIGH=3
CURRENT_FUNCTIONS_MODERATE=7
CURRENT_FUNCTIONS_LOW=0

HIGH_FINDINGS=12
HIGH_FINDINGS_BASIS=npm audit package nodes across two projects
UNIQUE_HIGH_ADVISORIES=6
MODERATE_FINDINGS=11
MODERATE_FINDINGS_BASIS=npm audit package nodes across two projects
LOW_FINDINGS=1
LOW_FINDINGS_BASIS=npm audit package nodes across two projects
RUNTIME_REACHABLE_HIGH=2
RUNTIME_REACHABLE_HIGH_SCOPE=unique Busboy advisories through one conditional upstream-response path
PUBLIC_INPUT_REACHABLE_HIGH=0
DEV_ONLY_HIGH=5
CONDITIONALLY_REACHABLE_HIGH=1
NOT_REACHABLE_HIGH=6
REMEDIATION_REQUIRED_HIGH=0
```

The B3 baseline remains historically correct for the root project. The current audit changed after new advisories were published/updated on 2 October 2026:

- Root increased from `4 HIGH / 4 MODERATE / 1 LOW` to `9 HIGH / 4 MODERATE / 1 LOW`. The five new HIGH nodes are one build-only `braces` advisory propagated through `tailwindcss`, `chokidar`, `fast-glob`, and `micromatch`.
- The separately packaged Functions project now reports `3 HIGH / 7 MODERATE / 0 LOW`. Its new HIGH node is `@fastify/busboy`, representing two multipart-parser advisories.

The twelve HIGH package nodes do not represent twelve independent vulnerabilities. They reduce to six unique HIGH advisories. No HIGH affected API is reachable from public/tenant input in the current application:

- Browser `@grpc/grpc-js` server code is absent from the Vite production artifact.
- Functions use gRPC only as a Firestore client and never create a gRPC server or authorize from `getAuthContext()`.
- Tailwind `braces` is development/build tooling and receives repository-controlled patterns only.
- Firebase Admin has a conditional Busboy runtime path, but it consumes multipart **responses from TLS-authenticated Google APIs**, not incoming demo HTTP requests.
- Functions `brace-expansion` is present only through an unused `google-gax → rimraf → glob → minimatch` tooling branch; ShiftOryx never passes request data to it.

Security exploitability verdict: `PASS_WITH_DOCUMENTED_NON_BLOCKERS`. Repository/public-release verdict remains `NOT_READY`: the root CI `npm audit --audit-level=high` gate is still red, this review implements no remediation, and other hosted release gates remain separate.

## 2. Projects and Production Packaging

Two independent npm projects exist:

1. Root React/Vite application — `package.json` and `package-lock.json`.
2. Firebase Functions Node 22 application — `functions/package.json` and `functions/package-lock.json`.

The public-demo packager copies the complete Functions source and exact Functions lockfile. Its only dependency-manifest change is setting `main` to `src/public-demo/entry.js`; it separately writes demo runtime options, environment/config and Rules artifacts (`scripts/package-public-demo.mjs:26-35`). Consequently, Functions production exposure must be assessed from the Functions lockfile, not the root lockfile.

Root direct dependency evidence:

- `firebase` — `package.json:63`
- `jspdf` — `package.json:65`
- `postcss` and `tailwindcss` — `package.json:79-80`

Functions direct dependency evidence:

- `firebase-admin` and `firebase-functions` — `functions/package.json:13-14`
- Public-demo runtime imports Admin Auth, Firestore and Storage — `functions/src/public-demo/service.ts:1-4`

## 3. Finding Matrix

The matrix has one row per unique advisory. npm metavulnerability nodes are mapped below it so the npm counts remain reproducible.

| Advisory | Severity | Package | Dependency path | Runtime surface | Reachability | Fixed version | Recommended action | Release disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| [GHSA-m9gg-hp2v-232j](https://github.com/advisories/GHSA-m9gg-hp2v-232j) | HIGH | `@grpc/grpc-js` | Root: `firebase → Firestore → grpc@1.9.16`; Functions: `firebase-admin → Firestore → google-gax → grpc@1.14.4` | Node branch of browser SDK; Functions Firestore client | `NOT_REACHABLE` | `1.13.6` or `1.14.5` | Functions patch refresh to 1.14.5; document root until Firebase changes or a separate override is validated | `NOT_REACHABLE_IN_PRODUCTION` |
| [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) | HIGH | `braces@3.0.3` | `tailwindcss → chokidar/fast-glob/micromatch → braces` | Local/CI CSS build only | `BUILD_OR_DEV_ONLY` | None published | Monitor upstream; do not force Tailwind 4 solely for this unreachable build path | `DEV_ONLY_NON_BLOCKING` |
| [GHSA-xjh9-v7x6-24jw](https://github.com/advisories/GHSA-xjh9-v7x6-24jw) | HIGH | `@fastify/busboy@3.2.0` | `firebase-admin → @fastify/busboy` | Admin SDK outbound multipart response parser | `CONDITIONALLY_REACHABLE`: upstream response only; not public input | `3.2.1` | Functions lockfile patch refresh | `ACCEPTABLE_WITH_MITIGATION` |
| [GHSA-x8mw-p69m-v3mx](https://github.com/advisories/GHSA-x8mw-p69m-v3mx) | HIGH | `@fastify/busboy@3.2.0` | Same as above | Same as above | `CONDITIONALLY_REACHABLE`: upstream response only; not public input | `3.2.1` | Same patch refresh | `ACCEPTABLE_WITH_MITIGATION` |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | HIGH | `brace-expansion@2.1.4` | `firebase-admin → Firestore → google-gax → rimraf → glob → minimatch → brace-expansion` | Deployed but unused tooling branch | `NOT_REACHABLE` | `2.1.6`; use `2.1.7` to cover all related issues | Functions lockfile patch refresh | `NOT_REACHABLE_IN_PRODUCTION` |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | HIGH | `brace-expansion@2.1.4` | Same as above | Same as above | `NOT_REACHABLE` | `2.1.5`; use `2.1.7` | Same patch refresh | `NOT_REACHABLE_IN_PRODUCTION` |
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | MODERATE | `brace-expansion@2.1.4` | Same as above | Same as above | `NOT_REACHABLE` | `2.1.7` | Same patch refresh | Non-blocking |
| [GHSA-55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) | MODERATE | `dompurify@3.4.11` | `jspdf → dompurify` | Lazy browser chunk | `NOT_REACHABLE`: no DOMPurify/`.html()`/`IN_PLACE`/hook use | `3.4.13` | Root transitive patch refresh | Non-blocking |
| [GHSA-c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) | LOW | `dompurify@3.4.11` | Same as above | Same as above | `NOT_REACHABLE`: no custom-element policy | `3.4.12` | Use 3.4.13 | Non-blocking |
| [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) | MODERATE | `fflate@0.8.2` | `jspdf → fflate` | Browser/server PDF renderer | `NOT_REACHABLE`: jsPDF imports `zlibSync`; no ZIP input or `unzipSync` call | `0.8.3` | Root transitive patch refresh | Non-blocking |
| [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | MODERATE | `postcss@8.5.18` | Direct dev dependency and Tailwind/Vite tooling | Local/CI build only | `BUILD_OR_DEV_ONLY`; repository-controlled CSS | `8.5.23` | Root patch update | `DEV_ONLY_NON_BLOCKING` |
| [GHSA-w9m9-85wc-3x92](https://github.com/advisories/GHSA-w9m9-85wc-3x92) | LOW | `postcss-selector-parser@6.1.2` | `tailwindcss/postcss-nested → selector-parser` | Local/CI build only | `BUILD_OR_DEV_ONLY` | `6.1.3` | Root transitive patch refresh | `DEV_ONLY_NON_BLOCKING` |
| [GHSA-j3f2-48v5-ccww](https://github.com/advisories/GHSA-j3f2-48v5-ccww) | MODERATE | Root `protobufjs@7.6.4` | `Firestore → grpc proto-loader → protobufjs` | Node SDK branch/local tooling | `NOT_REACHABLE`: absent from browser bundle; no untrusted `.proto` parsing | `7.6.5` | Root transitive patch refresh | Non-blocking |
| [GHSA-f596-whhp-79r4](https://github.com/advisories/GHSA-f596-whhp-79r4) | LOW | `@grpc/grpc-js` | Same two gRPC chains | gRPC server method errors | `NOT_REACHABLE`: ShiftOryx runs no gRPC server | `1.13.6` or `1.14.5` | Same gRPC disposition | Non-blocking |
| [GHSA-x5fp-wj9c-mxmx](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx) | MODERATE | `qs@6.15.3` | `firebase-functions → express/body-parser → qs` | Functions HTTP framework | `NOT_REACHABLE`: affected `comma:true` parser mode is not configured | `6.16.0` | Functions transitive minor refresh | Non-blocking |
| [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | MODERATE | `qs@6.15.3` | Same as above | Same as above | `NOT_REACHABLE`: no attacker-controlled parse→stringify round trip/options | `6.16.0` | Same refresh | Non-blocking |
| [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) | MODERATE | `uuid@9.0.1` | `firebase-admin → Storage → gaxios/teeny-request → uuid` | Functions outbound HTTP/Storage | `NOT_REACHABLE`: affected v3/v5/v6 output-buffer APIs are not called | `11.1.1` | Prefer parent Storage/Admin upgrade, not a forced incompatible override | Non-blocking |

### npm metavulnerability reconciliation

- Root HIGH nodes: `firebase`, `@firebase/firestore`, `@firebase/firestore-compat`, and `@grpc/grpc-js` all derive from the one gRPC HIGH advisory. `tailwindcss`, `chokidar`, `fast-glob`, `micromatch`, and `braces` derive from the one build-only `braces` advisory.
- Functions HIGH nodes: `@grpc/grpc-js`, `brace-expansion`, and `@fastify/busboy`.
- Functions MODERATE metavulnerability nodes `firebase-admin`, `@google-cloud/storage`, `retry-request`, `teeny-request`, and `gaxios` derive from the `uuid` chain; `qs` has two direct advisories.

## 4. Detailed HIGH Analysis

### H-01 — gRPC certificate authorization context

**Root cause.** `@grpc/grpc-js` can report an unauthorized client certificate through `getAuthContext()` as if it were authorized when server credentials use `requireClientCertificate: false`. The advisory explicitly applies when a gRPC **server** uses that context for authentication.

**Paths and exposure.**

```text
Root browser project
firebase@11.10.0
└── @firebase/firestore@4.8.0
    └── @grpc/grpc-js@1.9.16

Functions project
firebase-admin@14.3.0
└── @google-cloud/firestore@8.7.1
    └── google-gax@5.0.8
        └── @grpc/grpc-js@1.14.4
```

The frontend imports Firestore extensively (`src/firebase/config.js:5`, repository/service imports), but a fresh production build contained none of `@grpc/grpc-js`, `ServerCredentials`, or `getAuthContext`. Vite selected Firebase's browser implementation.

Functions use Admin Firestore as a client. Repository-wide source inspection found no gRPC server, `ServerCredentials`, `requireClientCertificate`, or project invocation of `getAuthContext`. Firebase callable/HTTP handling is provided by `firebase-functions`/Express, not a ShiftOryx gRPC server.

**Exploit requirements.** An attacker must connect to a ShiftOryx-owned gRPC server configured for optional client certificates, supply an unauthorized certificate, and reach application authorization based on `getAuthContext()`. No such server or decision exists.

**Disposition.** `NOT_REACHABLE_IN_PRODUCTION`. Functions can safely receive 1.14.5 through a later lock refresh. Root Firestore pins `~1.9.0`; even current `firebase@12.19.0` still declares this line. npm's proposed Firebase 9.14 downgrade is a breaking downgrade and does not constitute a sound remediation recommendation. If policy later requires zero root HIGH nodes, test a scoped gRPC override separately rather than changing it in this review.

### H-02 — Tailwind build-time `braces` recursion

**Root cause.** Deeply nested attacker-controlled brace patterns can exhaust the Node stack. No patched `braces` release exists as of this review.

**Path.**

```text
tailwindcss@3.4.19 (devDependency)
├── chokidar@3.6.0 ── braces@3.0.3
├── fast-glob@3.3.3 ── micromatch@4.0.8 ── braces@3.0.3
└── micromatch@4.0.8 ── braces@3.0.3
```

**Reachability.** `npm audit --omit=dev` removes all five propagated HIGH nodes. The chain is not in the browser production bundle or Functions package. Tailwind receives checked-in source/content patterns, not public request data. Exploitation would require an attacker to modify repository/build inputs, at which point they already possess source-pipeline write authority.

**Disposition.** `DEV_ONLY_NON_BLOCKING`. npm proposes Tailwind 4.3.3, but the project explicitly remains on Tailwind 3.x during this migration and a major framework migration is disproportionate to an unreachable build-only issue. Monitor for a patched 3.x-compatible path or handle Tailwind 4 in a separate approved migration.

### H-03 — Firebase Admin Busboy multipart DoS

**Root cause.** Busboy 3.2.0 can loop on a 252-byte multipart boundary and can throw on prototype-named part headers. Both are fixed in 3.2.1.

**Path.**

```text
firebase-admin@14.3.0
└── @fastify/busboy@3.2.0
```

**Reachability.** This package is included in the Functions deployment lockfile and Firebase Admin 14.3.0 has a real conditional runtime call path through `AsyncRequestCall.handleMultipartResponse()` ([authoritative v14.3.0 source, lines 550-600](https://github.com/firebase/firebase-admin-node/blob/v14.3.0/src/utils/api-request.ts#L550-L600)). That path parses multipart **responses returned by Google APIs**. It is not middleware for incoming public-demo requests. Public PDF/mutation/reset handlers accept strictly validated JSON; caller-controlled Content-Type boundaries and multipart part headers do not enter this parser. Classification is therefore `CONDITIONALLY_REACHABLE`, but not public-input reachable.

**Exploit requirements.** An attacker would need to control a TLS-authenticated Google API response or redirect Admin SDK traffic to an attacker-controlled endpoint. No caller-supplied endpoint exists in the reviewed flows.

**Existing mitigation and disposition.** The response source is a configured Google API over authenticated TLS, and no user-controlled endpoint/redirect exists in the reviewed flows. Exploitation would require compromise of that upstream response or of the TLS trust boundary. Disposition: `ACCEPTABLE_WITH_MITIGATION`; 3.2.1+ remains a low-risk, high-priority transitive patch for the next approved Functions lock refresh.

### H-04 — Functions `brace-expansion` DoS

**Root cause.** Crafted brace patterns can trigger recursive stack exhaustion; the related quadratic case blocks the event loop. Version 2.1.7 fixes the complete 2.x set.

**Path.**

```text
firebase-admin@14.3.0
└── @google-cloud/firestore@8.7.1
    └── google-gax@5.0.8
        └── rimraf@5.0.10
            └── glob@10.5.0
                └── minimatch@9.0.9
                    └── brace-expansion@2.1.4
```

**Reachability.** The packages are installed as optional production dependencies because Admin Firestore is used, but the google-gax runtime source does not import rimraf/glob and ShiftOryx imports none of rimraf, glob, minimatch, or brace-expansion. No request field becomes a file-glob pattern.

**Disposition.** `NOT_REACHABLE_IN_PRODUCTION`; update to 2.1.7 in the later minimal lock refresh.

## 5. Moderate and Low Findings

- **DOMPurify:** its chunk is present because jsPDF declares it optional, but ShiftOryx only constructs PDFs with text/image APIs (`src/services/schedulePublicationPdf.ts:3`; `src/utils/exportUtils.js:3`). There is no DOMPurify, `.html()`, `IN_PLACE`, hook, or custom-element call. Patch to 3.4.13 when refreshing the root lockfile.
- **fflate:** the generated server PDF renderer bundles the wider fflate implementation, including `unzipSync`, but jsPDF imports/calls only `zlibSync` (`node_modules/jspdf/dist/jspdf.es.js:52,13309`). ShiftOryx accepts no ZIP archive and never invokes the vulnerable API. Patch to 0.8.3.
- **PostCSS / selector-parser:** development-only build processors. Inputs are checked-in CSS/config; no public CSS compiler exists. Patch to PostCSS ≥8.5.23 and selector-parser 6.1.3 without changing Tailwind major.
- **protobufjs:** the root affected 7.6.4 belongs to Firestore's Node/proto-loader branch, is absent from the browser artifact, and receives no attacker-controlled `.proto`. Functions already resolves fixed 7.6.5. Patch root to 7.6.5.
- **qs:** deployed through Express, but ShiftOryx does not configure the affected `comma:true` mode or perform the vulnerable attacker-object parse→stringify flow. Refresh to 6.16.0.
- **uuid / Storage metavulnerabilities:** deployed through Admin Storage outbound clients, but only generated request identifiers are used. ShiftOryx does not call v3/v5/v6 with attacker-controlled buffers/offsets. Prefer a compatible parent Admin/Storage upgrade rather than forcing uuid 11 across incompatible parent ranges.
- **gRPC error-message LOW:** affects crashing application handlers on a gRPC server. ShiftOryx runs no such server.

No moderate/low finding is more important than its npm severity in this application. Several patchable findings can be removed together in the remediation phase, but none supplies an attack path in the current public demo.

## 6. Consolidated Remediation Plan

No remediation was performed. Ranked future options:

### Option 1 — Functions high-only transitive refresh (preferred first)

```text
TARGET_PACKAGE=@fastify/busboy
CURRENT_VERSION=3.2.0
SAFE_VERSION=3.2.1 or 3.2.2
UPDATE_TYPE=patch
LOCKFILE_IMPACT=functions/package-lock.json only
LIKELY_CODE_CHANGES=none
TEST_SCOPE_REQUIRED=Functions discovery, auth broker, public-demo HTTP/PDF/reset, emulator isolation
BREAKING_CHANGE_RISK=LOW
SECURITY_BENEFIT=removes two Busboy HIGH advisories

TARGET_PACKAGE=@grpc/grpc-js
CURRENT_VERSION=1.14.4
SAFE_VERSION=1.14.5
UPDATE_TYPE=patch
LOCKFILE_IMPACT=functions/package-lock.json only
LIKELY_CODE_CHANGES=none
TEST_SCOPE_REQUIRED=Firestore/Admin emulator and public-demo full regression
BREAKING_CHANGE_RISK=LOW
SECURITY_BENEFIT=removes gRPC HIGH and LOW advisories from Functions

TARGET_PACKAGE=brace-expansion
CURRENT_VERSION=2.1.4
SAFE_VERSION=2.1.7
UPDATE_TYPE=patch
LOCKFILE_IMPACT=functions/package-lock.json only
LIKELY_CODE_CHANGES=none
TEST_SCOPE_REQUIRED=Functions install/discovery/build and Firestore/public-demo regression
BREAKING_CHANGE_RISK=LOW
SECURITY_BENEFIT=removes two HIGH plus one MODERATE advisory

TARGET_PACKAGE=qs
CURRENT_VERSION=6.15.3
SAFE_VERSION=6.16.0
UPDATE_TYPE=minor transitive
LOCKFILE_IMPACT=functions/package-lock.json only
LIKELY_CODE_CHANGES=none expected
TEST_SCOPE_REQUIRED=all callable HTTP parser/negative-input tests
BREAKING_CHANGE_RISK=LOW_TO_MEDIUM
SECURITY_BENEFIT=removes two MODERATE advisories
```

Do not edit `functions/package.json` for these versions: existing parent ranges admit the safe transitive releases. Review the generated lockfile diff and reject unrelated churn.

### Option 2 — Root patchable transitive refresh

```text
TARGET_PACKAGE=dompurify, fflate, postcss, postcss-selector-parser, protobufjs
CURRENT_VERSION=3.4.11, 0.8.2, 8.5.18, 6.1.2, 7.6.4
SAFE_VERSION=3.4.13, 0.8.3, >=8.5.23, 6.1.3, 7.6.5
UPDATE_TYPE=patch/transitive refresh
LOCKFILE_IMPACT=package-lock.json; package.json only if PostCSS minimum is deliberately raised
LIKELY_CODE_CHANGES=none expected
TEST_SCOPE_REQUIRED=build, scheduler/PDF exports, public demo PDF browser, Firebase browser/emulator suites
BREAKING_CHANGE_RISK=LOW_TO_MEDIUM
SECURITY_BENEFIT=removes all currently patchable root MODERATE/LOW advisories
```

### Option 3 — Parent Admin upgrade for remaining Storage/uuid metadata

`firebase-admin@14.5.0` is allowed by the existing `^14.3.0` manifest range and moves Firestore/Storage parent lines forward. This has broader transitive churn than Option 1 and should be a second checkpoint with exact Storage conditional-generation, Firestore transaction, reset and PDF tests. It may not alone remove every gaxios/uuid meta advisory; validate the resulting lockfile rather than assuming.

### Deferred/accepted paths

- **Root Firebase gRPC:** latest inspected `firebase@12.19.0` still depends on a Firestore line declaring `@grpc/grpc-js ~1.9.0`. Do not downgrade to npm's proposed Firebase 9.14 or perform a broad Firebase migration. If CI policy requires zero HIGH despite the absent browser code, separately validate an explicit 1.13.6 override against browser build plus Node/emulator Firebase tests, or document a time-bounded exception until Firebase changes its dependency.
- **Tailwind `braces`:** no patched `braces` release exists. Do not force Tailwind 4 during the approved Tailwind 3 migration period solely to remove a non-reachable build-only finding. Monitor upstream and keep build inputs trusted.

## 7. Verification Evidence

Commands used, all non-mutating to manifests/lockfiles:

```text
git worktree list --porcelain
git status --short
git branch --show-current
git rev-parse HEAD
Get-FileHash package.json package-lock.json functions/package.json functions/package-lock.json .github/**
npm audit --json
npm audit --omit=dev --json
npm ls <affected packages> --all --json
npm view <affected/fixed package versions and dependency ranges> --json
rg source imports, affected APIs and production artifact strings
npm run build
```

Artifact evidence:

- The root build succeeded. Its output contains Firebase browser code and a lazy DOMPurify chunk, but no `@grpc/grpc-js`, `ServerCredentials`, `getAuthContext`, `protobufjs`, `brace-expansion`, or PostCSS source-map loader.
- Browser/server PDF artifacts contain fflate code, including the bundled unzip implementation, but jsPDF's ShiftOryx code path imports/calls `zlibSync`; neither application source nor the exercised renderer invokes `unzipSync`.
- Functions packaging copies the exact Functions lockfile, so all Functions runtime package findings were treated as deployed even when their affected APIs were unreachable.
- The worktree's installed `functions/node_modules` is shared/stale and `npm ls` reports a Firebase Admin version mismatch. Version and dependency claims therefore come from the checked-in lockfile, fresh lockfile-based `npm audit`, official package metadata, and tagged upstream source—not from the ambient installed tree.
- `npm audit --omit=dev` removes the Tailwind/braces HIGH propagation, proving that chain is development/build-only.

## 8. Security Review and Remaining Risks

```text
DEPENDENCIES_CHANGED=NO
LOCKFILE_CHANGED=NO
PACKAGE_MANIFEST_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
RISKY_APPLICATION_FILES_TOUCHED=NO
SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
REMEDIATION_IMPLEMENTED=NO
```

Remaining risks:

1. Root and Functions audits remain red, so the checked-in GitHub HIGH/CRITICAL audit gate will fail until a separate remediation or explicit policy exception is approved.
2. Runtime packages still contain vulnerable code even though current ShiftOryx call paths do not reach it. Future use of gRPC servers, multipart response endpoints, user-defined glob patterns, jsPDF HTML sanitization, ZIP import, arbitrary CSS compilation or proto parsing invalidates this disposition and requires immediate re-review.
3. Tailwind's `braces` issue has no patched package release. The present mitigation is architectural: build-only execution with trusted repository inputs.
4. Dependency registry/advisory state is time-sensitive. Rerun both audits immediately before any remediation PR and before the hosted release gate.

Project Guardian: `NOT_READY` for public release because the repository audit gate remains red and other hosted gates are outside this task. Dependency exploitability gate: `PASS_WITH_DOCUMENTED_NON_BLOCKERS` because no HIGH advisory has a demonstrated public/runtime attack path.

## 9. Final Gate

```text
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
DEPENDENCY_REVIEW_COMPLETE=YES
HIGH_FINDINGS_DISPOSITIONED=YES
DEPENDENCY_SECURITY_GATE=PASS_WITH_DOCUMENTED_NON_BLOCKERS
REMEDIATION_IMPLEMENTED=NO
PUBLIC_DEMO_RELEASE_READY=NO
NEXT_ACTION=Human-approved minimal dependency remediation: Functions transitive HIGH patches first, then root patchable findings; retain documented root gRPC/Tailwind exceptions unless a separately tested safe fix becomes available.
```
