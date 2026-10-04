# Demo-only server-mediated PDF — Phase 1 design and Phase 2 implementation plan

> **For agentic workers:** Phase 1 is DESIGN ONLY. Do not execute this plan until the user separately authorizes Phase 2. Then use `superpowers:executing-plans` task-by-task; independent security review belongs to Phase 3. No automatic commit, deployment, IAM mutation or merge is authorized by this document.

**Goal:** Restore demo publication/PDF workflows without weakening membership, platform-admin exclusion, generation fencing or immutability.

**Architecture:** Two demo-only authenticated HTTP handlers own publication creation and PDF delivery. They use the existing authoritative Firestore documents, the existing V3 snapshot/analysis/projection functions, and a server build of the existing PDF renderer. Direct demo browser writes to publication lifecycle documents and all demo Storage objects are denied. A durable operation barrier coordinates PDF I/O with the existing reset state; it is coordination metadata, not an authorization projection.

**Tech stack:** Existing Node 22 Functions Gen 2, Firebase Admin SDK, Firestore transactions, Cloud Storage generation preconditions, React/Vite, TypeScript, jsPDF and esbuild already in the repository. No additional package is proposed.

**Spec:** The user's “SHIFTORYX PUBLIC DEMO — PHASE 1 — SERVER-MEDIATED PDF ARCHITECTURE & SECURITY DESIGN ONLY” request. This document supplies its sections 1–15; the prior hosted checkpoint is [PUBLIC_DEMO_HOSTED_STORAGE_GATE.md](../../PUBLIC_DEMO_HOSTED_STORAGE_GATE.md).

Inspection began 25 September and the final no-mutation/self-review checkpoint completed 26 September 2026 (Europe/Athens). The filename retains the inspection start date.

## Global constraints

- Demo project exactly `shiftoryx-public-demo`; local emulator exactly `demo-shiftoryx-public` with emulator mode enforced. No ambient project fallback.
- Tenant allowlist exactly `demo-fuel`, `demo-cafe`, `demo-salon`, `demo-market`.
- No production behavior, production Rules, normal Functions entry, IAM, DNS or real tenant changes.
- No replicated authorization projection; no tenant/path/bucket/UID/version authority supplied by the browser.
- No credentials, request bodies, private snapshots, PDF contents, cookies or signed URLs in logs.
- No new dependencies, lockfile edits or Actions changes. Reuse the installed, locked PDF library, including its existing license notices in the generated server bundle.
- Scheduling warnings remain non-blocking after explicit acknowledgement. Technical validation and authorization failures block publication.
- No claim that Firestore and Cloud Storage form a common transaction. In-flight/uncertain writes require durable accounting and fail-closed handling.
- This design does not authorize Phase 2 or a hosted deployment.

## 1. Inspection baseline and scope

```
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
CURRENT_BRANCH=codex/public-shiftoryx-demo
WORKTREE_CLEAN=NO
WORKTREE=C:/Users/Spyros/.codex/worktrees/shiftoryx-public-demo
```

Executed `git status`, `git branch --show-current`, `git rev-parse HEAD`, `git log --oneline -n 20`, `git diff --stat`, `git diff --check`. Diff check passed, with pre-existing newline-conversion notices. The tracked content diff is seven files, 49 insertions/79 deletions. `functions/src/index.js` is additionally reported modified by status but has no content diff. Untracked files are part of the baseline, not disposable scratch data.

Read repository instructions, project brain, canonical local roadmap, current-state document, export guidance, manifests, deployment config and security workflow. Older roadmap deployment dates are historical; the current explicit demo request and verified branch govern this phase. No remote roadmap edit or production inspection was needed.

### Uncommitted change inventory

| Existing change | Inspected purpose / disposition |
| --- | --- |
| `firestore.rules` | Employee optional-field evaluation and canonical/legacy validator selection; preserve existing expression-limit correction. No authorization redesign in this file. |
| `functions/src/index.js` | No content delta in current diff; preserve. |
| `qa/scheduler-v3/fixtures.ts` | Imports the canonical fictional JSON and clones it; preserve. |
| `src/App.jsx` | Demo-mode routing branch; preserve normal path. |
| `EmployeeProfileModal.jsx`, `MainDashboard.jsx` | Demo hides contact/tax fields; preserve. |
| `src/firebase/config.js` | Demo analytics exclusion; preserve. |
| `src/hooks/useSchedulerStore.js` | Deduplicates absence IDs arriving during awaited audit persistence; preserve. |
| `functions/src/public-demo/{policy.ts,service.ts,fixtures.ts,fixtures.json,entry.js,generated.js}` | Exact project/tenant guards, shared identity, reset lease/cleanup, canonical data and generated runtime. Generated service parity was checked in memory. |
| `firestore.demo.rules`, `storage.demo.rules`, `scripts/build-public-demo.mjs` | Generated demo-specific enforcement; inspected actual publication and Storage allow branches. Neither was regenerated/edited in this phase. |
| `scripts/package-public-demo.mjs`, `prepare-demo-cloud.mjs`, `test-demo-package-guard.mjs`, `test-public-demo-policy.mjs` | Isolated packaging/setup and policy guards. Setup/package scripts were read, not executed. |
| `src/demo/{config.ts,PublicDemoApp.tsx}`, `src/components/demo/{DemoBanner.tsx,DemoLanding.tsx,demo.css}` | Exact environment/host gating, broker entry/reset UX and fictional-data notice. |
| `qa/public-demo/{runtime.mjs,firebaseClient.js,vite.config.mjs,test-support.mjs,verify.mjs,README.md}` | Fixed local emulator boundary, safe owned-process lifecycle and fresh fixtures per suite. |
| `qa/public-demo/{isolation,reset-coverage,settings-regression,entry-recovery,lease-recovery,storage-reset-race,normal-rules-regression}.mjs` | Existing authorization, cleanup, Rules and recovery assertions; no suites executed against mutable data. |
| `qa/public-demo/{browser,owner-workflows,auth-reset-races,hosted-browser,hosted-isolation,visual}.mjs` | Local vs actual-HTTPS distinctions and UI/API checks. Hosted isolation currently hardcodes generation 1 and incorrectly requires an absence for Salon, whose canonical absence list is empty; Phase 2 must correct fixture assumptions, not remove denial assertions. |
| `docs/PUBLIC_DEMO_{PREFLIGHT,BLOCKER_REVIEW,LOCAL_QA_HANDOFF,HOSTED_STORAGE_GATE}.md`, existing 2026-09-14 plan | Historical evidence/checkpoints preserved. This new design is the only intended file addition for this phase. |

This is a flow/design inspection, not an independent whole-repository security certification. No newly demonstrated urgent exploit requiring emergency mutation was established. Existing hosted PDF unavailability remains a release blocker.

## 2. Current PDF flow: exact source trace

Paths below are repository-relative, with concrete functions instead of inferred behavior.

