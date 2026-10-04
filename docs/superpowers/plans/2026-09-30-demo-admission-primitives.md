# ShiftOryx Demo Admission Primitives Implementation Plan

> **For agentic workers:** Implement inline with test-first cycles; Phase 3B.2B-1 only. No hosted deployment.

**Goal:** Add trusted demo-only admission primitives and safe Rules changes without cutting over active browser writes.

**Architecture:** Reuse the PDF token and in-transaction authority checks. Keep control documents fixed per allowlisted tenant and embed bounded receipts. Change only the explicit demo Rules source; generate the accepted demo artifact after review.

**Tech Stack:** TypeScript, Node 22, Firebase Admin, Firestore emulator, Firebase Rules, existing Node test scripts.

**Spec:** User-supplied Phase 3B.2B-1 prompt, 2026-09-30; accepted Phase 3B.2A.1 invariants.

## Global Constraints

- Preserve dirty work, production Rules/repositories, and all active demo browser writes.
- No cloud/IAM/DNS/deployment/commit/push/merge.
- No dependencies or lockfile edits.
- Every new behavior starts with a failing test, then minimal implementation and verification.

## Review Focus

- A verified but foreign or stale token must fail inside the write transaction.
- Replayed command IDs must never recharge or overwrite a different request.
- Fixed control documents must reject malformed, oversized, or client-writable state.
- Public projections must remain queryable when open and unreadable during reset.
- PDF intent creation and expiry deletion must update the retained count atomically.

---

### Task 1: Admission identity, receipt, quota and audit primitives

**Files:** Create `functions/src/public-demo/admission.ts`; create `scripts/test-public-demo-admission.mjs`.

**Interfaces:** Consume existing PDF authenticator and transactional authority reader. Produce narrow identity/receipt/quota/audit operations for later typed handlers, without arbitrary collection paths.

- [ ] Write tests for own/foreign/stale/revoked/admin/reset/origin, malformed IDs, exact replay, mismatched input, generation binding, fixed paths, quota edges, rollover, failed transaction, and ring concurrency.
- [ ] Run the test and record expected missing-primitive failures (RED).
- [ ] Implement the smallest pure and transaction-bound primitives; keep all request paths server-derived.
- [ ] Run the new test and affected PDF policy tests (GREEN).

### Task 2: Retained PDF intent count

**Files:** Modify `functions/src/public-demo/pdf-coordinator.ts` and `functions/src/public-demo/service.ts`; extend existing PDF policy/emulator tests.

**Interfaces:** First intent transaction charges `demoAdmission` and `demoPdfLimits.retainedIntentCount`; expired intent deletion decrements only actual deletes. Reset does not zero the count.

- [ ] Add failing tests for 800/801, exact replay, canceled/invalidate retention, expired deletion, and mismatch.
- [ ] Run the focused tests (RED).
- [ ] Add the minimal atomic counter writes without changing the PDF publication state machine or reset phases.
- [ ] Run focused policy and emulator tests (GREEN).

### Task 3: Safe demo Rules foundation

**Files:** Modify `rules/demo/firestore.template.rules`, `scripts/demo-firestore-rules.mjs`; generate `firestore.demo.rules` with the existing build script. Add emulator Rules tests.

**Interfaces:** Explicitly deny client writes to new fixed controls; fence anonymous public projection reads on `demoState.resetting`; deny only proved-unused legacy creates. Retain nine active direct-write paths.

- [ ] Add failing direct-SDK tests for control writes, reset public reads/list, open-state reads, foreign tenancy, and active OWNER writes.
- [ ] Run emulator tests (RED).
- [ ] Patch only the demo Rules source, update the intentional accepted hash, and regenerate the demo artifact.
- [ ] Run focused Rules/emulator suites (GREEN).

### Task 4: Whole-phase verification and independent review

**Files:** Tests and generated demo artifact only if Task 1–3 require corrections.

- [ ] Run all regression commands in the Phase 3B.2B-1 prompt against clean/fresh emulator state where needed.
- [ ] Run build and `git diff --check`; inspect normal Rules byte identity and file inventory.
- [ ] Obtain independent read-only security review; unresolved Critical/Important findings keep the gate closed.
- [ ] Report exact test outcomes, changed files, remaining active-write cutover, and no-cloud status.
