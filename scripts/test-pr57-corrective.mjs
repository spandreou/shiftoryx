import assert from 'node:assert/strict';
import * as service from '../src/services/schedulerV3Service.ts';
import * as profiles from '../src/scheduler-engine-v3/employeeProfile.ts';
import { buildPublicationV3 } from '../src/services/schedulePublicationService.ts';
const config=service.makeDefaultConfigV3('tenant-a');
config.shiftTemplates.push({...config.shiftTemplates[0],id:'afternoon',shiftType:'AFTERNOON',startTime:'16:00',endTime:'20:00',durationHours:4});
const employees=service.mapEmployeesV3([{id:'a',fullName:'Μαρία',isActive:true}]);
const input={config,employees,absences:[],periodType:'WEEK',periodStart:'2026-09-07',periodEnd:'2026-09-13',options:{balanceWeeklyTargets:true}};
const draft=service.createDraftV3(input,'base-draft');
let passed=0;const failures=[];
function test(name,fn){try{fn();passed++;}catch(error){failures.push(name+': '+error.message);}}
for(const workMode of ['NORMAL','SUBSTITUTE_ONLY'])for(const targetWeeklyHours of [32,null]){
  test(`new employee preserves ${workMode}/${targetWeeklyHours}`,()=>{
    const profile=profiles.normalizeEmployeeProfileV3({workMode,targetWeeklyHours,fixedDayOff:2,standardShiftTemplateId:'day',rotateStandardShiftWeekly:true,rotationAlternateShiftTemplateId:'afternoon',rotationAnchorWeekStart:'2026-09-07'});
    const added={id:'new',fullName:'Νέος',isActive:true,schedulerV3:profile};
    const result=service.refreshDraftPeopleV3(draft,[...employees,added],[]);
    assert.deepEqual(result.employees.find(e=>e.id==='new').schedulerV3,profile);
    assert.equal(service.analyzeDraftV3(result).employeeHours.find(h=>h.employeeId==='new').hours,0);
    const targetWarnings=service.analyzeDraftV3(result).warnings.filter(w=>w.employeeId==='new'&&w.code==='TARGET_HOURS_UNDER');
    assert.equal(targetWarnings.length,targetWeeklyHours===null?0:1);
    if(targetWeeklyHours!==null)assert.equal(targetWarnings[0].details.target,32);
    const generated=service.createDraftV3(result,'regenerated').shifts.filter(s=>s.employeeId==='new');
    assert.equal(generated.some(s=>s.date==='2026-09-08'),false,'fixed Tuesday off remains enforced');
    if(workMode==='SUBSTITUTE_ONLY')assert.equal(generated.length,0);
    else assert.ok(generated.length>0,'normal new employee participates in generation');
    result.employees.find(e=>e.id==='new').schedulerV3.fixedDayOff=3;
    assert.equal(profile.fixedDayOff,2,'profile snapshot must not alias current data');
  });
}
test('simple rotation chooses opposite and stable anchor',()=>{
  assert.equal(typeof profiles.applySimpleRotationV3,'function');
  const p=profiles.normalizeEmployeeProfileV3({standardShiftTemplateId:'day',rotateStandardShiftWeekly:true});
  const result=profiles.applySimpleRotationV3(p,config.shiftTemplates);
  assert.equal(result.profile.rotationAlternateShiftTemplateId,'afternoon');
  assert.equal(result.profile.rotationAnchorWeekStart,'2026-01-05');
  assert.deepEqual(profiles.applySimpleRotationV3(result.profile,config.shiftTemplates),result);
  assert.equal(profiles.resolveEffectiveStandardShift(result.profile,'2026-12-28'),'afternoon');
  assert.equal(profiles.resolveEffectiveStandardShift(result.profile,'2027-01-04'),'day');
});
test('ambiguous or custom rotation never guesses',()=>{
  assert.equal(typeof profiles.applySimpleRotationV3,'function');
  const p=profiles.normalizeEmployeeProfileV3({standardShiftTemplateId:'day',rotateStandardShiftWeekly:true});
  const ambiguous=profiles.applySimpleRotationV3(p,[...config.shiftTemplates,{...config.shiftTemplates[1],id:'other'}]);
  assert.equal(ambiguous.profile.rotationAlternateShiftTemplateId,null);assert.ok(ambiguous.warning);
  const custom=profiles.applySimpleRotationV3(p,[{...config.shiftTemplates[0],shiftType:'CUSTOM'},config.shiftTemplates[1]]);
  assert.equal(custom.profile.rotationAlternateShiftTemplateId,null);assert.ok(custom.warning);
});
test('reverse rotation and missing/intermediate patterns are explicit',()=>{
  const reverse=profiles.applySimpleRotationV3(profiles.normalizeEmployeeProfileV3({standardShiftTemplateId:'afternoon',rotateStandardShiftWeekly:true,rotationAnchorWeekStart:'2026-08-31'}),config.shiftTemplates);
  assert.equal(reverse.profile.rotationAlternateShiftTemplateId,'day');
  assert.equal(reverse.profile.rotationAnchorWeekStart,'2026-08-31');
  assert.equal(profiles.resolveEffectiveStandardShift(reverse.profile,'2026-09-07'),'day');
  const p=profiles.normalizeEmployeeProfileV3({standardShiftTemplateId:'day',rotateStandardShiftWeekly:true});
  for(const templates of [[config.shiftTemplates[0]],[config.shiftTemplates[0],{...config.shiftTemplates[1],isActive:false}],[{...config.shiftTemplates[0],shiftType:'INTERMEDIATE'},config.shiftTemplates[1]]]){
    const result=profiles.applySimpleRotationV3(p,templates);
    assert.equal(result.profile.rotationAlternateShiftTemplateId,null);assert.ok(result.warning);
  }
});
test('publication clone is new editable draft with immutable origin',()=>{
  assert.equal(typeof service.createDraftFromPublicationV3,'function');
  const pub=buildPublicationV3(draft,{tenantId:'tenant-a',uid:'owner',id:'v1',version:1,timestamp:'2026-09-07T10:00:00Z'});
  const before=structuredClone(pub);
  const restored=service.createDraftFromPublicationV3(pub,{id:'restored',tenantId:'tenant-a',employees,absences:[]});
  assert.equal(restored.sourcePublicationId,'v1');assert.equal(restored.id,'restored');assert.equal(restored.revision,0);
  assert.equal(restored.shifts.length,pub.shifts.length);assert.equal(restored.shifts[0].draftId,'restored');
  restored.shifts[0].startTime='09:00';assert.deepEqual(pub,before);
  assert.throws(()=>service.createDraftFromPublicationV3(pub,{id:'bad',tenantId:'tenant-b',employees,absences:[]}));
});
console.log(`PR57 corrective tests PASS=${passed} FAIL=${failures.length}`);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
