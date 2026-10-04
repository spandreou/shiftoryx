# Public Demo Functions Dependency Remediation

Date: 2026-10-03

## 1. Baseline

This phase performed the approved minimal dependency refresh in the Firebase Functions npm project only. It did not remediate the root npm project and did not authorize a hosted release.

```text
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_CONDITION=INHERITED_DIRTY_WORKTREE_PRESERVED
FUNCTIONS_HIGH_BEFORE=3
FUNCTIONS_MODERATE_BEFORE=7
FUNCTIONS_LOW_BEFORE=0
FUNCTIONS_CRITICAL_BEFORE=0
```

The initial audit matched the approved review baseline. No new Critical advisory appeared. Existing modified and untracked public-demo work was preserved; no reset, clean, stash, checkout, or restore operation was used.

Approved targets:

| Package | Before | Minimum/preferred safe target |
| --- | ---: | ---: |
| `@fastify/busboy` | 3.2.0 | >=3.2.1 |
| `@grpc/grpc-js` | 1.14.4 | >=1.14.5 |
| `brace-expansion` | 2.1.4 | 2.1.7 |
| `qs` | 6.15.3 | >=6.16.0 |

Protected baseline hashes were recorded before mutation. At the final integrity check, the root manifests, Functions manifest, GitHub Actions files, Firebase configuration, and normal Rules hashes were unchanged. Only the Functions lockfile hash changed, from `FB9A332FFC22EC9D487B4185094ABD6E9FDDFA7C919BDB354DBA2713112E656A` to `C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487`.

| Protected file | SHA-256 before and after (unchanged) |
| --- | --- |
| `package.json` | `C6AC0791A600658C70E841257CDE81192A6DD95451976844D7A5729259FAC83E` |
| `package-lock.json` | `3F5C5E927E9DAA89840A60699C1846BE5F494605E6B054B6D99BFC9A7672F563` |
| `functions/package.json` | `EEA56C6AAB24673F3FA1D7D01C181B8B5F390BE10936768627E0A862F240779F` |
| `.github/workflows/security-scan.yml` | `C5831EEBE3A296A633725547894062CDEF78E0A7D1E8012260108E37042156E3` |
| `.github/dependabot.yml` | `D69D208C3E285E5096467E4C5B90C422B034AEE8CA8233CC60CC2EE3D581BF10` |
| `firebase.json` | `3EBF643444C57B4E479F3609436E24704924D57B047917AEB7BBDE384D3EEEA3` |
| `firestore.rules` | `DF2F111C1F1B9DE6B874E37A3C2F5A92DF5BCC7D7608DB57F3D0A37CE1456F1F` |
| `storage.rules` | `DED3DC8A5C5FD5C20D583A9EBDD93B9182521C76FF7E427A2604579A388DAB0B` |

A final comparison with the pre-test verification snapshot checked 323 source/test/script/Rules files across `src`, `functions/src`, `qa`, `scripts`, and `rules`, with zero byte differences. The Git status difference from the captured baseline contains only the Functions lockfile modification and this new report; no inherited entry disappeared.

## 2. Dependency Resolution

The existing dependency ranges were proved to admit every safe target before the repository lockfile was changed. The installed `functions/node_modules` junction was not treated as authoritative because the prior review had established that it could be stale.

```text
PACKAGE=@fastify/busboy
BEFORE=3.2.0
AFTER=3.2.2
DEPENDENCY_CHAIN=firebase-admin@14.3.0 -> @fastify/busboy
PARENT_RANGE=^3.0.0
EXISTING_RANGE_ALLOWED_UPDATE=YES

PACKAGE=@grpc/grpc-js
BEFORE=1.14.4
AFTER=1.14.5
DEPENDENCY_CHAIN=firebase-admin@14.3.0 -> @google-cloud/firestore@8.7.1 -> google-gax@5.0.8 -> @grpc/grpc-js
PARENT_RANGE=^1.12.6
EXISTING_RANGE_ALLOWED_UPDATE=YES

PACKAGE=brace-expansion
BEFORE=2.1.4
AFTER=2.1.7
DEPENDENCY_CHAIN=firebase-admin@14.3.0 -> @google-cloud/firestore@8.7.1 -> google-gax@5.0.8 -> rimraf@5.0.10 -> glob@10.5.0 -> minimatch@9.0.9 -> brace-expansion
PARENT_RANGE=^2.0.2
EXISTING_RANGE_ALLOWED_UPDATE=YES

PACKAGE=qs
BEFORE=6.15.3
AFTER=6.16.0
DEPENDENCY_CHAIN=firebase-functions@7.3.2 -> express@5.2.1/body-parser@2.3.0 -> qs
PARENT_RANGES=express:^6.14.0;body-parser:^6.15.2
EXISTING_RANGE_ALLOWED_UPDATE=YES
```

