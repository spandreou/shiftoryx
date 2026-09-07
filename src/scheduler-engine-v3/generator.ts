/**
 * ShiftOryx Scheduler V3 — Pure Schedule Generator
 *
 * Deterministic schedule generation based on:
 * - Headcount-only coverage (no CORE/FLEX/EXTRA)
 * - Employee eligibility
 * - Standard shift matching
 * - Target-hours deficit balancing
 * - Round-robin with employeeId tie-breaking
 *
 * Same inputs → same output. No Math.random(), no localeCompare.
 * Pure function — no Firestore, no Firebase.
 */

import type {
  EmployeeV3,
  EmployeeAbsenceV3,
  GeneratedShiftV3,
  GenerateScheduleV3Input,
  GenerateScheduleV3Result,
  ScheduleWarningV3,
  EmployeeHoursSummaryV3,
  CoverageSummaryV3,
  SchedulerConfigV3,
  ShiftTemplateV3,
  WarningCodeV3,
} from './types.ts';
import { evaluateEmployeeEligibilityV3 } from './eligibility.ts';
import { resolveEffectiveStandardShift } from './employeeProfile.ts';
import { expandCoverageSlots, calculateCoverageSummary, eachDateInRange, getWeekdayForDate } from './coverage.ts';
import { getMondayOfWeek } from './employeeProfile.ts';
import { calculateShiftDurationHoursV3 } from './config.ts';

let _idCounter = 0;

/**
 * Generate a deterministic unique ID.
 * Uses a prefix + counter to ensure uniqueness within a single generation run.
 */
function generateId(prefix: string): string {
  _idCounter++;
  return `${prefix}-${_idCounter.toString().padStart(6, '0')}`;
}

/**
 * Deterministic hash for diagnostics (FNV-1a inspired).
 */
function simpleHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Get the ISO week start (Monday) and end (Sunday) for a given date.
 */
