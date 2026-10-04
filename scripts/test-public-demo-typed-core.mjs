import assert from 'node:assert/strict';
import {initialAdmissionState,initialAuditReceiptState} from '../functions/src/public-demo/admission.ts';
import {publicDemoFixture} from '../functions/src/public-demo/fixtures.ts';
import {createDraftV3,mapAbsencesV3} from '../src/services/schedulerV3Service.ts';

const typed=await import('../functions/src/public-demo/mutations-core.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
assert.equal(typeof typed.createTypedMutationCore,'function','typed demo mutation core missing');
const uuid='12345678-1234-4123-8123-123456789abc',tenant='demo-fuel',generation=7,uid='demo-fuel-owner-g7';
const identity={tenant,uid,generation,reverify:async()=>{}};
const fixture=publicDemoFixture(tenant,new Date('2026-09-30T12:00:00Z'));
class LocalDatabase {
  constructor(){this.rows=new Map([
    [`demoState/${tenant}`,{generation,resetting:false}],
    [`tenantMemberships/${uid}_${tenant}`,{uid,tenantId:tenant,role:'OWNER',status:'ACTIVE'}],
    [`tenants/${tenant}`,{id:tenant,slug:tenant,isDemo:true,status:'ACTIVE'}],
    [`demoAdmission/${tenant}`,initialAdmissionState(tenant,generation,fixture.employees.length,fixture.absences.length)],
    [`demoAuditReceipts/${tenant}`,initialAuditReceiptState(tenant,generation)],
    [`tenants/${tenant}/settings/scheduler`,{schedulerSchemaVersion:3,schedulerConfigV3:fixture.config}],
  ]);for(const {id,...employee}of fixture.employees){
      this.rows.set(`tenants/${tenant}/employees/${id}`,employee);
      this.rows.set(`tenants/${tenant}/publicEmployees/${id}`,typed.demoPublicEmployeeProjection(tenant,employee));
    }
    for(const absence of fixture.absences)this.rows.set(`tenants/${tenant}/absences/${absence.id}`,absence);
    this.tail=Promise.resolve();}
  async transaction(run){const before=this.tail;let release;this.tail=new Promise(resolve=>release=resolve);await before;
    const next=structuredClone(this.rows);let wrote=false,writeCount=0;
    const tx={get:async path=>{assert.equal(wrote,false,'Firestore reads must precede writes');return structuredClone(next.get(path));},
      list:async(path,limit)=>{assert.equal(wrote,false);return [...next.entries()].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).slice(0,limit).map(([key,data])=>({id:key.slice(path.length+1),data:structuredClone(data)}));},
      set:(path,value)=>{wrote=true;writeCount++;next.set(path,structuredClone(value));},
      create:(path,value)=>{wrote=true;writeCount++;assert.equal(next.has(path),false,'create cannot overwrite');next.set(path,structuredClone(value));},
      delete:path=>{wrote=true;writeCount++;next.delete(path)}};
    try{const result=await run(tx);this.rows=next;this.lastCommitWrites=writeCount;return result;}finally{release();}}
}
const db=new LocalDatabase(),core=typed.createTypedMutationCore({database:db,now:()=>Date.parse('2026-09-30T12:00:00Z')});
await assert.rejects(()=>core.execute(identity,{operation:'writeAnything',commandId:'emp_'+uuid,payload:{path:'tenants/demo-cafe/employees/x'}}),{code:'MUTATION_INVALID_REQUEST'});
const command={operation:'emp.create',commandId:'emp_'+uuid,payload:{fullName:'Φανταστική Άννα'}};
await assert.rejects(()=>core.execute(identity,{...command,commandId:'emp_92345678-1234-4123-8123-123456789abc',
  payload:{fullName:'Ά'.repeat(101)}}),{code:'MUTATION_INVALID_REQUEST'});
