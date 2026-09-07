/**
 * ShiftOryx Scheduler V3 Types
 *
 * NOTE: These types completely supersede the V2 engine types when schemaVersion=3.
 * Do NOT import or mix types from the V2 engine (src/scheduler-engine/types.ts).
 * This engine version uses deterministic scheduling and relies strictly on these pure types.
 */

export type Weekday =
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'
  | 'SUNDAY';

export type ShiftTypeV3 =
  | 'MORNING'
  | 'INTERMEDIATE'
  | 'AFTERNOON'
  | 'NIGHT'
  | 'CUSTOM';

export type WorkMode = 'NORMAL' | 'SUBSTITUTE_ONLY';

export type OperatingDayConfigV3 = {
  weekday: Weekday;
  isOpen: boolean;
  windows: Array<{
    openTime: string;
    closeTime: string;
    crossMidnight?: boolean;
  }>;
};

export type ShiftTemplateV3 = {
  id: string;
  label: string;
  shortCode: string;
  shiftType: ShiftTypeV3;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationHours: number;
  crossMidnight: boolean;
  color?: string;
  isActive: boolean;
};

export type CoverageSlotV3 = {
  shiftTemplateId: string;
  headcount: number; // integer >= 0
};

export type CoverageRequirementV3 = {
  weekday: Weekday;
  slots: CoverageSlotV3[];
};

export type WarningPoliciesV3 = {
  minRestIntervalHours?: number | null;
  maxDailyHours?: number | null;
  maxWeeklyHours?: number | null;
  maxConsecutiveWorkingDays?: number | null;
};

export type SchedulerConfigV3 = {
  schemaVersion: 3;
  tenantId: string;
  timezone: string;
  weekStartDay: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  operatingDays: Array<OperatingDayConfigV3>;
  shiftTemplates: Array<ShiftTemplateV3>;
  coverageRequirements: Array<CoverageRequirementV3>;
  generationDefaults: { balanceWeeklyTargetsForMonth: boolean };
  warningPolicies?: WarningPoliciesV3;
  templateId: string;
  templateVersion: number;
};

export type EmployeeSchedulingProfileV3 = {
  workMode: WorkMode;
  fixedDayOff: number | null; // (0=Sunday..6=Saturday)
  targetWeeklyHours: number | null;
  standardShiftTemplateId: string | null;
  rotateStandardShiftWeekly: boolean;
  rotationAlternateShiftTemplateId: string | null;
  rotationAnchorWeekStart: string | null; // (YYYY-MM-DD)
};

export type EmployeeV3 = {
  id: string;
  fullName: string;
  isActive: boolean;
  schedulerV3: EmployeeSchedulingProfileV3;
  activeFrom?: string | null;
  activeTo?: string | null;
  color?: string;
};

export type GeneratedShiftV3 = {
  id: string;
  date: string; // YYYY-MM-DD
  employeeId: string;
  employeeName: string;
  shiftTemplateId: string | null;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  durationHours: number;
  crossMidnight?: boolean;
  source: 'AUTO' | 'MANUAL';
  isManualOverride: boolean;
  schedulerSchemaVersion: 3;
  draftId?: string;
};

export type WarningCodeV3 =
  | 'COVERAGE_UNDER_TARGET'
  | 'COVERAGE_OVER_TARGET'
  | 'FIXED_DAY_OFF_OVERRIDE'
  | 'ABSENCE_OVERRIDE'
  | 'SHIFT_OVERLAP'
  | 'OUTSIDE_OPERATING_WINDOW'
  | 'STANDARD_SHIFT_DEVIATION'
  | 'TARGET_HOURS_UNDER'
  | 'TARGET_HOURS_OVER'
  | 'REST_INTERVAL_WARNING'
  | 'DAILY_HOURS_WARNING'
  | 'WEEKLY_HOURS_WARNING'
  | 'CONSECUTIVE_DAYS_WARNING'
  | 'ROTATION_CONFIGURATION_WARNING'
  | 'SUBSTITUTE_MANUAL_ASSIGNMENT'
  | 'DEACTIVATED_EMPLOYEE_REFERENCE';

