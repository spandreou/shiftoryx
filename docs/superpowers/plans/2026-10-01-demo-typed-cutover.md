# ShiftOryx Demo Typed Mutation Cutover Implementation Plan

> **For agentic workers:** Implement Phase 3B.2B-2 inline, task by task, with RED→GREEN tests. No commits, deployment, or next phase.

**Goal:** Route all required public-demo OWNER writes for the nine active reset-managed collections through tenant-authorized typed server operations, then deny direct browser writes.

**Architecture:** Reuse the B-1 identity, quota, receipt and audit primitives. One closed mutation HTTP dispatcher maps each operation to an exact schema and server transaction; demo-only service/repository adapters call it, while normal repositories retain their current direct Firestore path. The demo Rules cutover occurs only after local adapters and handlers work together.

**Tech Stack:** Node 22, TypeScript, Firebase Admin/Functions/Auth/Firestore emulators, React/Vite, existing Node and Playwright QA.

**Spec:** User's Phase 3B.2B-2 prompt and `docs/PUBLIC_DEMO_B2_MUTATION_INVENTORY.md`; inherited B-3 blockers remain mandatory and unchanged.

## Global Constraints

- Isolated `codex/public-shiftoryx-demo` worktree only; preserve all dirty baseline files.
- No hosted deployment, production Rules/repository semantics, dependency/lockfile/Actions changes, commit, push or merge.
- No caller-provided Firestore path, collection, tenant authority, arbitrary patch, token persistence, or generic Admin writer.
- Direct demo writes are denied only after the equivalent typed handler and adapter are locally tested.
- Draft save must satisfy `removedIds + newShifts + 1 <= 450` and at most 453 Firestore transaction writes.

## Review Focus

- A retry after an uncertain response must reuse the same command ID and not create a second employee, absence, announcement or draft revision.
- A foreign/stale OWNER token must fail before Admin SDK can write another tenant.
- A forged prior draft shift ID must never make a trusted handler delete another draft's shift.
- Public employee/announcement IDs and data must be server-derived from the private document, not a caller-supplied projection.
- An active V3 OWNER action must remain usable after all nine direct browser write paths are denied.

---

### Task 1: Trusted delta and narrow dispatch core

**Files:** Modify `functions/src/public-demo/admission.ts`; create `functions/src/public-demo/mutations-core.ts`; test `scripts/test-public-demo-typed-core.mjs`.

**Interfaces:** The core receives verified `PdfIdentity`, a closed operation, validated payload and a server clock. It calls the admission transaction, derives quota deltas from authoritative transaction reads, writes only fixed tenant-scoped paths, and returns a small receipt result.

- [ ] Write a test where a draft writer discovers two absent shift docs in the transaction and charges exactly two `shiftCreates`; a caller-supplied zero delta cannot be accepted.
- [ ] Run the focused test and verify RED for the missing transactional-delta interface.
- [ ] Change the admission callback to return `{result, delta}`; test replay, conflict and failed-transaction zero charge.
- [ ] Add typed employee/absence/announcement/settings/draft operation tests before each implementation slice; verify each RED then GREEN.

### Task 2: HTTP and browser transport

**Files:** Create `functions/src/public-demo/mutations-http.ts`, `src/demo/mutationTransport.ts`; modify `functions/src/public-demo/service.ts`; test HTTP policy and browser transport scripts.

**Interfaces:** An exact JSON envelope `{operation, commandId, payload}` is bounded before deep validation. Auth derives tenant from token and checks exact origin. The browser generates a UUIDv4 per logical action and retains only command ID plus canonical hash until success/definitive failure; the Firebase token remains with Auth.

- [ ] Test unknown operation, extra tenant/path fields, wrong origin/token, over-body, replay and retry ID stability; verify RED.
- [ ] Implement the minimal HTTP envelope and demo-only client transport; verify GREEN.

### Task 3: Demo repository adapters and projection ownership

**Files:** Modify the employee, absence, announcement, public projection, settings and audit Firebase services, `src/repositories/schedulePublicationsRepository.ts`, and the demo branch of `src/hooks/useSchedulerStore.js`.

**Interfaces:** Each required demo action uses the typed transport; normal mode follows its original code path. Server primary mutations write one audit event atomically. Export-only activity calls `aud.export`. Public projections are a server side effect, so demo browser snapshot sync is read-only.

- [ ] Write tests for normal-mode unchanged behavior and demo-mode mutation endpoint selection; verify RED.
- [ ] Migrate employee/absence/announcement/settings/draft/audit calls in small RED→GREEN slices.
- [ ] Verify V3 Preview, roster subscription and publication transport still use the returned ID/revision contracts.

### Task 4: Demo Rules cutover and direct SDK denial

**Files:** Modify only `rules/demo/firestore.template.rules` and intentional accepted hash in `scripts/demo-firestore-rules.mjs`; regenerate `firestore.demo.rules` using `scripts/build-public-demo.mjs`; test `qa/public-demo` direct SDK matrix.

- [ ] Write emulator tests asserting direct create/update/delete denial for every active collection and equivalent typed success; verify RED.
- [ ] Deny the nine active demo writes without changing reads or normal `firestore.rules`; regenerate and verify GREEN.
- [ ] Repeat all 12 ordered foreign-tenant typed mutation pairs.

### Task 5: Maximum draft and whole-flow verification

**Files:** Add 449-shift/max-byte emulator tests and affected OWNER/browser QA only.

- [ ] Commit 449 shifts through the actual typed handler, measure runtime, receipt/quota/audit once, replay, reload, and reject the next invalid geometry before mutation.
- [ ] Run the exact regression list in the B-2 prompt on fresh emulator fixtures where stateful suites require it.
- [ ] Obtain independent read-only security review and report B-3 blockers separately. No hosted cutover in this task.

## Self-review

All required active writers appear in `docs/PUBLIC_DEMO_B2_MUTATION_INVENTORY.md`. The plan does not authorize PDF retained-intent reconciliation, concurrent-reset redesign, hosted deployment, or normal-product changes.
