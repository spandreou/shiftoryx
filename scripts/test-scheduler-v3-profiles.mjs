import strict from 'node:assert/strict';
import * as v3 from '../src/scheduler-engine-v3/index.ts';
import * as service from '../src/services/schedulerV3Service.ts';
import { buildPublicationV3 } from '../src/services/schedulePublicationService.ts';
let assertions=0,passed=0;const failures=[];
const assert=new Proxy(strict,{get(target,key){const method=target[key];return typeof method==='function'?(...args)=>{assertions++;return method(...args);}:method;}});
function test(name,fn){try{fn();passed++;}catch(error){failures.push(`${name}: ${error.message}`);}}
const range=(startTime,endTime)=>({startTime,endTime});
const morning=range('06:00','14:00'),afternoon=range('14:00','22:00'),night=range('22:00','06:00');
const template=(id,times,extra={})=>({id,label:id,shortCode:id,shiftType:'CUSTOM',...times,durationHours:8,crossMidnight:times.endTime<times.startTime,isActive:true,...extra});
const templates=[template('a',morning),template('b',afternoon)];
const old={workMode:'NORMAL',fixedDayOff:null,targetWeeklyHours:40,standardShiftTemplateId:'a',rotateStandardShiftWeekly:true,rotationAlternateShiftTemplateId:'b',rotationAnchorWeekStart:'2026-08-31'};
const canonical={profileVersion:2,workMode:'NORMAL',fixedDayOff:null,targetWeeklyHours:40,standardShift:morning,rotateStandardShiftWeekly:true,rotationAlternateShift:afternoon,rotationAnchorWeekStart:'2026-08-31'};
test('new profile defaults to versioned normal regardless of roster',()=>{
  assert.equal(v3.normalizeEmployeeProfileV3().profileVersion,2);
  assert.equal(v3.normalizeEmployeeProfileV3().workMode,'NORMAL');
  for(let count=1;count<=100;count++)assert.ok(service.mapEmployeesV3(Array.from({length:count},(_,n)=>({id:String(n),fullName:String(n)}))).every(e=>e.schedulerV3.workMode==='NORMAL'));
});
test('legacy dual read is exact, immutable and canonical single write',()=>{
  const before=structuredClone(old);const result=v3.decodeEmployeeProfileV3(old,templates);
  assert.deepEqual(result,{profile:canonical,diagnostics:[]});assert.deepEqual(old,before);
  assert.deepEqual(v3.decodeEmployeeProfileV3(result.profile,[]).profile,canonical);
  assert.deepEqual(Object.keys(result.profile).sort(),Object.keys(canonical).sort());
  assert.equal(v3.decodeEmployeeProfileV3(old,[]).profile,null);
  for(const list of [[...templates,templates[0]],[template('a',range('06:01','14:00')),templates[1]]]){
    const invalid=v3.decodeEmployeeProfileV3(old,list);assert.equal(invalid.profile,null);assert.ok(invalid.diagnostics.length);
  }
});
test('direct invalid values and unknown fields cannot be normalized away',()=>{
  for(const patch of [{profileVersion:3},{workMode:''},{fixedDayOff:'2'},{targetWeeklyHours:-1},{targetWeeklyHours:NaN},{targetWeeklyHours:169},{rotateStandardShiftWeekly:1},{rotationAnchorWeekStart:'2026-02-30'},{rotationAnchorWeekStart:'2026-09-08'},{standardShiftTemplateId:'a'},{unexpected:true},{standardShift:range('06:01','14:00')},{standardShift:range('14:00','14:00')},{standardShift:{...morning,extra:true}},{standardShift:'06:00'},{rotationAlternateShift:null}]){
    const raw={...canonical,...patch};assert.equal(v3.validateEmployeeProfileV3(v3.normalizeEmployeeProfileV3(raw)).valid,false);
    assert.equal(v3.decodeEmployeeProfileV3(raw,templates).profile,null);
  }
  for(const raw of [false,3,'bad',[]])assert.equal(v3.decodeEmployeeProfileV3(raw,templates).profile,null);
  assert.equal(v3.decodeEmployeeProfileV3({profileVersion:2},templates).profile,null);
  assert.equal(v3.validateEmployeeProfileV3(v3.normalizeEmployeeProfileV3({standardShift:night})).valid,true);
  const participationDiagnostic=v3.decodeEmployeeProfileV3({...canonical,workMode:'INVALID'},templates).diagnostics.join(' ');
  assert.match(participationDiagnostic,/Κανονική συμμετοχή/);
  assert.match(participationDiagnostic,/Μόνο για κάλυψη \/ αντικατάσταση/);
  assert.doesNotMatch(participationDiagnostic,/\bNORMAL\b|\bSUBSTITUTE_ONLY\b/);
});
test('rotation is time based, equal duration, circular nonoverlap and deduplicated',()=>{
  const base=v3.normalizeEmployeeProfileV3({standardShift:morning,rotateStandardShiftWeekly:true});
  const resolved=v3.applySimpleRotationV3(base,[...templates,template('duplicate',afternoon),template('overlap',range('10:00','18:00'))]);
  assert.equal(resolved.warning,null);assert.deepEqual(resolved.profile.rotationAlternateShift,afternoon);assert.equal(resolved.profile.rotationAnchorWeekStart,'2026-01-05');
  assert.deepEqual(v3.applySimpleRotationV3(resolved.profile,templates),resolved);
  assert.deepEqual(v3.resolveEffectiveStandardShift(resolved.profile,'2026-12-28'),afternoon);
  assert.deepEqual(v3.resolveEffectiveStandardShift(resolved.profile,'2027-01-04'),morning);
  const anchored=v3.applySimpleRotationV3(canonical,templates);assert.equal(anchored.profile.rotationAnchorWeekStart,'2026-08-31');
  assert.deepEqual(v3.resolveEffectiveStandardShift(anchored.profile,'2026-09-07'),afternoon);
  const overnight=v3.applySimpleRotationV3({...base,standardShift:night},[template('night',night),template('morning',morning),template('overlap',range('02:00','10:00'))]);
  assert.deepEqual(overnight.profile.rotationAlternateShift,morning);assert.equal(overnight.warning,null);
  for(const list of [[templates[0]],[templates[0],template('short',range('14:00','18:00'),{durationHours:4})],[templates[0],{...templates[1],isActive:false}],[...templates,template('night',night)]]){
    const result=v3.applySimpleRotationV3(base,list);assert.equal(result.profile.rotationAlternateShift,null);assert.ok(result.warning);assert.equal(v3.validateEmployeeProfileV3(result.profile).valid,false);
  }
});
test('generator ranks exact standard times before target deficit; warning ignores IDs',()=>{
  const config=service.makeDefaultConfigV3('tenant-a');const employees=service.mapEmployeesV3([
    {id:'a',fullName:'A',schedulerV3:v3.normalizeEmployeeProfileV3({targetWeeklyHours:100})},
    {id:'b',fullName:'B',schedulerV3:v3.normalizeEmployeeProfileV3({standardShift:range('08:00','16:00'),targetWeeklyHours:0})},
  ],config);
  const draft=service.createDraftV3({config,employees,absences:[],periodType:'WEEK',periodStart:'2026-09-07',periodEnd:'2026-09-07',options:{balanceWeeklyTargets:true}},'direct');
  assert.equal(draft.shifts[0].employeeId,'b');
  const manual={...draft.shifts[0],shiftTemplateId:null,source:'MANUAL'};
  assert.ok(!v3.analyzeScheduleWarningsV3(config,employees,[],[manual],draft.periodStart,draft.periodEnd).some(w=>w.code==='STANDARD_SHIFT_DEVIATION'));
  assert.ok(v3.analyzeScheduleWarningsV3(config,employees,[],[{...manual,startTime:'09:00'}],draft.periodStart,draft.periodEnd).some(w=>w.code==='STANDARD_SHIFT_DEVIATION'));
});
test('draft legacy decode and publication restoration use their explicit config snapshots',()=>{
  const config=service.makeDefaultConfigV3('tenant-a');const raw=[{id:'a',fullName:'A',isActive:true,schedulerV3:{...old,standardShiftTemplateId:'day',rotateStandardShiftWeekly:false,rotationAlternateShiftTemplateId:null}}];
  const before=structuredClone(raw);const draft=service.createDraftV3({config,employees:raw,absences:[],periodType:'WEEK',periodStart:'2026-09-07',periodEnd:'2026-09-13',options:{balanceWeeklyTargets:true}},'old');
  assert.deepEqual(draft.employees[0].schedulerV3.standardShift,range('08:00','16:00'));assert.deepEqual(raw,before);
  const decoded=service.decodeDraftProfilesV3({...draft,employees:raw});assert.deepEqual(decoded.employees[0].schedulerV3,draft.employees[0].schedulerV3);
  const pub=buildPublicationV3(draft,{tenantId:'tenant-a',uid:'owner',id:'pub',version:1,timestamp:'2026-09-07T10:00:00Z',acceptWarnings:true});const saved=structuredClone(pub);
  const currentConfig=structuredClone(config);currentConfig.shiftTemplates[0]={...currentConfig.shiftTemplates[0],...morning};
  assert.throws(()=>service.createDraftFromPublicationV3(pub,{id:'missing-config',employees:raw}));
  const restored=service.createDraftFromPublicationV3(pub,{id:'restore',employees:raw,currentConfig});
  assert.deepEqual(restored.employees[0].schedulerV3.standardShift,morning);assert.deepEqual(restored.config,config);assert.deepEqual(pub,saved);
  const direct=service.createDraftFromPublicationV3(pub,{id:'restore-direct',employees:draft.employees});assert.equal(direct.employees[0].schedulerV3.profileVersion,2);
});
console.log(`V3 profile tests PASS=${passed} FAIL=${failures.length} ASSERTIONS=${assertions}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
