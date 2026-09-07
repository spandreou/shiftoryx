/**
 * ShiftOryx Scheduler V3 — Warning Engine
 *
 * Shared non-blocking schedule analyzer.
 * Used for generation, preview edits, and publish validation.
 * ALL warnings are blocking: false.
 * Pure function — no Firestore, no Firebase.
 */

import type {
  EmployeeV3,
  EmployeeAbsenceV3,
  GeneratedShiftV3,
  SchedulerConfigV3,
  ScheduleWarningV3,
  WarningCodeV3,
} from './types.ts';
import { timeToMinutesV3 } from './config.ts';
import { isFixedDayOff, isWithinActiveDates } from './employeeProfile.ts';
import { eachDateInRange, getWeekdayForDate } from './coverage.ts';
import { getMondayOfWeek } from './employeeProfile.ts';

let _warnIdCounter = 0;

function warnId(): string {
  _warnIdCounter++;
  return `warn-${_warnIdCounter.toString().padStart(6, '0')}`;
}

function makeWarning(
  code: WarningCodeV3,
  severity: 'INFO' | 'WARNING',
  message: string,
  overrides: Partial<ScheduleWarningV3> = {},
): ScheduleWarningV3 {
  return {
    id: warnId(),
    code,
    severity,
    blocking: false,
    message,
    ...overrides,
  };
}

/**
 * Analyze a schedule for all warning conditions.
 * This is the single shared analyzer used by:
 * - Generator (post-generation)
 * - Preview editor (after each edit)
 * - Publish gate (pre-publish review)
 *
 * @param config Tenant V3 configuration
 * @param employees All employees
 * @param absences All absences in the period
 * @param shifts Current schedule shifts
 * @param periodStart ISO date
 * @param periodEnd ISO date
 * @returns Array of non-blocking warnings
 */