The package-manager operation was rehearsed against a disposable copy of the checked-in Functions manifest and lockfile. After its diff was shown to be limited to the four approved nodes, the same official npm operation was run in `functions/`:

```powershell
npm update --package-lock-only --ignore-scripts --no-audit --fund=false @fastify/busboy @grpc/grpc-js brace-expansion qs
```

No lockfile content was manually edited. No override, forced resolution, direct dependency, package replacement, or major upgrade was introduced.

## 3. Complete Lockfile Delta

The complete `functions/package-lock.json` diff is 12 insertions and 12 deletions. Exactly four resolved package nodes changed. For each node, npm changed `version`, `resolved`, and `integrity`; dependency declarations and all parent nodes remained unchanged.

| Package | Before | After | Classification | Reason | Advisories addressed |
| --- | ---: | ---: | --- | --- | --- |
| `@fastify/busboy` | 3.2.0 | 3.2.2 | `APPROVED_SECURITY_TARGET` | Highest compatible patch selected within `^3.0.0` | GHSA-xjh9-v7x6-24jw; GHSA-x8mw-p69m-v3mx |
| `@grpc/grpc-js` | 1.14.4 | 1.14.5 | `APPROVED_SECURITY_TARGET` | Compatible patch within `^1.12.6` | GHSA-m9gg-hp2v-232j; related LOW node |
| `brace-expansion` | 2.1.4 | 2.1.7 | `APPROVED_SECURITY_TARGET` | Preferred complete 2.x fix within `^2.0.2` | GHSA-qhr7-859c-m2p7; GHSA-6j4f-fj2g-mc7p; GHSA-q2hr-2g5m-vwhr |
| `qs` | 6.15.3 | 6.16.0 | `APPROVED_SECURITY_TARGET` | Compatible release admitted by both parent ranges | GHSA-x5fp-wj9c-mxmx; GHSA-4mjr-xmp4-gh2g |

```text
APPROVED_SECURITY_TARGET_CHANGES=4
REQUIRED_TRANSITIVE_METADATA_CHANGES=0
EXPECTED_PARENT_TRANSITIVE_CHANGES=0
UNEXPECTED_LOCKFILE_CHANGES=0
```

## 4. Audit Result

Fresh audits were executed before and after the refresh with both the full and production-only views.

| Audit | High before | High after | Moderate before | Moderate after | Low before | Low after |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `npm audit --json` | 3 | 0 | 7 | 6 | 0 | 0 |
| `npm audit --omit=dev --json` | 3 | 0 | 7 | 6 | 0 | 0 |

```text
FUNCTIONS_HIGH_AFTER=0
FUNCTIONS_MODERATE_AFTER=6
FUNCTIONS_LOW_AFTER=0
FUNCTIONS_CRITICAL_AFTER=0
BUSBOY_HIGH_FIXED=YES
FUNCTIONS_GRPC_HIGH_FIXED=YES
BRACE_EXPANSION_HIGH_FIXED=YES
QS_MODERATES_FIXED=YES
```

The remaining six Functions MODERATE package nodes are `firebase-admin`, `@google-cloud/storage`, `retry-request`, `teeny-request`, `gaxios`, and `uuid`. They are the previously dispositioned `uuid`/Storage parent chain and are outside this minimal lockfile-only phase. npm continues to exit non-zero because MODERATE findings remain; that is not presented as a zero-finding audit.

## 5. Verification

All dependency-sensitive tests used a clean temporary `npm ci` installation derived from the updated lockfile. The repository's ambient Functions installation/junction was not modified. Generated demo artifacts and build output were produced only in an untracked temporary verification mirror.

