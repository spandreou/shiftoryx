import type { SchedulerConfigV3, ShiftTemplateV3 } from './types.ts';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
export const WEEKDAYS_V3 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as const;
export function isIsoDateV3(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function shiftIntervalV3(date: string, start: string, end: string, cross = false) {
  const midnight = Date.parse(`${date}T00:00:00Z`);
  return { start: midnight + timeToMinutesV3(start) * 60000, end: midnight + (timeToMinutesV3(end) + (cross ? 1440 : 0)) * 60000 };
}

/**
 * Validates if a string is in HH:mm format.
 * @param value String to test
 * @returns Boolean indicating validity
 */
export function isValidTimeV3(value: string): boolean {
  if (typeof value !== 'string') return false;
  return TIME_REGEX.test(value);
}

/**
 * Converts a HH:mm time string to minutes past midnight.
 * @param time HH:mm time string
 * @returns Minutes since midnight
 */
export function timeToMinutesV3(time: string): number {
  if (!isValidTimeV3(time)) return 0;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Calculates duration in hours between two HH:mm times with quarter-hour precision.
 * @param startTime HH:mm start time
 * @param endTime HH:mm end time
 * @param crossMidnight True if the shift crosses midnight
 * @returns Number of hours rounded to nearest 0.25
 */
export function calculateShiftDurationHoursV3(startTime: string, endTime: string, crossMidnight?: boolean): number {
  if (!isValidTimeV3(startTime) || !isValidTimeV3(endTime)) return 0;
  
  const startMins = timeToMinutesV3(startTime);
  let endMins = timeToMinutesV3(endTime);
  
  if (crossMidnight || endMins < startMins) {
    endMins += 24 * 60;
  }
  
  const diffMins = Math.max(0, endMins - startMins);
  const hours = diffMins / 60;
  
  return Math.round(hours * 4) / 4;
}

/**
 * Validates a single shift template independently.
 * @param template The template to validate
 * @returns Object containing valid boolean and any error messages
 */
export function validateShiftTemplateV3(template: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!template || typeof template !== 'object') {
    return { valid: false, errors: ['Το πρότυπο βάρδιας πρέπει να είναι αντικείμενο.'] };
  }
  const t = template as Partial<ShiftTemplateV3>;

  if (!t.id || typeof t.id !== 'string') {
    errors.push('Το πρότυπο βάρδιας πρέπει να έχει ένα έγκυρο id (string).');
  }
  if (!t.label || typeof t.label !== 'string' || t.label.trim() === '') {
    errors.push('Το πρότυπο βάρδιας πρέπει να έχει μία μη κενή ετικέτα (label).');
  }
  
  if (typeof t.isActive !== 'boolean') {
    errors.push('Το πεδίο isActive πρέπει να είναι boolean.');
  }

  if (!t.startTime || !isValidTimeV3(t.startTime)) {
    errors.push('Μη έγκυρη μορφή ώρας έναρξης. Πρέπει να είναι HH:mm.');
  }
  if (!t.endTime || !isValidTimeV3(t.endTime)) {
    errors.push('Μη έγκυρη μορφή ώρας λήξης. Πρέπει να είναι HH:mm.');
  }

  if (!Number.isFinite(t.durationHours) || t.durationHours <= 0 || t.durationHours > 24) {
    errors.push('Η διάρκεια της βάρδιας πρέπει να είναι θετικός αριθμός μεγαλύτερος του μηδενός.');
  }

  if (typeof t.crossMidnight !== 'boolean' || (isValidTimeV3(t.startTime) && isValidTimeV3(t.endTime) &&
    (t.startTime === t.endTime || t.crossMidnight !== (t.endTime < t.startTime)))) errors.push('Μη έγκυρη διέλευση μεσονυχτίου.');
  if (isValidTimeV3(t.startTime) && isValidTimeV3(t.endTime) && Math.abs(calculateShiftDurationHoursV3(t.startTime, t.endTime, t.crossMidnight) - t.durationHours) > 0.001) errors.push('Η διάρκεια δεν συμφωνεί με το ωράριο.');
  if (!['MORNING', 'INTERMEDIATE', 'AFTERNOON', 'NIGHT', 'CUSTOM'].includes(t.shiftType)) errors.push('Μη έγκυρος τύπος βάρδιας.');

  return { valid: errors.length === 0, errors };
}

/**
 * Validates the V3 Scheduler configuration structurally.
 * @param config The configuration to validate
 * @returns Object containing valid boolean and any error messages
 */
export function validateSchedulerConfigV3(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Η διαμόρφωση πρέπει να είναι αντικείμενο.'] };
  }
  
  const c = config as any;
  if (!c.generationDefaults || typeof c.generationDefaults.balanceWeeklyTargetsForMonth !== 'boolean') errors.push('Απαιτείται έγκυρη ρύθμιση εξισορρόπησης στόχων.');

  // Structural guards precede all nested access, including data read from storage.
  const object = (v: unknown): boolean => Boolean(v && typeof v === 'object' && !Array.isArray(v));
  if (!Array.isArray(c.operatingDays) || c.operatingDays.some(d => !object(d) || !Array.isArray(d.windows) || d.windows.some(w => !object(w))) ||
      !Array.isArray(c.shiftTemplates) || c.shiftTemplates.some(t => !object(t)) ||
      !Array.isArray(c.coverageRequirements) || c.coverageRequirements.some(p => !object(p) || !Array.isArray(p.slots) || p.slots.some(s => !object(s)))) {
    return { valid: false, errors: ['Μη έγκυρη δομή ρυθμίσεων.'] };
  }
  if (c.shiftTemplates.length > 50 || c.coverageRequirements.length > 7) errors.push('Υπέρβαση τεχνικού ορίου ρυθμίσεων.');
  if (new Set(c.operatingDays.map(d => d.weekday)).size !== 7 || c.operatingDays.some(d => !WEEKDAYS_V3.includes(d.weekday) || typeof d.isOpen !== 'boolean' || d.windows.length > 8)) errors.push('Απαιτούνται επτά μοναδικές έγκυρες ημέρες.');
  if (!Number.isInteger(c.weekStartDay)) errors.push('Το weekStartDay πρέπει να είναι ακέραιο.');
  for (const d of c.operatingDays) for (const w of d.windows) {
    if (w.openTime === w.closeTime || Boolean(w.crossMidnight) !== (w.closeTime < w.openTime)) errors.push('Μη έγκυρο crossMidnight ωραρίου λειτουργίας.');
  }
  for (const p of c.coverageRequirements) {
    if (!WEEKDAYS_V3.includes(p.weekday) || new Set(p.slots.map(s => s.shiftTemplateId)).size !== p.slots.length) errors.push('Μη έγκυρη ή διπλή κάλυψη.');
    for (const s of p.slots) if (Object.keys(s).some(k => !['shiftTemplateId', 'headcount'].includes(k)) || s.headcount > 100) errors.push('Η κάλυψη δέχεται μόνο πρότυπο και πλήθος έως 100.');
  }
  if (c.warningPolicies) for (const [key, value] of Object.entries(c.warningPolicies)) {
    if (!['minRestIntervalHours','maxDailyHours','maxWeeklyHours','maxConsecutiveWorkingDays'].includes(key) || (value !== null && (!Number.isFinite(value) || Number(value) <= 0))) errors.push('Μη έγκυρη πολιτική προειδοποιήσεων.');
  }

  if (c.schemaVersion !== 3) {
    errors.push('Η έκδοση σχήματος (schemaVersion) πρέπει να είναι 3.');
  }
  if (!c.tenantId || typeof c.tenantId !== 'string' || c.tenantId.trim() === '') {
    errors.push('Το tenantId είναι υποχρεωτικό και πρέπει να είναι μη κενό κείμενο (string).');
  }
  if (!c.timezone || typeof c.timezone !== 'string' || c.timezone.trim() === '') {
    errors.push('Το timezone είναι υποχρεωτικό και πρέπει να είναι μη κενό κείμενο (string).');
  }
  if (typeof c.weekStartDay !== 'number' || c.weekStartDay < 1 || c.weekStartDay > 7) {
    errors.push('Το weekStartDay πρέπει να είναι αριθμός από το 1 έως το 7.');
  }
  if (!c.templateId || typeof c.templateId !== 'string' || c.templateId.trim() === '') {
    errors.push('Το templateId είναι υποχρεωτικό και πρέπει να είναι μη κενό κείμενο (string).');
  }
  if (typeof c.templateVersion !== 'number' || c.templateVersion < 1 || !Number.isInteger(c.templateVersion)) {
    errors.push('Το templateVersion πρέπει να είναι ακέραιος αριθμός μεγαλύτερος ή ίσος του 1.');
  }

  // Operating Days
  if (!Array.isArray(c.operatingDays) || c.operatingDays.length !== 7) {
    errors.push('Το operatingDays πρέπει να είναι πίνακας με ακριβώς 7 καταχωρήσεις.');
  } else {
    for (let i = 0; i < c.operatingDays.length; i++) {
      const day = c.operatingDays[i];
      if (!Array.isArray(day.windows)) {
        errors.push(`Οι ώρες λειτουργίας στην ημέρα δείκτη ${i} πρέπει να περιέχουν πίνακα από windows.`);
      } else {
        for (const w of day.windows) {
          if (!w.openTime || !isValidTimeV3(w.openTime) || !w.closeTime || !isValidTimeV3(w.closeTime)) {
            errors.push('Τα ωράρια (openTime, closeTime) πρέπει να έχουν μορφή HH:mm.');
          } else {
            if (w.openTime >= w.closeTime && !w.crossMidnight) {
              errors.push('Η ώρα έναρξης πρέπει να είναι πριν την ώρα λήξης εκτός αν πρόκειται για crossMidnight.');
            }
          }
        }
      }
    }
  }

  const templateIds = new Set<string>();
  // Shift Templates
  if (!Array.isArray(c.shiftTemplates)) {
    errors.push('Το shiftTemplates πρέπει να είναι πίνακας.');
  } else {
    for (const t of c.shiftTemplates) {
      const tValidation = validateShiftTemplateV3(t);
      if (!tValidation.valid) {
        errors.push(...tValidation.errors);
      }
      if (t.id) {
        if (templateIds.has(t.id)) {
          errors.push(`Το shiftTemplate id "${t.id}" υπάρχει ήδη.`);
        }
        templateIds.add(t.id);
      }
    }
  }

  // Coverage Requirements
  const coverageWeekdays = new Set<string>();
  if (!Array.isArray(c.coverageRequirements)) {
    errors.push('Το coverageRequirements πρέπει να είναι πίνακας.');
  } else {
    for (const req of c.coverageRequirements) {
      if (coverageWeekdays.has(req.weekday)) {
        errors.push(`Υπάρχει ήδη εγγραφή coverage για την ημέρα ${req.weekday}.`);
      }
      coverageWeekdays.add(req.weekday);
      if (!Array.isArray(req.slots)) {
        errors.push(`Τα slots κάλυψης πρέπει να είναι πίνακας (${req.weekday}).`);
      } else {
        for (const slot of req.slots) {
          if (!templateIds.has(slot.shiftTemplateId)) {
            errors.push(`Το coverageRequirement αναφέρεται σε μη έγκυρο shiftTemplateId: ${slot.shiftTemplateId}.`);
          }
          if (typeof slot.headcount !== 'number' || slot.headcount < 0 || !Number.isInteger(slot.headcount)) {
            errors.push('Το headcount πρέπει να είναι ακέραιος αριθμός >= 0.');
          }
        }
      }
    }
  }

  // Warning Policies
  if (c.warningPolicies && typeof c.warningPolicies === 'object') {
    for (const [key, val] of Object.entries(c.warningPolicies)) {
      if (val !== null && (typeof val !== 'number' || val <= 0)) {
        errors.push(`Το warningPolicy "${key}" πρέπει να είναι null ή θετικός αριθμός.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalizes a partial V3 configuration by applying default values.
 * @param config Partial configuration
 * @returns Fully populated SchedulerConfigV3
 */
export function normalizeSchedulerConfigV3(config: Partial<SchedulerConfigV3>): SchedulerConfigV3 {
  const defaultOperatingDays = [
    { weekday: 'MONDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'TUESDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'WEDNESDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'THURSDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'FRIDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'SATURDAY' as const, isOpen: true, windows: [{ openTime: '06:00', closeTime: '22:00' }] },
    { weekday: 'SUNDAY' as const, isOpen: false, windows: [] },
  ];

  return {
    schemaVersion: 3,
    tenantId: config?.tenantId || '',
    timezone: config?.timezone || 'Europe/Athens',
    weekStartDay: config?.weekStartDay || 1,
    operatingDays: config?.operatingDays || defaultOperatingDays,
    shiftTemplates: config?.shiftTemplates || [],
    coverageRequirements: config?.coverageRequirements || [],
    generationDefaults: config?.generationDefaults || { balanceWeeklyTargetsForMonth: true },
    warningPolicies: config?.warningPolicies,
    templateId: config?.templateId || '',
    templateVersion: config?.templateVersion || 1,
  };
}
