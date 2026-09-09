# Scheduler V3 Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or, if delegation is unavailable, execute locally with the same TDD/review checkpoints. Steps use checkbox syntax.

**Goal:** Implement the user's direct-time workforce model, substitute fallback, overnight correctness and persistent large-staff tests while preserving V2 and current persistence boundaries.
**Architecture:** Canonical profileVersion:2 direct-time profiles; a pure dual-read compatibility boundary; unchanged tenant schemaVersion:3 and headcount coverage. Normal and substitute pools share physical eligibility but substitutes are selected only when no eligible normal remains for a slot. Existing immutable publication workflow and 449-shift capacity guard remain.
**Tech Stack:** Existing TypeScript/React/Vite/Firebase/Node/Playwright only.
**Spec:** User-approved attachment C:/Users/Spyros/.codex/attachments/1857b705-6278-4f6b-9757-ccae5fe524ec/pasted-text.txt (read fully; authoritative over prior design).

## Global Constraints
- Work only at C:/Users/Spyros/.codex/worktrees/shiftoryx-v3-simplification-correctness on codex/scheduler-v3-simplification-correctness.
- START_SHA=44c5fa422b6baada41a436df5be66c8df206df22.
- No deploy, production Firebase, tenant activation, Vercel env, IAM, DNS, auth/domain changes, Actions permissions or merge. Demo-only fixture state is not production activation.
- No new dependencies, lockfile edits, V2 engine rewrites or changes to its 2,118 assertions. No chunking/finalizer/persistence redesign.
- Never read/search/hash/copy/stage/delete firestore-debug.log or .serena. Do not read/copy .env/credentials. Use explicit scoped staging; preserve unrelated files.
- New workMode defaults NORMAL regardless of count/order. Greek UI labels: Κανονική συμμετοχή; Μόνο για κάλυψη / αντικατάσταση. Never display NORMAL/SUBSTITUTE_ONLY as labels.
- Rank: eligibility, effective standard-time match, target deficit, deterministic round-robin, stable ID. Substitutes only after eligible NORMAL pool exhausted.
- Target hours soft; no invented shifts. Direct profiles accept quarter-hour ranges, start != end, overnight valid.
- Legacy profile reads use the correct config snapshot and never write. New application saves use profileVersion:2 only.
- Rotation uses unique valid active tenant time ranges with same duration and no circular-day overlap, deduplicated by exact start/end. No semantic labels, first-element guesses or employee pairing.
- Preserve valid existing anchors; use stable 2026-01-05 for new ones. Reject enabling unresolved rotation.
- Touched dates use half-open working intervals: 22:00->06:00 touches both dates; 16:00->00:00 does not consume the next date.
- All implementation edits use apply_patch. Back up exact modified files under this plan's ignored workspace before changes.
- Each task records RED/GREEN commands/results, self-reviews and commits only its owned files. No subagents inside implementers.

### Task 1: Direct-time profiles, compatibility and integration boundaries
**Files:** modify types.ts, employeeProfile.ts, validation.ts, generator.ts, warnings.ts, index.ts under src/scheduler-engine-v3; create profileCompatibility.ts there; modify src/services/schedulerV3Service.ts, src/repositories/schedulePublicationsRepository.ts and focused V3 tests. Minimal migration.ts call-site updates if needed. No UI/Rules changes in this task.
**Interfaces:** canonical EmployeeSchedulingProfileV3 contains profileVersion:2, workMode, fixedDayOff, targetWeeklyHours, standardShift:{startTime,endTime}|null, rotateStandardShiftWeekly, rotationAlternateShift:{startTime,endTime}|null, rotationAnchorWeekStart. Legacy type separate. Provide decodeEmployeeProfileV3(raw, templates) returning {profile: canonical|null, diagnostics: string[]} and a throwing validated wrapper for service boundaries. normalizeEmployeeProfileV3 handles new/default profiles without dropping invalid supplied data. Compatibility only resolves legacy IDs with supplied snapshot; missing/duplicate/invalid references produce diagnostics. resolveEffectiveStandardShift returns direct range|null. applySimpleRotationV3 returns {profile,warning}; invalid enabled configuration must not become a valid persisted profile.
- [ ] Add scripts/test-scheduler-v3-profiles.mjs with counting assertions. Hand-derived checks include:
```js
assert.deepEqual(decodeEmployeeProfileV3(oldProfile, templates).profile.standardShift,
  {startTime:'06:00',endTime:'14:00'});
assert.equal(decodeEmployeeProfileV3(oldProfile, []).profile, null);
assert.equal(normalizeEmployeeProfileV3().workMode,'NORMAL');
```
Cover direct invalid types/unknown keys/quarter-minute validation, old raw immutability, unique/missing/ambiguous IDs, exact canonical single-write shape, rotation same duration/nonoverlap/overnight/dedup/ambiguity/anchor preservation.
- [ ] Run this new test on baseline; record meaningful RED.
- [ ] Implement canonical type/compatibility functions. Preserve existing pure date-distance parity. Map employees with explicit config at boundaries. createDraft and restored/loaded drafts carry canonical profiles; old drafts use historical config. For publication restoration, current employee raw profiles require current config when supplied, not historical current-ID guessing. Never rewrite snapshots/PDFs on read.
- [ ] Change generator standard-match and warnings to exact time comparisons while keeping existing standard-before-target ranking and current substitute behavior until Task 2. SaveSettings normalizes/validates and writes canonical profiles only; keep activation and capacity guards unchanged.
- [ ] Preserve existing coverage/profile-refresh/publication tests, adapting old-format test inputs to explicit compatibility APIs as required by the approved format change, not deleting behavioral assertions. Add service roundtrip/restoration tests for old and direct formats.
- [ ] Run new profile tests, npm run test:scheduler-contract-v3 and V2 baseline, npm run build. Update package test chain to include profile runner if owned and record for later task. Commit coherent foundation.

