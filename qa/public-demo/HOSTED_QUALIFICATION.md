# Future hosted qualification contract — not execution approval

R1_STATUS=BLOCKED. CONTROLLED_DEPLOYMENT_QUALIFICATION_READY=NO. PUBLIC_DEMO_RELEASE_READY=NO.

No hosted mutation test, reset, credentials/session setup, Rules/Functions/frontend deployment, IAM or cloud change is authorized by this local preparation.

## Two different baseline artifacts

`maintenance/public-demo/live-baseline.empty.json` is the EMPTY_UNVERIFIED recovery/infrastructure inventory. Its schema covers live resource IDs, Rules, Functions, aliases, schedules, reset/retention and exact Storage metadata. VERIFIED inventory never endorses the historical runtime as a rollback target.

`hosted-baseline.empty.json` is a non-executable qualification template consumed by the strict native TypeScript validator in hosted-qualification.ts. Its null fields deliberately fail. Populate a new file outside Git only in a separately approved qualification window; never write a token/password/key into it.

Required fields: schemaVersion1; exact project/bucket; qualificationSha; contextHash; fixtureSourceHash; fixtureVersion; UTC capturedAt; exactly five hostnames; exactly four tenant entries with generation, lastResetAt, fixtureAt, weekStart and canonical counts; per-tenant privateEvidence bound to the same generation. The external SHA256 supplied separately is over exact baseline file bytes, not a self-declared embedded hash.

Private evidence must contain an independently captured evidence digest, zero counts for demoPublicationArtifacts/exportAuditLogs/monthlyScheduleArchives, zero stored root monthly exports/tenant Storage objects and OPEN reset control. These server-private surfaces cannot be reread by an OWNER client; do not add a privileged reader API or infer emptiness from permission-denied. Their reviewed read-only metadata receipt must be captured and approved externally. Owner-readable rows/projections/histories/counters are reread and compared strictly before positives.

Use the existing canonical fixture adapter, never a new copy of business datasets. fixtureAt is the exact canonical reset fixture timestamp, not the later metadata capture time. Baseline capture must precede no more than one hour of use. Start only after the existing ten-minute reset cooldown has elapsed (lastResetAt is compared with actual demoState). The package context seal is obtained locally with qualificationContext(); it includes source, both lockfiles, target demo Rules and the hosted harness files. A local seal is not proof those bytes are deployed: that remains R1/cutover qualification.

## Guards and controllers

Both hosted entrypoints load and validate four explicit arguments: external web-config JSON; verified baseline JSON; independently approved baseline byte SHA256; qualification SHA. Required process flags: EXPECTED_PROJECT_ID=shiftoryx-public-demo, EXPECTED_BUCKET=shiftoryx-public-demo.firebasestorage.app, EXPECTED_QUALIFICATION_MODE=true, EXPECTED_RESET_QUALIFICATION_MODE=true. All emulator environment variables must be absent. Unknown/legacy state, host/project/bucket drift, duplicate JSON keys, stale timestamps and missing proof fail before Auth or mutation. The external config has only the six supported Firebase web-config fields; secret/server fields are rejected and never logged.

All four baselines are verified before business mutations. The isolation harness exports runHostedIsolationQualification for a separately reviewed in-process qualification controller. It requires preparedSessionProvider before Auth and will not auto-import executable paths, read token files/argv, create accounts/claims or silently skip standalone stale409, revoked401 and platform-admin403 cases. The provider returns an existing in-memory token plus externally reviewed precondition evidenceHash for the requested exact tenant/case. A generic malformed token is not valid proof of those distinct conditions. The normal standalone CLI refuses without that controller. No controller or session provisioning is implemented/authorized here.

Wrong-tenant context uses genuine A-token/B-origin probes in all12 directions. Old-session-after-reset is one combined case; it is not counted as three independent stale/revoked cases. A preexisting platform-admin collision cannot be manufactured by a frontend write; self-escalation has a separate SDK-denial probe. Future fixture/controller setup must itself receive explicit human review and cannot restore stale authorization or decrement generations.

The browser harness exercises real UI CRUD/settings, WEEK/MONTH Preview, versioned publication/PDF/history/reset and all12 foreign hostname directions. It observes successful typed requests, uses no development-server module imports, and blocks non-TLS/foreign network targets without replacing responses. SDK/API isolation is independently tested by the server-interface harness. No localhost result counts as actual hosted acceptance.

Full cleanup PASS also requires privateCleanupEvidenceProvider: an externally approved read-only collector returns a new g+1 receipt after each reset, with fresh observedAt/evidenceHash and zero private artifact/root-export/Storage counts plus OPEN control. Pre-run evidence cannot attest post-reset objects. Both exported harness entrypoints require this provider before Auth/mutation; standalone invocation refuses rather than silently treating OWNER-visible rows as complete private cleanup. The provider performs no cleanup/deletion and must not create privileged endpoints or new IAM scopes. It is not implemented or authorized to contact cloud during this phase.

## Cleanup and results

Employee/absence/announcement cleanup uses existing typed deletes with current revisions. Immutable publications and drafts are cleared only by the generation-safe reset contract under the separate reset flag/window approval. Fresh g+1 sessions reread canonical rows, projections and owner-readable empty collections after reset; ambiguous/uncertain failures remain FAIL for human recovery, never a generic prefix deletion. Browser failure cleanup uses the same contract; it does not restore old sessions.

Each harness needs a fresh independently captured baseline: do not reuse one after another suite's settings writes or reset. Shared visitor interference must fail rather than weaken exact counts/revisions/history. Credentials and private payloads are not printed in failures or result JSON. Store sanitized evidence outside Git.

## Local-only verification

scripts/test-hosted-qualification.mjs and scripts/test-hosted-runner.mjs exercise real guards/probe execution with controlled external adapters. hosted-target-emulator.mjs exercises the same scenario engine against fixed loopback synthetic infrastructure only; it cannot use the live SDK adapter. It is not a captured live baseline or hosted proof. No new dependency, privileged Function/test endpoint or security-policy exception is introduced.
