# ShiftOryx Scheduler Contract V3 — Owner-Authoritative Standard Architecture

**Version**: 3.0.0
**Status**: Implementation Draft
**Supersedes**: V2 only when `schemaVersion=3` is active for the tenant. V2 remains fully supported.

---

## 1. Purpose

Scheduler V3 replaces the hidden CORE/FLEX/EXTRA role topology with a **generic, owner-authoritative** scheduling model based on:

- Tenant-defined **headcount-only coverage**
- **Active employees** as normal scheduling participants by default
- Standard **days off**, optional **weekly target hours**, optional **standard shifts**
- Per-employee **weekly shift rotation**
- **Deterministic** automatic baseline generation
- **Editable draft preview** with live statistics
- **Non-blocking** scheduling warnings (OWNER decides)
- **Immutable publication versions** with permanent PDF history

---

## 2. Non-Negotiable Contracts

### 2.1 No Implicit Role Classification
V3 does NOT depend on `CORE_A`, `CORE_B`, `FLEX_A`, `FLEX_B`, `EXTRA_A`, `EXTRA_B`, employee array position, or employee count-based special cases.

### 2.2 Active Employee = Normal Participant
An active employee with `workMode=NORMAL` participates in normal scheduling. No employee becomes substitute-only implicitly.

### 2.3 Non-Blocking Warnings
All scheduling/business warnings are `blocking: false`. They inform the OWNER but never prevent draft saving, preview editing, or publishing. Only technical/security errors block operations.

### 2.4 Immutable Publications
Every Publish creates a new immutable version. Old versions are never overwritten or deleted.

### 2.5 PDF History
Each publication stores both a structured snapshot AND the exact PDF artifact. Historical PDFs remain stable regardless of future configuration changes.

### 2.6 Deterministic Generation
Same inputs → same output. No `Math.random()`, no `localeCompare` in scheduling paths, no wall-clock dependencies.

---

## 3. Data Model

### 3.1 SchedulerConfigV3
```typescript
type SchedulerConfigV3 = {
  schemaVersion: 3;
  tenantId: string;
  timezone: string;
  weekStartDay: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  operatingDays: OperatingDayConfigV3[];
  shiftTemplates: ShiftTemplateV3[];
  coverageRequirements: CoverageRequirementV3[];
  generationDefaults: { balanceWeeklyTargetsForMonth: boolean };
  warningPolicies?: WarningPoliciesV3;
  templateId: string;
  templateVersion: number;
};
```

Coverage is **headcount-only**. No role/skill requirements.

### 3.2 Employee Scheduling Profile V3
```typescript
type EmployeeSchedulingProfileV3 = {
  workMode: 'NORMAL' | 'SUBSTITUTE_ONLY';
  fixedDayOff: number | null;
  targetWeeklyHours: number | null;
  standardShiftTemplateId: string | null;
  rotateStandardShiftWeekly: boolean;
  rotationAlternateShiftTemplateId: string | null;
  rotationAnchorWeekStart: string | null;
};
```

Defaults for new employees:
- `workMode = NORMAL`
- All other fields = `null` / `false`

### 3.3 Coverage Slot
```typescript
type CoverageSlotV3 = {
  shiftTemplateId: string;
  headcount: number; // integer >= 0
};
```

No role or skill fields.

### 3.4 Warning
```typescript
type ScheduleWarningV3 = {
  id: string;
  code: WarningCodeV3;
  severity: 'INFO' | 'WARNING';
  blocking: false; // ALWAYS false
  date?: string;
  employeeId?: string;
  message: string;
  details?: Record<string, string | number | boolean>;
};
```

### 3.5 Publication
```typescript
type SchedulePublicationV3 = {
  id: string;
  tenantId: string;
  schemaVersion: 3;
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;
  periodEnd: string;
  periodKey: string;
  version: number;
  templateSnapshot: SchedulerConfigV3;
  employeeSnapshot: SafeEmployeeSnapshot[];
  shifts: SafePublishedShiftV3[];
  calculatedHours: EmployeeHoursSummaryV3[];
  warningsAtPublish: ScheduleWarningV3[];
  publishedWithWarnings: boolean;
  pdfStoragePath: string;
  pdfGeneratedAt: string;
  publishedAt: string;
  publishedByUid: string;
};
```

Employee snapshots contain ONLY: `employeeId`, `displayName`, optional `color`, optional `displayLabel`. NO email, phone, AFM, auth UID, or private metadata.

---

## 4. Generator Contract

### 4.1 Pure Function
`generateScheduleV3()` is pure. No Firestore. No Firebase. No side effects.

### 4.2 Assignment Priority
For each coverage slot:
1. Employee is auto-eligible (active, no absence, no fixed day off)
2. Employee's effective standard shift matches slot
3. Employee has remaining weekly target-hours deficit
4. Deterministic round-robin for equal candidates
5. Final `employeeId` lexicographic tie-break

### 4.3 Target Hours
- `targetWeeklyHours` is an objective, NOT a hard constraint
- Target is never treated as a maximum — coverage may exceed it
- `null` target means no weekly hours guidance

### 4.4 Weekly Rotation
- Anchor-based parity: `weeks_since_anchor % 2`
- Month/year boundaries do NOT reset rotation
- Manual preview edits do NOT alter rotation settings

### 4.5 Coverage Gaps
- Unfilled slots produce `COVERAGE_UNDER_TARGET` warnings
- Draft generation NEVER aborts due to coverage shortages
- Partial schedules are valid drafts

---

## 5. Warning Codes