const result=await core.execute(identity,command);
assert.deepEqual(result,{id:'de_'+uuid,status:'created'});
const privateRow=db.rows.get(`tenants/${tenant}/employees/${result.id}`),publicRow=db.rows.get(`tenants/${tenant}/publicEmployees/${result.id}`);
assert.equal(privateRow.fullName,'Φανταστική Άννα');assert.equal(privateRow.isActive,true);
assert.equal(privateRow.schedulerV3.workMode,'NORMAL');
assert.deepEqual(publicRow,{tenantId:tenant,fullName:'Φανταστική Άννα',role:'',color:'#1D4ED8',isActive:true});
assert.equal(db.rows.get(`demoAdmission/${tenant}`).employeeCreates,fixture.employees.length+1);
assert.equal(db.rows.get(`demoAdmissionRate/${tenant}`).attempts,1);
assert.deepEqual(await core.execute(identity,command),result);
assert.equal(db.rows.get(`demoAdmission/${tenant}`).employeeCreates,fixture.employees.length+1,'replay cannot recharge');
await assert.rejects(()=>core.execute(identity,{...command,payload:{fullName:'Άλλο πρόσωπο'}}),{code:'ADMISSION_COMMAND_CONFLICT'});
await assert.rejects(()=>core.execute(identity,{...command,commandId:'emp_12345678-1234-4123-8123-123456789abd',payload:{fullName:'Ξένο',tenantId:'demo-cafe'}}),{code:'MUTATION_INVALID_REQUEST'});
console.log('PUBLIC_DEMO_TYPED_EMPLOYEE_CREATE_PASS');

const edit={operation:'emp.update',commandId:'emp_12345678-1234-4123-8123-123456789abd',
  payload:{id:result.id,fullName:'Φανταστική Άννα Β',color:'#334455',expectedRevision:0}};
assert.deepEqual(await core.execute(identity,edit),{id:result.id,status:'updated',revision:1});
assert.equal(db.rows.get(`tenants/${tenant}/employees/${result.id}`).fullName,'Φανταστική Άννα Β');
assert.equal(db.rows.get(`tenants/${tenant}/publicEmployees/${result.id}`).fullName,'Φανταστική Άννα Β');
await assert.rejects(()=>core.execute(identity,{...edit,commandId:'emp_12345678-1234-4123-8123-123456789abe'}),{code:'MUTATION_REVISION_CONFLICT'});
await assert.rejects(()=>core.execute(identity,{...edit,commandId:'emp_12345678-1234-4123-8123-123456789abf',payload:{...edit.payload,afm:'private'}}),{code:'MUTATION_INVALID_REQUEST'});
const active={operation:'emp.active',commandId:'emp_12345678-1234-4123-8123-123456789ac0',
  payload:{id:result.id,isActive:false,expectedRevision:1}};
assert.deepEqual(await core.execute(identity,active),{id:result.id,status:'updated',revision:2});
assert.equal(db.rows.get(`tenants/${tenant}/employees/${result.id}`).isActive,false);
assert.equal(db.rows.get(`tenants/${tenant}/publicEmployees/${result.id}`).isActive,false);
const deletion={operation:'emp.delete',commandId:'emp_12345678-1234-4123-8123-123456789ac1',
  payload:{id:result.id,expectedRevision:2}};
assert.deepEqual(await core.execute(identity,deletion),{id:result.id,status:'deleted'});
assert.equal(db.rows.has(`tenants/${tenant}/employees/${result.id}`),false);
assert.equal(db.rows.has(`tenants/${tenant}/publicEmployees/${result.id}`),false);
assert.equal(db.rows.get(`demoAdmission/${tenant}`).employeeCreates,fixture.employees.length+1,'delete cannot refund');
console.log('PUBLIC_DEMO_TYPED_EMPLOYEE_LIFECYCLE_PASS');

const absenceId='da_22345678-1234-4123-8123-123456789abc';
const absenceFields={employeeId:fixture.employees[0].id,type:'OTHER',startDate:fixture.weekStart,endDate:fixture.weekStart,
  scope:'FULL_DAY',replacementMode:'AUTO',manualReplacementEmployeeId:'',note:'Φανταστική άδεια\nΔεύτερη γραμμή',status:'ACTIVE'};
await assert.rejects(()=>core.execute(identity,{operation:'abs.create',commandId:'abs_22345678-1234-4123-8123-123456789abd',
  payload:{...absenceFields,employeeId:'demo-cafe-e1'}}),{code:'MUTATION_FOREIGN_REFERENCE'});
