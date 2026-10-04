// Maximum persisted byte geometry, exclusively in the disposable demo emulator.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,login,close,project} from './test-support.mjs';
import {initialAdmissionState,initialAuditReceiptState} from '../../functions/src/public-demo/admission.ts';
import {demoPublicEmployeeProjection,MUTATION_LIMITS} from '../../functions/src/public-demo/mutations-core.ts';
import {makeDefaultConfigV3,mapAbsencesV3} from '../../src/services/schedulerV3Service.ts';
import {validateSchedulerConfigV3} from '../../src/scheduler-engine-v3/config.ts';

const tenant='demo-fuel',client=await login(tenant),uid=client.auth.currentUser.uid;
const generation=Number((await client.auth.currentUser.getIdTokenResult()).claims.demoGeneration);
const bytes=value=>Buffer.byteLength(JSON.stringify(value),'utf8');
const first=new Date().toISOString().slice(0,7)+'-01';
const last=new Date(Date.UTC(Number(first.slice(0,4)),Number(first.slice(5,7)),0)).toISOString().slice(0,10);
const draftId='maxdraft_'.padEnd(100,'d'),templateId='maxtemplate_000'.padEnd(100,'t');
const sample={id:'maxshift_000'.padEnd(100,'s'),date:first,employeeId:'maxemployee_000'.padEnd(100,'e'),
  employeeName:'',shiftTemplateId:templateId,startTime:'06:00',endTime:'14:00',durationHours:8,
  crossMidnight:false,source:'MANUAL',isManualOverride:true,schedulerSchemaVersion:3,draftId,type:'work'};
const nameLength=MUTATION_LIMITS.persistedShiftBytes-bytes(sample);
assert.ok(nameLength>=1&&nameLength<=200,'maximum-size shift must fit the scalar name bound');
const employees=Array.from({length:32},(_,n)=>({id:`maxemployee_${String(n).padStart(3,'0')}`.padEnd(100,'e'),
  fullName:'N'.repeat(nameLength),isActive:true,color:'#112233',activeFrom:first,activeTo:last,
  schedulerV3:{profileVersion:2,workMode:'NORMAL',fixedDayOff:6,targetWeeklyHours:168,
    standardShift:{startTime:'06:00',endTime:'14:00'},rotateStandardShiftWeekly:true,
    rotationAlternateShift:{startTime:'14:00',endTime:'22:00'},rotationAnchorWeekStart:'2026-01-05'}}));
const absences=Array.from({length:64},(_,n)=>({id:`maxabsence_${String(n).padStart(3,'0')}`.padEnd(100,'a'),
  employeeId:employees[n%32].id,type:'OTHER',startDate:first,endDate:first,scope:'FULL_DAY',status:'APPROVED'}));
const config=makeDefaultConfigV3(tenant);
config.shiftTemplates=Array.from({length:50},(_,n)=>({id:`maxtemplate_${String(n).padStart(3,'0')}`.padEnd(100,'t'),
  label:'L',shortCode:'S',shiftType:'MORNING',startTime:'06:00',endTime:'14:00',durationHours:8,
  crossMidnight:false,isActive:true}));
config.coverageRequirements=config.coverageRequirements.map(day=>({...day,slots:[]}));
const shifts=Array.from({length:449},(_,n)=>({id:`maxshift_${String(n).padStart(3,'0')}`.padEnd(100,'s'),
  date:new Date(Date.parse(first+'T00:00:00Z')+Math.floor(n/32)*86400000).toISOString().slice(0,10),
  employeeId:employees[n%32].id,employeeName:employees[n%32].fullName,shiftTemplateId:templateId,
  startTime:'06:00',endTime:'14:00',durationHours:8,crossMidnight:false,source:'MANUAL',
  isManualOverride:true,schedulerSchemaVersion:3,draftId}));
const draft={id:draftId,revision:0,config,employees,absences:mapAbsencesV3(absences,first,last),
  periodType:'MONTH',periodStart:first,periodEnd:last,options:{balanceWeeklyTargets:true},shifts};
const metadata=()=>({id:draftId,tenantId:tenant,schemaVersion:3,periodType:draft.periodType,
  periodStart:first,periodEnd:last,config,employees,absences:draft.absences,options:draft.options,
  updatedBy:uid,revision:1,shiftDocumentIds:shifts.map((_,n)=>`${draftId}_${n}`)});
