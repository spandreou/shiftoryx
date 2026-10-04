# ShiftOryx Public Demo — npm 11 Drift + Trivy Disposition Review

Date: 2026-10-04. Scope: analysis of the blocked qualification commit and design of a bounded follow-up. No implementation or hosted rerun is authorized by this report.

## 1. Executive Summary

The npm failure is reproducible at field level. Exactly two fields differ, both in the `fast-glob` metavulnerability node:

| Field | npm 10.9.4 | npm 11.19.0 |
| --- | --- | --- |
| `effects` | `[]` | `["tailwindcss"]` |
| `fixAvailable` | `true` | `{name:"tailwindcss", version:"4.3.3", isSemVerMajor:true}` |

All other parsed audit fields match, including nine package nodes, three leaf advisory records (two HIGH and the existing ancillary LOW), advisory content, ranges, metadata and physical dependency paths. Both audits report 0 Critical / 9 High / 0 Moderate / 0 Low and exit 1.

The `effects` delta represents an already-existing lockfile edge. The `fixAvailable` delta changes the meaning of remediation metadata from a boolean to an explicitly major parent upgrade. It is therefore **security-semantic remediation metadata drift**, although it is not a new vulnerability, dependency change, vulnerable-range change or increased runtime exposure.

Recommended npm strategy: **A. PIN_NPM_VERSION**. Keep the current strict fingerprints and execute npm 10.9.4 explicitly. Prefer retaining the already configured Node 24 runtime and qualifying the exact Node/npm pair in the separately authorized implementation phase. This reproduction used Node 22.21.0 for both npm versions; it does not establish the Node 24/npm 10 pair by itself.

Trivy disposition: **TRIVY_EXCEPTION_DEFENSIBLE**, limited to the exact root instance `@grpc/grpc-js@1.9.16`, `CVE-2026-101916`, the reviewed source/lock context and 2026-11-03 UTC expiry. This is a recommendation for a future guarded exception, not an approval to suppress the finding now. Native ignore-file matching alone does not enforce the required contract.

Project Guardian: **NOT_READY**. The existing remote CI qualification remains blocked.

## 2. Repository / Commit Boundary

```text
CURRENT_BRANCH=codex/public-shiftoryx-demo
CURRENT_SHA=0f06e70fd3c76a85ce23ccaebc7a4b2a0b1df069
QUALIFICATION_COMMIT_REACHABLE=YES
HOSTED_WORKFLOW_RUN=37202453378
INITIAL_TRACKED_DIFF=NONE
INITIAL_UNTRACKED=docs/PUBLIC_DEMO_HOSTED_CI_QUALIFICATION.md
```

The inherited hosted qualification report was preserved byte-for-byte. The four requested reports, current workflow, exception registry, typed policy/runtime helpers and both entry wrappers were inspected.

`SECURITY.md` was read and resolved for the root lockfile: HIGH/CRITICAL findings are blocking, automatic dependency changes are forbidden and tenant-private access remains membership based. The explicitly reviewed temporary dispositions govern only their accepted scope.

A SHA-256 snapshot covers all 453 tracked files plus the inherited hosted report (454 files). The final comparison must show zero differences; this new root-level report is the only current-phase repository addition.

## 3. npm 10.9.4 Evidence

An owned temporary workspace contains byte-identical copies of the root `package.json` and `package-lock.json`. No project `node_modules` was copied, installed or changed.

Evidence directory:

`C:/Users/Spyros/AppData/Local/Temp/shiftoryx-npm-drift-urQ4Q4`

Commands were executed through Node/argv with `shell:false` and a bounded subprocess timeout/buffer:

```text
node <installed-npm-10-cli> --version
node <installed-npm-10-cli> audit --audit-level=high --json
```

| Property | Result |
| --- | --- |
| Node | 22.21.0 |
| npm | 10.9.4 |
| Arborist | 8.0.1 |
| Audit schema | auditReportVersion=2 |
| Vulnerability nodes | 9 |
| Critical / High / Moderate / Low | 0 / 9 / 0 / 0 |
| Exit | 1, expected for the accepted HIGH state |
| Current registry validation | PASS, highPackages=9 |
| Raw JSON SHA-256 | 7A24AC6281ABAA1BC95C53F78E0D0932DAAB2C327C88CCFA11539F01CF4E8A85 |

