import type { EmployeeSchedulingProfileV3, ShiftTemplateV3, StandardShiftV3 } from './types.ts';
import { isDirectShiftV3, normalizeEmployeeProfileV3, validateEmployeeProfileV3 } from './employeeProfile.ts';
import { calculateShiftDurationHoursV3 } from './config.ts';

const legacyKeys = ['workMode', 'fixedDayOff', 'targetWeeklyHours', 'standardShiftTemplateId', 'rotateStandardShiftWeekly', 'rotationAlternateShiftTemplateId', 'rotationAnchorWeekStart'];

/** Dual read, with no storage mutations. Legacy IDs require their own config snapshot. */
export function decodeEmployeeProfileV3(raw: unknown, templates: ShiftTemplateV3[] = []): { profile: EmployeeSchedulingProfileV3 | null; diagnostics: string[] } {
  if (raw == null) return { profile: normalizeEmployeeProfileV3(), diagnostics: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { profile: null, diagnostics: ['Μη έγκυρη δομή προφίλ εργαζομένου.'] };
  const data = raw as Record<string, unknown>;
  let profile: EmployeeSchedulingProfileV3;
  const diagnostics: string[] = [];
  if (Object.hasOwn(data, 'profileVersion')) {
    profile = structuredClone(data) as EmployeeSchedulingProfileV3;
  } else {
    if (Object.keys(data).some(key => !legacyKeys.includes(key)) || legacyKeys.some(key => !Object.hasOwn(data, key))) return { profile: null, diagnostics: ['Το παλιό προφίλ χρειάζεται έλεγχο των πεδίων του.'] };
    const resolve = (id: unknown): StandardShiftV3 | null => {
      if (id === null) return null;
      if (typeof id !== 'string' || !id) { diagnostics.push('Μη έγκυρη παλιά αναφορά βάρδιας.'); return null; }
      const matches = templates.filter(template => template.id === id);
      if (matches.length !== 1) { diagnostics.push('Η παλιά αναφορά βάρδιας λείπει ή είναι αμφίσημη στο συγκεκριμένο στιγμιότυπο ρυθμίσεων.'); return null; }
      const template = matches[0];
      const range = { startTime: template.startTime, endTime: template.endTime };
      if (!isDirectShiftV3(range) || template.crossMidnight !== (range.endTime < range.startTime) || template.durationHours !== calculateShiftDurationHoursV3(range.startTime, range.endTime, template.crossMidnight)) {
        diagnostics.push('Η παλιά αναφορά βάρδιας περιέχει μη έγκυρες ώρες ή διάρκεια.'); return null;
      }
      return range;
    };
    profile = {
      profileVersion: 2, workMode: data.workMode, fixedDayOff: data.fixedDayOff,
      targetWeeklyHours: data.targetWeeklyHours, standardShift: resolve(data.standardShiftTemplateId),
      rotateStandardShiftWeekly: data.rotateStandardShiftWeekly,
      rotationAlternateShift: resolve(data.rotationAlternateShiftTemplateId), rotationAnchorWeekStart: data.rotationAnchorWeekStart,
    } as EmployeeSchedulingProfileV3;
  }
  diagnostics.push(...validateEmployeeProfileV3(profile).errors);
  return { profile: diagnostics.length ? null : profile, diagnostics };
}

/** Service/save boundary: invalid supplied data never becomes a default valid profile. */
export function requireEmployeeProfileV3(raw: unknown, templates: ShiftTemplateV3[] = []): EmployeeSchedulingProfileV3 {
  const result = decodeEmployeeProfileV3(raw, templates);
  if (!result.profile) throw new Error(result.diagnostics.join(' '));
  return result.profile;
}
