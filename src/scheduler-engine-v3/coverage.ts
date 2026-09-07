/**
 * ShiftOryx Scheduler V3 — Coverage Slot Processing
 *
 * Expands coverage requirements into concrete date/slot demands,
 * tracks filled vs unfilled, and generates coverage summary.
 * No role/skill coverage — headcount only.
 * Pure functions — no Firestore, no Firebase.
 */

import type {
  CoverageRequirementV3,
  CoverageSlotV3,
  CoverageSummaryV3,
  GeneratedShiftV3,
  OperatingDayConfigV3,
  SchedulerConfigV3,
  ShiftTemplateV3,
  Weekday,
} from './types.ts';

export type ExpandedCoverageSlot = {
  date: string;
  weekday: Weekday;
  shiftTemplateId: string;
  shiftTemplate: ShiftTemplateV3 | null;
  headcount: number;
  slotIndex: number; // 0-based within headcount for this slot
};

const DATE_TO_WEEKDAY: Record<number, Weekday> = {
  0: 'SUNDAY', 1: 'MONDAY', 2: 'TUESDAY', 3: 'WEDNESDAY',
  4: 'THURSDAY', 5: 'FRIDAY', 6: 'SATURDAY',
};

/**
 * Get the weekday name for an ISO date string.
 */
export function getWeekdayForDate(dateStr: string): Weekday {
  const d = new Date(dateStr + 'T00:00:00Z');
  return DATE_TO_WEEKDAY[d.getUTCDay()];
}

/**
 * Generate all dates in [startDate, endDate] inclusive.
 */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (current <= end) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Check if a weekday is open according to operating day config.
 */
function isDayOpen(weekday: Weekday, operatingDays: OperatingDayConfigV3[]): boolean {
  const day = operatingDays.find((d) => d.weekday === weekday);
  return day ? day.isOpen : false;
}

/**
 * Expand coverage requirements into concrete per-date, per-slot entries
 * for the given date range.
 *
 * Each headcount unit becomes its own slot entry to enable individual filling.
 */
export function expandCoverageSlots(
  config: SchedulerConfigV3,
  startDate: string,
  endDate: string,
): ExpandedCoverageSlot[] {
  const slots: ExpandedCoverageSlot[] = [];
  const templateMap = new Map(config.shiftTemplates.map((t) => [t.id, t]));
  const dates = eachDateInRange(startDate, endDate);

  for (const date of dates) {
    const weekday = getWeekdayForDate(date);

    // Skip closed days
    if (!isDayOpen(weekday, config.operatingDays)) continue;

    // Find coverage for this weekday
    const coverage = config.coverageRequirements.find((c) => c.weekday === weekday);
    if (!coverage) continue;

    for (const slot of coverage.slots) {
      const template = templateMap.get(slot.shiftTemplateId) || null;
      // Skip inactive templates
      if (template && !template.isActive) continue;

      for (let i = 0; i < slot.headcount; i++) {
        slots.push({
          date,
          weekday,
          shiftTemplateId: slot.shiftTemplateId,
          shiftTemplate: template,
          headcount: slot.headcount,
          slotIndex: i,
        });
      }
    }
  }

  return slots;
}

/**
 * Calculate coverage summary by comparing expanded slots to assigned shifts.
 */
export function calculateCoverageSummary(
  config: SchedulerConfigV3,
  startDate: string,
  endDate: string,
  assignedShifts: GeneratedShiftV3[],
): CoverageSummaryV3 {
  const allSlots = expandCoverageSlots(config, startDate, endDate);
  const dates = eachDateInRange(startDate, endDate);

  // Build a map of filled shifts per date/template
  const fillMap = new Map<string, number>();
  for (const shift of assignedShifts) {
    const key = `${shift.date}:${shift.shiftTemplateId || ''}`;
    fillMap.set(key, (fillMap.get(key) || 0) + 1);
  }

  // Aggregate by date/template for required vs filled
  const demandMap = new Map<string, { required: number; filled: number }>();
  for (const slot of allSlots) {
    const key = `${slot.date}:${slot.shiftTemplateId}`;
    if (!demandMap.has(key)) {
      demandMap.set(key, { required: 0, filled: 0 });
    }
    demandMap.get(key)!.required++;
  }
  for (const [key, entry] of demandMap) {
    entry.filled = fillMap.get(key) || 0;
  }

  let totalSlots = 0;
  let filledSlots = 0;
  let unfilledSlots = 0;
  let overfilledSlots = 0;
  const byWeekday: Record<string, { required: number; filled: number }> = {};

  for (const weekday of ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] as Weekday[]) {
    byWeekday[weekday] = { required: 0, filled: 0 };
  }

  for (const [key, entry] of demandMap) {
    const date = key.split(':')[0];
    const weekday = getWeekdayForDate(date);
    totalSlots += entry.required;
    const filled = Math.min(entry.filled, entry.required);
    filledSlots += filled;
    unfilledSlots += Math.max(0, entry.required - entry.filled);
    overfilledSlots += Math.max(0, entry.filled - entry.required);
    byWeekday[weekday].required += entry.required;
    byWeekday[weekday].filled += filled;
  }

  return {
    totalSlots,
    filledSlots,
    unfilledSlots,
    overfilledSlots,
    byWeekday: byWeekday as Record<Weekday, { required: number; filled: number }>,
  };
}
