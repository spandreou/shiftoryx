import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {realisticTenants,PERIODS} from './fixtures.ts';
import {createDraftV3,mapAbsencesV3,analyzeDraftV3,editDraftV3,buildV3EmployeePayload} from '../../src/services/schedulerV3Service.ts';
import {resolveEffectiveStandardShift,isFixedDayOff} from '../../src/scheduler-engine-v3/employeeProfile.ts';
import {touchedShiftDatesV3} from '../../src/scheduler-engine-v3/config.ts';
import {publishDraftV3} from '../../src/services/schedulePublicationService.ts';
import {renderPublicationPdfV3} from '../../src/services/schedulePublicationPdf.ts';
const output=resolve(process.argv[2]||'');if(!process.argv[2])throw new Error('Pass the QA output directory.');
await mkdir(output,{recursive:true});
const rows=[],results=[];let assertions=0;
function check(tenant,rule,expected,actual){assertions++;assert.deepEqual(actual,expected,tenant+': '+rule);rows.push({tenant,rule,expected,actual,result:'PASS'});}
const match=(a,b)=>a?.startTime===b.startTime&&a?.endTime===b.endTime;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function draftFor(t,periodType){const [periodStart,periodEnd]=PERIODS[periodType];return createDraftV3({config:t.config,employees:t.employees,absences:mapAbsencesV3(t.absences,periodStart,periodEnd),periodType,periodStart,periodEnd,options:{balanceWeeklyTargets:true}},t.slug+'-'+periodType.toLowerCase());}
for(const t of realisticTenants()){
  const schedules={};
  for(const periodType of ['WEEK','MONTH']){
    const draft=draftFor(t,periodType),analysis=analyzeDraftV3(draft);
    let offViolations=0,absenceViolations=0,standardMatches=0;
    for(const s of draft.shifts){const e=draft.employees.find(e=>e.id===s.employeeId);const dates=touchedShiftDatesV3(s.date,s.startTime,s.endTime,s.crossMidnight);offViolations+=dates.some(d=>isFixedDayOff(d,e.schedulerV3.fixedDayOff))?1:0;absenceViolations+=draft.absences.some(a=>a.employeeId===e.id&&dates.some(d=>a.startDate<=d&&a.endDate>=d))?1:0;standardMatches+=match(resolveEffectiveStandardShift(e.schedulerV3,s.date),s)?1:0;}
    check(t.slug,periodType+' fixed-off automatic violations',0,offViolations);
    check(t.slug,periodType+' absence automatic violations',0,absenceViolations);
    check(t.slug,periodType+' active workers in statistics',t.employees.length,analysis.employeeHours.length);
    check(t.slug,periodType+' business warnings non-blocking',true,analysis.warnings.every(w=>w.blocking===false));
    check(t.slug,periodType+' within current persistence capacity',true,draft.shifts.length<=449);
    check(t.slug,periodType+' standard shift used where possible',true,standardMatches>0);
    schedules[periodType]={draft,analysis,standardMatches,standardOpportunities:draft.shifts.length};
  }
  const week=schedules.WEEK.draft;
  // A quiet holiday week is an explicit business scenario, with zero demand.
  const quiet=structuredClone(t);quiet.config.coverageRequirements.forEach(d=>d.slots.forEach(s=>{s.headcount=0;}));
  const quietReport=analyzeDraftV3(draftFor(quiet,'WEEK'));
  check(t.slug,'quiet week retains every active zero-hour employee',t.employees.length,quietReport.employeeHours.filter(e=>e.hours===0&&e.shiftCount===0).length);
  // A manual extra assignment on a fixed day off is allowed and recalculates warnings/hours.
  const employee=t.employees[0],offDate=Array.from({length:7},(_,n)=>`2026-09-${String(7+n).padStart(2,'0')}`).find(date=>isFixedDayOff(date,employee.schedulerV3.fixedDayOff));
  const template=t.config.shiftTemplates[0];
  const manual={...week.shifts[0],id:'qa-manual-override',employeeId:employee.id,employeeName:employee.fullName,date:offDate,startTime:template.startTime,endTime:template.endTime,durationHours:template.durationHours,shiftTemplateId:template.id,source:'MANUAL',isManualOverride:true,crossMidnight:false};
  const edited=editDraftV3(week,[...week.shifts,manual]);const editedReport=analyzeDraftV3(edited);
  check(t.slug,'manual preview adds actual hours',template.durationHours,editedReport.employeeHours.find(e=>e.employeeId===employee.id).hours-schedules.WEEK.analysis.employeeHours.find(e=>e.employeeId===employee.id).hours);
  check(t.slug,'manual fixed-off warning visible',true,editedReport.warnings.some(w=>w.code==='FIXED_DAY_OFF_OVERRIDE'&&w.employeeId===employee.id));
  const snapshots=[],pdfs=new Map();let version=0;
  const io={reserve:async()=>++version,renderPdf:renderPublicationPdfV3,uploadPdf:async(path,bytes)=>{pdfs.set(path,bytes.slice());},finalize:async snapshot=>{snapshots.push(structuredClone(snapshot));}};
  const context={tenantId:t.slug,uid:'qa-local-owner',id:t.slug+'-publication-1',timestamp:'2026-09-07T12:00:00Z',acceptWarnings:true};
  const v1=await publishDraftV3(week,context,io),before=JSON.stringify(v1),pdfHash=hash(pdfs.get(v1.pdfStoragePath));
  const v2=await publishDraftV3(edited,{...context,id:t.slug+'-publication-2'},io);
  check(t.slug,'publish acknowledged scheduling warnings',true,v2.publishedWithWarnings);
  check(t.slug,'v1 snapshot unchanged after v2',before,JSON.stringify(snapshots[0]));rows.at(-1).expected='unchanged';rows.at(-1).actual='unchanged';
  check(t.slug,'v1 rendered PDF unchanged after v2',pdfHash,hash(pdfs.get(v1.pdfStoragePath)));rows.at(-1).expected='same bytes';rows.at(-1).actual='same bytes';
  check(t.slug,'PDF artifact is a PDF',true,new TextDecoder().decode(pdfs.get(v1.pdfStoragePath).slice(0,8)).startsWith('%PDF-'));
  await writeFile(resolve(output,t.slug+'-week-v1.pdf'),pdfs.get(v1.pdfStoragePath));
  for(const e of t.employees.filter(e=>e.schedulerV3.rotateStandardShiftWeekly)){
    const first=schedules.MONTH.draft.shifts.find(s=>s.employeeId===e.id&&s.date>='2026-09-07'&&s.date<='2026-09-13');
    const second=schedules.MONTH.draft.shifts.find(s=>s.employeeId===e.id&&s.date>='2026-09-14'&&s.date<='2026-09-20');
    check(t.slug,e.fullName+' first rotation week uses own standard',true,match(e.schedulerV3.standardShift,first));
    check(t.slug,e.fullName+' next rotation week uses own alternate',true,match(e.schedulerV3.rotationAlternateShift,second));
  }
  results.push({tenant:t,schedules,manualScenario:{date:offDate,employee:employee.fullName,addedHours:template.durationHours,warnings:editedReport.warnings},publication:{v1:1,v2:2,pdfSha256:pdfHash}});
}
const fuel=results[0],cafe=results[1];
check('qa-fuel','explicit substitute is used during shortage',true,fuel.schedules.WEEK.draft.shifts.some(s=>s.employeeId==='qa-fuel-e6'));
check('qa-fuel','weekly targets are soft: at least one exceeded',true,fuel.schedules.WEEK.analysis.weeklyHours.some(h=>h.delta>0));
check('qa-cafe','busy Saturday shortage produces warning',true,cafe.schedules.WEEK.analysis.warnings.some(w=>w.code==='COVERAGE_UNDER_TARGET'));
const hiring=structuredClone(fuel.tenant);const newWorker={id:'qa-fuel-new',...buildV3EmployeePayload({fullName:'QA Νέα πρόσληψη'})};hiring.employees.push(newWorker);
hiring.absences.push(...[1,2].map(n=>({id:'qa-hiring-'+n,employeeId:'qa-fuel-e'+n,type:'LEAVE',scope:'FULL_DAY',status:'APPROVED',startDate:'2026-09-07',endDate:'2026-09-07'})));
const hiringDraft=draftFor(hiring,'WEEK');
check('qa-fuel','new employee defaults to NORMAL','NORMAL',newWorker.schedulerV3.workMode);
check('qa-fuel','new NORMAL worker receives available coverage',true,hiringDraft.shifts.some(s=>s.employeeId===newWorker.id));

