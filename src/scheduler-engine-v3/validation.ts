import { calculateShiftDurationHoursV3, isIsoDateV3, isValidTimeV3, validateSchedulerConfigV3 } from './config.ts';
import { validateEmployeeProfileV3 } from './employeeProfile.ts';
import { eachDateInRange } from './coverage.ts';
import type { GenerateScheduleV3Input, GeneratedShiftV3 } from './types.ts';

/** Technical errors block; business-policy deviations are handled by warnings. */
export function assertV3Input(input: GenerateScheduleV3Input, shifts: GeneratedShiftV3[] = input.existingManualShifts || []): void {
  const validation = validateSchedulerConfigV3(input.config);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  eachDateInRange(input.periodStart, input.periodEnd);
  if (!['WEEK', 'MONTH'].includes(input.periodType) || !Array.isArray(input.employees) || input.employees.length > 100 || !Array.isArray(input.absences) || !Array.isArray(shifts)) throw new Error('Μη έγκυρη δομή προγράμματος.');
  const templates = new Set(input.config.shiftTemplates.map(t => t.id));
  const employeeIds = new Set<string>();
  for (const employee of input.employees) {
    if (!employee || !employee.id || employeeIds.has(employee.id) || typeof employee.fullName !== 'string' || typeof employee.isActive !== 'boolean') throw new Error('Μη έγκυρος εργαζόμενος.');
    employeeIds.add(employee.id);
    if (!employee.schedulerV3 || !validateEmployeeProfileV3(employee.schedulerV3, templates).valid) throw new Error('Μη έγκυρο προφίλ εργαζομένου.');
    for (const date of [employee.activeFrom, employee.activeTo, employee.schedulerV3.rotationAnchorWeekStart]) if (date && !isIsoDateV3(date)) throw new Error('Μη έγκυρη ημερομηνία προφίλ.');
  }
  const shiftIds = new Set<string>();
  for (const shift of shifts) {
    if (shift && (!['AUTO','MANUAL'].includes(shift.source) || shift.schedulerSchemaVersion !== 3 || typeof shift.isManualOverride !== 'boolean')) throw new Error('Μη έγκυρη προέλευση βάρδιας.');
    if (!shift || !shift.id || shiftIds.has(shift.id) || !employeeIds.has(shift.employeeId) || !isIsoDateV3(shift.date) || shift.date < input.periodStart || shift.date > input.periodEnd || !isValidTimeV3(shift.startTime) || !isValidTimeV3(shift.endTime) || shift.startTime === shift.endTime || Boolean(shift.crossMidnight) !== (shift.endTime < shift.startTime) || !Number.isFinite(shift.durationHours) || Math.abs(shift.durationHours - calculateShiftDurationHoursV3(shift.startTime, shift.endTime, shift.crossMidnight)) > 0.001 || (shift.shiftTemplateId !== null && !templates.has(shift.shiftTemplateId))) throw new Error('Μη έγκυρη δομή βάρδιας ή αναφορά εργαζομένου.');
    shiftIds.add(shift.id);
  }
  for (const absence of input.absences) if (!absence || !isIsoDateV3(absence.startDate) || !isIsoDateV3(absence.endDate) || absence.startDate > absence.endDate || !['FULL_DAY','PARTIAL_DAY'].includes(absence.scope)) throw new Error('Μη έγκυρη απουσία.');
}
