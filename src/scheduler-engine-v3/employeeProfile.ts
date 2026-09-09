/**
 * ShiftOryx Scheduler V3 — Employee Profile Normalization & Utilities
 *
 * Handles V3 employee scheduling profile defaults, validation,
 * standard shift resolution, and weekly rotation logic.
 * Pure functions — no Firestore, no Firebase.
 */

import type {
  EmployeeSchedulingProfileV3,
  EmployeeV3,
  ShiftTemplateV3,
  StandardShiftV3,
  Weekday,
} from './types.ts';
import { DEFAULT_EMPLOYEE_PROFILE_V3 } from './types.ts';
import { isIsoDateV3 } from './config.ts';

const WEEKDAY_JS_INDEX: Record<string, number> = {
  SUNDAY: 0, MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3,
  THURSDAY: 4, FRIDAY: 5, SATURDAY: 6,
};

const JS_INDEX_TO_WEEKDAY: Weekday[] = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

/**
 * Normalize an employee's V3 scheduling profile, applying defaults
 * for any missing fields. Does NOT mutate the input.
 */
export function normalizeEmployeeProfileV3(
  profile?: Partial<EmployeeSchedulingProfileV3> | null,
): EmployeeSchedulingProfileV3 {
  if (profile == null) return { ...DEFAULT_EMPLOYEE_PROFILE_V3 };
  if (typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Μη έγκυρη δομή προφίλ.');
  // Defaults fill absent fields only. Keep invalid values/unknown fields for validation.
  return structuredClone({ ...DEFAULT_EMPLOYEE_PROFILE_V3, ...profile });
}

export function isDirectShiftV3(value: unknown): value is StandardShiftV3 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const range = value as StandardShiftV3;
  return Object.keys(value).length === 2 && Object.hasOwn(value, 'startTime') && Object.hasOwn(value, 'endTime') &&
    typeof range.startTime === 'string' && typeof range.endTime === 'string' &&
    /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(range.startTime) &&
    /^(?:[01]\d|2[0-3]):(?:00|15|30|45)$/.test(range.endTime) && range.startTime !== range.endTime;
}