const esc=value=>String(value??'—').replaceAll('|','/').replaceAll('\n',' ');
const table=(headers,data)=>'| '+headers.map(esc).join(' | ')+' |\n| '+headers.map(()=>'---').join(' | ')+' |\n'+data.map(row=>'| '+row.map(esc).join(' | ')+' |').join('\n');
const time=r=>r?`${r.startTime}–${r.endTime}`:'—';const dayNames=['Κυριακή','Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο'];
let report='# Realistic Scheduler V3 — owner acceptance\n\nQA data only. September 2026. Local emulator rehearsal; hosted activation is separate.\n\n';
for(const {tenant:t,schedules,manualScenario} of results){
  report+=`## ${t.name}\n\n${t.story}\n\nTarget domain: ${t.domain}; active employees: ${t.employees.length}.\n\n`;
  report+=table(['Εργαζόμενος','Συμμετοχή','Ρεπό','Στόχος','Τυπικό','Rotation / alternate / anchor'],t.employees.map(e=>[e.fullName,e.schedulerV3.workMode==='NORMAL'?'Κανονική':'Μόνο αναπλήρωση',dayNames[e.schedulerV3.fixedDayOff]??'—',e.schedulerV3.targetWeeklyHours,time(e.schedulerV3.standardShift),e.schedulerV3.rotateStandardShiftWeekly?`${time(e.schedulerV3.rotationAlternateShift)} / ${e.schedulerV3.rotationAnchorWeekStart}`:'Όχι']))+'\n\n';
  report+='Coverage by weekday (headcount, not roles):\n\n'+table(['Day',...t.config.shiftTemplates.map(time)],t.config.coverageRequirements.map(d=>[d.weekday,...d.slots.map(s=>s.headcount)]))+'\n\n';
  report+='Absences: '+(t.absences.map(a=>`${t.employees.find(e=>e.id===a.employeeId).fullName}: ${a.startDate}–${a.endDate}`).join('; ')||'None')+'.\n\n';
  const days=Array.from({length:7},(_,n)=>`2026-09-${String(7+n).padStart(2,'0')}`),week=schedules.WEEK;
  report+='### Actual WEEK schedule\n\n'+table(['Εργαζόμενος',...days,'Ώρες'],t.employees.map(e=>[e.fullName,...days.map(date=>week.draft.shifts.filter(s=>s.employeeId===e.id&&s.date===date).map(time).join(', ')||'—'),week.analysis.employeeHours.find(h=>h.employeeId===e.id).hours]))+'\n\n';
  for(const period of ['WEEK','MONTH']){const r=schedules[period];report+=`### ${period} totals and weekly deltas\n\n${r.draft.shifts.length} assignments. Standard-time matches: ${r.standardMatches}/${r.standardOpportunities}.\n\n`;
    report+=table(['Employee','Hours','Shifts'],r.analysis.employeeHours.map(h=>[t.employees.find(e=>e.id===h.employeeId).fullName,h.hours,h.shiftCount]))+'\n\n';
    report+=table(['Employee','Week','Actual','Target','Delta','Partial week'],r.analysis.weeklyHours.map(h=>[t.employees.find(e=>e.id===h.employeeId).fullName,h.weekStart,h.hours,h.targetHours,h.delta,h.isPartialWeek]))+'\n\n';
    report+='Warnings (including coverage shortages/surplus):\n\n'+table(['Code','Date','Shift','Employee','Message'],r.analysis.warnings.map(w=>[w.code,w.date,time(t.config.shiftTemplates.find(t=>t.id===w.details?.shiftTemplateId)),t.employees.find(e=>e.id===w.employeeId)?.fullName,w.message]))+'\n\n';
  }
  report+=`Manual scenario: ${manualScenario.employee}, ${manualScenario.date}, +${manualScenario.addedHours}h; fixed-off warning visible; publishing after acknowledgment succeeds.\n\n`;
}
report+='## Expected vs Actual\n\n'+table(['Tenant','Rule','Expected','Actual','Result'],rows.map(r=>[r.tenant,r.rule,r.expected,r.actual,r.result]))+'\n\n';
report+='The publication checks above use the real services/PDF renderer with in-memory storage. Browser evidence separately verifies actual emulator persistence, auth broker and Rules. All complete generated WEEK/MONTH assignments are retained in acceptance.json.\n';
await writeFile(resolve(output,'acceptance.md'),report);await writeFile(resolve(output,'acceptance.json'),JSON.stringify({assertions,rows,results},null,2));
console.log(`REALISTIC_SCHEDULER_ACCEPTANCE assertions=${assertions} tenants=4 periods=8 PASS`);