export type ScheduleWarningV3 = {
  id: string;
  code: WarningCodeV3;
  severity: 'INFO' | 'WARNING';
  blocking: false;
  date?: string;
  employeeId?: string;
  shiftId?: string;
  message: string;
  details?: Record<string, string | number | boolean>;
};

export type ScheduleDraftMetadataV3 = {
  id: string;
  tenantId: string;
  schemaVersion: 3;
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;
  periodEnd: string;
  sourcePublicationId?: string | null;
  generationOptions: { balanceWeeklyTargets: boolean };
  status: 'DRAFT';
  warningSummary: {
    total: number;
    byCode: Record<WarningCodeV3, number>;
  };
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type SafeEmployeeSnapshot = {
  employeeId: string;
  displayName: string;
  color?: string;
  displayLabel?: string;
};

export type SafePublishedShiftV3 = {
  id: string;
  date: string;
  employeeId: string;
  employeeName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  shiftTemplateId?: string | null;
  source: 'AUTO' | 'MANUAL';
};

export type EmployeeHoursSummaryV3 = {
  employeeId: string;
  hours: number;
  shiftCount: number;
  targetWeeklyHours?: number | null;
};

export type SchedulePublicationV3 = {
  id: string;
  tenantId: string;
  schemaVersion: 3;
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;
  periodEnd: string;
  periodKey: string;
  version: number;
  sourceDraftId?: string | null;
  sourcePublicationId?: string | null;
  templateSnapshot: SchedulerConfigV3;
  employeeSnapshot: SafeEmployeeSnapshot[];
  shifts: SafePublishedShiftV3[];
  calculatedHours: EmployeeHoursSummaryV3[];
  warningsAtPublish: ScheduleWarningV3[];
  publishedWithWarnings: boolean;
  pdfStoragePath: string;
  pdfGeneratedAt: string;
  publishedAt: string;
  publishedByUid: string;
};

export type SchedulePublicationPeriodIndex = {
  tenantId: string;
  periodKey: string;
  latestVersion: number;
  latestPublicationId: string;
  updatedAt: string;
};

export type EmployeeAbsenceV3 = {
  id: string;
  employeeId: string;
  type: 'LEAVE' | 'SICK' | 'OTHER';
  startDate: string;
  endDate: string;
  scope: 'FULL_DAY' | 'PARTIAL_DAY';
  note?: string;
};

export type GenerateScheduleV3Input = {
  config: SchedulerConfigV3;
  employees: EmployeeV3[];
  absences: EmployeeAbsenceV3[];
  existingManualShifts?: GeneratedShiftV3[];
  periodType: 'WEEK' | 'MONTH';
  periodStart: string;
  periodEnd: string;
  options: { balanceWeeklyTargets: boolean };
};

export type CoverageSummaryV3 = {
  totalSlots: number;
  filledSlots: number;
  unfilledSlots: number;
  overfilledSlots: number;
  byWeekday: Record<Weekday, { required: number; filled: number }>;
};

export type GenerateScheduleV3Result = {
  shifts: GeneratedShiftV3[];
  warnings: ScheduleWarningV3[];
  coverageSummary: CoverageSummaryV3;
  employeeHours: EmployeeHoursSummaryV3[];
  diagnostics: {
    generatedAt: string;
    inputHash: string;
    deterministicSeed: string;
  };
};

export const DEFAULT_EMPLOYEE_PROFILE_V3: EmployeeSchedulingProfileV3 = {
  workMode: 'NORMAL',
  fixedDayOff: null,
  targetWeeklyHours: null,
  standardShiftTemplateId: null,
  rotateStandardShiftWeekly: false,
  rotationAlternateShiftTemplateId: null,
  rotationAnchorWeekStart: null,
};