await assert.rejects(()=>core.execute(identity,{operation:'abs.create',commandId:'abs_22345678-1234-4123-8123-123456789abe',
  payload:{...absenceFields,startDate:'2026-02-30'}}),{code:'MUTATION_INVALID_REQUEST'});
const absenceCreate={operation:'abs.create',commandId:'abs_22345678-1234-4123-8123-123456789abc',payload:absenceFields};
for(const [n,field]of ['type','scope','replacementMode','status'].entries())
  await assert.rejects(()=>core.execute(identity,{...absenceCreate,
    commandId:`abs_22345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`,
    payload:{...absenceFields,[field]:[absenceFields[field]]}}),{code:'MUTATION_INVALID_REQUEST'});
assert.deepEqual(await core.execute(identity,absenceCreate),{id:absenceId,status:'created'});
assert.equal(db.rows.get(`tenants/${tenant}/absences/${absenceId}`).employeeName,fixture.employees[0].fullName);
assert.equal(db.rows.get(`tenants/${tenant}/absences/${absenceId}`).status,'APPROVED','ACTIVE input is canonicalized for V3 publication');
assert.equal(db.rows.get(`demoAdmission/${tenant}`).absenceCreates,fixture.absences.length+1);
const absenceUpdate={operation:'abs.update',commandId:'abs_22345678-1234-4123-8123-123456789abf',
  payload:{id:absenceId,...absenceFields,note:'Ενημερωμένη φανταστική άδεια',expectedRevision:0}};
assert.deepEqual(await core.execute(identity,absenceUpdate),{id:absenceId,status:'updated',revision:1});
assert.equal(db.rows.get(`tenants/${tenant}/absences/${absenceId}`).note,'Ενημερωμένη φανταστική άδεια');
assert.equal('expectedRevision' in db.rows.get(`tenants/${tenant}/absences/${absenceId}`),false,'transport control is not persisted');
assert.equal('id' in db.rows.get(`tenants/${tenant}/absences/${absenceId}`),false,'path identity is not copied into data');
assert.deepEqual(await core.execute(identity,{operation:'abs.delete',commandId:'abs_22345678-1234-4123-8123-123456789ac0',
  payload:{id:absenceId,expectedRevision:1}}),{id:absenceId,status:'deleted'});
assert.equal(db.rows.has(`tenants/${tenant}/absences/${absenceId}`),false);
assert.equal(db.rows.get(`demoAdmission/${tenant}`).absenceCreates,fixture.absences.length+1);
console.log('PUBLIC_DEMO_TYPED_ABSENCE_LIFECYCLE_PASS');

const referencedEmployee=fixture.absences[0].employeeId;
await assert.rejects(()=>core.execute(identity,{operation:'emp.delete',
  commandId:'emp_22345678-1234-4123-8123-123456789ac1',
  payload:{id:referencedEmployee,expectedRevision:0}}),{code:'MUTATION_REFERENCED'});
assert.equal(db.rows.has(`tenants/${tenant}/employees/${referencedEmployee}`),true);
console.log('PUBLIC_DEMO_EMPLOYEE_REFERENCE_GUARD_PASS');

const announcementCreate={operation:'ann.create',commandId:'ann_32345678-1234-4123-8123-123456789abc',
  payload:{title:'Δοκιμαστική ανακοίνωση',body:'Μόνο φανταστικά δεδομένα.\nΔεύτερη γραμμή.'}};
const announcementId='dn_32345678-1234-4123-8123-123456789abc';
await assert.rejects(()=>core.execute(identity,{...announcementCreate,commandId:'ann_32345678-1234-4123-8123-123456789abd',
  payload:{...announcementCreate.payload,authorEmail:'owner@example.com'}}),{code:'MUTATION_INVALID_REQUEST'});
assert.deepEqual(await core.execute(identity,announcementCreate),{id:announcementId,status:'created'});
const privateAnnouncement=db.rows.get(`tenants/${tenant}/announcements/${announcementId}`);
const publicAnnouncement=db.rows.get(`tenants/${tenant}/publicAnnouncements/${announcementId}`);
assert.equal(privateAnnouncement.title,announcementCreate.payload.title);
assert.deepEqual(publicAnnouncement,{tenantId:tenant,title:announcementCreate.payload.title,
  body:announcementCreate.payload.body,createdAt:privateAnnouncement.createdAt,updatedAt:privateAnnouncement.updatedAt});