| Command / gate | Result | Evidence |
| --- | --- | --- |
| `npm ci --no-audit --fund=false` in clean Functions directory | PASS | 291 packages installed from the updated lockfile |
| Functions normal and public-demo manifest discovery | PASS | All expected normal/demo handlers loaded using Node 22 |
| `npm run lint` in clean Functions directory | PASS | No lint errors |
| `node scripts/build-public-demo.mjs` in temporary mirror | PASS | Demo Functions and separate Rules generated |
| `node scripts/test-demo-package-guard.mjs` | PASS | Wrong-project rejection and normal/demo package separation preserved |
| `node scripts/test-public-demo-pdf-http.mjs` | PASS | 9 request-policy checks |
| `node scripts/test-public-demo-pdf-policy.mjs` | PASS | 186 passed, 0 failed |
| `node scripts/test-public-demo-gcs-harness.mjs` | PASS | 19 local GCS harness checks |
| `node scripts/test-public-demo-reset-state.mjs` | PASS | Precheck rollback, worker-loss CAS and forward recovery checks |
| `node scripts/test-public-demo-reset-retention.mjs` | PASS | Retention, intent-cap and tombstone checks |
| `node scripts/test-public-demo-reset-engine.mjs` | PASS | Zero-effect rollback, canonical finalize and recovery checks |
| `node scripts/test-public-demo-reset-errors.mjs` | PASS | 16 reset error classifications |
| `npm run qa:auth-broker` | PASS | Static auth broker validation |
| Auth/Firestore/Functions emulator `test-auth-broker-emulator.mjs` | PASS | Auth broker emulator checks passed |
| `qa/public-demo/normal-rules-regression.mjs` | PASS | V3 profiles, drafts, transactions, immutable snapshots/PDF, OWNER/cross-tenant/platform-admin/anonymous denials |
| `qa/public-demo/verify.mjs b3-precheck` | PASS | 10 fail-closed rollback scenarios; foreign state unchanged |
| `qa/public-demo/verify.mjs b3-retention` | PASS | 800 allowed / 801 blocked; four atomic pages; no blind repair |
| `qa/public-demo/verify.mjs b3-recovery` | PASS | Worker-loss fencing, exact Storage deletion and canonical forward recovery |
| `qa/public-demo/verify.mjs b3-concurrency` | PASS | 81 races; 81 winners; 83 controlled losers; INTERNAL=0; foreignMutations=0 |
| `qa/public-demo/verify.mjs b3-adapter` | PASS | Bounded aggregates and exact tenant/root/Storage generation |
| `qa/public-demo/verify.mjs isolation` | PASS | 255 checks; all 12 ordered tenant pairs; reset cleanup and foreign preservation |
| `qa/public-demo/verify.mjs typed-isolation` | PASS | 48 foreign attempts; 0 mutations across all 12 pairs |
| `qa/public-demo/verify.mjs pdf` | PASS | 44 server PDF checks; exact bytes, direct Storage denial, v1 immutability, quotas, 12 ordered pairs |
| `qa/public-demo/verify.mjs pdf-races` | PASS | 18 reset/TOCTOU/cleanup/immutability race checks |
| `qa/public-demo/verify.mjs upload` | PASS | Late finalize denied with 403; no orphan object |
| `qa/public-demo/verify.mjs lease` | PASS | Interrupted lease recovery |
| `qa/public-demo/verify.mjs reset` | PASS | 25 tenant collections, 23 Rules surfaces, root metadata and two Storage families |
| `npm run build` in temporary mirror | PASS | Vite production build completed; existing large-chunk warnings only |
| `git diff --check -- functions/package-lock.json` | PASS | No whitespace errors |

The first static auth-broker attempt in the temporary mirror failed because that deliberately minimal mirror omitted `docs/auth-broker-runbook.md`. It was classified `ENVIRONMENTAL`, not as a dependency regression, and the unchanged real-checkout command subsequently passed. The first manifest discovery probe was likewise rerun from the correct Functions working directory and passed. No application or test source was changed in response.

The Firebase emulator printed its existing advisory that `firebase-functions` is not the latest release. Updating that direct dependency is outside this phase. The test used a `demo-*` project ID with Auth, Firestore, Functions and Storage emulators; no deployment or production mutation occurred.

```text
AUTH_REGRESSION=PASS
FIRESTORE_ADMIN_REGRESSION=PASS
STORAGE_PDF_REGRESSION=PASS
PUBLIC_DEMO_RESET_REGRESSION=PASS
FUNCTIONS_REGRESSION_GATE=PASS
SOURCE_CHANGE_REQUIRED=NO
```

Independent read-only closeout review: **PASS for human review**, with zero Critical, zero Important, and zero outstanding Minor findings. The reviewer independently checked the complete four-node lockfile diff, unchanged parent ranges, original backup/HEAD bytes, both fresh audit views, eight protected hashes, and the 323-file snapshot comparison. The preliminary rollback-documentation omission was resolved in section 8. Functional results were reviewed against the supplied execution evidence; those suites were not independently rerun. Hosted acceptance, real GCS generation semantics, production/IAM state, a fresh root audit, and broader inherited application behavior were explicitly outside that review. This verdict grants no merge or release approval.

## 6. Security Review