### Task 2: Substitute fallback, overnight correctness, weekly statistics and large-staff matrix
**Files:** src/scheduler-engine-v3/config.ts, eligibility.ts, generator.ts, warnings.ts, types.ts/index.ts if needed; src/services/schedulerV3Service.ts; scripts/test-scheduler-v3-large-staff.mjs (new); existing focused V3 tests and package.json.
**Interfaces:** provide touchedShiftDatesV3(date,startTime,endTime,crossMidnight) for half-open dates. Physical eligibility checks active dates/fixed off/absence/overlap/rest for all touched dates; workMode pool selection belongs to generator. Add calculateWeeklyEmployeeHoursV3(employees,shifts,periodStart,periodEnd,weekStartDay) producing employeeId/weekStart/hours/targetHours/delta/isPartialWeek. analyzeDraft exposes weeklyHours without changing publication storage layout.
- [ ] Write RED tests:
```js
assert.equal(generate(twoNeeded, [normal, substitute]).shifts.length,2);
assert.ok(generate(twoNeeded,[normalA,normalB,substitute]).shifts.every(s=>s.employeeId!=='sub'));
assert.equal(eligible(mondayNight, tuesdayAbsence),false);
assert.equal(eligible(mondayNight, tuesdayFixedOff),false);
```
Use real existing exports/fixtures, not placeholder test helpers, in the test file.
- [ ] Implement NORMAL first, then physically eligible explicit substitutes with deterministic ranking. If neither fits leave coverage warning. Update old all-substitutes-excluded assertion to the explicitly approved fallback contract with stronger normal-first controls.
- [ ] Apply touched-date logic to automatic eligibility and manual warning analyzer. Exact-midnight endpoint control, cancelled absence filtering, multi-day active dates, warning nonblocking and zero-write technical errors remain.
- [ ] Implement per-week target/delta summaries with null target=>null delta; quarter precision and partial-week label. Keep aggregate roster-first zero-hour totals.
- [ ] Persistent matrix counts 1,2,3,4,5,6,8,10,20,50,100; 101 rejected (including inactive records count documented). WEEK/MONTH partitions; lifecycle 4->5,5->6,10->11 unchanged demand and prior result; mixed8+2/18+2; each weekday/null/shared/staggered off; targets null/20/24/32/37.5/40; five specified time ranges; on/off/missing/ambiguous rotation across month/year/week53; absence/fallback/shortage/overnight; deficient/equal/surplus/zero demand. Keep computationally heavy dense100 month cases bounded, never claim all workers must have shifts when demand low.
- [ ] Assert unique IDs, valid refs/range/times/durations, no automatic absence/off/overlap, zero-hour stats, warning counts/deltas and no fake demand. For representative WEEK/MONTH inputs compare 100 repeated decisions and shuffled roster. Print actual assertion total and per-count outcomes, not only scenario count.
- [ ] Run focused RED/GREEN, V3 neighboring tests and V2 baseline; commit engine correctness and matrix.