assert.equal(db.rows.get(`demoAdmission/${tenant}`).announcementCreates,1);
assert.deepEqual(await core.execute(identity,announcementCreate),{id:announcementId,status:'created'});
assert.deepEqual(await core.execute(identity,{operation:'ann.delete',commandId:'ann_32345678-1234-4123-8123-123456789abe',
  payload:{id:announcementId,expectedRevision:0}}),{id:announcementId,status:'deleted'});
assert.equal(db.rows.has(`tenants/${tenant}/announcements/${announcementId}`),false);
assert.equal(db.rows.has(`tenants/${tenant}/publicAnnouncements/${announcementId}`),false);
assert.equal(db.rows.get(`demoAdmission/${tenant}`).announcementCreates,1);
console.log('PUBLIC_DEMO_TYPED_ANNOUNCEMENT_LIFECYCLE_PASS');

const settingsCommand={operation:'set.save',commandId:'set_42345678-1234-4123-8123-123456789abc',payload:{
  config:fixture.config,expectedRevision:0,profiles:[{id:fixture.employees[0].id,profile:fixture.employees[0].schedulerV3}],
}};
for(const [n,alter] of [
  c=>{c.shiftTemplates[0].shortCode={unknown:'value'};},
  c=>{delete c.shiftTemplates[0].shortCode;},
  c=>{c.shiftTemplates[0].label='x'.repeat(201);},
  c=>{c.shiftTemplates[0].label=' '.repeat(201)+'L';},
  c=>{c.shiftTemplates[0].color='#123456';},
  c=>{c.operatingDays[0].windows[0]={openTime:'22:00',closeTime:'06:00',crossMidnight:{unknown:true}};},
].entries()){
  const config=structuredClone(fixture.config);alter(config);
  await assert.rejects(()=>core.execute(identity,{...settingsCommand,
    commandId:`set_42345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`,
    payload:{...settingsCommand.payload,config}}),{code:'MUTATION_INVALID_REQUEST'});
}
await assert.rejects(()=>core.execute(identity,{...settingsCommand,commandId:'set_42345678-1234-4123-8123-123456789abd',
  payload:{...settingsCommand.payload,docId:'other'}}),{code:'MUTATION_INVALID_REQUEST'});
await assert.rejects(()=>core.execute(identity,{...settingsCommand,commandId:'set_42345678-1234-4123-8123-123456789abe',
  payload:{...settingsCommand.payload,config:{...fixture.config,tenantId:'demo-cafe'}}}),{code:'MUTATION_INVALID_REQUEST'});
await assert.rejects(()=>core.execute(identity,{...settingsCommand,commandId:'set_42345678-1234-4123-8123-123456789abf',
  payload:{...settingsCommand.payload,profiles:[{id:'demo-cafe-e1',profile:fixture.employees[0].schedulerV3}]}}),
  {code:'MUTATION_FOREIGN_REFERENCE'});
await assert.rejects(()=>core.execute(identity,{...settingsCommand,commandId:'set_42345678-1234-4123-8123-123456789acd',
  payload:{...settingsCommand.payload,profiles:[{id:fixture.employees[0].id,profile:null}]}}),{code:'MUTATION_INVALID_REQUEST'});
assert.deepEqual(await core.execute(identity,settingsCommand),{status:'updated',revision:1});
const savedSettings=db.rows.get(`tenants/${tenant}/settings/scheduler`);
assert.deepEqual(savedSettings.schedulerConfigV3,fixture.config);
assert.equal(savedSettings.demoRevision,1);
assert.deepEqual(db.rows.get(`tenants/${tenant}/employees/${fixture.employees[0].id}`).schedulerV3,
  fixture.employees[0].schedulerV3);
await assert.rejects(()=>core.execute(identity,{...settingsCommand,commandId:'set_42345678-1234-4123-8123-123456789ac0'}),
  {code:'MUTATION_REVISION_CONFLICT'});
console.log('PUBLIC_DEMO_TYPED_SETTINGS_PASS');

