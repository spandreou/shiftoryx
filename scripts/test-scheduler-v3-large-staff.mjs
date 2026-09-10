import strict from 'node:assert/strict';
import * as v3 from '../src/scheduler-engine-v3/index.ts';
import { makeDefaultConfigV3, mapEmployeesV3, refreshDraftPeopleV3, createDraftV3, analyzeDraftV3 } from '../src/services/schedulerV3Service.ts';

let assertions=0, passed=0; const failures=[];
const assert=new Proxy(strict,{get(target,key){const fn=target[key];return typeof fn==='function'?(...args)=>{assertions++;return fn(...args);}:fn;}});
function test(name,fn){try{fn();passed++;}catch(error){failures.push(name+': '+error.message);}}
const times=(startTime='06:00',endTime='14:00')=>({startTime,endTime});
const profile=patch=>v3.normalizeEmployeeProfileV3(patch);
function input(n,periodType='WEEK',range=times(),headcount=1){
  const config=makeDefaultConfigV3('test-only');
  const crossMidnight=range.endTime<range.startTime;
  const start=Number(range.startTime.slice(0,2))*60+Number(range.startTime.slice(3));
  const end=Number(range.endTime.slice(0,2))*60+Number(range.endTime.slice(3));
  config.shiftTemplates=[{id:'demand',label:'Ωράριο',shortCode:'Ω',shiftType:'CUSTOM',...range,durationHours:(end-start+1440)%1440/60,crossMidnight,isActive:true}];
  config.operatingDays.forEach(d=>{d.isOpen=true;d.windows=[{openTime:range.startTime,closeTime:range.endTime,crossMidnight}];});
  config.coverageRequirements.forEach(d=>d.slots=[{shiftTemplateId:'demand',headcount}]);
  config.warningPolicies={};
  return {config,employees:mapEmployeesV3(Array.from({length:n},(_,i)=>({id:'e'+String(i+1).padStart(3,'0'),fullName:'Εργαζόμενος '+(i+1),isActive:true}))),absences:[],periodType,periodStart:periodType==='WEEK'?'2026-09-07':'2026-09-01',periodEnd:periodType==='WEEK'?'2026-09-13':'2026-09-30',options:{balanceWeeklyTargets:true}};
}
const absence=(employeeId,startDate,endDate=startDate)=>({id:'leave-'+employeeId,employeeId,type:'LEAVE',startDate,endDate,scope:'FULL_DAY'});
const dayAfter=date=>new Date(Date.parse(date+'T00:00:00Z')+86400000).toISOString().slice(0,10);
function eligible(e,date,range,absences=[],shifts=[],extra={}){
  return v3.evaluateEmployeeEligibilityV3(e,date,absences,shifts,range.startTime,{shiftEndTime:range.endTime,crossMidnight:range.endTime<range.startTime,shiftDurationHours:8,...extra});
}
test('normal pool wins even when substitutes have better preferences/targets',()=>{
  const i=input(4,'WEEK',times(),2);i.periodEnd=i.periodStart;
  i.employees[3].schedulerV3=profile({workMode:'SUBSTITUTE_ONLY',standardShift:times(),targetWeeklyHours:100});
  const r=v3.generateScheduleV3(i);assert.equal(r.shifts.length,2);assert.ok(r.shifts.every(s=>s.employeeId!=='e004'));
});
for(const normalCount of [0,1,2])test('explicit fallback fills remaining demand after '+normalCount+' normal',()=>{
  const i=input(2,'WEEK',times(),2);i.periodEnd=i.periodStart;
  i.employees.forEach((e,n)=>e.schedulerV3=profile({workMode:n<normalCount?'NORMAL':'SUBSTITUTE_ONLY'}));
  const r=v3.generateScheduleV3(i);assert.equal(r.shifts.length,2);assert.equal(r.shifts.filter(s=>i.employees.find(e=>e.id===s.employeeId).schedulerV3.workMode==='SUBSTITUTE_ONLY').length,2-normalCount);
});
test('overnight next-day absence blocks normal and substitute workers',()=>{
  for(const workMode of ['NORMAL','SUBSTITUTE_ONLY']){
    const i=input(1,'WEEK',times('22:00','06:00'));i.employees[0].schedulerV3=profile({workMode});i.absences=[absence('e001','2026-09-08')];
    assert.equal(eligible(i.employees[0],'2026-09-07',times('22:00','06:00'),i.absences).eligible,false);
    assert.ok(!v3.generateScheduleV3(i).shifts.some(s=>s.date==='2026-09-07'));
  }
});
test('overnight next-day fixed off blocks automatically, manual override warns',()=>{
  const i=input(1,'WEEK',times('22:00','06:00'));i.employees[0].schedulerV3=profile({fixedDayOff:2});
  assert.equal(eligible(i.employees[0],'2026-09-07',times('22:00','06:00')).eligible,false);
  const manual={id:'manual',employeeId:'e001',employeeName:'Εργαζόμενος',date:'2026-09-07',...times('22:00','06:00'),durationHours:8,crossMidnight:true,shiftTemplateId:'demand',source:'MANUAL',isManualOverride:true,schedulerSchemaVersion:3};
  const draft={...i,id:'manual-draft',shifts:[manual],absences:[absence('e001','2026-09-08')]};
  const warnings=analyzeDraftV3(draft).warnings;
  assert.ok(warnings.some(w=>w.code==='FIXED_DAY_OFF_OVERRIDE'));assert.ok(warnings.some(w=>w.code==='ABSENCE_OVERRIDE'));assert.ok(warnings.every(w=>w.blocking===false));
});
test('half-open midnight end does not touch next-day leave/off',()=>{
  const e=input(1).employees[0];e.schedulerV3=profile({fixedDayOff:2});
  assert.equal(eligible(e,'2026-09-07',times('16:00','00:00'),[absence(e.id,'2026-09-08')]).eligible,true);
});
test('last night of period retains following-day absence context',()=>{
  const i=input(1,'WEEK',times('22:00','06:00'));const d=createDraftV3(i,'week-last-night');
  const refreshed=refreshDraftPeopleV3(d,i.employees,[absence('e001','2026-09-14')]);
  assert.equal(refreshed.absences.length,1);
  assert.ok(analyzeDraftV3(refreshed).warnings.some(w=>w.code==='ABSENCE_OVERRIDE'&&w.date==='2026-09-13'));
});
test('weekly statistics expose exact actual target delta and zero hours',()=>{
  const i=input(2);i.employees[0].schedulerV3=profile({targetWeeklyHours:37.5});
  const d=createDraftV3(i,'stats');const rows=analyzeDraftV3(d).weeklyHours;
  assert.ok(Array.isArray(rows));
  const row=rows.find(r=>r.employeeId==='e001');assert.equal(row.targetHours,37.5);assert.equal(row.delta,row.hours-37.5);assert.equal(row.isPartialWeek,false);
  const zero=analyzeDraftV3({...d,shifts:[]}).weeklyHours;assert.equal(zero.length,2);assert.equal(zero[0].hours,0);assert.equal(zero[0].delta,-37.5);assert.equal(zero[1].delta,null);
});
function invariants(i,r){
  const people=new Map(i.employees.map(e=>[e.id,e]));const intervals=new Map();
  assert.equal(new Set(r.shifts.map(s=>s.id)).size,r.shifts.length);
  assert.equal(r.employeeHours.length,i.employees.filter(e=>e.isActive).length);
  assert.ok(r.warnings.every(w=>w.blocking===false));
  assert.ok(r.shifts.length<=v3.expandCoverageSlots(i.config,i.periodStart,i.periodEnd).length);
  for(const s of r.shifts){
    const e=people.get(s.employeeId);assert.ok(e?.isActive);assert.ok(s.date>=i.periodStart&&s.date<=i.periodEnd);
    assert.match(s.startTime,/^([01]\d|2[0-3]):(00|15|30|45)$/);assert.match(s.endTime,/^([01]\d|2[0-3]):(00|15|30|45)$/);
    const start=Number(s.startTime.slice(0,2))*60+Number(s.startTime.slice(3));const end=Number(s.endTime.slice(0,2))*60+Number(s.endTime.slice(3));
    assert.equal(s.durationHours,(end-start+1440)%1440/60);assert.equal(s.crossMidnight,end<start);
    const touched=[s.date,...(end<start&&end!==0?[dayAfter(s.date)]:[])];
    for(const d of touched){assert.notEqual(new Date(d+'T00:00:00Z').getUTCDay(),e.schedulerV3.fixedDayOff);assert.ok(!i.absences.some(a=>a.employeeId===e.id&&a.startDate<=d&&a.endDate>=d));}
    const absolute=Date.parse(s.date+'T00:00:00Z')+start*60000;
    const list=intervals.get(e.id)||[];list.push([absolute,absolute+s.durationHours*3600000]);intervals.set(e.id,list);
  }
  for(const list of intervals.values()){list.sort((a,b)=>a[0]-b[0]);for(let n=1;n<list.length;n++)assert.ok(list[n-1][1]<=list[n][0]);}
  for(const row of r.employeeHours){assert.equal(row.hours,r.shifts.filter(s=>s.employeeId===row.employeeId).reduce((sum,s)=>sum+s.durationHours,0));assert.equal(row.shiftCount,r.shifts.filter(s=>s.employeeId===row.employeeId).length);}
  for(const row of v3.calculateWeeklyEmployeeHoursV3(i.employees,r.shifts,i.periodStart,i.periodEnd,i.config.weekStartDay)){
    assert.equal(row.targetHours,people.get(row.employeeId).schedulerV3.targetWeeklyHours);assert.equal(row.delta,row.targetHours===null?null:row.hours-row.targetHours);assert.equal(row.hours*4,Math.round(row.hours*4));
  }
  for(const date of v3.eachDateInRange(i.periodStart,i.periodEnd))for(const slot of i.config.coverageRequirements.find(d=>d.weekday===v3.getWeekdayForDate(date)).slots){
    const count=r.shifts.filter(s=>s.date===date&&s.shiftTemplateId===slot.shiftTemplateId).length;
    assert.equal(r.warnings.filter(w=>w.code==='COVERAGE_UNDER_TARGET'&&w.date===date&&w.details.shiftTemplateId===slot.shiftTemplateId).length,count<slot.headcount?1:0);
  }
}
const staffCounts=[1,2,3,4,5,6,8,10,20,50,100];
for(const n of staffCounts){
  const before=failures.length;
  for(const period of ['WEEK','MONTH'])test(`pool ${n} ${period}`,()=>{
    const i=input(n,period);const r=v3.generateScheduleV3(i);invariants(i,r);
    assert.ok(i.employees.every(e=>e.schedulerV3.workMode==='NORMAL'));
    assert.equal(r.shifts.length,period==='WEEK'?7:30);
    assert.deepEqual(v3.generateScheduleV3({...i,employees:[...i.employees].reverse()}),r);
    assert.ok(i.employees.every(e=>eligible(e,i.periodStart,times()).eligible));
  });
  console.log(`STAFF_COUNT=${n} WEEK_MONTH=${failures.length===before?'PASS':'FAIL'}`);
}
for(const period of ['WEEK','MONTH'])test(`101 total inputs rejected ${period}`,()=>{
  const i=input(101,period);assert.throws(()=>v3.generateScheduleV3(i));i.employees[100].isActive=false;assert.throws(()=>v3.generateScheduleV3(i));
});
for(const n of [4,5,10])for(const period of ['WEEK','MONTH'])test(`current roster lifecycle ${n}->${n+1} ${period}`,()=>{
  const i=input(n,period,times(),n);const before=v3.generateScheduleV3(i);const saved=JSON.stringify(before);
  const next={...i,employees:input(n+1,period).employees};const r=v3.generateScheduleV3(next);
  assert.ok(r.shifts.some(s=>s.employeeId===next.employees.at(-1).id));assert.equal(r.shifts.length,before.shifts.length);assert.equal(JSON.stringify(before),saved);invariants(next,r);
});
for(const n of [10,20])for(const period of ['WEEK','MONTH'])for(const shortage of [false,true])test(`mixed ${n-2}+2 ${period} shortage=${shortage}`,()=>{
  const i=input(n,period,times(),shortage?n:n-2);i.employees.slice(-2).forEach(e=>e.schedulerV3=profile({workMode:'SUBSTITUTE_ONLY'}));
  const r=v3.generateScheduleV3(i);invariants(i,r);assert.equal(r.shifts.some(s=>Number(s.employeeId.slice(1))>n-2),shortage);
});
for(const period of ['WEEK','MONTH'])for(const fixedDayOff of [null,0,1,2,3,4,5,6])test(`fixed day ${fixedDayOff} ${period}`,()=>{
  const i=input(8,period,times(),4);i.employees.forEach(e=>e.schedulerV3=profile({fixedDayOff}));invariants(i,v3.generateScheduleV3(i));
  i.employees.forEach((e,n)=>e.schedulerV3=profile({fixedDayOff:n%7}));invariants(i,v3.generateScheduleV3(i));
});
const targets=[null,20,24,32,37.5,40];
const ranges=[times(),times('14:00','22:00'),times('10:00','18:00'),times('07:30','15:30'),times('22:00','06:00')];
for(const period of ['WEEK','MONTH'])for(const targetWeeklyHours of targets)for(const range of ranges)test(`target/time ${targetWeeklyHours} ${range.startTime} ${period}`,()=>{
  const i=input(6,period,range,2);i.employees.forEach((e,n)=>e.schedulerV3=profile({standardShift:range,targetWeeklyHours:n%2?targets[n]:targetWeeklyHours}));invariants(i,v3.generateScheduleV3(i));
});
test('soft quarter-hour target never creates or caps demand',()=>{
  const i=input(1,'WEEK',times('07:30','15:45'));i.employees[0].schedulerV3=profile({targetWeeklyHours:20});
  const r=v3.generateScheduleV3(i);assert.equal(r.shifts.length,7);assert.equal(r.employeeHours[0].hours,57.75);invariants(i,r);
});
for(const period of ['WEEK','MONTH'])for(const demand of [0,1,4,6])test(`demand ${demand} staff4 ${period}`,()=>{const i=input(4,period,times(),demand);const r=v3.generateScheduleV3(i);invariants(i,r);assert.equal(r.shifts.length,Math.min(4,demand)*(period==='WEEK'?7:30));});
for(const period of ['WEEK','MONTH'])test(`dense 100 ${period}`,()=>{const i=input(100,period,times(),100);const r=v3.generateScheduleV3(i);assert.equal(r.shifts.length,100*(period==='WEEK'?7:30));invariants(i,r);});
for(const workMode of ['NORMAL','SUBSTITUTE_ONLY'])test(`physical constraints ${workMode}`,()=>{
  const e=input(1).employees[0];e.schedulerV3=profile({workMode});
  assert.equal(eligible({...e,isActive:false},'2026-09-07',times()).eligible,false);
  assert.equal(eligible({...e,activeTo:'2026-09-07'},'2026-09-07',times('22:00','06:00')).eligible,false);
  assert.equal(eligible(e,'2026-09-07',times(),[],[],{maxDailyHours:4}).eligible,false);
  const prior={id:'prior',employeeId:e.id,date:'2026-09-06',...times('22:00','06:00'),crossMidnight:true,durationHours:8};
  assert.equal(eligible(e,'2026-09-07',times(),[],[prior],{minRestIntervalHours:11}).eligible,false);
  assert.equal(eligible(e,'2026-09-07',times('05:00','13:00'),[],[prior]).eligible,false);
});
for(const period of ['WEEK','MONTH'])test(`absence + fallback + shortage ${period}`,()=>{
  const i=input(4,period,times(),3);i.employees[3].schedulerV3=profile({workMode:'SUBSTITUTE_ONLY'});
  i.absences=[absence('e001',i.periodStart,i.periodEnd),absence('e002',i.periodStart,i.periodEnd)];
  const r=v3.generateScheduleV3(i);invariants(i,r);assert.ok(r.shifts.some(s=>s.employeeId==='e004'));assert.ok(r.coverageSummary.unfilledSlots>0);
  i.absences.push(absence('e003',i.periodStart,i.periodEnd),absence('e004',i.periodStart,i.periodEnd));assert.equal(v3.generateScheduleV3(i).shifts.length,0);
});
test('automatic normal and fallback assignments stay inside operating windows',()=>{
  for(const workMode of ['NORMAL','SUBSTITUTE_ONLY']){
    const i=input(1);i.employees[0].schedulerV3=profile({workMode});
    i.config.operatingDays.forEach(d=>d.windows=[{openTime:'09:00',closeTime:'17:00',crossMidnight:false}]);
    const r=v3.generateScheduleV3(i);assert.equal(r.shifts.length,0);assert.equal(r.coverageSummary.unfilledSlots,7);assert.ok(r.warnings.every(w=>!w.blocking));
  }
});
test('cancelled absences do not prevent regeneration',()=>{
  const i=input(1);const d=createDraftV3(i,'cancelled');const next=refreshDraftPeopleV3(d,i.employees,[{...absence('e001',i.periodStart,i.periodEnd),status:'CANCELLED'}]);assert.equal(next.absences.length,0);assert.equal(createDraftV3(next,'again').shifts.length,7);
});
function rotatingInput(period){
  const i=input(2,period);const afternoon=times('14:00','22:00');
  i.config.shiftTemplates.push({...i.config.shiftTemplates[0],id:'alternate',...afternoon});
  i.config.coverageRequirements.forEach(d=>d.slots.push({shiftTemplateId:'alternate',headcount:1}));
  i.config.operatingDays.forEach(d=>d.windows=[{openTime:'06:00',closeTime:'22:00',crossMidnight:false}]);
  i.employees[0].schedulerV3=profile({standardShift:times(),rotateStandardShiftWeekly:true,rotationAlternateShift:afternoon,rotationAnchorWeekStart:'2026-09-07'});
  i.employees[1].schedulerV3=profile({standardShift:afternoon,rotateStandardShiftWeekly:true,rotationAlternateShift:times(),rotationAnchorWeekStart:'2026-09-07'});
  return i;
}
for(const period of ['WEEK','MONTH'])test(`independent rotation ${period}`,()=>{
  const i=rotatingInput(period);const r=v3.generateScheduleV3(i);invariants(i,r);
  assert.equal(r.shifts.find(s=>s.employeeId==='e001'&&s.date==='2026-09-07').startTime,'06:00');
  const next=v3.generateScheduleV3({...i,periodStart:'2026-09-14',periodEnd:'2026-09-20'});assert.equal(next.shifts.find(s=>s.employeeId==='e001').startTime,'14:00');
  i.employees[1].schedulerV3.rotateStandardShiftWeekly=false;invariants(i,v3.generateScheduleV3(i));
});
for(const [anchor,date,want] of [['2026-09-28','2026-10-05','14:00'],['2026-12-21','2026-12-28','14:00'],['2026-12-21','2027-01-04','06:00']])test(`rotation boundary ${date}`,()=>{
  const i=rotatingInput('WEEK');i.employees.forEach(e=>e.schedulerV3.rotationAnchorWeekStart=anchor);i.periodStart=date;i.periodEnd=date;
  assert.equal(v3.generateScheduleV3(i).shifts.find(s=>s.employeeId==='e001').startTime,want);
});
for(const period of ['WEEK','MONTH'])for(const variant of ['normal','mixed','rotation'])test(`100 deterministic runs ${period} ${variant}`,()=>{
  const i=variant==='rotation'?rotatingInput(period):input(10,period,times(),3);
  if(variant==='mixed')i.employees.slice(2).forEach(e=>e.schedulerV3=profile({workMode:'SUBSTITUTE_ONLY'}));
  const expected=v3.generateScheduleV3(i);for(let n=0;n<100;n++)assert.deepEqual(v3.generateScheduleV3(i),expected);
  assert.deepEqual(v3.generateScheduleV3({...i,employees:[...i.employees].reverse()}),expected);
});
console.log('DETERMINISM_REPEATS=100 INPUTS=6 WEEK_MONTH=YES');
console.log(`V3 large-staff tests PASS=${passed} FAIL=${failures.length} ASSERTIONS=${assertions}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