| Step | FILE / FUNCTION | INPUTS → OUTPUTS | TRUST_BOUNDARY / CURRENT_AUTHORIZATION | CURRENT_FAILURE_MODE |
| --- | --- | --- | --- | --- |
| Preview edits | `src/components/scheduler/SchedulerWorkspaceV3.jsx` / `change`; `src/services/schedulerV3Service.ts` / `editDraftV3`, `analyzeDraftV3` | Edited shifts + draft → validated local draft, hours/warnings | Browser-only model; no server authority yet | Technical validation throws; no publish. Business violations produce warnings. |
| Publish action | `SchedulerWorkspaceV3.jsx` / inline Publish `onClick` via `run` | `refreshDraftPeopleV3` candidate + warning acknowledgement → `publishDraftV3` call | Browser UID/tenant/UUID/timestamp passed to service; UI busy/warning checks are not security | Changed warnings require re-acknowledgement. Every new click creates a new UUID, so lost-response retry is not durable idempotency. |
| Snapshot + ordering | `src/services/schedulePublicationService.ts` / `buildPublicationV3`, `publishDraftV3` | Draft/context → snapshot, then reserve/render/upload/finalize | In-memory pure validation/analysis; server trusts enforced Rules, not the helper itself | Rejects mismatched tenant/invalid context, unacknowledged warnings or empty/≥10 MiB PDF. No PDF parser/content-to-snapshot proof. |
| Version reservation | `src/repositories/schedulePublicationsRepository.ts` / `reserve` | tenant, periodKey, publication ID → version | Client Firestore transaction reads reservation/counter, writes counter+reservation. Rules: active matching OWNER, not active platform admin, demo claims/state; `getAfter` binds counter/reservation | Existing reservation reused only after period check; gaps possible after downstream failure. No reset generation field in reservation. |
| PDF rendering | `src/services/schedulePublicationPdf.ts` / `renderPublicationPdfV3` | Snapshot → `Uint8Array` | Browser jsPDF + embedded Roboto, plain text; no storage/auth here | Render/import failure after version reservation. Creation metadata is not currently frozen for deterministic retries. |
| Path derivation | `schedulePublicationService.ts` / `buildPublicationV3` | tenant + publication ID → `pdfStoragePath` | Derived client-side; canonical path also checked by publication Rules | Client derivation is not trustworthy server authority. |
| Upload | `schedulePublicationsRepository.ts` / `uploadPdf` | tenant, arbitrary parameter `path`, bytes → Firebase `uploadBytes` completion | Client checks own prefix/suffix; Storage Rules enforce owner, platform exclusion, reset generation, reservation, create-only, MIME, <2 MiB demo cap | Hosted `storage/unauthorized`; three authorization documents plus reservation exceed hosted limit. Client 10 MiB and demo 2 MiB caps also differ. |
| Finalize + latest | `schedulePublicationsRepository.ts` / `finalize` | snapshot → publication + conditional period index + sanitized projections | Client Firestore transaction; publication immutable create, counter reservation linkage via Rules; `projectionTargetsV3`/`projectionPayloadV3` reuse prior slices | No cross-service PDF existence check in Firestore Rules. Existing publication throws, not idempotent success. Upload-success/finalize-failure leaves object/reservation until reset. |
| Latest projections | `src/services/publicationProjectionsV3.ts` / `projectionTargetsV3`, `projectionPayloadV3` | publication + previous public slices → affected weeks/months | Same finalization transaction; update only if new version exceeds latest for the **same periodKey** | Versions across overlapping WEEK/MONTH periods are not globally comparable. Preserve existing merge/order semantics, do not redesign scheduling. |
| History | `schedulePublicationsRepository.ts` / `list`; `src/components/scheduler/PublicationHistoryV3.jsx` | tenant → sorted snapshots and immutable table UI | Firestore list requires matching owner/demo generation. Old snapshots are copied into new drafts, not edited | No history row exists if finalize never succeeds. |
| Download | `SchedulerWorkspaceV3.jsx` / `download`; repository / `download` | publication ID → direct Storage `getBytes` → Blob URL/browser download | Client canonical path, Storage Rules three-document owner/generation test. No publication document lookup on the current Storage read branch | Same hosted budget failure. Current read does not require finalized publication existence. Local Blob URL is not a public Firebase URL. |
| Reset cleanup | `functions/src/public-demo/service.ts` / `resetTenant`, callable `resetPublicDemo`, scheduled `resetPublicDemosDaily` | explicit allowlisted tenant + verified caller or trusted scheduler → incremented generation, canonical fixture | Admin SDK: fixed project/tenant; state/control transaction; matching member for public reset; revoke old identity; delete explicit collections/root metadata/exact prefix with object-generation conditions | Errors leave reset locked. Current coordination relies on Rules fencing client writes; it does not yet account for a trusted server upload finishing after the Storage sweep. |

Current finalization writes `schedulePublications/{id}`, `schedulePublicationPeriods/{periodKey}`, and affected `publicSchedules`/`publicMonths`. Reservation/counter are allocated earlier. UI draft saving is a separate action; current Publish does not require the draft to have been saved first.

## 3. Storage Rules document budget

`storage.demo.rules` functions: `demoAccess`, `isPlatformAdmin`, `isTenantAdmin`, followed by `match /tenants/{tenantId}/schedule-publications/{publicationId}/schedule.pdf`.

| Authoritative document | Download | Upload | Requirement |
| --- | --- | --- | --- |
| `demoState/{tenantId}` | Read | Read | `resetting == false`, claim generation matches |
| `platformAdmins/{uid}` | Exists/get | Exists/get | ACTIVE platform identity excluded |
| `tenantMemberships/{uid}_{tenantId}` | Exists/get | Exists/get | uid/tenant/status ACTIVE/role OWNER |
| `tenants/{tenantId}/schedulePublicationReservations/{publicationId}` | No | Exists | Reservation exists |
| Distinct documents on valid path | **3** | **4** | Hosted allowance **2** |