const exportCommand={operation:'aud.export',commandId:'aud_52345678-1234-4123-8123-123456789abc',
  payload:{exportType:'PDF',exportScope:'WEEK',status:'SUCCESS'}};
for(const [n,field]of ['exportType','exportScope','status'].entries())
  await assert.rejects(()=>core.execute(identity,{...exportCommand,
    commandId:`aud_52345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`,
    payload:{...exportCommand.payload,[field]:[exportCommand.payload[field]]}}),{code:'MUTATION_INVALID_REQUEST'});
await assert.rejects(()=>core.execute(identity,{...exportCommand,commandId:'aud_52345678-1234-4123-8123-123456789abd',
  payload:{...exportCommand.payload,fileName:'../../foreign.pdf'}}),{code:'MUTATION_INVALID_REQUEST'});
const exportResult=await core.execute(identity,exportCommand);
assert.equal(exportResult.status,'recorded');
assert.equal(typeof exportResult.sequence,'number');
assert.deepEqual(await core.execute(identity,exportCommand),exportResult);
assert.equal(db.rows.get(`demoAdmission/${tenant}`).auditOnlyCount,1);
assert.equal(db.rows.get(`tenants/${tenant}/auditLogs/log_${String(exportResult.sequence%512).padStart(3,'0')}`).action,'aud.export');
console.log('PUBLIC_DEMO_TYPED_AUDIT_EXPORT_PASS');

const draft=createDraftV3({config:fixture.config,employees:fixture.employees,
  absences:mapAbsencesV3(fixture.absences,fixture.weekStart,fixture.weekEnd),periodType:'WEEK',
  periodStart:fixture.weekStart,periodEnd:fixture.weekEnd,
  options:{balanceWeeklyTargets:fixture.config.generationDefaults.balanceWeeklyTargetsForMonth}},'draft_b2');
const draftCreate={operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789abc',payload:{draft}};
const missingProfile=structuredClone(draft);delete missingProfile.employees[0].schedulerV3;
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_82345678-1234-4123-8123-123456789abd',
  payload:{draft:missingProfile}}),{code:'MUTATION_INVALID_REQUEST'});
const oversizedPerson={...draft.employees[0],fullName:'Ά'.repeat(200)},oversizedDraftId='d'.repeat(100);
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_82345678-1234-4123-8123-123456789abc',
  payload:{draft:{...draft,id:oversizedDraftId,employees:[oversizedPerson,...draft.employees.slice(1)],
    shifts:[{...draft.shifts[0],id:'s'.repeat(100),employeeName:oversizedPerson.fullName,draftId:oversizedDraftId}]}}}),
  {code:'MUTATION_INVALID_REQUEST'});
assert.deepEqual(await core.execute(identity,draftCreate),{status:'saved',revision:1});
const draftPath=`tenants/${tenant}/scheduleDrafts/${draft.id}`;
const firstSave=db.rows.get(draftPath);
assert.equal(firstSave.revision,1);
assert.deepEqual(firstSave.shiftDocumentIds,draft.shifts.map((_,n)=>`${draft.id}_${n}`));
assert.equal(db.rows.get(`tenants/${tenant}/shifts/${draft.id}_0`).draftId,draft.id);
assert.deepEqual(await core.execute(identity,draftCreate),{status:'saved',revision:1});
assert.ok([...db.rows.entries()].some(([path,row])=>path.includes('/auditLogs/')&&row.action==='drf.save'&&row.targetId===draft.id));
assert.equal(db.rows.get(`demoAdmission/${tenant}`).draftSaveCount,1);
await assert.rejects(()=>core.execute(identity,{...draftCreate,commandId:'drf_62345678-1234-4123-8123-123456789abd'}),
  {code:'MUTATION_REVISION_CONFLICT'});
const shorter={...draft,revision:1,shifts:draft.shifts.slice(0,Math.max(0,draft.shifts.length-1))};
assert.deepEqual(await core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789abe',
  payload:{draft:shorter}}),{status:'saved',revision:2});
