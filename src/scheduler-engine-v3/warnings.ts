import type { EmployeeV3, EmployeeAbsenceV3, GeneratedShiftV3, SchedulerConfigV3, ScheduleWarningV3, WarningCodeV3 } from './types.ts';
import { shiftIntervalV3 } from './config.ts';
import { isFixedDayOff, resolveEffectiveStandardShift } from './employeeProfile.ts';
import { eachDateInRange, getWeekdayForDate } from './coverage.ts';

export function getWeekStartV3(date: string, weekStartDay = 1): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - weekStartDay % 7 + 7) % 7));
  return d.toISOString().slice(0, 10);
}

/** One pure analyzer for generated, edited and published candidates. */
export function analyzeScheduleWarningsV3(config: SchedulerConfigV3, employees: EmployeeV3[], absences: EmployeeAbsenceV3[], shifts: GeneratedShiftV3[], periodStart: string, periodEnd: string): ScheduleWarningV3[] {
  const warnings: ScheduleWarningV3[] = [];
  const add = (code: WarningCodeV3, message: string, fields: Partial<ScheduleWarningV3> = {}) => warnings.push({
    ...fields, id: 'warning-' + String(warnings.length + 1).padStart(6, '0'), code, message, severity: 'WARNING', blocking: false,
  });
  const empMap = new Map(employees.map(e => [e.id, e]));
  const ordered = [...shifts].sort((a,b) => {
    const x = a.date + a.startTime + a.employeeId + a.id, y = b.date + b.startTime + b.employeeId + b.id;
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const dates = eachDateInRange(periodStart, periodEnd);
  const policies = config.warningPolicies || {};
  for (const date of dates) {
    const day = config.operatingDays.find(d => d.weekday === getWeekdayForDate(date));
    if (!day?.isOpen) continue;
    for (const slot of config.coverageRequirements.find(c => c.weekday === day.weekday)?.slots || []) {
      if (config.shiftTemplates.find(t => t.id === slot.shiftTemplateId)?.isActive === false) continue;
      const assigned = ordered.filter(s => s.date === date && s.shiftTemplateId === slot.shiftTemplateId).length;
      if (assigned !== slot.headcount) add(assigned < slot.headcount ? 'COVERAGE_UNDER_TARGET' : 'COVERAGE_OVER_TARGET',
        'Κάλυψη ' + assigned + '/' + slot.headcount + ' στις ' + date, { date, details: { shiftTemplateId: slot.shiftTemplateId, assigned, required: slot.headcount } });
    }
  }
  for (const shift of ordered) {
    const employee = empMap.get(shift.employeeId);
    const fields = { date: shift.date, employeeId: shift.employeeId, shiftId: shift.id };
    if (!employee?.isActive) add('DEACTIVATED_EMPLOYEE_REFERENCE', 'Αναφορά σε ανενεργό ή μη διαθέσιμο εργαζόμενο.', fields);
    if (employee && isFixedDayOff(shift.date, employee.schedulerV3.fixedDayOff)) add('FIXED_DAY_OFF_OVERRIDE', 'Εργασία σε σταθερό ρεπό.', fields);
    if (absences.some(a => a.employeeId === shift.employeeId && a.startDate <= shift.date && a.endDate >= shift.date)) add('ABSENCE_OVERRIDE', 'Εργασία σε ημέρα απουσίας.', fields);
    if (employee?.schedulerV3.workMode === 'SUBSTITUTE_ONLY' && shift.source === 'MANUAL') add('SUBSTITUTE_MANUAL_ASSIGNMENT', 'Χειροκίνητη ανάθεση αναπληρωματικού.', fields);
    if (employee) {
      const effective = resolveEffectiveStandardShift(employee.schedulerV3, shift.date);
      if (effective && shift.shiftTemplateId !== effective) add('STANDARD_SHIFT_DEVIATION', 'Απόκλιση από την τυπική βάρδια.', fields);
    }
    const interval = shiftIntervalV3(shift.date, shift.startTime, shift.endTime, Boolean(shift.crossMidnight));
    const day = config.operatingDays.find(d => d.weekday === getWeekdayForDate(shift.date));
    const fits = day?.isOpen && day.windows.some(w => {
      const window = shiftIntervalV3(shift.date, w.openTime, w.closeTime, Boolean(w.crossMidnight));
      return interval.start >= window.start && interval.end <= window.end;
    });
    if (!fits) add('OUTSIDE_OPERATING_WINDOW', 'Βάρδια εκτός ωραρίου λειτουργίας.', fields);
  }
  const weeks = [...new Set(dates.map(d => getWeekStartV3(d, config.weekStartDay)))].sort();
  for (const employee of [...employees].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const profile = employee.schedulerV3;
    if (profile.rotateStandardShiftWeekly && (!profile.standardShiftTemplateId || !profile.rotationAlternateShiftTemplateId || !profile.rotationAnchorWeekStart ||
      !config.shiftTemplates.some(t => t.id === profile.standardShiftTemplateId) || !config.shiftTemplates.some(t => t.id === profile.rotationAlternateShiftTemplateId))) {
      add('ROTATION_CONFIGURATION_WARNING', 'Η εβδομαδιαία εναλλαγή χρειάζεται δύο πρότυπα και εβδομάδα αναφοράς.', { employeeId: employee.id });
    }
    const list = ordered.filter(s => s.employeeId === employee.id);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const x = shiftIntervalV3(list[a].date, list[a].startTime, list[a].endTime, Boolean(list[a].crossMidnight));
      const y = shiftIntervalV3(list[b].date, list[b].startTime, list[b].endTime, Boolean(list[b].crossMidnight));
      if (x.start < y.end && y.start < x.end) add('SHIFT_OVERLAP', 'Αλληλεπικαλυπτόμενες βάρδιες.', { employeeId: employee.id, date: list[b].date });
      else if (policies.minRestIntervalHours && (y.start - x.end) / 3600000 < policies.minRestIntervalHours) add('REST_INTERVAL_WARNING', 'Ανεπαρκής ανάπαυση μεταξύ βαρδιών.', { employeeId: employee.id, date: list[b].date });
    }
    let streak = 0;
    for (const date of dates) {
      const daily = list.filter(s => s.date === date);
      streak = daily.length ? streak + 1 : 0;
      if (policies.maxConsecutiveWorkingDays && streak > policies.maxConsecutiveWorkingDays) add('CONSECUTIVE_DAYS_WARNING', 'Πολλές συνεχόμενες ημέρες εργασίας.', { employeeId: employee.id, date });
      if (policies.maxDailyHours && daily.reduce((h,s) => h + s.durationHours, 0) > policies.maxDailyHours) add('DAILY_HOURS_WARNING', 'Υπέρβαση ημερήσιων ωρών.', { employeeId: employee.id, date });
    }
    for (const weekStart of weeks) {
      const hours = list.filter(s => getWeekStartV3(s.date, config.weekStartDay) === weekStart).reduce((h,s) => h + s.durationHours, 0);
      const target = profile.targetWeeklyHours;
      if (employee.isActive && target !== null && hours !== target) add(hours < target ? 'TARGET_HOURS_UNDER' : 'TARGET_HOURS_OVER', 'Ώρες ' + hours + ' / στόχος ' + target, { employeeId: employee.id, details: { hours, target, weekStart } });
      if (policies.maxWeeklyHours && hours > policies.maxWeeklyHours) add('WEEKLY_HOURS_WARNING', 'Υπέρβαση εβδομαδιαίων ωρών.', { employeeId: employee.id, details: { hours, weekStart } });
    }
  }
  return warnings;
}
