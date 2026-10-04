# Public demo hosted gate — 25 September 2026

Status: **BLOCKED — not ready for public sharing or another deployment**.

This checkpoint supersedes older statements that no deployment has occurred. It does not supersede historical local test evidence. No commit, push, merge or Draft PR has been made for the public-demo work.

```
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
WORKTREE_CLEAN=NO
DRAFT_PR_URL=NOT_CREATED
```

## Deployment already performed in the preceding continuation

- Isolated Firebase project: `shiftoryx-public-demo`, project number `848554493137`; Firestore and Storage in `us-central1`. No real tenant data was copied.
- Dedicated runtime service account, demo-only IAM bindings, six demo/broker Functions and separate demo Rules were deployed. Auth authorized domains are the five demo hostnames plus the demo project's Firebase Auth domain.
- Scheduled daily reset and ticket cleanup were enabled. The initial seed created only the four allowlisted fictional tenants, with 6/8/6/9 employees.
- Isolated Vercel project: `shiftoryx-public-demo`, ID `prj_E2ORHb1pVLrUtEppzyusna56ZPiH`; deployment `dpl_6ev3HdHNDjT9LvqacfqhKq9zz2eo`.
- Exact aliases: <https://demo.shiftoryx.gr>, <https://demo-fuel.shiftoryx.gr>, <https://demo-cafe.shiftoryx.gr>, <https://demo-salon.shiftoryx.gr>, <https://demo-market.shiftoryx.gr>.
- Existing wildcard DNS was reused; no DNS record changed. The apex, www and wildcard remained attached to the original production Vercel project.
- Previous deployment commands ended with an Artifact Registry cleanup-policy warning after successful Functions deployment. No force cleanup was authorized or performed.

These are records of the preceding execution, not a claim of newly rerunning every infrastructure check on 25 September.

## Actual hosted acceptance result

Receipt: external temporary directory `shiftoryx-hosted-browser-UvzgVj`, `results.json`; screenshots `landing.png`, `demo-fuel-week.png`, `failure.png`.

Nine actual-HTTPS checks passed for Fuel: landing/selection/login/redirect; refresh persistence; authorized direct subdomain; canonical roster; WEEK generation; quarter-hour edit with recalculated hours; employee replacement; manual assignment; removal with live coverage warnings.

The next action, publication PDF upload, failed with `storage/unauthorized`. The observed object path was `tenants/demo-fuel/schedule-publications/9fc07660-c93f-42e2-a910-6d5bb622204e/schedule.pdf`. Earlier read-only checks found its publication reservation and matching ACTIVE OWNER membership. The PDF was approximately 99 KB, below the 2 MB demo limit.

The receipt does **not** prove hosted MONTH, successful publication/history/immutable PDF/reset, all four completed workflows, or all 12 cross-tenant denials. A denied foreign Storage request alone is not sufficient isolation evidence while valid own-tenant Storage access also fails. A reservation/version counter may remain from the failed publication: inspect/reset only the selected fictional tenant before rerunning a harness that assumes version 1.

## Root cause evidence, refreshed 25 September

### 1. Unsupported Storage Rules document budget

The deployed Storage authorization uses three distinct Firestore paths even for an authorized read:

1. `demoState/{tenantId}` — reset lock and current generation.
2. `platformAdmins/{uid}` — explicit platform-admin exclusion.
3. `tenantMemberships/{uid}_{tenantId}` — matching active OWNER membership.

Publication creation additionally checks `tenants/{tenantId}/schedulePublicationReservations/{publicationId}`: four distinct documents total.