assert.equal(db.rows.get(draftPath).shiftDocumentIds.length,shorter.shifts.length);
assert.equal(db.rows.has(`tenants/${tenant}/shifts/${draft.id}_${draft.shifts.length-1}`),false);
const tampered=structuredClone(db.rows.get(draftPath));tampered.shiftDocumentIds=['other_draft_0'];db.rows.set(draftPath,tampered);
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789abf',
  payload:{draft:{...shorter,revision:2}}}),{code:'MUTATION_INTEGRITY'});
db.rows.set(`tenants/${tenant}/scheduleDrafts/missing_ids`,{id:'missing_ids',tenantId:tenant,schemaVersion:3,revision:1});
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789acd',
  payload:{draft:{...shorter,id:'missing_ids',revision:1,shifts:[]}}}),{code:'MUTATION_INTEGRITY'});
console.log('PUBLIC_DEMO_TYPED_DRAFT_LIFECYCLE_PASS');

const monthStart=fixture.weekStart.slice(0,7)+'-01';
const monthEnd=new Date(Date.UTC(Number(monthStart.slice(0,4)),Number(monthStart.slice(5,7)),0)).toISOString().slice(0,10);
const monthDraft=createDraftV3({config:fixture.config,employees:fixture.employees,
  absences:mapAbsencesV3(fixture.absences,monthStart,monthEnd),periodType:'MONTH',
  periodStart:monthStart,periodEnd:monthEnd,
  options:{balanceWeeklyTargets:fixture.config.generationDefaults.balanceWeeklyTargetsForMonth}},'month_b2');
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_72345678-1234-4123-8123-123456789abc',
  payload:{draft:{...monthDraft,periodStart:'2026-01-01',periodEnd:'2026-12-31',shifts:[]}}}),{code:'MUTATION_INVALID_REQUEST'});
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_72345678-1234-4123-8123-123456789abd',
  payload:{draft:{...draft,shifts:[{...draft.shifts[0],crossMidnight:'false'}]}}}),{code:'MUTATION_INVALID_REQUEST'});
assert.deepEqual(await core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789ac0',
  payload:{draft:monthDraft}}),{status:'saved',revision:1});
console.log('PUBLIC_DEMO_TYPED_MONTH_DRAFT_PASS');

const times=[['00:00','08:00'],['08:00','16:00'],['16:00','00:00']];
const stressShifts=Array.from({length:449},(_,n)=>{
  const person=fixture.employees[Math.floor(n/3)%fixture.employees.length],slot=n%3;
  return {id:`stress-${String(n).padStart(3,'0')}`,date:new Date(Date.parse(monthStart+'T00:00:00Z')+
    Math.floor(n/(fixture.employees.length*3))*86400000).toISOString().slice(0,10),employeeId:person.id,
    employeeName:person.fullName,shiftTemplateId:null,startTime:times[slot][0],endTime:times[slot][1],
    durationHours:8,crossMidnight:slot===2,source:'MANUAL',isManualOverride:true,schedulerSchemaVersion:3,draftId:'stress_b2'};
});
const stressDraft={...monthDraft,id:'stress_b2',revision:0,shifts:stressShifts};
const beforeStress=db.rows.get(`demoAdmission/${tenant}`).shiftWriteOps;
assert.deepEqual(await core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789ac1',
  payload:{draft:stressDraft}}),{status:'saved',revision:1});
assert.equal(db.lastCommitWrites,453,'449 shift writes + metadata + three admission writes');
assert.equal(db.rows.get(`demoAdmission/${tenant}`).shiftWriteOps,beforeStress+449);
assert.equal(db.rows.get(`tenants/${tenant}/scheduleDrafts/stress_b2`).shiftDocumentIds.length,449);
await assert.rejects(()=>core.execute(identity,{operation:'drf.save',commandId:'drf_62345678-1234-4123-8123-123456789ac2',
  payload:{draft:{...stressDraft,id:'stress_bad',shifts:[...stressShifts,{...stressShifts[0],id:'stress-449',draftId:'stress_bad'}]}}}),
  {code:'MUTATION_INVALID_REQUEST'});
assert.equal(db.rows.has(`tenants/${tenant}/scheduleDrafts/stress_bad`),false);
console.log('PUBLIC_DEMO_TYPED_DRAFT_449_LOCAL_PASS writes=453');
