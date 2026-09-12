import nodeAssert from 'node:assert/strict';
import * as service from '../src/services/schedulerV3Service.ts';
import { buildWhatsappSummary } from '../src/utils/whatsappExport.js';
let assertions=0;
const assert=new Proxy(nodeAssert,{get(target,key){const fn=target[key];return typeof fn==='function'?(...args)=>{assertions++;return fn(...args);}:fn;}});
assert.equal(typeof service.buildV3EmployeePayload,'function');
for(const n of [5,6,20,100]){
  const payload=service.buildV3EmployeePayload({fullName:'  Εργαζόμενος '+n+'  ',scheduleRole:'EXTRA_A',workMode:'SUBSTITUTE_ONLY'});
  assert.equal(payload.fullName,'Εργαζόμενος '+n);
  assert.equal(payload.schedulerV3.profileVersion,2);assert.equal(payload.schedulerV3.workMode,'NORMAL');assert.equal(payload.isActive,true);
  for(const key of ['scheduleRole','roleType','extraMode','fixedDayOff','participatesInRotation','participatesInSundayRotation','defaultShiftPreference','weeklyFixedShiftSideRotation'])assert.equal(Object.hasOwn(payload,key),false);
}
assert.throws(()=>service.buildV3EmployeePayload({fullName:' '}));
assert.throws(()=>service.buildV3EmployeePayload({fullName:'x'.repeat(201)}));
assert.throws(()=>service.buildV3EmployeePayload({fullName:{}}));
const config=service.makeDefaultConfigV3('test-only');
const employees=service.mapEmployeesV3([{id:'e1',fullName:'One',email:'PRIVATE',scheduleRole:'CORE_A'},{id:'e2',fullName:'Zero'}]);
const draft=service.createDraftV3({config,employees,absences:[],periodType:'WEEK',periodStart:'2026-09-07',periodEnd:'2026-09-13',options:{balanceWeeklyTargets:true}},'export');
const payload=service.buildV3ExportPayload(draft);
assert.deepEqual(payload.employees,[{id:'e1',fullName:'One'},{id:'e2',fullName:'Zero'}]);
assert.equal(payload.weekDays.length,7);assert.equal(payload.shifts.length,draft.shifts.length);
assert.ok(!JSON.stringify(payload).includes('PRIVATE'));assert.ok(!JSON.stringify(payload).includes('schedulerV3'));assert.ok(!JSON.stringify(payload).includes('scheduleRole'));
assert.deepEqual(payload.weekdayLabels,['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο','Κυριακή']);
for(const [periodStart,periodEnd,count,first,eighth,last] of [
  ['2026-09-01','2026-09-30',30,'Τρίτη','Τρίτη','Τετάρτη'],
  ['2028-02-01','2028-02-29',29,'Τρίτη','Τρίτη','Τρίτη'],
]){
  const month=service.createDraftV3({...draft,periodType:'MONTH',periodStart,periodEnd},'month-export');
  const exported=service.buildV3ExportPayload(month);
  assert.equal(exported.weekdayLabels.length,count);
  assert.equal(exported.weekdayLabels[0],first);
  assert.equal(exported.weekdayLabels[7],eighth);
  assert.equal(exported.weekdayLabels.at(-1),last);
  const summary=buildWhatsappSummary(exported);
  assert.ok(!summary.includes('undefined'));
  assert.ok(summary.includes(`Τρίτη (08/${periodStart.slice(5,7)}/${periodStart.slice(0,4)})`));
}
console.log(`V3 employee/create export payload PASS assertions=${assertions}`);
