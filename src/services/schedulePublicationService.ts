import { analyzeDraftV3, type DraftV3 } from './schedulerV3Service.ts';
import type { SchedulePublicationV3 } from '../scheduler-engine-v3/types.ts';

export function buildPublicationV3(draft: DraftV3, context: { tenantId: string; uid: string; id: string; version: number; timestamp: string }): SchedulePublicationV3 {
  if (draft.config.tenantId !== context.tenantId || !context.uid || !/^[a-zA-Z0-9_-]{1,100}$/.test(context.id) || !Number.isInteger(context.version) || context.version < 1) throw new Error('Μη έγκυρο πλαίσιο δημοσίευσης.');
  const { warnings, employeeHours } = analyzeDraftV3(draft);
  return {
    id:context.id,tenantId:context.tenantId,schemaVersion:3,periodType:draft.periodType,periodStart:draft.periodStart,periodEnd:draft.periodEnd,
    periodKey:`${draft.periodType}_${draft.periodStart}_${draft.periodEnd}`,version:context.version,sourceDraftId:draft.id,
    templateSnapshot:structuredClone(draft.config),
    employeeSnapshot:draft.employees.map(e=>({employeeId:e.id,displayName:e.fullName,...(e.color?{color:e.color}:{})})),
    shifts:draft.shifts.map(s=>({id:s.id,date:s.date,employeeId:s.employeeId,employeeName:draft.employees.find(e=>e.id===s.employeeId)!.fullName,startTime:s.startTime,endTime:s.endTime,durationHours:s.durationHours,shiftTemplateId:s.shiftTemplateId,source:s.source})),
    calculatedHours:employeeHours,warningsAtPublish:warnings,publishedWithWarnings:warnings.length>0,
    pdfStoragePath:`tenants/${context.tenantId}/schedule-publications/${context.id}/schedule.pdf`,pdfGeneratedAt:context.timestamp,publishedAt:context.timestamp,publishedByUid:context.uid,
  };
}

/** Allocate once, upload the exact PDF, then atomically expose snapshot + latest pointer. */
export async function publishDraftV3(draft: DraftV3, context: { tenantId:string;uid:string;id:string;timestamp:string;acceptWarnings:boolean }, io: {
  reserve: (periodKey:string,id:string)=>Promise<number>;
  renderPdf:(snapshot:SchedulePublicationV3)=>Promise<Uint8Array>;
  uploadPdf:(path:string,bytes:Uint8Array)=>Promise<void>;
  finalize:(snapshot:SchedulePublicationV3)=>Promise<void>;
}) {
  const initial = buildPublicationV3(draft,{...context,version:1});
  if (initial.publishedWithWarnings && !context.acceptWarnings) throw new Error('Επιβεβαίωσε ότι διάβασες τις προειδοποιήσεις.');
  const version = await io.reserve(initial.periodKey,context.id);
  const snapshot = { ...initial, version };
  const pdf = await io.renderPdf(snapshot);
  if (!(pdf instanceof Uint8Array) || !pdf.length || pdf.length >= 10 * 1024 * 1024) throw new Error('Μη έγκυρο PDF.');
  await io.uploadPdf(snapshot.pdfStoragePath,pdf);
  await io.finalize(snapshot);
  return snapshot;
}

export function publicProjectionV3(snapshot: SchedulePublicationV3) {
  return snapshot.shifts.map(s=>({employeeName:s.employeeName,date:s.date,startTime:s.startTime,endTime:s.endTime,type:'work',label:'ΕΡΓ',shiftType:'custom',schedulerSchemaVersion:3,crossMidnight:s.endTime<s.startTime}));
}
