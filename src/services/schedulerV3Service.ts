import { analyzeScheduleWarningsV3, assertV3Input, calculateEmployeeHoursV3, calculateCoverageSummary, generateScheduleV3, normalizeEmployeeProfileV3 } from '../scheduler-engine-v3/index.ts';
import type { GenerateScheduleV3Input, GeneratedShiftV3, SchedulerConfigV3, EmployeeV3, SchedulePublicationV3 } from '../scheduler-engine-v3/types.ts';

export function isSchedulerV3Active(globalFlag: unknown, tenantVersion: unknown): boolean {
  return (globalFlag === true || globalFlag === 'true') && tenantVersion === 3;
}
export function mapEmployeesV3(employees: Array<Record<string, unknown>>): EmployeeV3[] {
  return employees.map(e => ({ id: String(e.id || ''), fullName: String(e.fullName || ''), isActive: e.isActive !== false, schedulerV3: normalizeEmployeeProfileV3(e.schedulerV3 as EmployeeV3['schedulerV3']), activeFrom: e.activeFrom as string || null, activeTo: e.activeTo as string || null, color: typeof e.color === 'string' ? e.color : undefined }));
}
export function mapAbsencesV3(absences: Array<Record<string, any>>, first:string,last:string) {
  return absences.filter(a=>a.status!=='CANCELLED'&&a.startDate<=last&&(a.endDate||a.startDate)>=first).map(a=>({id:a.id,employeeId:a.employeeId,type:['LEAVE','SICK'].includes(a.type)?a.type:'OTHER',startDate:a.startDate,endDate:a.endDate||a.startDate,scope:a.scope==='FULL_DAY'?'FULL_DAY':'PARTIAL_DAY'}));
}
export function refreshDraftPeopleV3(draft:DraftV3,employees:EmployeeV3[],absences:Array<Record<string,any>>):DraftV3 {
  const current=new Map(employees.map(e=>[e.id,e]));
  const people=draft.employees.map(e=>{const latest=current.get(e.id);return latest?{...e,isActive:latest.isActive,fullName:latest.fullName,activeFrom:latest.activeFrom,activeTo:latest.activeTo}:{...e,isActive:false};});
  const ids=new Set(people.map(e=>e.id));
  people.push(...employees.filter(e=>!ids.has(e.id)).map(e=>({...e,schedulerV3:normalizeEmployeeProfileV3(e.schedulerV3)})));
  return {...draft,employees:people,absences:mapAbsencesV3(absences,draft.periodStart,draft.periodEnd)};
}
export type DraftV3 = GenerateScheduleV3Input & { id: string; shifts: GeneratedShiftV3[]; revision?: number; sourcePublicationId?: string };
export function createDraftFromPublicationV3(publication:SchedulePublicationV3, options:{id?:string;tenantId?:string;employees?:EmployeeV3[];absences?:Array<Record<string,any>>}={}):DraftV3 {
  if(publication.tenantId !== (options.tenantId ?? publication.tenantId) || publication.templateSnapshot.tenantId !== publication.tenantId) throw new Error('Μη έγκυρο κατάστημα δημοσίευσης.');
  const id=options.id ?? globalThis.crypto.randomUUID();
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || id===publication.sourceDraftId)throw new Error('Απαιτείται νέο αναγνωριστικό προσχεδίου.');
  const current=new Map((options.employees||[]).map(e=>[e.id,e]));
  const people:EmployeeV3[]=publication.employeeSnapshot.map(e=>{
    const live=current.get(e.employeeId);
    return live?{...live,schedulerV3:normalizeEmployeeProfileV3(live.schedulerV3)}:{id:e.employeeId,fullName:e.displayName,isActive:false,color:e.color,schedulerV3:normalizeEmployeeProfileV3()};
  });
  const existing=new Set(people.map(e=>e.id));
  people.push(...(options.employees||[]).filter(e=>!existing.has(e.id)).map(e=>({...e,schedulerV3:normalizeEmployeeProfileV3(e.schedulerV3)})));
  const draft:DraftV3={id,revision:0,sourcePublicationId:publication.id,config:structuredClone(publication.templateSnapshot),employees:people,absences:mapAbsencesV3(options.absences||[],publication.periodStart,publication.periodEnd),periodType:publication.periodType,periodStart:publication.periodStart,periodEnd:publication.periodEnd,options:{balanceWeeklyTargets:publication.templateSnapshot.generationDefaults.balanceWeeklyTargetsForMonth},shifts:publication.shifts.map(s=>({...structuredClone(s),shiftTemplateId:s.shiftTemplateId??null,crossMidnight:s.endTime<s.startTime,isManualOverride:s.source==='MANUAL',schedulerSchemaVersion:3,draftId:id}))};
  analyzeDraftV3(draft);return draft;
}
export function createDraftV3(input: GenerateScheduleV3Input, id: string): DraftV3 {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Μη έγκυρο αναγνωριστικό προσχεδίου.');
  const result = generateScheduleV3(input);
  return { ...structuredClone(input), id, shifts: result.shifts.map(s => ({ ...s, draftId: id })) };
}
export function analyzeDraftV3(draft: DraftV3) {
  assertV3Input(draft, draft.shifts);
  return {
    warnings: analyzeScheduleWarningsV3(draft.config, draft.employees, draft.absences, draft.shifts, draft.periodStart, draft.periodEnd),
    employeeHours: calculateEmployeeHoursV3(draft.employees, draft.shifts),
    coverageSummary: calculateCoverageSummary(draft.config, draft.periodStart, draft.periodEnd, draft.shifts),
  };
}
export function editDraftV3(draft: DraftV3, shifts: GeneratedShiftV3[]): DraftV3 {
  const next = { ...draft, shifts: structuredClone(shifts) };
  analyzeDraftV3(next);
  return next;
}
export function makeDefaultConfigV3(tenantId: string): SchedulerConfigV3 {
  const weekdays = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY'] as const;
  return { schemaVersion:3, tenantId, timezone:'Europe/Athens', weekStartDay:1, templateId:'scheduler-standard', templateVersion:1,
    operatingDays:weekdays.map(weekday=>({weekday,isOpen:weekday!=='SUNDAY',windows:weekday==='SUNDAY'?[]:[{openTime:'08:00',closeTime:'20:00',crossMidnight:false}]})),
    shiftTemplates:[{id:'day',label:'Ημέρα',shortCode:'ΗΜ',shiftType:'MORNING',startTime:'08:00',endTime:'16:00',durationHours:8,crossMidnight:false,isActive:true}],
    coverageRequirements:weekdays.map(weekday=>({weekday,slots:[{shiftTemplateId:'day',headcount:weekday==='SUNDAY'?0:1}]})),generationDefaults:{balanceWeeklyTargetsForMonth:true},warningPolicies:{minRestIntervalHours:11,maxDailyHours:12,maxWeeklyHours:48,maxConsecutiveWorkingDays:6} };
}
