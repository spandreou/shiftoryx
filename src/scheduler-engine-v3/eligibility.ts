/**
 * ShiftOryx Scheduler V3 — Employee Eligibility
 *
 * Evaluates whether an employee is eligible for automatic assignment
 * on a specific date/slot. No CORE/FLEX/EXTRA dependencies.
 * Pure function — no Firestore, no Firebase.
 */

import type {
  EmployeeV3,
  EmployeeAbsenceV3,
  ShiftTemplateV3,
  GeneratedShiftV3,
  Weekday,
} from './types.ts';
import { isFixedDayOff, isWithinActiveDates, resolveEffectiveStandardShift } from './employeeProfile.ts';
import { timeToMinutesV3, calculateShiftDurationHoursV3, shiftIntervalV3 } from './config.ts';

export type EligibilityReason =
  | 'ELIGIBLE'
  | 'INACTIVE'
  | 'SUBSTITUTE_ONLY'
  | 'FIXED_DAY_OFF'
  | 'ABSENCE'
  | 'OUTSIDE_ACTIVE_DATES'
  | 'ALREADY_ASSIGNED'
  | 'REST_INTERVAL'
  | 'DAILY_HOURS_EXCEEDED'
  | 'WEEKLY_HOURS_EXCEEDED'
  | 'CONSECUTIVE_DAYS_EXCEEDED';

export type EligibilityResult = {
  eligible: boolean;
  reason: EligibilityReason;
  employeeId: string;
};

/**
 * Check if a date falls within any of the employee's absences.
 */
function hasAbsenceOnDate(
  employeeId: string,
  dateStr: string,
  absences: EmployeeAbsenceV3[],
): boolean {
  return absences.some(
    (a) =>
      a.employeeId === employeeId &&
      dateStr >= a.startDate &&
      dateStr <= a.endDate &&
      ['FULL_DAY', 'PARTIAL_DAY'].includes(a.scope),
  );
}

/**
 * Check if assigning a shift on this date would violate rest interval.
 * Returns true if the rest period is insufficient.
 */
function wouldViolateRestInterval(
  employeeId: string,
  dateStr: string,
  shiftStartTime: string,
  existingShifts: GeneratedShiftV3[],
  minRestHours: number | null | undefined,
): boolean {
  if (!minRestHours || minRestHours <= 0) return false;

  const minRestMinutes = minRestHours * 60;
  const newStartMin = timeToMinutesV3(shiftStartTime);

  // Check shifts on previous day and same day
  const prevDate = addDaysSimple(dateStr, -1);
  const relevantShifts = existingShifts.filter(
    (s) => s.employeeId === employeeId && (s.date === prevDate || s.date === dateStr),
  );

  for (const s of relevantShifts) {
    if (s.date === prevDate) {
      // End of previous shift to start of new shift
      const endMin = timeToMinutesV3(s.endTime);
      const restMinutes = (24 * 60 - endMin - (s.crossMidnight ? 1440 : 0)) + newStartMin;
      if (restMinutes < minRestMinutes) return true;
    }
    if (s.date === dateStr && s.endTime !== shiftStartTime) {
      // Same-day overlap check
      return true;
    }
  }

  return false;
}

