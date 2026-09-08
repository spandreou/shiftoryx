import { eachDateInRange, getWeekStartV3 } from '../scheduler-engine-v3/index.ts';
import { publicProjectionV3 } from './schedulePublicationService.ts';
import type { SchedulePublicationV3 } from '../scheduler-engine-v3/types.ts';
export function projectionTargetsV3(snapshot:SchedulePublicationV3) {
  const dates=eachDateInRange(snapshot.periodStart,snapshot.periodEnd);
  return [
    ...[...new Set(dates.map(d=>getWeekStartV3(d,1)))].map(start=>({collection:'publicSchedules',id:start,start,end:new Date(Date.parse(start)+6*86400000).toISOString().slice(0,10)})),
    ...[...new Set(dates.map(d=>d.slice(0,7)))].map(id=>{const date=new Date(id+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return {collection:'publicMonths',id,start:id+'-01',end:date.toISOString().slice(0,10)};}),
  ];
}
export function projectionPayloadV3(snapshot:SchedulePublicationV3,target:ReturnType<typeof projectionTargetsV3>[number],previous:Record<string,unknown>={}) {
  const prior=Array.isArray(previous.shifts)?previous.shifts:[];
  const shifts=[...prior.filter(s=>s.date<snapshot.periodStart||s.date>snapshot.periodEnd),...publicProjectionV3(snapshot)]
    .filter(s=>s.date>=target.start&&s.date<=target.end)
    .map(s=>({employeeName:String(s.employeeName||''),date:String(s.date),startTime:String(s.startTime),endTime:String(s.endTime),type:'work',label:'ΕΡΓ',shiftType:'custom',...(s.schedulerSchemaVersion===3?{schedulerSchemaVersion:3,crossMidnight:s.endTime<s.startTime}:{})}));
  const common={tenantId:snapshot.tenantId,shifts,shiftCount:shifts.length,publishedAt:snapshot.publishedAt};
  return target.collection==='publicSchedules'?{...common,weekStart:target.start,weekEnd:target.end}:{...common,yearMonth:target.id,monthStart:target.start,monthEnd:target.end};
}