// Grow only approved config scalars/slots; no unknown padding field is allowed.
for(const day of config.coverageRequirements)for(const template of config.shiftTemplates){
  day.slots.push({shiftTemplateId:template.id,headcount:0});
  if(bytes(metadata())>MUTATION_LIMITS.draftMetadataBytes||bytes(config)>64*1024){day.slots.pop();break;}
}
for(const template of config.shiftTemplates)for(const field of ['label','shortCode']){
  const amount=Math.min(199,MUTATION_LIMITS.draftMetadataBytes-bytes(metadata()));
  template[field]+='P'.repeat(amount);
}
assert.equal(bytes(metadata()),MUTATION_LIMITS.draftMetadataBytes,'exercise exact metadata byte bound');
assert.equal(validateSchedulerConfigV3(config).valid,true);
assert.ok(shifts.every(shift=>bytes({...shift,type:'work'})===MUTATION_LIMITS.persistedShiftBytes));
try{
  // Replace only fictional emulator fixture documents; the admission maxima
  // match these trusted initial counts before testing the HTTP implementation.
  for(const collection of ['employees','publicEmployees','absences','settings']){
    const rows=await dbAdmin.collection(`tenants/${tenant}/${collection}`).get();
    const batch=dbAdmin.batch();rows.docs.forEach(row=>batch.delete(row.ref));await batch.commit();
  }
  const seed=dbAdmin.batch();
  for(const {id,...employee}of employees){seed.set(dbAdmin.doc(`tenants/${tenant}/employees/${id}`),employee);
    seed.set(dbAdmin.doc(`tenants/${tenant}/publicEmployees/${id}`),demoPublicEmployeeProjection(tenant,employee));}
  for(const {id,...absence}of absences)seed.set(dbAdmin.doc(`tenants/${tenant}/absences/${id}`),absence);
  seed.set(dbAdmin.doc(`tenants/${tenant}/settings/scheduler`),{schedulerSchemaVersion:3,schedulerConfigV3:config});
  seed.set(dbAdmin.doc(`demoAdmission/${tenant}`),initialAdmissionState(tenant,generation,32,64));
  seed.set(dbAdmin.doc(`demoAuditReceipts/${tenant}`),initialAuditReceiptState(tenant,generation));
  await seed.commit();
  const token=await client.auth.currentUser.getIdToken(),commandId='drf_'+randomUUID();
  async function send(candidate,id=commandId){const body=JSON.stringify({operation:'drf.save',commandId:id,payload:{draft:candidate}});
    const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',
      headers:{Origin:`https://${tenant}.shiftoryx.gr`,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      body,signal:AbortSignal.timeout(120000)});return {status:response.status,body:await response.json(),requestBytes:Buffer.byteLength(body)};}
  const start=Date.now(),saved=await send(draft),runtimeMs=Date.now()-start;
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  const stored=(await dbAdmin.doc(`tenants/${tenant}/scheduleDrafts/${draftId}`).get()).data();
  assert.equal(bytes(stored),MUTATION_LIMITS.draftMetadataBytes);
  assert.equal(stored.shiftDocumentIds.length,449);
  const rows=await Promise.all(stored.shiftDocumentIds.map(id=>dbAdmin.doc(`tenants/${tenant}/shifts/${id}`).get()));
  assert.ok(rows.every(row=>row.exists&&bytes(row.data())===768));
  assert.equal((await send(draft)).body.revision,1);
  assert.equal((await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().shiftWriteOps,449);
  const overshift=structuredClone(draft);overshift.employees.forEach(employee=>employee.fullName+='N');
  overshift.shifts.forEach(shift=>shift.employeeName+='N');
  assert.equal((await send(overshift,'drf_'+randomUUID())).status,400);
  const overmetadata=structuredClone(draft);overmetadata.config.shiftTemplates.at(-1).label+='X';
  assert.equal((await send({...overmetadata,revision:1},'drf_'+randomUUID())).status,413);
  assert.equal((await dbAdmin.doc(`tenants/${tenant}/scheduleDrafts/${draftId}`).get()).data().revision,1);
  const admission=(await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data();
  assert.equal(admission.successfulMutations,1);assert.equal(admission.shiftCreates,449);
  assert.equal(Object.keys(admission.receipts).length,1);
  assert.equal((await dbAdmin.collection(`tenants/${tenant}/auditLogs`).get()).size,1);
  console.log(`PUBLIC_DEMO_DRAFT_MAX_PAYLOAD_EMULATOR_PASS shifts=449 shiftBytes=768 metadataBytes=131072 requestBytes=${saved.requestBytes} runtimeMs=${runtimeMs}`);
}finally{await close();}