`npm10.json` and `npm10-fresh.json` are byte-identical.

## 4. npm 11.19.0 Evidence

npm 11.19.0 was resolved only through the existing npm execution-cache mechanism, outside the repository. It was not installed globally or added to either project. Its package declares no preinstall/install/postinstall/prepare lifecycle script.

The initial operation was:

```text
npm exec --yes --package=npm@11.19.0 -- npm --version
npm exec --yes --package=npm@11.19.0 -- npm audit --audit-level=high --json
```

The independent fresh-cache run invoked its verified cached CLI directly under the same Node executable as npm 10. A reduced environment carried OS/path/temp variables and no project environment/secrets.

| Property | Result |
| --- | --- |
| Node used for reproduction | 22.21.0 |
| npm | 11.19.0 |
| Arborist | 9.9.1 |
| Audit schema | auditReportVersion=2 |
| Vulnerability nodes | 9 |
| Critical / High / Moderate / Low | 0 / 9 / 0 / 0 |
| Exit | 1 |
| Current registry validation | FAIL: GATE_ADVISORY_OR_NODE_DRIFT |
| Raw JSON SHA-256 | 27FB82C1ECADFAAF3EF12D87502F7B92BC4113992B4493D26946EA046896A59F |

`npm11.json` and `npm11-fresh.json` are byte-identical. Separate initially empty caches for each npm version eliminate ambient cache contents as the explanation.

Raw artifacts, the comparison script and hash snapshot remain outside Git. The repository manifests/lockfiles and their temporary copies remained equal after both runs.

The actual hosted run used Ubuntu 24.04 / Node 24.21.0 / npm 11.19.0. Its raw audit JSON was not retained; the reproduction establishes a sufficient cause for its exact failure code, not a newly captured hosted JSON report.

## 5. Exact npm Audit Representation Differences

The complete comparison ignores object-key ordering but preserves array elements. It found two changed fields, represented as three leaf differences when array length is counted:

1. `vulnerabilities.fast-glob.effects.length`: 0 to 1.
2. `vulnerabilities.fast-glob.effects[0]`: absent to `tailwindcss`.
3. `vulnerabilities.fast-glob.fixAvailable`: `true` to the object above.

