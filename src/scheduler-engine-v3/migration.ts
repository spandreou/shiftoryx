import { normalizeEmployeeProfileV3 } from './employeeProfile.ts';
import { validateSchedulerConfigV3 } from './config.ts';
import type { SchedulerConfigV3 } from './types.ts';

/** Offline, preview-only conversion. Never infers workMode from a legacy role. */
export function previewV2Migration(raw: Record<string, any>, tenantId: string) {
  const deferred = ['role/skill coverage','substitute strategies','Sunday special policy','special dates'];
  const config: SchedulerConfigV3 = {
    schemaVersion:3,tenantId,timezone:raw.timezone || 'Europe/Athens',weekStartDay:raw.weekStartDay || 1,
    templateId:'scheduler-v3-migration',templateVersion:1,
    operatingDays:structuredClone(raw.operatingDays || []),
    shiftTemplates:(raw.shiftTemplates || []).map(t=>({id:t.id,label:t.label,shortCode:t.shortCode,shiftType:['MORNING','INTERMEDIATE','AFTERNOON','NIGHT'].includes(t.shiftType)?t.shiftType:'CUSTOM',startTime:t.startTime,endTime:t.endTime,durationHours:t.durationHours,crossMidnight:Boolean(t.crossMidnight),isActive:t.isActive!==false})),
    coverageRequirements:(raw.coverageRequirements || []).map(p=>({weekday:p.weekday,slots:p.slots.map(s=>({shiftTemplateId:s.shiftTemplateId,headcount:s.targetHeadcount}))})),
    generationDefaults:{balanceWeeklyTargetsForMonth:true},warningPolicies:{minRestIntervalHours:raw.complianceRules?.minRestIntervalBetweenShiftsHours ?? null,maxDailyHours:raw.complianceRules?.maxDailyWorkingHours ?? null,maxWeeklyHours:raw.complianceRules?.maxWeeklyStandardHours ?? null,maxConsecutiveWorkingDays:raw.complianceRules?.maxConsecutiveWorkingDays ?? null},
  };
  return { config, validation:validateSchedulerConfigV3(config), requiresOwnerReview:true, deferred, defaultEmployeeProfile:normalizeEmployeeProfileV3() };
}