The upload also requires `resource == null`, `request.resource != null`, safe ID, content type `application/pdf` and size strictly less than `2 * 1024 * 1024`. Repeated reads of one document may be cached; three/four different paths cannot be collapsed by local-variable caching. Removing any authoritative guard is not a permitted fix. [Firebase Storage Rules limit](https://firebase.google.com/docs/rules/rules-behavior#security_rules_limits).

The separately missing cross-service service-agent role is not a solution to this incompatible data-access shape. The proposed final demo Storage Rules have **zero** Firestore lookups, so that missing role should not be added for this design.

## 4. API boundary and authoritative authorization

### Chosen transport

Use Gen 2 `onRequest` handlers, each accepting POST JSON and bounded OPTIONS preflight, region `us-central1`, Node 22, memory 512 MiB, timeout 60 seconds, maxInstances 2, concurrency 4. Application-level serialization below, not instance counts, supplies correctness. Reuse existing Functions infrastructure; do not introduce a Vercel API/proxy, Express dependency or browser upload session.

```
PROPOSED_UPLOAD_HANDLER=publishPublicDemoPdf
PROPOSED_DOWNLOAD_HANDLER=downloadPublicDemoPdf
```

The “upload” is a server-generated artifact upload, not reception of user-provided PDF bytes. This gives stronger snapshot correspondence and removes the need to accept arbitrary PDF/HTML content. Existing HTTP Functions can return binary responses; use a fully validated bounded Buffer response, not an early pipe from Storage. [Firebase HTTP Functions](https://firebase.google.com/docs/functions/http-events).

### Common authentication/authorization sequence

1. Reject unsupported method, query parameters, encodings and oversized envelope; runtime/project/bucket guard before any business data access. Allow POST only, plus OPTIONS with no business work. Reject compressed request bodies and multipart/binary uploads.
2. Require one `Authorization: Bearer <Firebase ID token>` header. Do not accept custom tokens, cookies, query tokens, a service-account identity from the client, or caller-supplied decoded claims. Admin `verifyIdToken(token, true)` verifies the demo project and token revocation/disabled user. Emulator exceptions exist only in the already guarded local emulator mode.
3. Derive tenant solely from the **verified** `demoTenant` claim; require exact four-tenant allowlist, `publicDemo === true`, positive safe-integer `demoGeneration` and UID `demoOwnerUid(tenant, generation)`.
4. Require request Origin exactly `https://{thatTenant}.shiftoryx.gr`. Landing origin cannot publish/download. CORS lists only the four tenant origins; do not use a wildcard regex. Origin is an additional browser barrier, not authorization; non-browser clients can forge it.
5. In an authoritative transaction read `demoState/{tenant}`, `platformAdmins/{uid}`, `tenantMemberships/{uid}_{tenant}` and `tenants/{tenant}`. Missing/malformed state, membership or tenant fails closed. Require current unlocked generation, matching UID+tenant, ACTIVE OWNER, and a demo tenant document (`id`, `slug`, `isDemo:true`, `status:'ACTIVE'`) matching the fixed tenant. An ACTIVE platform-admin document denies access regardless of membership; malformed platform status also denies, never silently treats it as absence.
6. Read the operation-specific draft/reservation/intent/publication/manifest under **that same tenant**, plus the PDF coordination and quota records. No collection-group/global search for a publication ID and no selection by body/header hostname.
7. Recheck those authority documents at pre-I/O admission and the final commit/release point described below. Coordination records never substitute for membership/platform/state reads. Do not cache authorization across requests.

A verification/key-fetch outage returns a generic failure; never trusts an unverified token as fallback. Token verification reads existing Auth metadata only; handlers never create users/claims/memberships or platform admins.

### Publish contract

POST JSON, exact keys:

```
{ intentId, draftId, draftRevision, previewHash, acceptWarnings }
```

- `intentId`: canonical lowercase UUIDv4 created once for an explicit Publish intent and reused on uncertain retries.
- `draftId`: existing repository-safe ID, ASCII `[A-Za-z0-9_-]{1,100}` (use the narrower creation contract, not the repository's looser 120 limit).
- `draftRevision`: positive safe integer of the saved draft.
- `previewHash`: 64 lowercase hex SHA-256 of the canonical preview described below. This detects staleness, **never** supplies authorization.
- `acceptWarnings`: boolean. `false` permitted only when server analysis has no warnings.

MUST NOT accept `tenantId`, UID, generation, publicationId, version, timestamp, periodKey, snapshot, warnings, totals, Storage path, bucket, URL, file name, PDF/base64/bytes/MIME, metadata, leases or projection payloads. Reject unknown keys, arrays, null, duplicate JSON keys and malformed JSON rather than silently dropping fields. Limit actual raw body to 4 KiB (also validate Content-Length if supplied); handler-side limit is not a claim of provider-level pre-parser DoS protection.

The two envelopes are flat: implement a bounded raw-body token scanner for object/string/number/boolean tokens, rejecting duplicate keys, escaped key names, nested values and extra trailing tokens before `JSON.parse`. Do not try to detect duplicate keys with a substring search. The accepted ID/hash strings use their ASCII grammars; escaped variants are unnecessary and rejected. `Content-Type` must be `application/json` (optional UTF-8 charset), with valid UTF-8, one Authorization header ≤8 KiB and no compression. OPTIONS accepts only the listed origins, POST and Authorization/Content-Type headers; it performs no authentication/data operation.

Client prepares the current candidate exactly as today, saves it using `saveDraft`, stores the returned revision in React state, and computes a canonical preview hash. Canonicalization is UTF-8 JSON, object keys sorted lexicographically by codepoint, array order preserved, undefined object properties omitted, no NaN/infinity or prototype keys. Hash these exact normalized fields: `id`, `config`, `employees` restricted to `id/fullName/isActive/activeFrom/activeTo/color/schedulerV3`, mapped `absences`, `periodType`, `periodStart`, `periodEnd`, `options`, `sourcePublicationId` when present, and canonical persisted `shifts` fields. Exclude revision, audit fields and storage wrapper fields (`type`, document ID). Return one canonical helper shared by frontend and server; SHA-256 uses Web Crypto on client and Node crypto on server.

Canonical shift keys are exactly `id,date,employeeId,employeeName,shiftTemplateId,startTime,endTime,durationHours,crossMidnight,source,isManualOverride,schedulerSchemaVersion,draftId`; derive employeeName from the canonical employee map, normalize crossMidnight to boolean and draftId to the enclosing ID. Canonical absence keys are `id,employeeId,type,startDate,endDate,scope`; no reason/private note. `options` contains only boolean `balanceWeeklyTargets`. Normalize employee activeFrom/activeTo to null when absent, omit undefined color, and use `decodeDraftProfilesV3` consistently on both sides. This prevents saved-wrapper/default-field differences causing perpetual PREVIEW_CHANGED.

The server transaction reconstructs the saved draft by explicit `shiftDocumentIds`, requires the exact saved revision, validates each ID and `draftId` binding, then runs `decodeDraftProfilesV3` and `refreshDraftPeopleV3` with current tenant employees, absences and settings as the existing UI does. Compare computed previewHash before allocating a version. Current names/active state/absences are refreshed; saved config/profile semantics stay as `refreshDraftPeopleV3` defines, not re-generated shifts. Stale revision/hash returns 409 `PREVIEW_CHANGED` and no reservation; client reloads/reviews and explicitly starts a new intent.

Run existing `analyzeDraftV3`/`assertV3Input` and a narrow persisted-record schema decoder before using Admin SDK writes. Existing client-writable Firestore data is **untrusted input**, not automatically safe because it came from the database. Validate known keys/types, valid dates/times, unique IDs, finite numeric values, employee/shift references and exact tenant binding. Use ≤100 employees, ≤449 shifts (existing 450-write draft budget includes metadata), ≤50 templates, ≤1,000 relevant absences; fetch bounded queries with limit+1 and fail on overflow, never truncate. Restrict this demo endpoint to a valid Monday–Sunday WEEK or exact calendar MONTH (≤31 days). Keep the existing technical limits separate from soft business warnings. Bound user-facing strings to 200 characters and reject control characters; preserve Greek UTF-8. Frozen snapshot serialized UTF-8 must be <768 KiB before persisting, including all calculated warnings. No new scheduler rules or automatic “repair”.

Response on initial or idempotent finalized success, HTTP 200:

```
{ publicationId, version, periodKey, publishedAt, replayed }
```

No bytes/URLs/tokens returned by publish. Existing scoped `repository.list` loads the immutable snapshot/history. `publishedAt` and `pdfGeneratedAt` use one server timestamp frozen when reservation is created, preserving the current snapshot schema. It represents publication preparation time, not a claimed atomic cross-service commit time.

Existing-intent replay is checked before reloading a potentially changed/deleted draft: require the exact stored request tuple and current authorization. FINALIZED returns its stored identity; active PREPARING/IO states return busy unless the safe attempt-adoption rules apply. A new preview must not silently mutate an existing intent. Preserve intent independently of draft save result once the request is first issued; a failed save sends no publish request.

### Shared error, logging and retry contract

All error responses are JSON `{error:{code,message},requestId}` with fixed public messages, never raw exceptions. Codes/statuses: `INVALID_REQUEST` 400; `UNAUTHENTICATED` 401; `ACCESS_DENIED` 403; `PDF_NOT_AVAILABLE` 404; `METHOD_NOT_ALLOWED` 405; `PREVIEW_CHANGED`, `INTENT_CONFLICT`, `PDF_BUSY`, `DEMO_GENERATION_CHANGED` 409; `PAYLOAD_TOO_LARGE` 413; `UNSUPPORTED_MEDIA_TYPE` 415; `RATE_LIMITED` 429; `PDF_INTEGRITY_FAILURE` 500; `DEMO_RESETTING`, `PDF_RECOVERY_REQUIRED`, `SERVICE_UNAVAILABLE` 503. Auth failure occurs before publication existence disclosure. Provider/internal error strings stay out of responses and logs.

Log only `{event,requestId,tenantSlug,operationKind,statusCode,errorCode,durationMs}` after sanitization; the server generates requestId. No caller-supplied correlation text, paths, UID, input hashes, body or byte content. Errors before tenant verification omit tenantSlug. Use existing platform logging only, no external telemetry.

Client may refresh its ID token once on 401; if that fails show re-entry guidance, never direct-Storage/anonymous/production fallback. Never auto-retry 400/403/404/413/415, PREVIEW_CHANGED, INTENT_CONFLICT or generation change. Transient 503/transport loss/PDF_BUSY allows at most three retries with the **same** tuple/intent, delays 1/2/4 seconds plus bounded jitter, respecting a capped Retry-After. After that show an explicit retry action retaining the intent. PDF_RECOVERY_REQUIRED does not auto-retry. Download retries rerun authorization from the start and return no partial file. Quota errors use Retry-After, not a hot polling loop.

### Download contract

POST JSON, exact keys: `{ publicationId }`, canonical server UUIDv4, raw body ≤1 KiB. Do not accept a path, tenant, version, bucket, generation, URL or arbitrary file name. Full common auth above. Missing publication, foreign ID, absent manifest or old-generation ID uses the same generic 404 `PDF_NOT_AVAILABLE` **after caller authorization**; do not disclose foreign existence.

Read scoped `schedulePublications/{publicationId}` and its server-only `demoPublicationArtifacts/{publicationId}` in the admission transaction. Require manifest `FINALIZED`, exact tenant/UID-generation ownership context, publication ID/path consistency, snapshot SHA, nonempty size <2 MiB, fixed MIME and stored GCS object generation. UID ownership is the generation's shared OWNER; no cross-generation adoption.

Derive path, read metadata and then bytes at the **recorded GCS generation**, not mutable latest. Enforce length and SHA-256; read at most cap+1 bytes with cancellation on excess, no unbounded `download()` buffer. Recheck authoritative state/membership/platform/manifest/publication in a final transaction before releasing any byte. Return raw bytes with:

- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="schedule-{validated-periodKey}-v{version}.pdf"` (ASCII derived fields, no CR/LF)
- `Content-Length`, `X-Content-Type-Options: nosniff`
- `Cache-Control: private, no-store, max-age=0`, `Vary: Origin, Authorization`
- exact allowed Origin; no credentialed-cookie CORS, no redirect, no permanent URL, download token or signed URL

Do not support Range, conditional 304 or inline preview in this first transport. Reject Range requests before I/O. Browser uses authenticated `fetch` → Blob → existing local object-URL download and revokes that URL. In-memory buffering is appropriate below 2 MiB and permits a final check before byte release; early streaming cannot offer that check. Already delivered bytes cannot be revoked or erased from a user's device.

## 5. Storage path and artifact contract

```
PDF_STORAGE_PATH_TEMPLATE=tenants/{tenantId}/schedule-publications/{publicationId}/schedule.pdf
```

Server generates publicationId as lowercase UUIDv4 once and stores it in the intent. Tenant is the verified exact allowlist member. No decoded arbitrary path segments, percent-encoded slashes, `..`, backslashes, Unicode lookalikes or client-provided suffixes can reach path construction. Enforce grammar before creating document references. The fixed project determines the fixed demo bucket; do not consume client or manifest bucket/path as authority. On reads compare stored path to the freshly derived path and reject mismatch.

Immutable upload: non-resumable GCS object creation with `ifGenerationMatch:0`, contentType fixed `application/pdf`, private/no-store metadata, no Firebase download token/ACL/public grant. Use no fire-and-forget SDK calls. Disable automatic upload retries; one tracked attempt at a time. A 412 means an existing object must be verified against this exact reservation's expected SHA/size/snapshot; it is never permission to overwrite/delete and retry. Deletion is only for a proven unfinalized own operation or selected demo reset, at the recorded GCS generation. [GCS request preconditions](https://cloud.google.com/storage/docs/request-preconditions).

Render only plain text from `buildPublicationV3` through the existing `renderPublicationPdfV3`/Roboto source. No HTML renderer, remote fonts/images, PDF import, external hyperlinks, attachments, JavaScript or user template execution. Set PDF creation date and file ID deterministically from the frozen server timestamp/snapshot hash for retries. Add optional renderer options with unchanged defaults for normal tenants. Record renderer bundle/version digest in the reservation. A changed renderer cannot regenerate different bytes under an existing artifact identity.

Before I/O, ensure `Uint8Array`, nonzero length strictly <2,097,152 bytes, `%PDF-` header and expected trailing EOF structure from the trusted generator. These checks are corruption guards, **not a malware validator for arbitrary uploaded PDFs**. Arbitrary PDF bytes are not an accepted API input. Save generated byte SHA/size before I/O; after upload verify metadata/object identity and persist them into the final artifact manifest. Downloads serve the exact saved bytes, never rerender from live data.

## 6. Firestore state model and publication state machine

Reuse existing tenant reservation/counter/publication/index/projection collections. Add only demo coordination metadata:

| Document | Proposed fields and writer |
| --- | --- |
| `demoPdfControls/{tenant}` | `operationId`, `attemptId`, `kind:PUBLISH|DOWNLOAD`, `generation`, `stage`, `startedAt`, `heartbeatAt`; server only. One active PDF operation per tenant, transactionally acquired. Not authorization. Missing/idle control means no outstanding tracked I/O. |
| `demoPdfRequests/{tenant}/intents/{intentId}` | Immutable input tuple/hash, tenant, UID, generation, publicationId, state, timestamps, version, periodKey; server only. Survives reset as a small invalidated tombstone, with visitor payload removed. No credentials. |
| Existing `schedulePublicationReservations/{publicationId}` | Existing tenant/period/version/publisher plus demo transportVersion, generation, intentId, attemptId, frozen snapshot/hash, renderer digest, expected PDF SHA/size, state; server only in demo. |
| `tenants/{tenant}/demoPublicationArtifacts/{publicationId}` | `status:FINALIZED`, tenantId, generation, publicationId, snapshotHash, SHA-256, byteLength, contentType, storageObjectGeneration, rendererDigest; immutable server create, reset-only deletion. |
| `demoPdfLimits/{tenant}` | Bounded server-time quota counters, not reset by visitors; server only. |

Limits: one active PDF I/O per tenant; ≤30 newly accepted publication intents/hour/tenant; ≤60 download admissions/minute/tenant. Retry of an existing intent never consumes another version/new-intent quota. Rate-limit replay/download work too. Controls serialize different publication requests with 409 `PDF_BUSY`; the browser may retry with the same intent. Different tenants remain independent. Bound retries, handler time and memory; no promise queue that grows with public traffic. This limits post-auth application work, not a guarantee against billable unauthenticated request floods.

```
ABSENT -> RESERVED -> RENDERED -> IO_INTENT -> OBJECT_STORED -> FINALIZED
             |           |          |              |
             +-----------+----------+--------------+-> CANCEL_PENDING -> CANCELLED
                                    |
                                    +-> IO_UNCERTAIN (fail-closed, no automatic takeover)
```

`FINALIZED` lives in the intent/reservation and corresponds to publication+artifact existence; no partially prepared snapshot is inserted into `schedulePublications`.

### Exact sequence

1. Authenticate and reject invalid envelope before quota/render/Storage work.
2. Transaction T1: read authority documents, existing intent, control, quota, draft metadata/shifts and bounded current people/absence/settings records. Reconstruct/validate preview. Existing matching FINALIZED intent returns its same identity after current authorization; mismatched tuple/UID/generation is rejected. Read all before writes.
3. For a new valid intent: allocate server UUID outside the retryable transaction callback (stable across callback retries), increment existing period counter exactly once, create intent+reservation with frozen `buildPublicationV3` snapshot, acquire control with random attemptId. Failed transactions allocate nothing. Repeated intent never re-increments counter. Version gaps after abort are allowed and documented; never decrement/reuse counters.
4. Render bounded deterministic bytes **outside** transaction callbacks. Never put Storage/render/network side effects inside a Firestore transaction that the SDK may retry.
5. T2 pre-I/O: re-read authority, control/attempt, intent/reservation and absence of publication/manifest. Ensure unchanged frozen snapshot and allowed generation. Persist expected SHA/size and `IO_INTENT` before invoking GCS. This is write-ahead tracking of every possible upload.
6. Perform one immutable Storage create. On known completion record object generation and `OBJECT_STORED`; on uncertain completion keep IO_UNCERTAIN/control. No release based solely on elapsed time.
7. T3 finalization: re-read all authoritative documents (including existing/missing platform-admin document), control/attempt, exact reservation+intent hashes/generation, publication, artifact, index, and previous projection targets. Require object identity/checksum already confirmed while the control is held; reset cannot sweep it while I/O control is held. Atomically create publication+artifact, mark intent/reservation FINALIZED, and update index/projections using the existing same-period `latestVersion` condition and `projectionPayloadV3`. Clear control in this same commit. No Storage call in this transaction.
8. Return success. If HTTP response is lost, same intent returns the same finalized publication; no new version/render/upload. If reset committed before the retry, deny/invalidate, never reconstruct it in the new generation.

Current draft changes after T1 do not mutate the frozen snapshot: the accepted saved revision is the publication input. Reservation/hash mutation before T3 aborts; any privileged corruption is not silently repaired. Concurrent membership/platform/reset changes read in T3 cause transaction conflict/retry and current-state rejection. [Firestore transaction commit-time serializability](https://firebase.google.com/docs/firestore/transaction-data-contention).

### Failure/cleanup/retry matrix

| Failure point | Firestore result | Storage result | Cleanup / retry |
| --- | --- | --- | --- |
| Invalid input/auth/preview before T1 commit | No reservation/version/control | None | Correct input/review; no blind auth retry |
| T1 conflict/transient failure | Atomic no-op or one committed intent | None | Retry same intent; read outcome before allocating |
| Render/size/type failure | Reservation retained; terminal failure/cancel and control cleared if no I/O began | None | No new version on same intent; review/fix before explicit new intent |
| Revocation/reset/reservation change before T2 | Mark rejected/cancelled under matching attempt; no final publication | None | No stale retry; re-entry/new generation requires new intent |
| Known upload rejection | Reservation failed; no publication | None if creation conclusively rejected | Release after known settlement; retry same intent only while authorized, preserving identity |
| Upload timeout/disconnect/worker death with ambiguous outcome | IO_UNCERTAIN and outstanding control remain | Unknown; potentially private object backed by reservation | Do NOT infer absence from one HEAD/404 or elapsed lease. Do not release reset barrier. Operator/recovery evidence required. |
| Upload succeeds, checkpoint/transaction fails | Reservation/intent track attempted object; not visible in history | Private immutable object | Once outcome conclusively known, retry validation/finalization same intent or conditional cleanup; never allocate new version automatically |
| T3 loses auth/generation race | No publication/latest update | Private unfinalized object | Mark CANCEL_PENDING before conditional generation deletion; release barrier only after known cleanup completion |
| T3 succeeds, response lost | Exactly one publication/artifact/index result | Exact immutable PDF | Replay same intent gives HTTP200/replayed, no write/overwrite |
| Cleanup itself fails/unknown | CANCEL_PENDING/IO_UNCERTAIN remains | May exist | Fail closed and retain accounting/control; reset cannot report success |
| Existing object differs from expected digest/size/generation | No final publication; diagnostic incident | Preserve unexpected object, no overwrite | Fail closed; trusted investigation, not client deletion |

There can be a **temporary private staged object backed by a valid reservation**, but never a downloadable unfinalized artifact or an untracked upload. Instant cross-service atomic rollback is impossible. “No orphan after successful reset” is achieved by draining all recorded I/O before the sweep/unlock, not by claiming such rollback exists.

### Retry/crash ownership rule

Every stage transition CAS-checks attemptId/control/state. Only the current attempt may begin I/O. A stalled pre-I/O attempt may be cancelled/taken over transactionally; its old worker must recheck and fails before issuing GCS work. **An IO_INTENT/IO_UNCERTAIN attempt is never stolen merely because a lease/deadline elapsed.** After verified OBJECT_STORED with no outstanding Storage work, a new attempt can safely adopt the immutable object only by CAS and complete T3; old attempts lose finalize/delete authority. Cleanup admission also CAS-checks that no finalized publication/manifest exists and marks CANCEL_PENDING before deletion, preventing finalize-vs-delete races.

For an actually lost worker with uncertain GCS outcome, availability is deliberately sacrificed: leave demo/reset locked and require separately authorized operator recovery that establishes all original upload attempts have conclusively settled. Scale-to-zero/HTTP timeout alone is **not** proof that a previously accepted Storage request cannot complete. If settlement cannot be established, do not clear the barrier. No optimistic “lease expired, probably safe” fallback. This is an explicit operational limitation, not an unresolved trust assumption or an automatic generic deletion primitive.

## 7. Download release and TOCTOU semantics

Acquire the same tenant control (kind DOWNLOAD) before Storage read; record selected generation/publication/object generation. Read/hash bounded bytes, then T-download re-reads authority+publication+manifest/control. This transaction is the **authorization linearization point for byte release**. Start no response body before it succeeds. Hold the control through response finish/close; settle/cancel all own reads before release. A cancelled response is not success.

If reset or membership revocation wins before T-download, return denial and discard buffered bytes. If T-download commits first, the already-authorized response may finish while a later reset/revocation begins; do not promise retroactive recall. Reset waits for this operation to finish before reporting successful cleanup. CORS/no-store prevents shared caching but cannot remove a deliberately downloaded copy.

Both upload and download check Firebase Auth revocation initially and again immediately before final authorization. Authority is linearized at the Firestore transaction, not an assumed distributed transaction with Firebase Auth. A future identity change after admission cannot retroactively undo already completed work; Firestore membership remains the authoritative immediate operational revocation control.

## 8. Reset/generation integration

Extend the **existing** `resetTenant` flow; keep allowlist/cooldown/lease/foreign preservation.

- Reset acquisition transaction reads PDF control as well as existing `demoState`/`demoControl`, advances generation and sets resetting=true as today. No new PDF operation can then acquire/admit I/O.
- It must **not delete reservations, intents or PDFs yet**. First drain outstanding PDF control. A live operation sees the fence, skips finalization, settles its I/O and conditionally removes any unfinalized own object, then releases control.
- Once control is empty, perform existing explicit collection/root-export cleanup and generation-conditional exact-prefix Storage sweep, plus the new artifact manifest collection. Recheck control empty under final reset transaction before exposing canonical state.
- Convert old completed/cancelled intent records to small INVALIDATED tombstones; retain `{intentId,tenant,uid,generation,publicationId,inputHash,status}` so retry cannot recreate a prior intent. Strip frozen snapshot and all visitor content. Retain current-generation intents until reset; prune terminal tombstones older than 7 days only in trusted scheduled maintenance. Old tokens still fail generation checks even after tombstone expiry. Never prune nonterminal/uncertain records.
- Keep quota records across reset; visitors cannot reset rate limits. Keep the PDF control outside the existing business-data deletion loop. Add only the explicit `demoPublicationArtifacts` collection and exact demo request namespace to reset inventory. No generic recursive tenant delete.
- Existing eight-minute reset lease recovery may recover the reset worker, but it must not override an outstanding PDF barrier. A trusted retry still drains it first. Timeout/error leaves resetting=true. Daily reset cannot silently unlock partial state.

| Interleaving | Required result |
| --- | --- |
| Reset starts before publish/T1 | No reservation/upload; stale generation rejected |
| Reset after T1 but before T2 | Fence observed, no upload, cancelled intent |
| Reset during upload | Reset waits; uploader settles and deletes unfinalized object; no T3 publication |
| Upload completes after generation changes | T3 rejects; conditional cleanup occurs before reset sweep/unlock |
| Reset completes before late finalization attempt | Impossible for a tracked live upload to survive successful reset; stale/fenced finalizer still rejects missing/wrong reservation and generation |
| Download during reset | New admission denied; buffered not-yet-admitted response denied; already admitted response drains before reset success |
| Old publication ID after reset | Generic unavailable; manifest removed; no old-generation adoption even with fresh login |
| Retry after reset | Old intent invalidated; no new allocation. User regenerates/reviews in new session and creates new intent |
| Upload/cleanup worker crashes | No successful reset while outcome is uncertain; permanent regression must prove this |

## 9. Membership/platform/reservation TOCTOU decisions

| Changed authority | Required checkpoints / outcome |
| --- | --- |
| Membership revoked after request start | Initial and pre-I/O and T3/T-download reads. Revoke-before-final-commit prevents publication/byte release. |
| Revoke between pre-I/O check and actual Storage write | A private staged object may be created by trusted runtime, never made downloadable; T3 rejects and cleans. Do not claim the SDK write and Firestore check are atomic. |
| ACTIVE platform admin appears | Same three reads including absent-document read; platform grant before final commit denies, despite a matching OWNER row. |
| Reset generation changes | Transaction reads conflict/re-evaluate, no stale finalize; PDF barrier prevents premature reset success. |
| Reservation or intent changes | Hash, identity, generation, phase, attempt and version bound in T2/T3; reject mismatch. Public clients cannot update these after migration. |
| Saved draft/current roster changes after snapshot freeze | Frozen accepted revision is immutable; not a change of tenant authority. No invisible rerender/replacement. |

Current public reset validates membership/claims but does not explicitly read platformAdmins in its acquisition transaction. For the new coordination integration, use the same existing-authority guard for **public reset acquisition** so the forbidden dual-role state cannot operate through that handler either; scheduled internal reset has no caller role and keeps its separate trusted path. This is a specified demo-only Phase 2 correction, not an implemented change or a production migration.

## 10. Direct client enforcement after migration

```
DIRECT_CLIENT_PDF_STORAGE_AFTER_MIGRATION=DENIED
```

Generate a demo-only Storage ruleset denying **all** client read/write paths. There are only two current Storage families in application source: immutable publication PDFs and legacy `monthly_schedule_pdfs`. Public-demo package omits `VITE_ENABLE_MONTHLY_PDF_ARCHIVE`, default false; emulator config explicitly false; V3 Tools disables archive creation. Phase 2 packaging must explicitly pin that flag false and test it. The legacy local-only exports do not need Firebase Storage. Production archive repository/rules stay untouched. Reset still removes old objects in both families through the demo runtime.

If Phase 2 inspection finds another enabled demo Storage consumer, STOP: do not quietly deny a required workflow or reopen client access. No new legacy archive upload/download API is included in this phase's design.

Demo Firestore Rules changes are also required in Phase 2, not now:

- Keep authorized reads of existing publication/history/counter/index data.
- Deny browser create/update/delete on counters, reservations, publications and period indexes; otherwise a hostile browser could bypass the new publication finalizer by writing Firestore directly.
- Deny client writes to demo `publicSchedules`/`publicMonths` that are now exclusively server publication projections. Preserve sanitized reads and announcements/employee tools. Old client publication pipelines must fail closed.
- Deny all client access to PDF controls/requests/limits/artifact manifest documents. No catch-all allow can override these denials.
- Do not modify `firestore.rules` or `storage.rules` (normal tenants). Change demo generator targets and generated demo files only. Generator assertions must separately enforce server-only Storage rather than incorrectly requiring its old cross-service helper text.

Admin SDK uses IAM instead of client Rules. That is the **explicit reviewed trust boundary**, not an undocumented Rules bypass: the new handlers must perform all authoritative checks themselves and reject input previously validated only by Rules.

## 11. IAM/runtime design (inspection only)

```
RUNTIME_SERVICE_ACCOUNT=public-demo-runtime@shiftoryx-public-demo.iam.gserviceaccount.com
REQUIRED_STORAGE_PERMISSIONS=storage.objects.create,get,delete,list
REQUIRED_FIRESTORE_PERMISSIONS=datastore.databases.get,getMetadata; datastore.entities.get,list,create,update,delete
REQUIRED_AUTH_PERMISSION=firebaseauth.users.get (ID-token revocation/disabled-user verification; already covered)
PROPOSED_BINDINGS=NONE_REQUIRED_FOR_PDF_TRANSPORT
BINDINGS_NO_LONGER_NEEDED=roles/firebaserules.firestoreServiceAgent for demo Storage cross-service evaluation (currently absent; DO NOT ADD)
```

Read-only `gcloud` checks in Phase 1 confirmed:

| Existing binding | Scope / reason |
| --- | --- |
| `roles/datastore.user` | Demo project, runtime identity; existing database/reset/broker operations |
| `roles/firebaseauth.admin` | Demo project, runtime identity; existing demo identity lifecycle. PDF flow does not introduce Auth mutation. |
| `roles/storage.objectAdmin` | **Exact demo bucket**, runtime identity; existing cleanup plus new I/O can use it |
| `roles/iam.serviceAccountTokenCreator` | Runtime service account on itself only; existing custom token signing, not PDF download URLs |
| `roles/firebasestorage.serviceAgent` | Demo Storage service agent; platform-managed role, do not remove |

`resetPublicDemo` is ACTIVE, Gen2 Node22, this runtime SA, 512 MiB, 420-second timeout, maxInstances1/concurrency4. New handlers specify their own bounded options and the same demo-only SA through isolated packaging. No user-managed private key.

The existing objectAdmin/datastore roles are broader than the operations PDF needs; do not describe them as least-privilege custom roles. No added role or signing permission is necessary. An optional **separately approved** later IAM narrowing can replace bucket objectAdmin with a custom role limited to the four object permissions above after auditing reset, with bindings restricted to the exact bucket. Firestore IAM does not replace per-tenant application checks. No broad editor/owner role, service-agent role on runtime, production IAM change or new impersonation is proposed.

## 12. Phase 2 exact file change plan

All below are **proposals only**, not changes in Phase 1. New critical logic is TypeScript. Keep JSX changes thin and limited to transport selection/state display.

| FILE | ACTION | PURPOSE |
| --- | --- | --- |
| `functions/src/public-demo/pdf-authorization.ts` | CREATE | Strict HTTP envelope, verified demo identity/origin/project and transactional authoritative guard; safe errors |
| `functions/src/public-demo/pdf-coordinator.ts` | CREATE | Intent/reservation state machine, shared I/O barrier, quotas, immutable finalizer, reset drain/recovery assertions |
| `functions/src/public-demo/pdf-transport.ts` | CREATE | Export `publishPublicDemoPdf` and `downloadPublicDemoPdf`, bounded binary response, no public URLs |
| `functions/src/public-demo/pdf-renderer.cjs` | CREATE (generated) | Node22 bundled existing renderer/font/jsPDF, deterministic options, license notices; never hand-edit |
| `functions/src/public-demo/service.ts` | MODIFY | Reset drain/new explicit cleanup, public-reset authority guard; re-export handlers for generated entry |
| `functions/src/public-demo/entry.js` | MODIFY | Demo deployment exports two new handlers; normal `functions/src/index.js` unchanged |
| `functions/src/public-demo/generated.js` | MODIFY (generated) | Compile inspected TypeScript sources; parity test |
| `src/services/publicationIntentV3.ts` | CREATE | Pure canonical preview schema/serialization reused client/server; no Firebase singleton |
| `src/services/schedulePublicationPdf.ts` | MODIFY | Optional deterministic date/file-ID options; default normal renderer behavior preserved |
| `src/demo/publicationTransport.ts` | CREATE | Demo-only strict endpoint selection, ID-token POST, persistent nonsecret intent retry and binary download adapter |
| `src/components/scheduler/SchedulerWorkspaceV3.jsx` | MODIFY | Save candidate once for a new demo intent, reuse revision/intent on retry, route demo publish; normal publish branch untouched |
| `src/repositories/schedulePublicationsRepository.ts` | MODIFY | Demo download adapter; fail-closed guards on direct demo reserve/upload/finalize; preserve normal implementation and shared draft/history |
| `scripts/build-public-demo.mjs` | MODIFY | Build server renderer from root locked deps, externalize Admin/Functions only as appropriate, generate server-only demo Rules and parity assertions |
| `scripts/package-public-demo.mjs` | MODIFY | Package generated renderer; explicit legacy archive=false; verify exact demo exports/project/resources |
| `firestore.demo.rules` | MODIFY (generated) | Server-only lifecycle/projections/new coordination surfaces; preserve all other demo validators |
| `storage.demo.rules` | MODIFY (generated) | Deny all direct clients; zero Firestore lookups |
| `scripts/test-public-demo-pdf-policy.mjs` | CREATE | Pure strict validation/path/hash/PDF limits/idempotency/error tests; no cloud |
| `qa/public-demo/pdf-transport.mjs` | CREATE | Emulator positive/negative endpoint+Rules tests, exact bytes/immutability/12 pairs |
| `qa/public-demo/pdf-races.mjs` | CREATE | Deterministic barrier, reset, revocation, duplicate intent and uncertain I/O tests |
| `qa/public-demo/hosted-pdf.mjs` | CREATE | Later approved actual-HTTPS positive controls/denials; no destructive fault injection in hosted data |
| `qa/public-demo/{test-support.mjs,verify.mjs,runtime.mjs}` | MODIFY | New endpoint allowlist/local worker probes/fresh suite names; no credentials logged |
| `qa/public-demo/{isolation.mjs,reset-coverage.mjs,storage-reset-race.mjs,auth-reset-races.mjs}` | MODIFY | Add new server path assertions and control/manifest cleanup; retain direct-client denial and every existing business/security invariant |
| `qa/public-demo/{browser.mjs,hosted-browser.mjs,hosted-isolation.mjs}` | MODIFY | Assert network has no direct publication Storage calls, stable retry, real PDF checks; fixture-derived generation/absence expectations; retain12 pairs |
| `qa/public-demo/README.md` | MODIFY | Fresh suite prerequisites, bounded fault injection and actual hosted distinction |
| `docs/PUBLIC_DEMO_HOSTED_STORAGE_GATE.md` | MODIFY | Phase 2/3 evidence only after it exists; never rewrite historical failed receipts as passes |

No change planned to normal Rules, scheduler-engine algorithms, canonical fixtures, normal Functions entry, package manifests, lockfiles, Actions or production configuration. The new server snapshot decoder may call existing engine validators, but must not import the browser Firebase singleton.

### Renderer packaging decision

The existing renderer produced a valid PDF in memory under installed Node `v22.21.0` during inspection. A write:false esbuild CJS probe also bundled it using current dependencies; output about 2.83 MB, with Node built-ins and lazy optional `html2canvas`/`dompurify` imports. No file was emitted and nothing installed.

Phase 2 must build a CJS server renderer artifact from the locked root dependencies, retaining notices, and prove in an isolated Node22 staging directory without root node_modules that the plain-text path works and never invokes those optional HTML imports. Do not add them to Functions just to silence a build. `html()`/DOM/network/image input is forbidden. If that isolated smoke fails, stop for a focused packaging decision instead of installing another PDF engine. Root jsPDF reuse is not a claim that Functions already declares jsPDF.

### Future activation/rollback ordering — not authorized in Phase 1 or by design readiness

Phase 2 remains local implementation. A separately approved Phase 3 rollout must coordinate the existing scheduled/manual reset and new handlers; an old reset worker cannot run concurrently with the new publication protocol. First put only the demo in a controlled maintenance window and establish no in-flight old reset (including scheduled invocation), then deploy stricter demo Rules, the reset-aware Functions and new handlers with publication entry disabled. Verify every deployed handler/reset revision and Rules before enabling the new transport/frontend. Do not rely on a multi-function deployment being atomic. The old browser publisher must fail closed during transition, not fall back to old Storage Rules.

Disposable existing demo reservations/publications without the new manifest are not silently trusted/backfilled. Perform a separately authorized canonical reset in that maintenance window, then use new publications for positive hosted acceptance. No production migration is involved. Keep the stricter demo Rules on rollback and disable the new demo publication entry; never restore permissive direct client publication writes to keep an old frontend apparently working. Any unresolved I/O barrier must be retained across rollback. These are ordering requirements, not commands executed here.

### Implementation task order (not executed)

- [ ] Task 1: Write red unit tests for the specified request schemas, preview hash, path/tenant denial and PDF corruption/cap; implement pure TypeScript policy/intent and bounded existing-renderer bundle; verify normal renderer defaults and isolated Node22 load.
- [ ] Task 2: Write emulator tests for server-created reservation/version/manifest and repeat intent; implement T1/T2/T3 with a fake controllable Storage adapter in unit tests and real emulator adapter in integration. No side effects inside transaction retries.
- [ ] Task 3: Write/reset race red cases at every I/O boundary including process loss; implement reset drain and terminal cleanup. Expiring the existing reset lease must not clear IO_UNCERTAIN.
- [ ] Task 4: Write download tests including object-generation/digest mismatch and revocation before response; implement buffered binary HTTP transport and final authorization admission.
- [ ] Task 5: Write direct demo client Firestore/Storage denial tests, then generate stricter demo-only Rules. Preserve normal Rules hashes and existing normal regressions.
- [ ] Task 6: Write browser tests for save/revision/stable intent/reload/retry and no direct Storage traffic; wire thin demo adapter. An unresolved publish retains the same persisted `{intentId,draftId,draftRevision,previewHash,acceptWarnings,tenant,generation}` locally without tokens/snapshots. Do not resave/increment revision on retry. New edits require explicit new intent; changed generation clears pending UI intent.
- [ ] Task 7: Run all relevant fresh local suites and full regressions; independent Phase 3 review before any hosted deployment. No automatic commit/push/merge or infrastructure change.

## 13. Concrete future test matrix

Rows are specifications, **not Phase 1 PASS claims**. Multiple layers mean repeat the same invariant at each listed layer. Hosted adversarial auth uses only isolated fictional tenants; privileged mid-flight fault injection remains emulator-only unless separately authorized.

| TEST_NAME | LAYER | EXPECTED_RESULT |
| --- | --- | --- |
| `owner_publish_week_month` | UNIT / EMULATOR / BROWSER / HOSTED | Valid saved WEEK and MONTH finalize for all4 tenants; warning acknowledgement retained |
| `owner_download_exact_bytes` | EMULATOR / BROWSER / HOSTED | 200 PDF bytes identical to stored manifest/object SHA/length; no rerender |
| `pdf_snapshot_correspondence` | UNIT / EMULATOR / HOSTED | Dates/names/shifts/totals/version match frozen snapshot; Greek text visually checked |
| `v1_unchanged_after_v2` | EMULATOR / BROWSER / HOSTED | Snapshot, object generation and bytes of v1 unchanged |
| `anonymous_denied` | UNIT / EMULATOR / HOSTED | 401 for both APIs; no intent/object/version changes |
| `wrong_project_custom_expired_revoked_tokens` | UNIT / EMULATOR | No unverified/custom/foreign/expired/revoked token authority |
| `all12_foreign_publications` | EMULATOR / HOSTED | Valid caller cannot download any other tenant's existing publication; own PDF succeeds before/after |
| `all12_foreign_draft_publish` | EMULATOR / HOSTED | Foreign draft ID never resolves outside own tenant; no foreign artifacts |
| `inactive_mismatch_membership` | UNIT / EMULATOR | REVOKED/inactive, wrong UID, wrong tenant, legacy role and missing row denied |
| `platform_owner_overlap_denied` | EMULATOR | ACTIVE platform admin with apparent active OWNER row denied by publish/download/public reset |
| `foreign_vs_missing_id_nondisclosure` | UNIT / EMULATOR / HOSTED | Same generic response for inaccessible/absent publication after caller auth |
| `path_bucket_uid_version_injection` | UNIT / EMULATOR | Unknown privileged fields rejected, no Storage I/O |
| `traversal_encoded_id_injection` | UNIT / EMULATOR | Slash/backslash/dot/percent/Unicode-lookalike IDs rejected before refs |
| `malformed_pdf_input_denied` | UNIT / EMULATOR / HOSTED | Binary/multipart/base64 PDF request rejected; server never accepts caller PDF |
| `renderer_invalid_header_eof` | UNIT / EMULATOR | Faulted renderer result never stored/finalized; generic safe error |
| `oversized_envelope_pdf` | UNIT / EMULATOR | 4KiB/1KiB request caps; zero or ≥2MiB rendered result denied; no upload |
| `unknown_duplicate_keys_prototype_nan` | UNIT / EMULATOR | Strict schema rejects ambiguous/dangerous input, even before hash |
| `stale_draft_revision_preview` | EMULATOR / BROWSER | 409, no version allocated; review needed, not silently changed PDF |
| `stored_malformed_draft` | UNIT / EMULATOR | Admin path still validates types/references/bounds; no reliance solely on client Rules |
| `warning_nonblocking` | EMULATOR / BROWSER / HOSTED | Shortage/manual overrides publish after acknowledgement, never bypass technical failures |
| `stale_generation_denied` | EMULATOR / HOSTED | Old session fails publish/download after reset; fresh session works |
| `finalized_overwrite_denied` | EMULATOR / HOSTED | Replay gives existing identity; changed tuple rejected; direct overwrite denied |
| `direct_storage_read_write_denied` | EMULATOR / HOSTED | Even valid current OWNER cannot read/create/update/delete publication/monthly objects directly; server positive control succeeds |
| `direct_firestore_finalize_denied` | EMULATOR / HOSTED | Browser cannot forge reservation/counter/publication/index/manifest/projections |
| `reservation_without_pdf_invisible` | EMULATOR | Pending state absent from history/latest; download unavailable |
| `stored_pdf_without_finalized_manifest_denied` | EMULATOR | Private staged object is not downloadable through API |
| `object_digest_generation_mismatch` | UNIT / EMULATOR | Corruption/replacement fails closed, no bytes returned |
| `reset_before_upload` | EMULATOR | No GCS write after losing pre-I/O admission |
| `reset_during_upload` | EMULATOR | Reset waits for settlement/cleanup, stale finalizer denied, then zero objects |
| `reset_before_finalization` | EMULATOR | Object cleaned conditionally; publication/latest never appear |
| `upload_finishes_after_generation_change` | EMULATOR | Late private object accounted for and deleted before reset success |
| `duplicate_publish_same_intent` | UNIT / EMULATOR / BROWSER | Exactly one reservation/version/object/publication, replay same response |
| `concurrent_different_intents` | EMULATOR | Serial admission or retryable busy, unique monotonically allocated versions; latest never regresses |
| `lost_response_after_commit` | EMULATOR / BROWSER | Retry/reload uses same persisted intent/revision, no duplicate version |
| `membership_revoked_prewrite_or_precommit` | EMULATOR | No finalization; any staged object cleaned; no download bytes if revoke before release admission |
| `platform_status_changes_midflight` | EMULATOR | Final transaction rechecks and rejects, not token-only permission |
| `reservation_changed_midflight` | EMULATOR | Hash/generation/attempt mismatch aborts, no overwrite or publication |
| `download_reset_before_release` | EMULATOR | Buffered bytes discarded; response denied |
| `download_admitted_then_reset` | EMULATOR | Already authorized response may drain; reset success waits, next download denied |
| `worker_loss_ambiguous_storage` | UNIT / EMULATOR | IO_UNCERTAIN retained, no lease-based takeover, reset stays locked; simulated late completion cannot leave orphan after a reported success |
| `cleanup_failure_unknown_delete` | EMULATOR | Barrier retained, generic error; no premature unlock |
| `attempt_takeover_preio_fenced` | EMULATOR | Old worker cannot issue upload after losing CAS attempt |
| `retry_old_intent_after_reset` | EMULATOR / BROWSER | No recreation; invalidated intent requires new reviewed action |
| `foreign_reset_preservation_new_metadata` | EMULATOR | Other3 demo tenants/non-demo sentinels unchanged, selected artifacts removed, control/tombstones obey contract |
| `quota_cooldown_cannot_reset` | UNIT / EMULATOR | New identities/reset do not reset quota; no unbounded intent queue |
| `download_headers_no_url_no_token` | UNIT / EMULATOR / HOSTED | attachment/no-store/nosniff, exact CORS, no public token/signed URL/log leakage |
| `network_no_direct_publication_storage` | BROWSER / HOSTED | Publish/download use only approved Functions; no Firebase object upload/download requests |
| `normal_mode_unchanged` | UNIT / EMULATOR / BROWSER | Demo disabled retains original publish/archive path; normal Rules bytes unchanged |
| `isolated_renderer_bundle` | UNIT | Node22 server artifact works without root node_modules/DOM/network/optional HTML calls |

Retain all existing suites and strengthen evidence. Existing `storage-reset-race.mjs` assumes a valid client can start an upload; after migration keep stale/direct-client denial and **add** a server in-flight write test rather than reclassifying all denied Storage access as success. Reset coverage must account for the new manifest collection and root controls, not merely update a magic count without assertions. Hosted generation comes from verified current demoState/claims, not hardcoded 1; Salon zero absences is valid and must use a dedicated fictional absence fixture when a negative write needs an existing record.

Required later commands (fresh runtime for each stateful suite): existing `node scripts/test-public-demo-policy.mjs`, package guard, new PDF unit/emulator/race suites, OWNER/full browser/isolation12pairs, settings, reset, identity, lease and normal Rules; then all requested npm suites: `test:scheduler-contract-v2`, `test:scheduler-contract-v3`, `qa:scheduler-engine`, `qa:scheduler`, `qa:repositories`, `qa:public-readonly`, `qa:tenant-authorization`, `qa:auth-broker`, `qa:central-portal-isolation`, `qa:export-security`, `security:hardening`, `security:integrity`, `build`, `npm audit --audit-level=high`. New `verify.mjs` suite names: `pdf` and `pdf-races`. None were run against mutable infrastructure during Phase 1.

## 14. Phase 3 independent security review checklist

- [ ] Authentication bypass: real demo-project ID-token verification/revocation; no token/body/cookie fallback, emulator mode impossible in hosted artifact.
- [ ] Tenant confusion: claim → explicit allowlist → exact membership+tenant document; hostile Origin does not confer access; exact endpoint/project/bucket bindings.
- [ ] IDOR: all12 foreign IDs and existing objects denied with valid own positive controls; no global publication lookup.
- [ ] Object/path injection: server UUID and fixed suffix only; never trust stored/client path/bucket blindly.
- [ ] Privilege escalation: platform-admin overlap denied in both handlers and public reset; no identity/member creation through PDF APIs.
- [ ] Publication immutability: create preconditions, immutable Firestore create, frozen snapshot/deterministic bytes, no delete/recreate on conflict.
- [ ] Reset race: all I/O admitted before reset is recorded/drained, controls not swept early, unknown writes never unlock via elapsed time.
- [ ] TOCTOU: authority read in final Firestore transactions; no Storage I/O inside retryable transaction callbacks; download linearization/cancellation semantics match documented limits.
- [ ] IAM over-permission: exact demo runtime/bucket, no new role needed, existing role surplus recorded; no cross-service role added without use.
- [ ] Information leakage: same foreign/missing response, no private reason/notes/contact fields in PDF, sanitized projections, no public blob URL/token.
- [ ] Secret leakage: no credentials in source, generated bundles, traces, receipts, logs or response; existing cloud auth only.
- [ ] Unsafe logging: whitelist `{event, requestId, tenantSlug, operationKind, statusCode, errorCode, durationMs}`; no raw errors, paths, UID, authorization, body, snapshot or PDF bytes. Library error details mapped to fixed codes.
- [ ] Oversized payload DoS: raw-body/type caps, bounded DB queries, records/snapshot/PDF caps, concurrency/quota caps; provider pre-parser/auth floods remain operational exposure, not falsely “solved”.
- [ ] Replay/duplicates: same intent survives lost response/reload; changed hash and generation rejected; no version reuse; no stale takeover.
- [ ] Supply chain: root locked jsPDF build provenance/license, no optional HTML execution, no new package/postinstall/native binary, no lockfile/Actions churn.
- [ ] Production isolation: normal code branch/regression behavior, normal Rules hashes, normal Functions entry and production IAM untouched.
- [ ] Hosted proof: both valid own PDF success and foreign denial; no localhost substitutions, no generic unauthorized-only “PASS”.
- [ ] Recovery: fault-injected uncertain worker cannot produce false reset success; operational fail-closed procedure rehearsed and accurately described before sharing.

## 15. Review focus, decisions and remaining risks

Selected design decisions: server-rendered PDF; existing authoritative documents; buffered authenticated download; whole-demo client Storage deny; one tracked PDF I/O per tenant; uncertain I/O fails closed; no additional IAM binding. No pending choice to weaken a guard or to assume a two-service transaction.

Explicit limitations:

1. Shared low-traffic demo serializes PDF work; busy responses are expected and do not imply tenant isolation failure.
2. Unknown Storage completion can lock the selected demo pending trusted operator investigation. The design prefers that outage to stale artifacts/recreated data after reset. Automatic timeout takeover is prohibited.
3. Download revocation is prospective at the final admission point, not recall of bytes already authorized/delivered.
4. Version gaps from failed intents are retained; “v1 then v2” tests must use clean fixtures rather than decrementing counters.
5. Server renderer packaging and race behavior are specified but still need Phase 2 implementation tests; the in-memory smoke is not hosted Functions proof.
6. Existing objectAdmin and datastore.user bindings remain wider than the PDF-only operation set; optional narrowing is a separate approved IAM change.
7. Existing hosted demo remains NOT_READY. No success marker for full public demo or hosted PDF is issued by this design.

Open questions: no unresolved authorization/path/idempotency decision is delegated to Phase 2. If product review rejects the explicit fail-closed recovery availability tradeoff, return to design before implementation; do not replace it with optimistic expiry. Phase 3 must independently validate implementation and operational limits before hosted approval.

## Phase 1 verification and no-mutation report

Performed only Git/source inspection, read-only demo IAM/runtime metadata queries, generated-service comparison in memory, and existing-renderer Node22/bundle probes with `write:false`. No browser login, seed, reset, hosted workflow, mutable emulator suite or setup/deploy script executed. No implementation or prior documentation edited; this new design file is the sole intended addition. Existing tracked/untracked content is checked by before/after hashes, excluding protected ignored logs/credential files.

Before/after SHA-256 comparison covered 363 pre-existing tracked/untracked files: **zero changed, zero removed**; the only addition is this document. The initial hash command had a PowerShell syntax error and was corrected before any file addition; the successful baseline and final comparison are the evidence, not that failed command. `git diff --check` and existing generated-service parity pass. The PDF probe produced bytes in memory only; no PDF file, build directory or emulator fixture was created.

```
START_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
END_SHA=b23d6bd2d575d6e1680c848c91325c0ad392d8bd
BRANCH=codex/public-shiftoryx-demo
CURRENT_PDF_FLOW_SUMMARY=client reserve -> client render/upload -> client finalize/index/projections; direct Storage download
ROOT_CAUSE_CONFIRMED=YES
PROPOSED_UPLOAD_HANDLER=publishPublicDemoPdf
PROPOSED_DOWNLOAD_HANDLER=downloadPublicDemoPdf
AUTHORIZATION_MODEL=verified demo ID token plus authoritative state/platform/membership/tenant and operation documents, transactional rechecks
STORAGE_PATH_MODEL=server-derived exact tenant plus server UUID plus fixed schedule.pdf
PUBLICATION_STATE_MACHINE=RESERVED -> RENDERED -> IO_INTENT -> OBJECT_STORED -> FINALIZED; cancellation/uncertainty fail closed
RESET_RACE_MODEL=generation fence -> drain tracked I/O -> conditional sweep -> restore -> unlock
DOWNLOAD_MODEL=bounded server buffer -> final authorization transaction -> attachment bytes, no public URL
DIRECT_CLIENT_PDF_STORAGE_AFTER_MIGRATION=DENIED
RUNTIME_SERVICE_ACCOUNT=public-demo-runtime@shiftoryx-public-demo.iam.gserviceaccount.com
PROPOSED_IAM_CHANGES=NONE_REQUIRED
PHASE_2_FILES=section 12
PHASE_2_TESTS=section 13
SECURITY_CONCERNS=section 15 explicit recovery/linearization/operational limits; independent review required
OPEN_QUESTIONS=none blocking implementation of this specified design; no authority to begin Phase 2
PHASE_2_READY=YES (design handoff only, not tested implementation or deployment readiness)
IMPLEMENTATION_CODE_CHANGED=NO
IAM_CHANGED=NO
RULES_DEPLOYED=NO
FUNCTIONS_DEPLOYED=NO
VERCEL_DEPLOYED=NO
PRODUCTION_CHANGED=NO
DEMO_DATA_CHANGED=NO
DEPENDENCIES_CHANGED=NO
LOCKFILE_CHANGED=NO
GITHUB_ACTIONS_CHANGED=NO
```

Project Guardian: **NOT_READY for hosted release**; design handoff only. Rollback of Phase 1 requires only removal of this newly authored design document if the user rejects it; there is no runtime/data/infrastructure change to roll back. Stop here and await Phase 2 authorization.
