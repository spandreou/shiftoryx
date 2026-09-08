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
  Weekday,
} from './types.ts';
import { DEFAULT_EMPLOYEE_PROFILE_V3 } from './types.ts';

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
  if (!profile) return { ...DEFAULT_EMPLOYEE_PROFILE_V3 };
  return {
    workMode: profile.workMode || 'NORMAL',
    fixedDayOff: typeof profile.fixedDayOff === 'number' ? profile.fixedDayOff : null,
    targetWeeklyHours: typeof profile.targetWeeklyHours === 'number' && profile.targetWeeklyHours >= 0
      ? profile.targetWeeklyHours
      : null,
    standardShiftTemplateId: profile.standardShiftTemplateId || null,
    rotateStandardShiftWeekly: profile.rotateStandardShiftWeekly === true,
    rotationAlternateShiftTemplateId: profile.rotationAlternateShiftTemplateId || null,
    rotationAnchorWeekStart: profile.rotationAnchorWeekStart || null,
  };
}

/**
 * Validate an employee's V3 profile fields.
 * Returns blocking structural errors only.
 */
export function validateEmployeeProfileV3(
  profile: EmployeeSchedulingProfileV3,
  availableTemplateIds: Set<string>,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (profile.workMode !== 'NORMAL' && profile.workMode !== 'SUBSTITUTE_ONLY') {
    errors.push('Ο τρόπος εργασίας (workMode) πρέπει να είναι NORMAL ή SUBSTITUTE_ONLY.');
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

  if (profile.standardShiftTemplateId !== null && !availableTemplateIds.has(profile.standardShiftTemplateId)) {
    errors.push(`Μη έγκυρη αναφορά τυπικής βάρδιας: ${profile.standardShiftTemplateId}.`);
  }

  if (profile.rotateStandardShiftWeekly) {
    // Missing rotation choices produce ROTATION_CONFIGURATION_WARNING; owners may save the draft.
    if (profile.rotationAlternateShiftTemplateId && !availableTemplateIds.has(profile.rotationAlternateShiftTemplateId)) {
      errors.push(`Μη έγκυρη αναφορά εναλλακτικής βάρδιας: ${profile.rotationAlternateShiftTemplateId}.`);
    }
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
 * Resolve the effective standard shift template ID for an employee on a given date.
 * Considers rotation if enabled.
 *
 * @returns The effective shift template ID, or null if no standard shift configured.
 */
export function resolveEffectiveStandardShift(
  profile: EmployeeSchedulingProfileV3,
  dateStr: string,
): string | null {
  if (!profile.standardShiftTemplateId) return null;

  if (!profile.rotateStandardShiftWeekly || !profile.rotationAlternateShiftTemplateId) {
    return profile.standardShiftTemplateId;
  }

  const parity = computeRotationWeekParity(dateStr, profile.rotationAnchorWeekStart);
  return parity === 0
    ? profile.standardShiftTemplateId
    : profile.rotationAlternateShiftTemplateId;
}

/**
 * Resolve an alternate shift template for rotation.
 * If the standard shift is MORNING, find the first active AFTERNOON template.
 * If AFTERNOON, find the first active MORNING template.
 * Returns null if no unambiguous alternate can be resolved.
 */
export function resolveRotationAlternateTemplate(
  standardTemplateId: string,
  allTemplates: ShiftTemplateV3[],
): { alternateId: string | null; ambiguous: boolean } {
  const standard = allTemplates.find((t) => t.id === standardTemplateId);
  if (!standard) return { alternateId: null, ambiguous: false };

  let oppositeType: string;
  if (standard.shiftType === 'MORNING') {
    oppositeType = 'AFTERNOON';
  } else if (standard.shiftType === 'AFTERNOON') {
    oppositeType = 'MORNING';
  } else {
    // INTERMEDIATE, NIGHT, CUSTOM — no automatic rotation
    return { alternateId: null, ambiguous: false };
  }

  const candidates = allTemplates.filter(
    (t) => t.isActive && t.shiftType === oppositeType && t.id !== standardTemplateId,
  );

  if (candidates.length === 0) return { alternateId: null, ambiguous: false };
  if (candidates.length === 1) return { alternateId: candidates[0].id, ambiguous: false };
  // Multiple candidates — ambiguous
  return { alternateId: null, ambiguous: true };
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