### Task 3: Neutral employee creation and V3 UI with protected tools
**Files:** src/hooks/useSchedulerStore.js; SchedulerSettingsV3.jsx, SchedulerWorkspaceV3.jsx, MainDashboard.jsx, SchedulePreviewV3.jsx and QuarterHourTimePicker.jsx only if necessary; neutral V3 tools component if extraction is necessary; tests/scheduler-v3.e2e.spec.js and a focused store creation test.
**Interfaces:** use canonical profiles/decode diagnostics from Task 1 and weeklyHours from Task 2. V3 creation must persist schedulerV3 default profileVersion:2/NORMAL with no scheduleRole or other V2 scheduling defaults; legacy addEmployee keeps existing behavior. Regenerate snapshots latest store roster after creation/sync, not stale draft roster.
- [ ] Browser RED: profile editor active dropdown, Greek participation labels, no legacy role controls; direct 06-14/07:30-15:30/22-06 selectors; fixed-off selection; invalid rotation cannot be enabled/saved; four employees generate, add fifth via real UI with repository test seam, regenerate from current roster, stats include fifth and explicit zero-hours.
- [ ] Implement active employee selector, optional two clock fields, fixed off Monday..Sunday + null, rotation checkbox with derived range/Greek diagnostic, target and Greek-only participation labels. Display total hours/shifts plus weekly actual/target/delta/partial-week context.
- [ ] Remove the embedded editable V2 dashboard in V3. Preserve employee management, announcements, logout and history/exports via neutral components or read-only adapters. Do not expose V2 role summaries in normal V3. Do not delete V2 components. Inventory each preserved tool in report.
- [ ] Make incompatible profile diagnostics a visible safe state rather than uncaught render exceptions; no implicit data repair. Manual preview changes never alter profiles/anchor.
- [ ] Run focused browser tests mobile390 and desktop1440, V3 services/build, relevant old UI regressions. Commit UI/store integration.

### Task 4: Versioned profile Rules and actual emulator compatibility
**Files:** firestore.rules; scripts/test-scheduler-v3-emulator.mjs; repository/profile call sites only if concrete integration defect.
**Interfaces:** new profile schema from Task1. Keep old documents readable; existing old profile unchanged on unrelated employee edits remains valid. Creating/replacing schedulerV3 writes requires canonical profileVersion:2. Do not change V2 helpers, tenant authorization or draft shift validator/capacity.
- [ ] Emulator RED for malformed nested standard/alternate maps, missing/extra keys, start=end, invalid/non-quarter times, wrong workMode/bools/target bounds, rotation ON without complete valid fields, unknown profile version and mixed old/new fields.
- [ ] Positive controls for new normal/substitute canonical profiles; old fixture seeded only in demo emulator, old profile read/compatible conversion and unrelated edit preserved; app save writes direct only. SaveSettings keeps version2 tenant unchanged. Demo fixtures may explicitly seed synthetic version3 for V3 flow.
- [ ] Implement strict predicates and field-write checks. Existing legacy employee with no schedulerV3 still follows unchanged V2 behavior. Old profile replacement via app becomes new version; no auto migration.
- [ ] Full repository save/reload/publish/PDF/history/restore flows within current449-shift bound; cross-tenant/platform-admin/anonymous denied; old publication/PDF unchanged.
- [ ] Run emulator from external temp cwd with absolute worktree Rules/config, no checkout logs. Run hardening/integrity/authorization, V3 and V2; commit Rules/tests.

### Task 5: Documentation, complete verification and Draft PR delivery
**Files:** docs/SCHEDULER_CONTRACT_V3.md and concise implementation report; existing plan/ledger; focused fixes only through reviewed follow-ups.
- [ ] Document exact approved direct-time/normal/substitute-fallback/rotation/overnight/target contracts and100TOTALinput,449shift persistence limits; no large persistence readiness claim.
- [ ] Run test:scheduler-contract-v2 (2118), test:scheduler-contract-v3 plus large-staff, qa:scheduler-engine, qa:scheduler, qa:repositories, qa:public-readonly, qa:tenant-authorization, qa:auth-broker, qa:export-security, security:hardening, security:integrity, build, complete demo emulator and selected mobile/desktop E2E.
- [ ] Inspect available local TypeScript compiler only; do not install one. Review final diff, dependencies/lockfiles/Actions/secrets/protected artifacts and original main clean state.
- [ ] Obtain bounded independent whole-branch review and resolve important defects with focused regression evidence.
- [ ] Commit documentation and verified fixes, push implementation branch, create DRAFT PR against main. Never ready/merge/deploy. Confirm PR head and checks; record remaining warnings honestly.
- [ ] Final report includes START/END,branch/PR/files/schema/compat/UI/engine/fallback/rotation/overnight/lifecycle/per-count/determinism/actualassertions/V2/emulator/browser/build/security/no-production/capacity/human checklist and exact requested marker only on verified completion.

