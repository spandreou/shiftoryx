import assert from 'node:assert/strict';
import * as v3 from '../src/scheduler-engine-v3/index.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (error) { failures.push(`${name}: ${error.message}`); }
}
export function fixture() {
  const template = { id: 'day', label: 'Ημέρα', shortCode: 'ΗΜ', shiftType: 'MORNING', startTime: '08:00', endTime: '16:00', durationHours: 8, crossMidnight: false, isActive: true };
  const config = v3.normalizeSchedulerConfigV3({ tenantId: 'test-tenant', templateId: 'scheduler-standard', shiftTemplates: [template] });
  config.coverageRequirements = config.operatingDays.map(d => ({ weekday: d.weekday, slots: [{ shiftTemplateId: 'day', headcount: 1 }] }));
  const employees = ['a', 'b', 'c'].map(id => ({ id, fullName: id, isActive: true, schedulerV3: v3.normalizeEmployeeProfileV3() }));
  return { config, employees, absences: [], periodStart: '2026-09-07', periodEnd: '2026-09-13', periodType: 'WEEK', options: { balanceWeeklyTargets: true } };
}
function manual(input, fields = {}) {
  return { id: 'manual', employeeId: 'a', employeeName: 'a', date: input.periodStart, shiftTemplateId: 'day', startTime: '08:00', endTime: '16:00', durationHours: 8, source: 'MANUAL', isManualOverride: true, schedulerSchemaVersion: 3, ...fields };
}
for (let quarter = 0; quarter < 96; quarter++) {
  const label = `${String(Math.floor(quarter / 4)).padStart(2, '0')}:${String((quarter % 4) * 15).padStart(2, '0')}`;
  test(`quarter ${label} valid`, () => assert.equal(v3.isValidTimeV3(label), true));
  test(`quarter ${label} minutes`, () => assert.equal(v3.timeToMinutesV3(label), quarter * 15));
}
test('baseline config', () => assert.equal(v3.validateSchedulerConfigV3(fixture().config).valid, true));
test('default normal', () => assert.equal(v3.normalizeEmployeeProfileV3().workMode, 'NORMAL'));
test('complete result deterministic', () => {
  const input = fixture(); const before = JSON.stringify(input);
  const first = v3.generateScheduleV3(input);
  const start = Date.now(); while (Date.now() === start) { /* advance clock without changing inputs */ }
  assert.deepEqual(v3.generateScheduleV3(input), first);
  assert.equal(JSON.stringify(input), before);
});
test('array order cannot alter output', () => {
  const a = fixture(), b = structuredClone(a); b.employees.reverse();
  assert.deepEqual(v3.generateScheduleV3(a), v3.generateScheduleV3(b));
});
for (let n = 1; n <= 30; n++) {
  test(`pool ${n} headcount and zero-hours visibility`, () => {
    const input = fixture(); input.employees = Array.from({ length: n }, (_, i) => ({ ...input.employees[0], id: `e${i}`, fullName: `e${i}` }));
    const result = v3.generateScheduleV3(input);
    assert.equal(result.shifts.length, 6); assert.equal(result.employeeHours.length, n);
    assert.ok(result.warnings.every(w => w.blocking === false));
    assert.deepEqual(v3.generateScheduleV3(input), result);
  });
}
for (let week = -26; week <= 26; week++) {
  test(`rotation continuity ${week}`, () => {
    const d = new Date('2026-01-05T00:00:00Z'); d.setUTCDate(d.getUTCDate() + week * 7);
    assert.equal(v3.computeRotationWeekParity(d.toISOString().slice(0, 10), '2026-01-05'), Math.abs(week) % 2);
  });
}
for (const [name, mutate] of [
  ['null operating day', c => c.operatingDays[0] = null],
  ['duplicate day', c => c.operatingDays[1].weekday = 'MONDAY'],
  ['invalid day', c => c.operatingDays[0].weekday = 'FUNDAY'],
  ['NaN duration', c => c.shiftTemplates[0].durationHours = NaN],
  ['duration mismatch', c => c.shiftTemplates[0].durationHours = 1],
  ['32-hour window', c => c.operatingDays[0].windows[0].crossMidnight = true],
  ['duplicate demand template', c => c.coverageRequirements[0].slots.push({ shiftTemplateId: 'day', headcount: 1 })],
  ['unknown template', c => c.coverageRequirements[0].slots[0].shiftTemplateId = 'missing'],
  ['NaN policy', c => c.warningPolicies = { maxDailyHours: NaN }],
  ['fractional week start', c => c.weekStartDay = 1.5],
  ['role demand', c => c.coverageRequirements[0].slots[0].requiredRole = 'CORE_A'],
  ['infinite headcount', c => c.coverageRequirements[0].slots[0].headcount = Infinity],
]) test(name, () => { const { config } = fixture(); mutate(config); assert.equal(v3.validateSchedulerConfigV3(config).valid, false); });
test('shortage remains editable', () => { const i = fixture(); i.employees = []; const r = v3.generateScheduleV3(i); assert.equal(r.coverageSummary.unfilledSlots, 6); assert.ok(r.warnings.every(w => !w.blocking)); });
test('substitute excluded automatically', () => { const i = fixture(); i.employees.forEach(e => e.schedulerV3.workMode = 'SUBSTITUTE_ONLY'); assert.equal(v3.generateScheduleV3(i).shifts.length, 0); });
test('fixed days off and absences', () => { const i = fixture(); i.employees = [i.employees[0]]; i.employees[0].schedulerV3.fixedDayOff = 1; i.absences = [{id:'absence', employeeId:'a',type:'LEAVE',startDate:'2026-09-08',endDate:'2026-09-09',scope:'FULL_DAY'}]; const r=v3.generateScheduleV3(i); assert.ok(r.shifts.every(s => s.date >= '2026-09-10')); });
test('manual deviation retained with warning', () => { const i = fixture(); i.employees[0].schedulerV3.fixedDayOff=1; i.existingManualShifts=[manual(i)]; const r=v3.generateScheduleV3(i); assert.ok(r.shifts.some(s=>s.id==='manual')); assert.ok(r.warnings.some(w=>w.code==='FIXED_DAY_OFF_OVERRIDE')); });
test('cross-midnight overlap warning', () => { const i=fixture(); const shifts=[manual(i,{startTime:'22:00',endTime:'06:00',durationHours:8,crossMidnight:true}),manual(i,{id:'next',date:'2026-09-08',startTime:'05:00',endTime:'13:00'})]; assert.ok(v3.analyzeScheduleWarningsV3(i.config,i.employees,[],shifts,i.periodStart,i.periodEnd).some(w=>w.code==='SHIFT_OVERLAP')); });
test('closed day custom work warns', () => { const i=fixture(); assert.ok(v3.analyzeScheduleWarningsV3(i.config,i.employees,[],[manual(i,{date:'2026-09-13',shiftTemplateId:null})],i.periodStart,i.periodEnd).some(w=>w.code==='OUTSIDE_OPERATING_WINDOW')); });
test('standard deviation analyzer', () => { const i=fixture(); i.employees[0].schedulerV3.standardShiftTemplateId='other'; assert.ok(v3.analyzeScheduleWarningsV3(i.config,i.employees,[],[manual(i)],i.periodStart,i.periodEnd).some(w=>w.code==='STANDARD_SHIFT_DEVIATION')); });
test('rotation configuration warning', () => { const i=fixture(); i.employees[0].schedulerV3.rotateStandardShiftWeekly=true; assert.ok(v3.analyzeScheduleWarningsV3(i.config,i.employees,[],[],i.periodStart,i.periodEnd).some(w=>w.code==='ROTATION_CONFIGURATION_WARNING')); });
test('date input fails structurally', () => { const i=fixture(); i.periodStart='not-a-date'; assert.throws(()=>v3.generateScheduleV3(i)); });
test('overnight rest includes midnight rollover', () => { const i=fixture(); const e=i.employees[0]; const s=manual(i,{date:'2026-09-06',startTime:'22:00',endTime:'06:00',crossMidnight:true}); assert.equal(v3.evaluateEmployeeEligibilityV3(e,'2026-09-07',[],[s],'08:00',{minRestIntervalHours:11,shiftEndTime:'16:00',shiftDurationHours:8}).reason,'REST_INTERVAL'); });
test('prospective daily hours counted', () => { const i=fixture(); assert.equal(v3.evaluateEmployeeEligibilityV3(i.employees[0],i.periodStart,[],[],'08:00',{maxDailyHours:6,shiftDurationHours:8}).reason,'DAILY_HOURS_EXCEEDED'); });
test('consecutive days include candidate', () => { const i=fixture(); const prior=['2026-09-04','2026-09-05','2026-09-06'].map((date,n)=>manual(i,{date,id:String(n)})); assert.equal(v3.evaluateEmployeeEligibilityV3(i.employees[0],i.periodStart,[],prior,'08:00',{maxConsecutiveWorkingDays:3}).reason,'CONSECUTIVE_DAYS_EXCEEDED'); });
test('unknown manual employee is technical error', () => { const i=fixture(); i.existingManualShifts=[manual(i,{employeeId:'foreign'})]; assert.throws(()=>v3.generateScheduleV3(i)); });
console.log(`V3 tests: PASS=${passed} FAIL=${failures.length}`);
if (failures.length) { console.error(failures.join('\n')); process.exitCode=1; }