/** Simple date arithmetic */
function addDaysSimple(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate total hours already assigned to an employee for a given date range.
 */
function getEmployeeHoursInRange(
  employeeId: string,
  startDate: string,
  endDate: string,
  existingShifts: GeneratedShiftV3[],
): number {
  return existingShifts
    .filter((s) => s.employeeId === employeeId && s.date >= startDate && s.date <= endDate)
    .reduce((sum, s) => sum + s.durationHours, 0);
}

/**
 * Count shifts assigned to employee on a specific date.
 */
function getEmployeeShiftCountOnDate(
  employeeId: string,
  dateStr: string,
  existingShifts: GeneratedShiftV3[],
): number {
  return existingShifts.filter((s) => s.employeeId === employeeId && s.date === dateStr).length;
}

/**
 * Count consecutive working days ending on the given date.
 */
function getConsecutiveWorkDays(
  employeeId: string,
  dateStr: string,
  existingShifts: GeneratedShiftV3[],
): number {
  let count = 0;
  let checkDate = dateStr;
  const shiftDates = new Set(
    existingShifts.filter((s) => s.employeeId === employeeId).map((s) => s.date),
  );

  while (shiftDates.has(checkDate)) {
    count++;
    checkDate = addDaysSimple(checkDate, -1);
  }
  return count;
}

/**
 * Evaluate employee eligibility for automatic assignment on a given date/shift.
 *
 * @param employee The employee to evaluate
 * @param dateStr ISO date string (YYYY-MM-DD)
 * @param absences All employee absences for the period
 * @param existingShifts Shifts already assigned in this generation pass
 * @param shiftStartTime The start time of the shift being considered
 * @param options Policy limits
 */
export function evaluateEmployeeEligibilityV3(
  employee: EmployeeV3,
  dateStr: string,
  absences: EmployeeAbsenceV3[],
  existingShifts: GeneratedShiftV3[],
  shiftStartTime: string,
  options: {
    minRestIntervalHours?: number | null;
    maxDailyHours?: number | null;
    maxWeeklyHours?: number | null;
    maxConsecutiveWorkingDays?: number | null;
    weekStartDate?: string;
    weekEndDate?: string;
    shiftEndTime?: string;
    crossMidnight?: boolean;
    shiftDurationHours?: number;
  } = {},
): EligibilityResult {
  const eid = employee.id;
  const prospectiveHours = options.shiftDurationHours ?? 0;

  // 1. Active check
  if (!employee.isActive) {
    return { eligible: false, reason: 'INACTIVE', employeeId: eid };
  }

  // 2. Work mode check
  if (employee.schedulerV3.workMode === 'SUBSTITUTE_ONLY') {
    return { eligible: false, reason: 'SUBSTITUTE_ONLY', employeeId: eid };
  }

  // 3. Seasonal active dates
  if (!isWithinActiveDates(dateStr, employee.activeFrom, employee.activeTo)) {
    return { eligible: false, reason: 'OUTSIDE_ACTIVE_DATES', employeeId: eid };
  }

  // 4. Fixed day off
  if (isFixedDayOff(dateStr, employee.schedulerV3.fixedDayOff)) {
    return { eligible: false, reason: 'FIXED_DAY_OFF', employeeId: eid };
  }

  // 5. Absence
  if (hasAbsenceOnDate(eid, dateStr, absences)) {
    return { eligible: false, reason: 'ABSENCE', employeeId: eid };
  }

  // 6. Already assigned (no double shifts from auto-generation)
  if (getEmployeeShiftCountOnDate(eid, dateStr, existingShifts) > 0) {
    return { eligible: false, reason: 'ALREADY_ASSIGNED', employeeId: eid };
  }

  // 7. Rest interval
  if (wouldViolateRestInterval(eid, dateStr, shiftStartTime, existingShifts, options.minRestIntervalHours)) {
    return { eligible: false, reason: 'REST_INTERVAL', employeeId: eid };
  }

  // 8. Daily hours
  if (options.shiftEndTime) {
    const candidate = shiftIntervalV3(dateStr, shiftStartTime, options.shiftEndTime, Boolean(options.crossMidnight));
    for (const shift of existingShifts.filter(s => s.employeeId === eid)) {
      const other = shiftIntervalV3(shift.date, shift.startTime, shift.endTime, Boolean(shift.crossMidnight));
      const separation = Math.max(candidate.start - other.end, other.start - candidate.end) / 3600000;
      if (separation < 0 || (options.minRestIntervalHours && separation < options.minRestIntervalHours)) return { eligible: false, reason: 'REST_INTERVAL', employeeId: eid };
    }
  }
  if (options.maxDailyHours && options.maxDailyHours > 0) {
    const dailyHours = getEmployeeHoursInRange(eid, dateStr, dateStr, existingShifts);
    if (dailyHours + prospectiveHours > options.maxDailyHours) {
      return { eligible: false, reason: 'DAILY_HOURS_EXCEEDED', employeeId: eid };
    }
  }

  // 9. Weekly hours
  if (options.maxWeeklyHours && options.maxWeeklyHours > 0 && options.weekStartDate && options.weekEndDate) {
    const weeklyHours = getEmployeeHoursInRange(eid, options.weekStartDate, options.weekEndDate, existingShifts);
    if (weeklyHours + prospectiveHours > options.maxWeeklyHours) {
      return { eligible: false, reason: 'WEEKLY_HOURS_EXCEEDED', employeeId: eid };
    }
  }

  // 10. Consecutive days
  if (options.maxConsecutiveWorkingDays && options.maxConsecutiveWorkingDays > 0) {
    const consecutive = getConsecutiveWorkDays(eid, addDaysSimple(dateStr, -1), existingShifts);
    if (consecutive >= options.maxConsecutiveWorkingDays) {
      return { eligible: false, reason: 'CONSECUTIVE_DAYS_EXCEEDED', employeeId: eid };
    }
  }

  return { eligible: true, reason: 'ELIGIBLE', employeeId: eid };
}