function getWeekBounds(dateStr: string): { weekStart: string; weekEnd: string } {
  const monday = getMondayOfWeek(dateStr);
  const d = new Date(monday + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return { weekStart: monday, weekEnd: d.toISOString().slice(0, 10) };
}

/**
 * Calculate total assigned hours for an employee within a date range.
 */
function calcHoursInRange(
  employeeId: string,
  startDate: string,
  endDate: string,
  shifts: GeneratedShiftV3[],
): number {
  return shifts
    .filter((s) => s.employeeId === employeeId && s.date >= startDate && s.date <= endDate)
    .reduce((sum, s) => sum + s.durationHours, 0);
}

/**
 * Generate a V3 schedule.
 *
 * @param input - Complete generation input with config, employees, absences, and options
 * @returns Deterministic schedule result with shifts, warnings, coverage summary, and diagnostics
 */
export function generateScheduleV3(input: GenerateScheduleV3Input): GenerateScheduleV3Result {
  // Reset ID counter for determinism
  _idCounter = 0;

  const { config, employees, absences, existingManualShifts, periodStart, periodEnd, options } = input;

  // 1. Prepare lookup structures
  const templateMap = new Map(config.shiftTemplates.map((t) => [t.id, t]));
  const activeEmployees = employees
    .filter((e) => e.isActive)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)); // Deterministic order by ID

  const shifts: GeneratedShiftV3[] = [];
  const warnings: ScheduleWarningV3[] = [];

  // 2. Include existing manual shifts
  if (existingManualShifts) {
    for (const manual of existingManualShifts) {
      shifts.push({ ...manual });
    }
  }

  // 3. Expand coverage slots
  const coverageSlots = expandCoverageSlots(config, periodStart, periodEnd);

  // 4. Group coverage slots by date for ordered processing
  const slotsByDate = new Map<string, typeof coverageSlots>();
  for (const slot of coverageSlots) {
    if (!slotsByDate.has(slot.date)) slotsByDate.set(slot.date, []);
    slotsByDate.get(slot.date)!.push(slot);
  }

  // Process dates in chronological order
  const sortedDates = [...slotsByDate.keys()].sort();

  // 5. Round-robin tracker per shift template
  const roundRobinIndex = new Map<string, number>();

  for (const date of sortedDates) {
    const dateSlots = slotsByDate.get(date) || [];
    const { weekStart, weekEnd } = getWeekBounds(date);

    // Process slots ordered by shiftTemplateId for determinism
    const sortedSlots = [...dateSlots].sort((a, b) => {
      if (a.shiftTemplateId !== b.shiftTemplateId) {
        return a.shiftTemplateId < b.shiftTemplateId ? -1 : 1;
      }
      return a.slotIndex - b.slotIndex;
    });

    for (const slot of sortedSlots) {
      // Check if already filled by a manual shift
      const alreadyFilled = shifts.filter(
        (s) => s.date === date && s.shiftTemplateId === slot.shiftTemplateId,
      ).length;
      if (alreadyFilled > slot.slotIndex) continue;

      const template = slot.shiftTemplate;
      if (!template) {
        warnings.push({
          id: generateId('w'),
          code: 'COVERAGE_UNDER_TARGET',
          severity: 'WARNING',
          blocking: false,
          date,
          message: `Δεν βρέθηκε πρότυπο βάρδιας: ${slot.shiftTemplateId}.`,
        });
        continue;
      }

      // 6. Find eligible candidates
      const candidates: {
        employee: EmployeeV3;
        matchesStandard: boolean;
        hoursDeficit: number;
      }[] = [];

      for (const emp of activeEmployees) {
        const eligibility = evaluateEmployeeEligibilityV3(
          emp, date, absences, shifts, template.startTime,
          {
            minRestIntervalHours: config.warningPolicies?.minRestIntervalHours,
            maxDailyHours: config.warningPolicies?.maxDailyHours,
            maxWeeklyHours: config.warningPolicies?.maxWeeklyHours,
            maxConsecutiveWorkingDays: config.warningPolicies?.maxConsecutiveWorkingDays,
            weekStartDate: weekStart,
            weekEndDate: weekEnd,
          },
        );

        if (!eligibility.eligible) continue;

        // Check standard shift match
        const effectiveShift = resolveEffectiveStandardShift(emp.schedulerV3, date);
        const matchesStandard = effectiveShift === template.id;

        // Calculate target-hours deficit
        let hoursDeficit = 0;
        if (emp.schedulerV3.targetWeeklyHours !== null) {
          const currentHours = calcHoursInRange(emp.id, weekStart, weekEnd, shifts);
          hoursDeficit = emp.schedulerV3.targetWeeklyHours - currentHours;
        }

        candidates.push({ employee: emp, matchesStandard, hoursDeficit });
      }

      // 7. Sort candidates by priority (deterministic)
      candidates.sort((a, b) => {
        // Priority 1: Standard shift match
        if (a.matchesStandard !== b.matchesStandard) {
          return a.matchesStandard ? -1 : 1;
        }
        // Priority 2: Highest target-hours deficit
        if (a.hoursDeficit !== b.hoursDeficit) {
          return b.hoursDeficit - a.hoursDeficit;
        }
        // Priority 3: Round-robin (least recently assigned for this template)
        const rrKey = slot.shiftTemplateId;
        const rrIdx = roundRobinIndex.get(rrKey) || 0;
        const aIdx = activeEmployees.indexOf(a.employee);
        const bIdx = activeEmployees.indexOf(b.employee);
        const aRR = (aIdx - rrIdx + activeEmployees.length) % activeEmployees.length;
        const bRR = (bIdx - rrIdx + activeEmployees.length) % activeEmployees.length;
        if (aRR !== bRR) return aRR - bRR;
        // Priority 4: Tie-break by employeeId (lexicographic)
        return a.employee.id < b.employee.id ? -1 : 1;
      });

      if (candidates.length > 0) {
        const selected = candidates[0];
        const duration = calculateShiftDurationHoursV3(
          template.startTime,
          template.endTime,
          template.crossMidnight,
        );

        shifts.push({
          id: generateId('shift-v3'),
          date,
          employeeId: selected.employee.id,
          employeeName: selected.employee.fullName,
          shiftTemplateId: template.id,
          startTime: template.startTime,
          endTime: template.endTime,
          durationHours: duration,
          crossMidnight: template.crossMidnight || undefined,
          source: 'AUTO',
          isManualOverride: false,
          schedulerSchemaVersion: 3,
        });

        // Update round-robin index
        const selIdx = activeEmployees.indexOf(selected.employee);
        roundRobinIndex.set(slot.shiftTemplateId, (selIdx + 1) % activeEmployees.length);

        // Standard shift deviation warning
        if (!selected.matchesStandard && selected.employee.schedulerV3.standardShiftTemplateId) {
          warnings.push({
            id: generateId('w'),
            code: 'STANDARD_SHIFT_DEVIATION',
            severity: 'INFO',
            blocking: false,
            date,
            employeeId: selected.employee.id,
            message: `Ο ${selected.employee.fullName} δεν εργάζεται στην τυπική του βάρδια.`,
          });
        }
      } else {
        // Coverage gap
        warnings.push({
          id: generateId('w'),
          code: 'COVERAGE_UNDER_TARGET',
          severity: 'WARNING',
          blocking: false,
          date,
          message: `Δεν βρέθηκε διαθέσιμος εργαζόμενος για ${template.label} (${date}).`,
          details: { shiftTemplateId: template.id },
        });
      }
    }
  }

  // 8. Post-generation warnings: target hours
  const allDates = eachDateInRange(periodStart, periodEnd);
  const weekBoundsMap = new Map<string, { weekStart: string; weekEnd: string }>();
  for (const date of allDates) {
    const bounds = getWeekBounds(date);
    weekBoundsMap.set(bounds.weekStart, bounds);
  }

  for (const emp of activeEmployees) {
    if (emp.schedulerV3.targetWeeklyHours === null) continue;
    for (const [, bounds] of weekBoundsMap) {
      const hours = calcHoursInRange(emp.id, bounds.weekStart, bounds.weekEnd, shifts);
      const target = emp.schedulerV3.targetWeeklyHours;
      if (hours < target * 0.9) {
        warnings.push({
          id: generateId('w'),
          code: 'TARGET_HOURS_UNDER',
          severity: 'INFO',
          blocking: false,
          employeeId: emp.id,
          message: `Ο ${emp.fullName} έχει ${hours.toFixed(1)}h (στόχος: ${target}h).`,
          details: { actual: hours, target, weekStart: bounds.weekStart },
        });
      } else if (hours > target * 1.1) {
        warnings.push({
          id: generateId('w'),
          code: 'TARGET_HOURS_OVER',
          severity: 'INFO',
          blocking: false,
          employeeId: emp.id,
          message: `Ο ${emp.fullName} έχει ${hours.toFixed(1)}h (στόχος: ${target}h).`,
          details: { actual: hours, target, weekStart: bounds.weekStart },
        });
      }
    }
  }

  // 9. Calculate coverage summary
  const coverageSummary = calculateCoverageSummary(config, periodStart, periodEnd, shifts);

  // 10. Calculate employee hours
  const employeeHours = calculateEmployeeHoursV3(employees, shifts);

  // 11. Build diagnostics
  const inputStr = JSON.stringify({
    periodStart,
    periodEnd,
    employeeIds: activeEmployees.map((e) => e.id),
    templateIds: config.shiftTemplates.map((t) => t.id),
  });

  // Sort shifts deterministically
  shifts.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.employeeId !== b.employeeId) return a.employeeId < b.employeeId ? -1 : 1;
    return 0;
  });

  return {
    shifts,
    warnings,
    coverageSummary,
    employeeHours,
    diagnostics: {
      generatedAt: new Date().toISOString(),
      inputHash: simpleHash(inputStr),
      deterministicSeed: `v3-${periodStart}-${periodEnd}`,
    },
  };
}

