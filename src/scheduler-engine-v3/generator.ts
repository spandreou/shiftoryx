import type { EmployeeV3, GeneratedShiftV3, GenerateScheduleV3Input, GenerateScheduleV3Result, EmployeeHoursSummaryV3 } from './types.ts';
import { evaluateEmployeeEligibilityV3 } from './eligibility.ts';
import { resolveEffectiveStandardShift } from './employeeProfile.ts';
import { expandCoverageSlots, calculateCoverageSummary } from './coverage.ts';
import { analyzeScheduleWarningsV3, getWeekStartV3 } from './warnings.ts';
import { assertV3Input } from './validation.ts';

const compare = (a:string,b:string) => a < b ? -1 : a > b ? 1 : 0;
function hashInput(value:unknown):string {
  let hash=0x811c9dc5;
  for(const char of JSON.stringify(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,0x01000193);}
  return (hash>>>0).toString(16).padStart(8,'0');
}

/** Deterministic, pure automatic baseline; owners may edit all business decisions. */
export function generateScheduleV3(input:GenerateScheduleV3Input):GenerateScheduleV3Result {
  assertV3Input(input);
  const {config,employees,absences,periodStart,periodEnd,options}=input;
  const active=employees.filter(e=>e.isActive).sort((a,b)=>compare(a.id,b.id));
  const shifts:GeneratedShiftV3[]=(input.existingManualShifts||[]).map(s=>({...s}));
  const ids=new Set(shifts.map(s=>s.id));
  let counter=0;
  const nextId=()=>{let id;do{id='shift-v3-'+String(++counter).padStart(6,'0');}while(ids.has(id));ids.add(id);return id;};
  const rotation=new Map<string,number>();
  const slots=expandCoverageSlots(config,periodStart,periodEnd).sort((a,b)=>compare(a.date,b.date)||compare(a.shiftTemplateId,b.shiftTemplateId)||a.slotIndex-b.slotIndex);
  for(const slot of slots){
    const template=slot.shiftTemplate;
    if(!template||!template.isActive)continue;
    if(shifts.filter(s=>s.date===slot.date&&s.shiftTemplateId===template.id).length>slot.slotIndex)continue;
    const weekStart=getWeekStartV3(slot.date,config.weekStartDay);
    const weekEnd=new Date(Date.parse(weekStart)+6*86400000).toISOString().slice(0,10);
    const eligible=active.filter(e=>evaluateEmployeeEligibilityV3(e,slot.date,absences,shifts,template.startTime,{
      ...config.warningPolicies,weekStartDate:weekStart,weekEndDate:weekEnd,
      shiftEndTime:template.endTime,shiftDurationHours:template.durationHours,crossMidnight:template.crossMidnight,
    }).eligible);
    const cursor=rotation.get(template.id)||0;
    const rank=(employee:EmployeeV3)=>{
      const target=employee.schedulerV3.targetWeeklyHours;
      const worked=shifts.filter(s=>s.employeeId===employee.id&&s.date>=weekStart&&s.date<=weekEnd).reduce((sum,s)=>sum+s.durationHours,0);
      return {
        standard:resolveEffectiveStandardShift(employee.schedulerV3,slot.date)===template.id?1:0,
        deficit:options.balanceWeeklyTargets&&target!==null?target-worked:0,
        rotation:(active.indexOf(employee)-cursor+active.length)%active.length,
      };
    };
    eligible.sort((a,b)=>{const x=rank(a),y=rank(b);return y.standard-x.standard||y.deficit-x.deficit||x.rotation-y.rotation||compare(a.id,b.id);});
    const selected=eligible[0];
    if(!selected)continue;
    shifts.push({id:nextId(),date:slot.date,employeeId:selected.id,employeeName:selected.fullName,shiftTemplateId:template.id,startTime:template.startTime,endTime:template.endTime,durationHours:template.durationHours,crossMidnight:template.crossMidnight,source:'AUTO',isManualOverride:false,schedulerSchemaVersion:3});
    rotation.set(template.id,(active.indexOf(selected)+1)%active.length);
  }
  shifts.sort((a,b)=>compare(a.date,b.date)||compare(a.startTime,b.startTime)||compare(a.employeeId,b.employeeId)||compare(a.id,b.id));
  return {
    shifts,warnings:analyzeScheduleWarningsV3(config,employees,absences,shifts,periodStart,periodEnd),
    coverageSummary:calculateCoverageSummary(config,periodStart,periodEnd,shifts),
    employeeHours:calculateEmployeeHoursV3(employees,shifts),
    diagnostics:{generatedAt:'',inputHash:hashInput({...input,employees:[...employees].sort((a,b)=>compare(a.id,b.id))}),deterministicSeed:'v3-'+periodStart+'-'+periodEnd},
  };
}

/** Zero-hour active employees and historical references stay visible. */
export function calculateEmployeeHoursV3(employees:EmployeeV3[],shifts:GeneratedShiftV3[]):EmployeeHoursSummaryV3[]{
  const totals=new Map<string,{hours:number;shiftCount:number}>();
  employees.filter(e=>e.isActive).forEach(e=>totals.set(e.id,{hours:0,shiftCount:0}));
  for(const shift of shifts){const item=totals.get(shift.employeeId)||{hours:0,shiftCount:0};item.hours+=shift.durationHours;item.shiftCount++;totals.set(shift.employeeId,item);}
  return [...totals].map(([employeeId,item])=>({employeeId,hours:Math.round(item.hours*4)/4,shiftCount:item.shiftCount,targetWeeklyHours:employees.find(e=>e.id===employeeId)?.schedulerV3.targetWeeklyHours??null})).sort((a,b)=>compare(a.employeeId,b.employeeId));
}
