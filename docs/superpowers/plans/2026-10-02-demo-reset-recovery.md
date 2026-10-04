# ShiftOryx Demo Reset Recovery Implementation Plan

> Execute natively, one task and RED→GREEN cycle at a time. User-approved Phase3B.2B-3 only; preserve the dirty worktree and do not commit, deploy, or start hosted rollout.

**Goal:** Close retained-intent operational reconciliation and concurrent-reset classification while implementing OPEN(g) → PRECHECK(g,L) → DESTRUCTIVE(g+1,L) → FINALIZE(g+1) → OPEN(g+1).

**Architecture:** Keep the existing demo Auth/project/tenant boundary and PDF state machine. Extract reset phase/CAS primitives, bounded retained-intent reconciliation, SDK adapters and the reset orchestrator; retain `service.ts.resetTenant` as the existing facade. Every cleanup transaction reads the exact unexpired reset lease and phase/generation before writing. External Auth/Storage calls occur only after DESTRUCTIVE and never inside a Firestore transaction.

**Tech stack:** Existing TypeScript/Node22, Firebase Admin/Functions, native bounded aggregate queries, Firebase emulators and existing Playwright/Node tests. No dependencies, Rules or IAM changes.

**Spec:** `C:/Users/Spyros/.codex/attachments/6d845473-abdb-4543-a4ab-b06d1402dc72/Pasted text.txt`; accepted B2 report and B3 handoff.

## Constraints and interfaces

- Four explicit demo tenants only; authenticated OWNER token/claims/origin remain authoritative for public reset. Trusted scheduled/initial options are never accepted from the HTTP body.
- PRECHECK keeps generation and membership unchanged. Failed PRECHECK clears only its exact lease with phase/generation CAS; an expired/lost worker cannot unlock a successor.
- Actual intent query is limited to801. Counter must equal actual retained docs before any proven expired tombstone deletion; at most200 actions plus the exact counter update per transaction.
- Tenant collection counts use limit10000 and require count<10000; root monthly export count uses limit9750 and requires count<9750. Storage list uses33 and requires≤32 exact-generation objects.
- Bounded aggregate counts are checked again in the atomic destructive boundary. New publish/write admission is already fenced by `resetting=true`.
- Draft path453 writes, all9 browser-write denials, normal Rules and normal repositories remain unchanged. GCS qualification is accepted PREVIOUSLY_PASS and is not rerun.
- Public expected errors expose Greek messages plus a safe enum only; never a lease, path, stack, token or provider payload.

`ResetTransaction`: `get`, bounded `list`, bounded `count`, `set`, `delete`; filtered root export queries permit only exact `tenantId`. `ResetLease`: tenant, UUID lease, phase, base/current generation, initial flag and persistent fixtureAt. `ResetError`: closed reset error-code union. `createDemoResetEngine(deps).run(tenant, options)` consumes guarded database/Auth/Storage adapters and a server clock; no generic client writer.

## Review focus

1. A stale PRECHECK worker must not clear another lease, revoke Auth or delete data.
2. Count mismatch/801 intents/over-cap resources must preserve the old usable generation with zero tenant/Storage/Auth side effects.
3. A worker failing after boundary must never restore old OWNER authority; trusted expired-lease recovery goes forward at the same new generation.
4. An active PDF operation may drain; uncertain/malformed PDF state is preserved, never timed out into assumed object absence.
5. Parallel public resets must have one winner and controlled non-500 losers even when the old token is revoked during request verification.

## Task1 — reproduce and phase/CAS primitives

Files: new `functions/src/public-demo/reset-state.ts`, `scripts/test-public-demo-reset-state.mjs`, `qa/public-demo/reset-precheck.mjs`.

- [ ] Run the real current reset with a balanced fixture except retained counter1/actual0; require non-500 rejection, unchanged generation/OWNER/Auth/data/Storage. Expected RED: old handler returns200 and advances generation.
- [ ] Test missing/invalid phase, PRECHECK acquisition with stable generation, exact heartbeat, exact rollback, successor lease protection and trusted expired PRECHECK/DESTRUCTIVE recovery before implementing helpers.
- [x] Implement closed phase/error types and `acquireResetLease`, `assertResetLease`, `heartbeatResetLease`, `rollbackPrecheck`, `advanceResetBoundary`, `advanceResetFinalize` using transaction/CAS and independent literal expectations. OPEN is written only by Task3 after actual final invariants.
- [ ] Verify the state suite GREEN; no external Auth/Storage action belongs to these primitives.

## Task2 — actual retained docs and capacity preflight

Files: new `functions/src/public-demo/reset-retention.ts`, `scripts/test-public-demo-reset-retention.mjs`; new reset adapter.

- [ ] RED tests: lower/higher/missing/malformed counter;800/801 docs; malformed/uncertain intents; expired+young tombstones; exact decrement and replay; stale lease no cleanup.
- [ ] Use existing limit/counter validator and cleanup primitive only inside stronger exact-phase/actual-count transactions. Known terminal records become tombstones after boundary; young invalidated age is preserved.
- [ ] Classify real PDF controls: valid bounded heartbeat waits; IO_UNCERTAIN/uncertain cancel/malformed/impossible states require recovery. No control is deleted to unblock reset.
- [ ] Implement native transaction aggregate counts and exact tenant Storage list/deletion adapters; no unbounded collection or fallback to latest object generation.
- [ ] Verify GREEN with real-emulator aggregate/count/retention tests, including rollback and untouched foreign sentinels.

## Task3 — orchestrator and recovery wiring

Files: new `reset-engine.ts`, `reset-adapters.ts`; modify `service.ts` and locally regenerate `generated.js`; new `qa/public-demo/reset-recovery.mjs` and `reset-concurrency.mjs`.

- [ ] RED: public concurrent reset200+500; worker loss before/after boundary; new generation token unusable until finalize; old generation never usable after boundary.
- [ ] Run PRECHECK drain → reconciliation → capacity → atomic boundary; then Auth revoke, lease-checked tenant/root cleanup, retained tombstones, pinned-generation Storage deletion and deterministic reseed.
- [ ] Persist fixtureAt at acquisition; recovery uses it again. Record external Auth effects under exact lease; FINALIZE verifies canonical fixture, membership/claims, no PDF control, exact retained count and reseeded admission before OPEN.
- [ ] Map known reset contention/generation/lease/recovery/capacity/transient errors to safe non-INTERNAL outcomes. Keep public verification checkRevoked=true.
- [ ] Run at least20 public two-way races per tenant plus a multi-caller race. Keep production cooldown intact; only emulator fixture timestamps are reset between independent rounds.

## Task4 — regressions and independent gate

Files: affected QA fixtures/runner/docs only; normal Rules/production entry/lockfiles stay byte-identical.

- [ ] Update only affected test fixtures to explicit phases/complete retained records; retain or strengthen denial and rollback assertions.
- [ ] Run all focused B3 suites, all required B2 deterministic/npm suites, and each named emulator/browser suite on fresh state.
- [ ] Independently review final reset/CAS/retention source with the user's focus list; unresolved Critical/Important keeps B3 closed.
- [ ] Compare protected hashes, final diff, exact tests, dependency status and no-cloud flags; write B3 report and stop before hosted work.

Progress and rulings are recorded in `docs/PUBLIC_DEMO_B3_PROGRESS.md` rather than commits, which this task explicitly forbids.