```text
DEPENDENCIES_CHANGED=YES (four transitive Functions resolutions only)
DEPENDENCY_MANIFESTS_CHANGED=NO
FUNCTIONS_PACKAGE_JSON_CHANGED=NO
FUNCTIONS_LOCKFILE_CHANGED=YES
ROOT_PACKAGE_JSON_CHANGED=NO
ROOT_LOCKFILE_CHANGED=NO
APPLICATION_SOURCE_CHANGED=NO (by this phase; inherited dirty source was preserved)
TEST_SOURCE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
SECRETS_TOUCHED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
DNS_CHANGED=NO
PRODUCTION_CLOUD_CHANGED=NO
PRODUCTION_CHANGED=NO
COMMIT_PUSH_MERGE=NONE
```

No new dependency, install/postinstall script, native binary, override, or package replacement was introduced. The only risky artifact changed by this phase is the Functions resolution lockfile. All authorization, Rules, reset, PDF and tenant-isolation source remained byte-for-byte in its inherited state.

## 7. Remaining Risks

- The root project remains outside scope. Its authoritative dependency-review baseline was `9 HIGH / 4 MODERATE / 1 LOW`; root dependencies were unchanged and no new root audit was required for this phase.
- The root Tailwind 3 build chain still contains the build-only `braces` advisory for which the review found no patched release. This phase does not authorize a Tailwind 4 migration.
- The root Firebase browser dependency still resolves the separately dispositioned gRPC branch. This phase neither downgrades Firebase nor adds a root override.
- The Functions project retains six MODERATE nodes through the `firebase-admin -> @google-cloud/storage -> retry-request/teeny-request/gaxios -> uuid` parent chain. Fixing that chain requires a separately reviewed parent dependency update, not a forced incompatible resolution.
- Audit results are time-sensitive and must be rerun at the later release gate.
- The emulator reports that a newer `firebase-functions` release exists; broad Functions/Firebase modernization was intentionally not attempted.
- This phase establishes local/emulator compatibility only. It is not hosted deployment or public-release evidence.
- The Storage emulator does not establish real GCS object-generation fidelity. Exact-generation semantics were exercised through the controlled local contract and existing harness; the real GCS qualification and hosted acceptance were not rerun because this phase authorizes no cloud mutation.

## 8. Rollback Procedure

No rollback was executed. If human review requests rollback, restore only the exact pre-phase Functions lockfile and preserve all inherited source, tests, Rules, manifests, and untracked work.

1. Verify that the current target is `C:\Users\Spyros\.codex\worktrees\shiftoryx-public-demo\functions\package-lock.json` and still has SHA-256 `C3B7F0CF49452184E6B72853D5D61BC80393529C9C712AE10F0ACCB002B1D487`. Stop if it changed since this report.
2. Verify that the backup `C:\Users\Spyros\AppData\Local\Temp\shiftoryx-functions-deps-c69239ddfc0246bc8ce01c8ab98e7537\package-lock.before.json` has SHA-256 `FB9A332FFC22EC9D487B4185094ABD6E9FDDFA7C919BDB354DBA2713112E656A`. This matches the original lockfile at the unchanged start SHA.
3. Copy that complete verified file to the exact target above. This restores the captured package-manager artifact without manually editing lockfile content. Do not use broad Git cleanup or restore commands.
4. Recheck protected hashes and Git status against this phase baseline. The rollback must remove only the Functions lockfile delta. Retain this report as evidence and record that the dependency remediation was rolled back; the original Functions vulnerabilities return.

If the temporary backup no longer exists, recover the exact original lockfile bytes from `b23d6bd2d575d6e1680c848c91325c0ad392d8bd:functions/package-lock.json` into a separate reviewed recovery file and verify the original SHA-256 before replacing the target. No package re-resolution, manifest change, or cloud operation is part of rollback.

## 9. Final Gate

```text
FUNCTIONS_DEPENDENCY_REMEDIATION_COMPLETE=YES
UNEXPECTED_LOCKFILE_CHANGES=0

BUSBOY_HIGH_FIXED=YES
FUNCTIONS_GRPC_HIGH_FIXED=YES
BRACE_EXPANSION_HIGH_FIXED=YES
QS_MODERATES_FIXED=YES

FUNCTIONS_REGRESSION_GATE=PASS
FUNCTIONS_DEPENDENCY_SECURITY_GATE=PASS

ROOT_DEPENDENCY_REMEDIATION=NOT_STARTED
PUBLIC_DEMO_RELEASE_READY=NO

NEXT_ACTION=Human review of this lockfile-only change and report; do not proceed to root remediation or hosted release without a separate explicit approval.
```
