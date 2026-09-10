import assert from 'node:assert/strict';
import * as service from '../src/services/schedulerV3Service.ts';
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
console.log('V3 employee/create export payload PASS assertions=58');
