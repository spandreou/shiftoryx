# Public demo blockers — evidence and correction record

> Current checkpoint: [PUBLIC_DEMO_HOSTED_STORAGE_GATE.md](PUBLIC_DEMO_HOSTED_STORAGE_GATE.md). The original three blockers below have local regression evidence. The subsequent isolated hosted deployment uncovered a separate Storage document-budget/IAM blocker; the earlier independent review and emulator passes do not close it.

Branch `codex/public-shiftoryx-demo`, base `b23d6bd2d575d6e1680c848c91325c0ad392d8bd`. No hosted deployment authorized to proceed until the closing gate is green. All test mutations in this document target the fixed local project `demo-shiftoryx-public`.

## 1. Firestore evaluator limit

Reproduction: `node qa/public-demo/settings-regression.mjs --diagnose`. The UI repository submits one atomic batch: `update tenants/demo-fuel/employees/{id}` with only `schedulerV3`, plus a merged `set tenants/demo-fuel/settings/scheduler`. The observed roster had eight employees; it included the rotating canonical profile `demo-fuel-e1`.

A single `update` to `demo-fuel-e1` reproduced `permission-denied` / `maximum of 1000 expressions`, independently of the batch. The other seven non-rotating updates passed. Therefore splitting the batch would not resolve the failing validation and would unnecessarily lose atomicity.

Evaluated branch: tenant employee update → `isTenantAdmin` → changed-field allowlist → `validEmployee` → optional metadata validators and `validSchedulerProfileWrite` → direct-time profile/time-range/Monday/rotation validation. The original OR-based profile check also explored the incompatible legacy fallback for failing canonical requests. Emulator rule coverage was inspected in memory by source line and count only; no coverage payload is retained. Repeated optional field helper calls and legacy fallback exhausted the expression budget; the membership read limit was not the reported limit.

Bounded correction: keep the existing authorization, field allowlists, data types, rotation and calendar checks. In `validEmployee`, bind the data map once and inline equivalent optional field checks using `Map.get` defaults. Missing string/bool values remain allowed; explicit null/wrong types remain rejected. Select the canonical or unchanged-legacy validator using the presence of `profileVersion`, since their existing allowlists are disjoint. No client write shape change, privilege expansion, validation bypass or deployed production Rules change.

Evidence: original single rotating update and settings batch RED; corrected batch GREEN. Permanent regression additionally rejects 54 malformed metadata/profile/unknown-field payloads, requiring permission-denied without evaluator exhaustion. Broader emulator/regression review is pending final rerun.

## 2. Reset data inventory

Inventory was compared with actual Rules blocks, `TENANT_SCOPED_COLLECTIONS`, the publication repository, `monthlyScheduleArchiveService`, `exportAuditService`, auth broker and reset implementation. Client access remains membership/generation scoped; server operations remain project-guarded and exactly four-tenant allowlisted.

| Surface | Producer/authority | Reset treatment |
| --- | --- | --- |
| `tenants/{id}/employees`, `absences`, `settings` | employee/absence/settings repositories | Clear, then restore canonical fixture employees/profiles, absences and V3 settings |
| `shifts`, `scheduleDrafts` | V3 draft persistence | Clear |
| `schedulePublications`, `schedulePublicationCounters`, `schedulePublicationReservations`, `schedulePublicationPeriods` | immutable publish pipeline | Clear only during explicit reset; versions remain immutable between resets |
| `publicSchedules`, `publicMonths`, `publicEmployees`, `publicAnnouncements` | sanitized projections | Clear |
| `shiftTemplates`, `attendanceHistory`, `weekLocks`, `weekHistory`, `weekTemplates` | existing tenant scheduling surfaces | Clear |
| `announcements`, `auditLogs` | owner announcements and audit/export writers | Clear |
| `subscription`, `tokenRequests` | existing tenant Rules surfaces (no billing UI in demo) | Clear any visitor-created records |
| Root `monthly_schedule_exports/{exportId}` | monthly archive service; ownership is stored `tenantId` | Query exact `tenantId`; delete under the same reset lease transaction |
| `tenants/{id}/monthly_schedule_pdfs/...` and `tenants/{id}/schedule-publications/...` | Storage Rules permit only these two families | Clear exact selected tenant prefix; generation-match conditional object deletion |
| Root `tenants/{id}`, `tenantMemberships/{uid}_{id}` | server only | Restore tenant metadata and new generation OWNER; revoke/delete prior membership |
| Root `demoState/{id}`, `demoControl/{id}` | reset lock and identity generation | Retain/advance; never reset generation to a previous value |
| Root `demoEntryLimits/{id}` | entry throttling | Retain so reset cannot clear rate limiting |
| Root `authTickets` | broker only | Retain under existing broker expiry/cleanup policy; old membership removal prevents exchange authorization |
| Root `users`, `platformAdmins`, registration/provisioning collections | demo Rules deny client mutation; provisioning not exported by demo entry | No reset deletion; no demo customer/admin creation workflow |
| All other paths | default deny | Not a client-mutable demo surface |