| Code | Trigger |
|---|---|
| `COVERAGE_UNDER_TARGET` | Coverage slot unfilled |
| `COVERAGE_OVER_TARGET` | More employees than headcount |
| `FIXED_DAY_OFF_OVERRIDE` | Manual assignment on fixed day off |
| `ABSENCE_OVERRIDE` | Manual assignment during absence |
| `SHIFT_OVERLAP` | Employee has overlapping assignments |
| `OUTSIDE_OPERATING_WINDOW` | Shift outside operating hours |
| `STANDARD_SHIFT_DEVIATION` | Employee not on their standard shift |
| `TARGET_HOURS_UNDER` | Below weekly target hours |
| `TARGET_HOURS_OVER` | Above weekly target hours |
| `REST_INTERVAL_WARNING` | Less than minimum rest between shifts |
| `DAILY_HOURS_WARNING` | Exceeds daily hour limit |
| `WEEKLY_HOURS_WARNING` | Exceeds weekly hour limit |
| `CONSECUTIVE_DAYS_WARNING` | Too many consecutive working days |
| `ROTATION_CONFIGURATION_WARNING` | Rotation misconfigured |
| `SUBSTITUTE_MANUAL_ASSIGNMENT` | Substitute-only employee manually assigned |
| `DEACTIVATED_EMPLOYEE_REFERENCE` | Reference to inactive employee |

ALL warnings: `blocking: false`.

---

## 6. Publication Flow

```
Draft
  → Structural validation (blocking)
  → Warning analysis (non-blocking)
  → OWNER reviews warnings
  → Publish Anyway
  → Immutable version created
  → PDF stored
  → Period index updated
  → Public projection updated
```

### 6.1 Version Allocation
Transaction-safe. Two concurrent publishes must produce unique version numbers.

### 6.2 PDF
Generated from the immutable in-memory snapshot. Stored at:
`tenants/{tenantId}/schedule-publications/{publicationId}/schedule.pdf`

No permanent public URL. Download through authorized Firebase Storage SDK.

---

## 7. V2 Coexistence

- `schemaVersion=2` → existing V2/legacy paths
- `schemaVersion=3` → V3 paths
- V2 tests, contract, and functionality remain untouched
- No automatic production migration

---

## 8. Security

- All new collections are tenant-scoped
- Publications: create-only, deny update/delete
- PDF: OWNER-only access via tenant membership
- No cross-tenant access
- Employee snapshots exclude private fields
- No secrets in warning details or audit logs

## 9. Implemented Integration And Verification (8 September 2026)

- Activation requires `VITE_ENABLE_SCHEDULER_V3=true` and tenant settings `schedulerSchemaVersion: 3`. The default is off. Repository operations also enforce the global flag. Existing broker/gate flags are unchanged.
- V3 settings and employee profiles are saved atomically. The V3 workspace includes employee creation/deactivation and the existing absence editor.
- The primary scheduling workspace is V3. A separate disclosure retains previous schedules, exports and tools; legacy public refresh/month-clear actions are gated for a V3 tenant and cannot replace the new publication projections.
- Drafts use `shifts` with `schedulerSchemaVersion: 3` and `draftId`, plus private `scheduleDrafts` metadata. Revision checks reject stale saves. Reads reconstruct one consistent transaction snapshot. Legacy bulk reads/clear operations exclude V3 draft rows.
- Publication version reservation is transactional and bound to the publication ID. PDF upload precedes publication visibility. Snapshot, latest-period pointer and intersecting public week/month projections commit together. Published snapshots and PDFs deny overwrite/delete.
- Public projections contain only display names, dates, times, work labels and non-sensitive V3/cross-midnight markers; internal IDs, warning details and profile data stay private. Public overnight analytics use the explicit V3 marker.
- `previewV2Migration` is an offline preview function. Role/skill demand, replacement strategies, special dates and special Sunday policies are reported for owner review rather than silently migrated. It performs no writes.
- `npm run test:scheduler-contract-v3`: 304 engine cases and 17 service cases. The service cases include real PDF generation, privacy allowlists and publication failure ordering.
- V2 contract suite: 2,118 assertions unchanged. Browser coverage: three existing V2 tests plus V3 mobile and desktop tests. Emulator coverage exercises the actual V3 repository, concurrent reservations, draft roundtrips, stale saves, immutable snapshot/PDF denial and tenant/identity boundaries.

Technical limits and follow-up before production activation:

- Draft writes are bounded to one Firestore transaction (450 operations). Oversized drafts fail explicitly rather than partially saving.
- Failed PDF/finalization attempts can leave an unused reserved version or an unreferenced immutable PDF. No publication pointer is exposed on upload failure; abandoned artifacts require a separately approved cleanup policy.
- Time calculations use dated civil-clock intervals. IANA timezone/DST elapsed-hour conversion is not implemented.
- The separate lifecycle branch's 152-case script is absent from this branch and was not cherry-picked. V3 lifecycle behavior has its own tests; the independent branch is preserved.
- Vite transpilation/build is not TypeScript type checking. No standalone TypeScript compiler was installed.
- No production activation, Rules deployment, migration, DNS change or PR merge is part of this work.

Partial-day absences currently have no time bounds and conservatively exclude their full date from automatic assignment. V2 break-adjusted durations require review during preview migration because V3 templates represent gross time spans.

Emulator testing uses `scripts/run-scheduler-v3-emulator.mjs` inside Firebase `emulators:exec` for demo project `demo-shiftoryx-v3`. Run the emulator from a temporary directory with a config referencing this checkout's Rules; debug logs must remain outside the checkout.