/**
 * Calculate per-employee hours summary, including zero-hour employees.
 */
export function calculateEmployeeHoursV3(
  employees: EmployeeV3[],
  shifts: GeneratedShiftV3[],
): EmployeeHoursSummaryV3[] {
  const hoursByEmployee = new Map<string, { hours: number; shiftCount: number }>();

  // Initialize all active employees (including zero-shift ones)
  for (const emp of employees) {
    if (emp.isActive) {
      hoursByEmployee.set(emp.id, { hours: 0, shiftCount: 0 });
    }
  }

  // Accumulate shift hours
  for (const shift of shifts) {
    const entry = hoursByEmployee.get(shift.employeeId);
    if (entry) {
      entry.hours += shift.durationHours;
      entry.shiftCount++;
    } else {
      hoursByEmployee.set(shift.employeeId, {
        hours: shift.durationHours,
        shiftCount: 1,
      });
    }
  }

  // Build result with target hours
  const empMap = new Map(employees.map((e) => [e.id, e]));
  return [...hoursByEmployee.entries()]
    .map(([employeeId, stats]) => ({
      employeeId,
      hours: Math.round(stats.hours * 4) / 4, // Quarter-hour precision
      shiftCount: stats.shiftCount,
      targetWeeklyHours: empMap.get(employeeId)?.schedulerV3?.targetWeeklyHours ?? null,
    }))
    .sort((a, b) => (a.employeeId < b.employeeId ? -1 : 1)); // Deterministic order
}