The source-level explanation is explicit in npm 11's [Arborist audit report](https://github.com/npm/cli/blob/v11.19.0/workspaces/arborist/lib/audit-report.js): it reconciles all metavulnerability `via` links after processing the vulnerability set. `Vuln.addVia()` records reverse `effects` and propagates fix information. npm 10's [earlier implementation](https://github.com/npm/cli/blob/v10.9.4/workspaces/arborist/lib/audit-report.js) links during traversal before its already-marked-node short circuit.

The inspected installed distribution implements this at npm 11 `audit-report.js:217-225` and `vuln.js:136-140`; npm 10 uses `audit-report.js:160-167` and `vuln.js:132-136`. The emitted JSON source confirms both versions serialize `effects` and `fixAvailable` from those internal values.

The root lock already contains `tailwindcss@3.4.19 -> fast-glob:^3.3.2`; npm 11 did not create that edge. The existing `tailwindcss` audit node already reported its major fix in both outputs.

In-memory attribution, with unchanged repository files:

| Input to existing validator | Result |
| --- | --- |
| Original npm 10 JSON | PASS |
| Original npm 11 JSON | FAIL: advisory/node drift |
| npm 11 with only effects restored to npm 10 value | FAIL |
| npm 11 with only fixAvailable restored | FAIL |
| npm 11 with both restored | PASS |

These are diagnostic mutations of parsed temporary data, not an implemented normalization rule or a new test suite.

## 6. Security-Semantic vs Representation-Only Classification

| Field/group | Change | Classification / impact |
| --- | --- | --- |
| `fast-glob.effects` | Adds reverse edge to already affected Tailwind | REPRESENTATION_ONLY_CHANGE for this exact proven graph |
| `fast-glob.fixAvailable` | Boolean becomes major-upgrade object | SECURITY_SEMANTIC_CHANGE in remediation metadata; installed exposure unchanged |
| GHSA IDs, advisory sources, names, URL, title, CWE, CVSS, leaf ranges | None | Same advisory content |
| Node severities, directness, ranges and physical node paths | None | Same affected package instances |
| Package versions and dependency declarations | None | Same lock/manifest bytes |
| Counts, dependency inventory, audit version and metadata | None | Same schema and count state |
| Object/array ordering | No material changed field beyond the two above | Not the cause |

The existing policy expressly treats fix availability and graph metadata drift as review triggers. Blanket removal of `effects` or `fixAvailable` from fingerprints would weaken that invariant. In particular, changing fix availability to false, an in-range fix, a different parent or an incompatible recommendation must not silently pass.

```text
NEW_VULNERABILITY_DETECTED_IN_COMPARISON=NO
INSTALLED_EXPOSURE_CHANGED=NO
VULNERABLE_RANGES_CHANGED=NO
REMEDIATION_METADATA_SEMANTICS_CHANGED=YES
```

npm's [audit documentation](https://docs.npmjs.com/cli/v11/commands/npm-audit/) describes separate metavulnerability/remediation calculation and explains that the HIGH threshold affects exit status, not which findings appear in JSON. Counts alone cannot establish semantic equivalence.

## 7. Current Fingerprint Algorithm Review

At `scripts/lib/auditExceptionPolicy.ts:35-38`, fingerprinting sorts object keys recursively and top-level `nodes`, `effects` and `via` arrays. It retains their members and every other field.

The complete node fingerprint includes:

- name, severity and direct/transitive flag;
- all leaf advisory records or `via` references;
- reverse effects;
- vulnerable node range and physical node paths;
- boolean/object fix availability, including name/version/major flag.

Leaf advisory fingerprints include numeric source, package/dependency name, title, GHSA URL, severity, CWE, CVSS and vulnerable range. Separate checks enforce lock-entry integrity, exact versions/paths, incoming dependency ranges, reviewed source context, expiry, complete inventory and severity propagation.

At line 178 the exact node comparison rejects npm 11 before any exception is granted. The code is functioning according to its reviewed contract.

One stable semantic model could derive reverse effects from the audited `via` graph plus independently pinned lock edges, but it must reject an unexpected new edge. A version-aware adapter could express the already-proven fix propagation equivalence while preserving all remediation fields. That would be a new security-policy implementation requiring fixtures and review, not a generic serialization cleanup.

## 8. npm Gate Options

| Option | Security strength | Determinism / maintenance | Upgrade and fail-closed behavior | False acceptance / rejection | Decision |
| --- | --- | --- | --- | --- | --- |
| A: pin npm 10.9.4, verify version and retain exact fingerprints | Preserves accepted contract | High tool determinism; advisory service can still change | Tool/version mismatch and advisory drift reject; explicit upgrade review | Low acceptance risk; deliberate rejection on changed registry data | RECOMMENDED for this temporary window |
| B: npm 11 with general normalization | Depends on precisely specified semantic equivalence | Less scanner coupling; greater validation work | Must reconstruct graph and retain remediation changes | Unsafe if effects/fixAvailable are discarded; blanket normalization rejected | NOT RECOMMENDED as the minimal fix |
| C: version-aware semantic fingerprints for exactly reviewed npm versions | Strong with no unknown-version fallback | More fixtures/profiles and reviewer burden | Every version/profile update requires review | Low if profiles are complete; accidental profile fallback is dangerous | Viable later, larger than needed |
| D: npm 11-only new complete reviewed profile | Strong if individually reviewed | Simpler single profile, but changes current accepted metadata | Re-review npm 11 representation and every relevant registry entry | Low with exact comparison, but requires policy refresh | Not the smallest approved follow-up |

Pinning npm does not freeze upstream advisory data or the npm metavulnerability cache. A fresh audit must still reject narrative, range, node, source or remediation changes. No cached result may substitute for a live scan.

## 9. Recommended npm Strategy

Choose **A. PIN_NPM_VERSION**.

Proposed minimum follow-up:

- Pin npm 10.9.4 and assert the actual CLI version used by `runNpm` before audits and CVE Lite execution.
- Retain Node 24.21.0 unless separate compatibility evidence supports a runtime change; qualify the exact Node 24/npm 10 pair before hosted execution. The existing Linux wrapper resolves npm beside the active Node installation, so a PATH shim alone does not prove it uses the pinned CLI.
- Keep complete accepted advisory/node fingerprints, HIGH threshold, graph checks and 2026-11-03 expiry.
- Fail on every unexpected npm version or failed pin operation. No fallback to the ambient npm 11 CLI.
- Revalidate installation/build, CVE Lite 1.37.0 and the 99 negative/positive tests on that pair.

The now-observed npm 11 correction should be retained as reviewed forensic evidence. Using npm 10 temporarily preserves the older fast-glob reporting limitation; independently locked edges and the Tailwind node's already-major remediation record remain necessary controls.

No Node/npm pin, normalization, version-aware profile or registry change was made.

## 10. Trivy CVE-2026-101916 Dependency Provenance

Exact root path:

```text
root package.json: firebase ^11.7.0
root lock: firebase 11.10.0
├─ @firebase/firestore 4.8.0
│  └─ @grpc/grpc-js ~1.9.0 -> 1.9.16
└─ @firebase/firestore-compat 0.3.53
   └─ @firebase/firestore 4.8.0
      └─ the same physical @grpc/grpc-js 1.9.16 entry
```

There is exactly one matching root lock entry:

`package-lock.json -> node_modules/@grpc/grpc-js`

It is transitive, not dev-only, and resolves the npm grpc-js 1.9.16 tarball. The parent range is `~1.9.0`. No nested second gRPC instance was found.

The **vulnerable 1.9.16 instance is absent from the Functions lock**. The package name is not absent: Functions use `firebase-admin@14.3.0 -> @google-cloud/firestore@8.7.1 -> google-gax@5.0.8 -> @grpc/grpc-js@1.14.5` under `^1.12.6`. Version 1.14.5 is patched.

The hosted Trivy finding explicitly names the root `package-lock.json`, @grpc/grpc-js, version 1.9.16 and CVE-2026-101916. Its Functions result was clean. Thus it matches the same unique locked root instance, not the patched Functions instance.

## 11. Trivy Exploitability Review

Input claim: remote certificate-authentication bypass using gRPC server credentials with optional client certificates and authorization based on `getAuthContext()`. The [maintainer advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j) explicitly maps CVE-2026-101916, identifies those preconditions and fixes 1.13.6 / 1.14.5.

Current supported surfaces:

- Public/OWNER browser SPA imports `firebase/firestore` at `src/firebase/config.js:5`.
- Firestore 4.8.0 browser exports resolve to `dist/index.esm2017.js`; its Node entry imports gRPC. The browser entry contains no gRPC server authorization sink.
- Vite builds a browser application; Docker serves only the resulting dist through Nginx.
- Demo backend packaging copies the separate Functions source/manifest/lock. It does not install the vulnerable root Firebase dependency into that runtime.
- The generated PDF renderer bundles the PDF rendering service, not Firebase/gRPC. Generated demo service external imports use firebase-admin with the patched Functions graph.

Static searches inspected source, generated demo bundles, browser export, Node export and the existing Firebase browser chunk. No application gRPC server, ServerCredentials, requireClientCertificate or getAuthContext use exists in those supported entrypoints.

Existing artifact inspected without rebuilding:

| Artifact | SHA-256 |
| --- | --- |
| Firebase browser chunk | 1352376264C5E93F90D91A07B029D1346BC2EA6C45364AC806912688CBF30774 |
| Generated demo service | 38503ABB8A3249668F1549342C1063BA6070DBB218498530010B3E90C5818A9C |
| PDF renderer | 9FBEF3C10EBB0A6FB29E2CD5CB58633AACB8126357F9DB80140B68F7D2D51B6E |

Triage verdict for exploitability at this exact source/build context: **not_actionable**, high static confidence; stack rank is null. The dependency is affected, but the browser/backend packaging defeats the specified source-to-server-auth sink. No runtime exploit attempt, application build or hosted validation was performed in this task.

Proof limits: this is qualification-commit source/artifact evidence, not an audit of the currently deployed hosted backend. New SSR/root-SDK server packaging, gRPC/xDS servers or certificate-based authentication invalidates this disposition. CI remains blocking until human approval of a scanner-specific implementation.

## 12. Cross-Scanner Mapping

| Scanner | Version | ID / GHSA / CVE | Instance / severity | Fixed version | Source/path | Disposition / exception |
| --- | --- | --- | --- | --- | --- | --- |
| npm audit | 10.9.4 | GHSA-m9gg-hp2v-232j; CVE alias supplied by the advisory | root @grpc/grpc-js 1.9.16 / high | Advisory fixes 1.13.6, 1.14.5; npm proposes a Firebase major/downgrade-style remediation | root lock node; both Firebase paths | Exact temporary exception active until 2026-11-03 |
| npm audit | 11.19.0 | Same GHSA | Same root instance / high | Same gRPC record; other cluster's fast-glob remediation differs | Same root node and graph | Current gate rejects fast-glob node drift |
| CVE Lite | 1.37.0, prior reviewed local evidence | GHSA-m9gg-hp2v-232j + CVE-2026-101916 | Same root instance / high | Validated first fixed 1.13.6 | Two explicit Firebase dependency paths | Reviewed native ratchet + raw guards; hosted step skipped |
| Trivy | 0.70.0, actual run 37202453378 | CVE-2026-101916; mapped GHSA-m9gg-hp2v-232j | Same root instance / HIGH | 1.13.6, 1.14.5 | Target package-lock.json | FAIL; no Trivy exception implemented |

The underlying vulnerability, unique root instance and reviewed exploitability context match. The scanner policies do not: npm/CVE Lite acceptance does not propagate to Trivy. npm JSON does not itself emit a CVE field for this leaf; the alias is confirmed by the maintainer advisory and existing CVE registry.

## 13. Proposed Trivy Exception Contract

Disposition: **TRIVY_EXCEPTION_DEFENSIBLE** subject to explicit approval, complete raw scanner evidence and independent verification of the future implementation.

Bind an exception to this complete conjunction:

| Binding | Required value/control |
| --- | --- |
| Scanner | Exactly reviewed Trivy 0.70.0/action behavior; explicit version validation |
| Raw report | Recognized SchemaVersion, fresh successful scan, all configured vulnerability/misconfiguration/secret result surfaces examined |
| Finding type | Vulnerability only; never a secret or misconfiguration |
| Target / ecosystem | Exact root package-lock.json / npm / language package |
| Vulnerability | CVE-2026-101916; reviewed GHSA alias and advisory content |
| Package / version | @grpc/grpc-js / 1.9.16 |
| Instance | Unique node_modules/@grpc/grpc-js in the verified root lock; reject ambiguity/new nested copies |
| Severity / remediation | HIGH only; CRITICAL must fail; fixed-version/content changes require review |
| Graph / lock | Exact existing five gRPC incoming edges and locked package fingerprints; full root-lock snapshot for scanner provenance |
| Source context | Existing reviewed application, Functions and build/packaging fingerprints |
| Owner / review | Named maintainer, reviewed justification; date strictly before 2026-11-03 UTC |
| Other findings | Every unapproved HIGH/CRITICAL in every scanned target or finding category fails |
| Staleness | Approved finding disappears: require reviewed exception cleanup |

Recommended future mechanism: a strict native-Node validator over **fresh unfiltered Trivy JSON**, retaining raw scanner `--severity HIGH,CRITICAL --exit-code 1` and all configured scanners. Exit 1 can be accepted only when valid complete JSON proves that the exact allowed HIGH is the sole blocking result. Exit 1 without such proof, missing output, old output, timeout, process error and unexpected report/scanner version fail.

The real hosted run currently provides table output only. A future authorized phase must first capture Trivy 0.70.0 JSON and validate target/identity/schema fields against that actual corpus; this report invents no observed PURL or PkgPath value. An absent optional PkgPath can only be resolved using the unambiguous pinned lock instance; missing required target/name/version fields fail. Preserve unfiltered evidence and consume all security-bearing result arrays and ModifiedFindings; do not mistake omitted scanner coverage for a clean scan.

Native YAML matching is insufficient alone. Trivy 0.70.0's [ignore implementation](https://github.com/aquasecurity/trivy/blob/v0.70.0/pkg/result/ignore.go) supports ID/path/PURL/expiry but:
- a missing target PURL matches its PURL predicate;
- omitted expiry has no expiry;
- YAML decoding does not enforce a required-key/unknown-key contract;
- native matching does not bind severity or reviewed source context.

Its [filter implementation](https://github.com/aquasecurity/trivy/blob/v0.70.0/pkg/result/filter.go) applies ignore matching after selecting severity and records ignored entries separately. A same-CVE CRITICAL would therefore need an independent raw guard before any suppression. These observations rule out an unguarded ignore file for this task's invariants.

No .trivyignore, VEX, Rego policy, scanner-specific registry or wrapper was created. The existing `ignore-unfixed`, scanner set, severity and exit-code values remain unchanged.

## 14. Required Negative Tests

Design only; no permanent test source was created.

| Test | Expected future result |
| --- | --- |
| Unknown HIGH CVE | FAIL, no exception match |
| Any CRITICAL, including approved CVE | FAIL |
| Approved CVE on another package | FAIL |
| Approved CVE on another installed version | FAIL |
| Expiry at 2026-11-03T00:00:00Z | FAIL |
| Foreign target / Functions target / changed node path | FAIL |
| Changed lock integrity/entry/edge or source/build fingerprint | FAIL |
| Duplicate/conflicting/malformed exception; unknown key; typo in expiry | FAIL |
| Missing required report field, unexpected schema, missing configured scanner result | FAIL |
| Scanner unavailable, timeout, signal, non-audit exit, absent/stale/truncated JSON | FAIL |
| A second unapproved HIGH/CRITICAL or duplicate ambiguous package instance | FAIL |
| Same CVE/GHSA with changed affected range/advisory content/severity/fixes | FAIL/review |
| npm semantic advisory drift under pinned npm | FAIL |
| Unknown npm JSON fields/version or unreviewed scanner/npm version | FAIL |
| New HIGH secret/misconfiguration in another result target | FAIL |
| Native suppressed/ModifiedFindings input without complete raw verification | FAIL |
| Missing PURL with native ignore path selected | FAIL rather than trusting native match |
| Change between scan start/end to root lock or source context | FAIL |
| Stale exception after genuinely clean scan | FAIL until reviewed cleanup |

Positive cases must include the exact current finding, unchanged context before expiry, complete scanner result, preserved raw evidence and denial of all unrelated blocking findings. Tool-version assertions must verify the executable actually used, not only the command named npm in PATH.

## 15. Remaining Risks

- HIGH packages remain installed. The existing root dispositions are temporary; expiry stays 2026-11-03.
- npm 10 pinning preserves an older metavulnerability representation. Current graph/parent guards mitigate it; long-term scanner upgrades still need review.
- Audits depend on fresh upstream data and can reject later metadata changes even with a pinned CLI.
- Node 24/npm 10 pairing and Linux behavior require follow-up qualification; local reproduction used Node 22.
- Existing hosted raw npm JSON is unavailable. The isolated npm 11 reproduction plus source inspection explains its rejection but is not a hosted audit rerun.
- Trivy table evidence does not establish raw JSON completeness/schema/PURL behavior for a new wrapper. Capture is required before implementing final acceptance rules.
- Trivy's native ignore format cannot alone supply this project's strict exception contract.
- The previous Functions MODERATE Storage/UUID disposition is unchanged.
- Qualification-commit analysis does not certify current deployed demo/production state.
- Any workflow change invalidates the existing reviewed-context workflow hash. A future approved change must explicitly re-review that context hash; it must not auto-refresh the registry to make CI pass.

## 16. Recommended Next Implementation Task

Authorize one bounded CI policy phase with the following concrete scope:

1. Pin/assert npm 10.9.4 in the hosted toolchain, retain Node 24 and qualify that pair; preserve all existing npm/CVE advisory fingerprints and expiry.
2. Capture fresh Trivy 0.70.0 raw JSON in a disposable local/approved runner environment; implement a schema-validated, ID/package/version/target/context/expiry-specific gate for CVE-2026-101916.
3. Add the negative tests above without changing existing assertions or application/Functions/Rules code.
4. Re-review only the explicitly changed workflow context and Trivy policy; no exception-date extension or additional CVE.
5. Rerun local gates, obtain independent review, then perform one separately authorized hosted qualification run against its exact commit.

Expected areas: the security workflow, runtime version enforcement helper, a typed Trivy validator and tests/fixture, an explicitly approved scanner-specific registry entry and implementation report. Updating workflow provenance in `reviewedContext` requires human approval; existing advisory fingerprints must remain byte-identical.

This report authorizes none of those changes and performs no commit, push, CI rerun or deployment.

## 17. Security Review

All 454 baseline file hashes were rechecked, including manifests, both lockfiles, workflow, source/Functions, Rules, registry and the inherited hosted report. No baseline file changed. Temporary audit workspaces contain public npm dependency metadata only; no service account, project environment file or credential was copied or logged.

| Protected path | SHA-256 |
| --- | --- |
| package.json | C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E |
| package-lock.json | 85D7B977873D7967C0C35228EB95F46612360E881518A10CDCA7FA561A95B438 |
| functions/package.json | EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F |
| functions/package-lock.json | C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487 |
| .github/workflows/security-scan.yml | 3C04E2A2DA7CEE507F584753BB390D0DB1C201FD40A56EC9D00D762150D69BB1 |
| security/npm-audit-exceptions.json | AC8F3EE8203E560EF2200F40916B3F0757873372D278DCD831EBD5C126E2EEB5 |

The only current-phase repository addition is `PUBLIC_DEMO_NPM11_TRIVY_DISPOSITION.md`. The inherited untracked hosted qualification report is preserved. Raw npm audits/comparison helpers are not tracked. Git HEAD and the existing workflow run remain unchanged.

The user-authorized npm audit reproduction and report destination take precedence over the triage skill's generic no-execution/no-artifact restrictions. gRPC exploitability triage stayed static; no exploit test, application run, build or new scanner run was performed. Project Guardian's evidence rule keeps the release gate blocked.

```text
NPM_11_DRIFT_ROOT_CAUSE=DETERMINED
NPM_11_DRIFT_SECURITY_SEMANTIC=YES
NPM_11_DRIFT_SEMANTIC_SCOPE=REMEDIATION_METADATA_ONLY
NEW_VULNERABILITY_OR_EXPOSURE=NO

NPM_STRATEGY=PIN_NPM_VERSION

TRIVY_FINDING_MATCHES_REVIEWED_GHSA=YES
TRIVY_SAME_PACKAGE_INSTANCE=YES
TRIVY_EXPLOITABILITY_DISPOSITION_RECONFIRMED=YES
TRIVY_DISPOSITION=EXCEPTION_DEFENSIBLE
TRIVY_EXCEPTION_IMPLEMENTED=NO

DEPENDENCIES_CHANGED=NO
LOCKFILES_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO
FUNCTIONS_SOURCE_CHANGED=NO
RULES_CHANGED=NO
WORKFLOW_CHANGED=NO
GITHUB_ACTIONS_PERMISSIONS_CHANGED=NO
SECRETS_TOUCHED=NO

COMMIT_CREATED=NO
PUSH_PERFORMED=NO
HOSTED_CI_RERUN=NO
DEPLOYMENT_PERFORMED=NO
IAM_CHANGED=NO
DNS_CHANGED=NO
PRODUCTION_CHANGED=NO

PUBLIC_DEMO_RELEASE_READY=NO
```