[Firebase's Storage Rules limits](https://firebase.google.com/docs/rules/rules-behavior#security_rules_limits) allow only two Firestore access calls, with duplicate reads potentially cached. [Firebase's cross-service announcement](https://firebase.blog/posts/2022/09/announcing-cross-service-security-rules/) explicitly distinguishes two **unique** documents from repeated reads of the same document. Binding repeated `get()` calls to a local variable cannot reduce these three/four distinct dependencies to two.

This is a demonstrated incompatibility between the deployed rules and the hosted limit. It is separate from the previously fixed Firestore 1,000-expression failure. The old emulator successes do not establish hosted compatibility.

### 2. Missing cross-service IAM binding

A read-only project IAM query found only `roles/firebasestorage.serviceAgent` for `service-848554493137@gcp-sa-firebasestorage.iam.gserviceaccount.com`, not `roles/firebaserules.firestoreServiceAgent`.

[Firebase's cross-service deployment documentation](https://firebase.google.com/docs/rules/manage-deploy#manage_permissions_for_cross-service_cloud_storage_security_rules) identifies that additional role on the Storage service agent. The installed Firebase CLI's `rulesDeploy.js` explicitly returns without checking/adding this role in non-interactive mode, explaining why the earlier non-interactive deploy could succeed without it.

No IAM binding was changed during this investigation. Adding the documented binding alone would **not** solve the independent two-document budget violation. The current generic `storage/unauthorized` response does not distinguish which failure is encountered first.

### 3. Unsafe local attempt withdrawn

An interim local generator edit removed the platform-admin denial from demo Storage Rules. That was not an acceptable optimization and was not deployed.

Restored the previous generator, including the original short-circuited demo guard and mandatory `demoAccess(tenantId) && !isPlatformAdmin()` generation assertion. Regenerated both demo Rules files. A read-only Rules API comparison confirmed the restored local `storage.demo.rules` exactly equals the active hosted Storage ruleset after newline normalization; the active release includes the platform-admin denial and was last updated at `2026-09-24T18:08:33.608706Z`.

Restoration preserves authorization but intentionally does **not** claim to fix the hosted availability failure.

## Approval boundary: architecture decision required

The user requires stopping before an architectural correction beyond a bounded fix. That boundary is reached: removing membership, platform-admin, reset-generation or reservation checks is not allowed, and caching alone cannot satisfy the platform limit.

Two directions require design approval and independent review before implementation:

- **Trusted authorization projection, retaining direct Storage access:** consolidate authorization into at most one server-maintained document plus the reservation. Define synchronous, authoritative updates for membership revocation, platform-admin status and reset generation; an eventually consistent trigger or client-maintained copy is not acceptable. This changes the authorization data model and must not make existing membership authority optional.
- **Demo-only server-mediated PDF transport:** deny direct client Storage access and implement authenticated upload/download handlers that check the existing authoritative documents. No public download tokens or long-lived signed URLs. Reset/upload finalization, immutable bytes and read-vs-reset races require explicit coordination. This changes the trust boundary and therefore needs explicit approval; it is not a silent Admin SDK bypass to make tests pass.

No implementation of either option, privilege expansion, new cloud deployment or IAM correction was performed. Decide and approve the bounded design first; keep all normal tenant and production paths unchanged.

## Verification and security review

Fresh checks after withdrawing the unsafe local edit:

- `node scripts/build-public-demo.mjs`: PASS.
- `node scripts/test-public-demo-policy.mjs`: 75 PASS (unchanged assertions).
- `node scripts/test-demo-package-guard.mjs`: wrong-project rejection PASS.
- `git diff --check`: PASS; existing LF/CRLF notices only.
- Read-only deployed Storage/local Rules parity: PASS, including platform-admin exclusion.

Prior receipts, **not rerun in this investigation**: final fresh races 10 PASS (`shiftoryx-demo-browser-QbTtqo`); local browser 84 PASS (`shiftoryx-demo-browser-J2gWJW`); OWNER 36 PASS (`shiftoryx-demo-browser-b773po`); isolation 255 PASS/all12 pairs; reset inventory, identity/lease/upload-race regressions; all requested npm suites/build and audit high threshold. The last audit retained 1 low and 4 moderate findings. The prior independent review preceded this hosted discovery; it does not approve a future Storage architecture change.

No dependencies, lockfiles or GitHub Actions changed. No secrets were printed or persisted by this investigation; existing cloud authentication was used only in memory for read-only inspection. No production customer data, real tenants, DNS, Rules, IAM or cloud configuration changed in this investigation. Demo-only IAM/Rules/Functions/domain changes from the preceding deployment remain as recorded above.

## Remaining work and deployment gate

1. Approve the Storage authorization correction design; implement and add permanent positive/negative/race regressions without weakening existing assertions.
2. Independent security review of that change and the complete demo boundary; verify any required narrowly scoped demo service-agent binding.
3. Re-run affected emulator and required regression suites, then deploy only the reviewed isolated demo correction.
4. Finish actual HTTPS acceptance for all four tenants, valid own-PDF positive controls, all12 foreign pairs, reset/re-entry races and PDF/history immutability.
5. Finish the full delivery report and Draft PR; no automatic merge.

```
FIRESTORE_EXPRESSION_LIMIT_RESOLVED=YES (prior local regression evidence)
RESET_CLEANUP_COMPLETE=YES (prior emulator evidence; hosted closure pending)
AUTH_RESET_RACE_RESOLVED=YES (prior emulator/browser evidence; hosted closure pending)
TENANT_ISOLATION_CLEAN=NO (complete hosted proof pending)
DEMO_PROJECT_ISOLATED=YES (separate deployed demo project)
PRODUCTION_PROJECT_UNCHANGED=YES (no task changes to customer project)
READY_FOR_HOSTED_DEPLOYMENT=NO (next correction deployment blocked)
SAFE_TO_SHARE_PUBLICLY=NO
```

Rollback for this investigation is limited to the external local backup `shiftoryx-storage-review-944e1c9dd9a84c1eaa643641ba71e1d9`. It contains the withdrawn unsafe attempt and is **not** a deployable rollback target. No remote rollback was performed. Any shutdown of the already hosted demo must target only the demo project and exact five demo aliases; never delete/move the production wildcard or customer data, and do not merely remove aliases if that would expose the production wildcard app at demo hostnames.