export function analyzeScheduleWarningsV3(
  config: SchedulerConfigV3,
  employees: EmployeeV3[],
  absences: EmployeeAbsenceV3[],
  shifts: GeneratedShiftV3[],
  periodStart: string,
  periodEnd: string,
): ScheduleWarningV3[] {
  _warnIdCounter = 0;
  const warnings: ScheduleWarningV3[] = [];
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const policies = config.warningPolicies || {};

  // 1. Coverage analysis
  const templateMap = new Map(config.shiftTemplates.map((t) => [t.id, t]));
  const dates = eachDateInRange(periodStart, periodEnd);

  for (const date of dates) {
    const weekday = getWeekdayForDate(date);
    const dayConfig = config.operatingDays.find((d) => d.weekday === weekday);
    if (!dayConfig || !dayConfig.isOpen) continue;

    const coverage = config.coverageRequirements.find((c) => c.weekday === weekday);
    if (!coverage) continue;

    for (const slot of coverage.slots) {
      const assigned = shifts.filter(
        (s) => s.date === date && s.shiftTemplateId === slot.shiftTemplateId,
      ).length;
      if (assigned < slot.headcount) {
        warnings.push(makeWarning(
          'COVERAGE_UNDER_TARGET', 'WARNING',
          `Ελλιπής κάλυψη: ${assigned}/${slot.headcount} εργαζόμενοι (${date}).`,
          { date, details: { shiftTemplateId: slot.shiftTemplateId, assigned, required: slot.headcount } },
        ));
      } else if (assigned > slot.headcount) {
        warnings.push(makeWarning(
          'COVERAGE_OVER_TARGET', 'INFO',
          `Υπερκάλυψη: ${assigned}/${slot.headcount} εργαζόμενοι (${date}).`,
          { date, details: { shiftTemplateId: slot.shiftTemplateId, assigned, required: slot.headcount } },
        ));
      }
    }
  }

  // Per-employee analyses
  for (const shift of shifts) {
    const emp = empMap.get(shift.employeeId);

    // 2. Fixed day off override
    if (emp && isFixedDayOff(shift.date, emp.schedulerV3.fixedDayOff)) {
      warnings.push(makeWarning(
        'FIXED_DAY_OFF_OVERRIDE', 'WARNING',
        `Ο ${emp.fullName} εργάζεται στη σταθερή ημέρα ανάπαυσής του (${shift.date}).`,
        { date: shift.date, employeeId: shift.employeeId },
      ));
    }

    // 3. Absence override
    const hasAbsence = absences.some(
      (a) =>
        a.employeeId === shift.employeeId &&
        shift.date >= a.startDate &&
        shift.date <= a.endDate &&
        a.scope === 'FULL_DAY',
    );
    if (hasAbsence) {
      warnings.push(makeWarning(
        'ABSENCE_OVERRIDE', 'WARNING',
        `Ο ${emp?.fullName || shift.employeeName} εργάζεται ενώ έχει άδεια (${shift.date}).`,
        { date: shift.date, employeeId: shift.employeeId },
      ));
    }

    // 4. Outside operating window
    if (shift.shiftTemplateId) {
      const weekday = getWeekdayForDate(shift.date);
      const dayConfig = config.operatingDays.find((d) => d.weekday === weekday);
      if (dayConfig && dayConfig.isOpen && dayConfig.windows.length > 0) {
        const shiftStart = timeToMinutesV3(shift.startTime);
        const shiftEnd = timeToMinutesV3(shift.endTime);
        const inWindow = dayConfig.windows.some((w) => {
          const wStart = timeToMinutesV3(w.openTime);
          const wEnd = timeToMinutesV3(w.closeTime);
          if (w.crossMidnight) return true; // simplified for cross-midnight
          return shiftStart >= wStart && shiftEnd <= wEnd;
        });
        if (!inWindow) {
          warnings.push(makeWarning(
            'OUTSIDE_OPERATING_WINDOW', 'WARNING',
            `Βάρδια εκτός ωραρίου λειτουργίας (${shift.date}, ${shift.startTime}-${shift.endTime}).`,
            { date: shift.date, employeeId: shift.employeeId, shiftId: shift.id },
          ));
        }
      }
    }

    // 5. Substitute-only employee assignment
    if (emp && emp.schedulerV3.workMode === 'SUBSTITUTE_ONLY' && shift.source === 'MANUAL') {
      warnings.push(makeWarning(
        'SUBSTITUTE_MANUAL_ASSIGNMENT', 'INFO',
        `Ο ${emp.fullName} είναι μόνο αναπληρωματικός και ανατέθηκε χειροκίνητα (${shift.date}).`,
        { date: shift.date, employeeId: shift.employeeId },
      ));
    }

    // 6. Deactivated employee reference
    if (emp && !emp.isActive) {
      warnings.push(makeWarning(
        'DEACTIVATED_EMPLOYEE_REFERENCE', 'WARNING',
        `Αναφορά σε ανενεργό εργαζόμενο: ${emp.fullName} (${shift.date}).`,
        { date: shift.date, employeeId: shift.employeeId },
      ));
    }
  }

  // 7. Shift overlaps (per employee, per date)
  const shiftsByEmployeeDate = new Map<string, GeneratedShiftV3[]>();
  for (const shift of shifts) {
    const key = `${shift.employeeId}:${shift.date}`;
    if (!shiftsByEmployeeDate.has(key)) shiftsByEmployeeDate.set(key, []);
    shiftsByEmployeeDate.get(key)!.push(shift);
  }
  for (const [key, dayShifts] of shiftsByEmployeeDate) {
    if (dayShifts.length < 2) continue;
    const sorted = [...dayShifts].sort((a, b) =>
      a.startTime < b.startTime ? -1 : a.startTime > b.startTime ? 1 : 0,
    );
    for (let i = 0; i < sorted.length - 1; i++) {
      const endMin = timeToMinutesV3(sorted[i].endTime);
      const nextStartMin = timeToMinutesV3(sorted[i + 1].startTime);
      if (endMin > nextStartMin) {
        const emp = empMap.get(sorted[i].employeeId);
        warnings.push(makeWarning(
          'SHIFT_OVERLAP', 'WARNING',
          `Αλληλεπικαλυπτόμενες βάρδιες για ${emp?.fullName || sorted[i].employeeName} (${sorted[i].date}).`,
          { date: sorted[i].date, employeeId: sorted[i].employeeId },
        ));
      }
    }
  }

  // 8. Rest interval (between consecutive days)
  if (policies.minRestIntervalHours && policies.minRestIntervalHours > 0) {
    const minRestMin = policies.minRestIntervalHours * 60;
    const employeeIds = [...new Set(shifts.map((s) => s.employeeId))];
    for (const eid of employeeIds) {
      const empShifts = shifts
        .filter((s) => s.employeeId === eid)
        .sort((a, b) => {
          if (a.date !== b.date) return a.date < b.date ? -1 : 1;
          return a.startTime < b.startTime ? -1 : 1;
        });
      for (let i = 0; i < empShifts.length - 1; i++) {
        const curr = empShifts[i];
        const next = empShifts[i + 1];
        if (curr.date === next.date) continue; // same day — overlap check already done
        const currEnd = timeToMinutesV3(curr.endTime);
        const nextStart = timeToMinutesV3(next.startTime);
        // Days between
        const d1 = new Date(curr.date + 'T00:00:00Z');
        const d2 = new Date(next.date + 'T00:00:00Z');
        const daysDiff = Math.round((d2.getTime() - d1.getTime()) / (24 * 60 * 60 * 1000));
        if (daysDiff === 1) {
          const restMin = (24 * 60 - currEnd) + nextStart;
          if (restMin < minRestMin) {
            const emp = empMap.get(eid);
            warnings.push(makeWarning(
              'REST_INTERVAL_WARNING', 'WARNING',
              `Ανεπαρκής ανάπαυση (${(restMin / 60).toFixed(1)}h) για ${emp?.fullName || eid} μεταξύ ${curr.date} και ${next.date}.`,
              { date: next.date, employeeId: eid, details: { restHours: Math.round(restMin / 60 * 4) / 4 } },
            ));
          }
        }
      }
    }
  }

  // 9. Consecutive working days
  if (policies.maxConsecutiveWorkingDays && policies.maxConsecutiveWorkingDays > 0) {
    const maxConsec = policies.maxConsecutiveWorkingDays;
    const employeeIds = [...new Set(shifts.map((s) => s.employeeId))];
    for (const eid of employeeIds) {
      const workDates = [...new Set(shifts.filter((s) => s.employeeId === eid).map((s) => s.date))].sort();
      let consecutive = 1;
      for (let i = 1; i < workDates.length; i++) {
        const prev = new Date(workDates[i - 1] + 'T00:00:00Z');
        const curr = new Date(workDates[i] + 'T00:00:00Z');
        const diff = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000));
        if (diff === 1) {
          consecutive++;
          if (consecutive > maxConsec) {
            const emp = empMap.get(eid);
            warnings.push(makeWarning(
              'CONSECUTIVE_DAYS_WARNING', 'WARNING',
              `${emp?.fullName || eid}: ${consecutive} συνεχόμενες ημέρες εργασίας (μέγιστο: ${maxConsec}).`,
              { date: workDates[i], employeeId: eid },
            ));
          }
        } else {
          consecutive = 1;
        }
      }
    }
  }

  // 10. Weekly hours
  if (policies.maxWeeklyHours && policies.maxWeeklyHours > 0) {
    const maxWeekly = policies.maxWeeklyHours;
    const employeeIds = [...new Set(shifts.map((s) => s.employeeId))];
    const weekStarts = new Set<string>();
    for (const date of dates) {
      weekStarts.add(getMondayOfWeek(date));
    }
    for (const eid of employeeIds) {
      for (const ws of weekStarts) {
        const weEnd = new Date(ws + 'T00:00:00Z');
        weEnd.setUTCDate(weEnd.getUTCDate() + 6);
        const weekEnd = weEnd.toISOString().slice(0, 10);
        const hours = shifts
          .filter((s) => s.employeeId === eid && s.date >= ws && s.date <= weekEnd)
          .reduce((sum, s) => sum + s.durationHours, 0);
        if (hours > maxWeekly) {
          const emp = empMap.get(eid);
          warnings.push(makeWarning(
            'WEEKLY_HOURS_WARNING', 'WARNING',
            `${emp?.fullName || eid}: ${hours.toFixed(1)}h σε εβδομάδα ${ws} (μέγιστο: ${maxWeekly}h).`,
            { employeeId: eid, details: { hours, maxWeeklyHours: maxWeekly, weekStart: ws } },
          ));
        }
      }
    }
  }

  // 11. Daily hours
  if (policies.maxDailyHours && policies.maxDailyHours > 0) {
    const maxDaily = policies.maxDailyHours;
    for (const [key, dayShifts] of shiftsByEmployeeDate) {
      const totalHours = dayShifts.reduce((sum, s) => sum + s.durationHours, 0);
      if (totalHours > maxDaily) {
        const [eid, date] = key.split(':');
        const emp = empMap.get(eid);
        warnings.push(makeWarning(
          'DAILY_HOURS_WARNING', 'WARNING',
          `${emp?.fullName || eid}: ${totalHours.toFixed(1)}h στις ${date} (μέγιστο: ${maxDaily}h).`,
          { date, employeeId: eid },
        ));
      }
    }
  }

  return warnings;
}