export function sameShiftTimesV3(a: StandardShiftV3 | null, b: StandardShiftV3 | null): boolean {
  return !!a && !!b && a.startTime === b.startTime && a.endTime === b.endTime;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
function duration(range: StandardShiftV3): number { return (minutes(range.endTime) - minutes(range.startTime) + 1440) % 1440; }
/** Circular-day intervals are half open; adjacent ranges do not overlap. */
export function validRotationPairV3(a: StandardShiftV3 | null, b: StandardShiftV3 | null): boolean {
  if (!isDirectShiftV3(a) || !isDirectShiftV3(b) || duration(a) !== duration(b)) return false;
  const aStart = minutes(a.startTime), aEnd = aStart + duration(a), bStart = minutes(b.startTime);
  return ![-1440, 0, 1440].some(offset => aStart < bStart + offset + duration(b) && bStart + offset < aEnd);
}

/**
 * Validate an employee's V3 profile fields.
 * Returns blocking structural errors only.
 */
export function validateEmployeeProfileV3(
  profile: EmployeeSchedulingProfileV3,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { valid: false, errors: ['Μη έγκυρη δομή προφίλ.'] };
  const keys = Object.keys(DEFAULT_EMPLOYEE_PROFILE_V3);
  if (Object.keys(profile).length !== keys.length || keys.some(key => !Object.hasOwn(profile, key))) errors.push('Το προφίλ πρέπει να περιέχει μόνο τα πεδία της έκδοσης 2.');
  if (profile.profileVersion !== 2) errors.push('Μη έγκυρη έκδοση προφίλ.');
  if (typeof profile.rotateStandardShiftWeekly !== 'boolean') errors.push('Μη έγκυρη επιλογή εβδομαδιαίας αλλαγής.');

  if (profile.workMode !== 'NORMAL' && profile.workMode !== 'SUBSTITUTE_ONLY') {
    errors.push('Η συμμετοχή πρέπει να είναι «Κανονική συμμετοχή» ή «Μόνο για κάλυψη / αντικατάσταση».');
  }

  if (profile.fixedDayOff !== null) {
    if (!Number.isInteger(profile.fixedDayOff) || profile.fixedDayOff < 0 || profile.fixedDayOff > 6) {
      errors.push('Η σταθερή ημέρα ανάπαυσης πρέπει να είναι 0-6 ή null.');
    }
  }

  if (profile.targetWeeklyHours !== null) {
    if (!Number.isFinite(profile.targetWeeklyHours) || profile.targetWeeklyHours < 0 || profile.targetWeeklyHours > 168) {
      errors.push('Ο στόχος εβδομαδιαίων ωρών πρέπει να είναι μη αρνητικός αριθμός ή null.');
    }
  }

  if (profile.standardShift !== null && !isDirectShiftV3(profile.standardShift)) errors.push('Μη έγκυρες ώρες τυπικής βάρδιας.');
  if (profile.rotationAlternateShift !== null && !isDirectShiftV3(profile.rotationAlternateShift)) errors.push('Μη έγκυρες ώρες εναλλακτικής βάρδιας.');
  if (profile.rotationAnchorWeekStart !== null && (!isIsoDateV3(profile.rotationAnchorWeekStart) || new Date(profile.rotationAnchorWeekStart + 'T00:00:00Z').getUTCDay() !== 1)) errors.push('Η εβδομάδα αναφοράς πρέπει να είναι έγκυρη Δευτέρα.');
  if (profile.rotateStandardShiftWeekly) {
    if (!validRotationPairV3(profile.standardShift, profile.rotationAlternateShift) || !profile.rotationAnchorWeekStart) errors.push('Η εβδομαδιαία αλλαγή χρειάζεται δύο μη επικαλυπτόμενες βάρδιες ίδιας διάρκειας και εβδομάδα αναφοράς.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Compute the ISO Monday start date for a given ISO date string (YYYY-MM-DD).
 */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dayOfWeek = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/**
 * Compute the number of weeks between two ISO Monday dates.
 * Positive if target is after anchor.
 */
export function weeksBetween(anchorMonday: string, targetMonday: string): number {
  const a = new Date(anchorMonday + 'T00:00:00Z').getTime();
  const b = new Date(targetMonday + 'T00:00:00Z').getTime();
  return Math.round((b - a) / (7 * 24 * 60 * 60 * 1000));
}

/**
 * Compute rotation week parity for a given date.
 * Returns 0 for standard shift weeks, 1 for alternate shift weeks.
 * Deterministic — uses explicit anchor date.
 */
export function computeRotationWeekParity(
  dateStr: string,
  rotationAnchorWeekStart: string | null,
): 0 | 1 {
  const anchor = rotationAnchorWeekStart || '2026-01-05'; // Default anchor: first Monday of 2026
  const anchorMonday = getMondayOfWeek(anchor);
  const targetMonday = getMondayOfWeek(dateStr);
  const weeks = weeksBetween(anchorMonday, targetMonday);
  // Use absolute value to support dates before the anchor
  return (Math.abs(weeks) % 2) as 0 | 1;
}

/**
 * Resolve the effective direct-time standard shift for an employee on a given date.
 * Considers rotation if enabled.
 *
 * @returns The effective time range, or null if no standard shift configured.
 */
export function resolveEffectiveStandardShift(
  profile: EmployeeSchedulingProfileV3,
  dateStr: string,
): StandardShiftV3 | null {
  if (!profile.standardShift) return null;

  if (!profile.rotateStandardShiftWeekly || !profile.rotationAlternateShift) {
    return profile.standardShift;
  }

  const parity = computeRotationWeekParity(dateStr, profile.rotationAnchorWeekStart);
  return parity === 0
    ? profile.standardShift
    : profile.rotationAlternateShift;
}

/**
 * Resolve a unique active time range of equal duration without circular-day overlap.
 * Labels, template IDs, and shift types do not influence selection.
 */
export function resolveRotationAlternateShiftV3(
  standard: StandardShiftV3 | null,
  allTemplates: ShiftTemplateV3[],
): { alternate: StandardShiftV3 | null; ambiguous: boolean } {
  const unique = new Map<string, StandardShiftV3>();
  for (const template of allTemplates) {
    const range = { startTime: template.startTime, endTime: template.endTime };
    if (template.isActive === true && validRotationPairV3(standard, range) && template.durationHours === duration(range) / 60 && template.crossMidnight === (range.endTime < range.startTime)) unique.set(range.startTime + '/' + range.endTime, range);
  }
  return { alternate: unique.size === 1 ? [...unique.values()][0] : null, ambiguous: unique.size > 1 };
}

/** Normal OWNER controls only choose a standard shift and toggle weekly rotation. */
export function applySimpleRotationV3(profile:EmployeeSchedulingProfileV3,templates:ShiftTemplateV3[]):{profile:EmployeeSchedulingProfileV3;warning:string|null} {
  const next=normalizeEmployeeProfileV3(profile);
  if(!next.rotateStandardShiftWeekly)return {profile:next,warning:null};
  const alternate=resolveRotationAlternateShiftV3(next.standardShift,templates);
  next.rotationAlternateShift=alternate.alternate;
  next.rotationAnchorWeekStart=next.rotationAnchorWeekStart||'2026-01-05';
  const validation=validateEmployeeProfileV3(next);
  return {profile:next,warning:validation.valid?null:alternate.ambiguous?'Υπάρχουν περισσότερες από μία κατάλληλες εναλλακτικές βάρδιες. Διόρθωσε τα ενεργά πρότυπα.':validation.errors.join(' ')};
}

/**
 * Convert a fixedDayOff number (0=Sunday..6=Saturday) to a Weekday string.
 */
export function fixedDayOffToWeekday(dayOff: number | null): Weekday | null {
  if (dayOff === null || dayOff < 0 || dayOff > 6) return null;
  return JS_INDEX_TO_WEEKDAY[dayOff];
}

/**
 * Check if a date string falls on an employee's fixed day off.
 */
export function isFixedDayOff(dateStr: string, fixedDayOff: number | null): boolean {
  if (fixedDayOff === null) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.getUTCDay() === fixedDayOff;
}

/**
 * Check if a date falls within an employee's active seasonal range.
 */
export function isWithinActiveDates(
  dateStr: string,
  activeFrom?: string | null,
  activeTo?: string | null,
): boolean {
  if (activeFrom && dateStr < activeFrom) return false;
  if (activeTo && dateStr > activeTo) return false;
  return true;
}