Additional legacy names in the reset's explicit collection list are harmless reserved cleanup surfaces, not prefix-derived targets. No recursive generic tenant deletion is exposed.

Reproduction: `node qa/public-demo/reset-coverage.mjs` was RED on retained root monthly export metadata. Correction uses an explicit collection and exact stored tenantId query, never document-name prefix matching. GREEN covers all22 Rules-exposed tenant collections, root export metadata, both Storage families, complete canonical employee/profile/settings/absence restoration, and untouched foreign-demo and non-demo sentinels. Non-demo/production IDs and a foreign OWNER reset are rejected. All sentinels are fictional emulator-only data.

## 3. Auth/reset interleavings

Permanent browser suite: `node qa/public-demo/browser.mjs --races-only`. A real emulator transaction holds the first employee document so reset can acquire its generation lock but cannot expose completed state prematurely. Browser interception delays only delivery of real ticket exchange responses; authorization is evaluated by actual emulator Functions and Rules.

Scenarios cover reset-lock old read/write rejection, two tabs, an old exchange response delivered after reset, fresh login immediately after reset, and a new handoff while a validly signed but stale generation is persisted on the tenant origin. Already-issued old custom tokens can authenticate/recreate an Auth UID; they must never recreate membership or obtain current-generation write authority.

The old UI reproduced RED with a valid new handoff stuck on the reset notice. Correction keeps `AuthTicketCallback` mounted independently of that notice, reconciles the notice against current-generation claims, and ignores obsolete asynchronous auth callbacks. GREEN browser evidence: `shiftoryx-demo-browser-LEIKlA`, 10 checks including A–E, stale Storage denial, successful fresh handoff/refresh, cross-tenant denial and no unhandled page errors. Browser QA waits for `/app` navigation to finish before testing a subsequent refresh.

## Independent review and verification checkpoint

Independent reviewer `/root/public_demo_final_review` completed a read-only whole-change review: no unresolved Critical or Important finding. Independently ran 75 policy checks and checked generated Functions/Rules parity in memory. Reviewed additional shared-Auth-account recovery: a visitor can self-delete a shared Auth UID; entry restores only its exact current-generation identity after validating an existing matching ACTIVE OWNER membership, never by creating membership, and rechecks generation before issuing the response.

Minor accepted for this phase: if a scheduled reset fails on an earlier tenant, later tenants in that daily loop do not run. This affects reset availability, not authorization; manual reset and trusted recovery remain available. Hosted Scheduler delivery and aggregate cost control remain operational checks.

The normal (non-demo) V3 emulator suite passed against the changed validation source, including legacy profile preservation/canonical writes, 100-profile batches, 182 negative shift writes, immutable publications/PDFs and foreign/platform-admin/anonymous denial. The emulator emitted a Java shutdown exception after the test had exited successfully; this is recorded separately from test assertions.

Full named npm regressions/build passed again; audit high threshold passed with 1 low and 4 moderate findings. Local landing visual checks passed at 320/390/768/1440/1920px, keyboard navigation and no uncaught page errors. Desktop and mobile screenshots were visually inspected. Remaining runs: final clean full demo browser/OWNER/isolation checks and targeted identity/upload/lease checks. No hosted readiness marker or deployment yet.
