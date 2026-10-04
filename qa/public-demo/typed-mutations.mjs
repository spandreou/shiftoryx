import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,login,close,project,tenants} from './test-support.mjs';
import {createDraftV3,mapAbsencesV3} from '../../src/services/schedulerV3Service.ts';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';

const endpoint=`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`;
const fuel=await login('demo-fuel');
async function mutate(client,operation,payload,commandId=`${operation.split('.')[0]}_${randomUUID()}`,origin=`https://${client.tenant}.shiftoryx.gr`){
  const token=await client.auth.currentUser.getIdToken();
  const response=await fetch(endpoint,{method:'POST',headers:{Origin:origin,Authorization:`Bearer ${token}`,
    'Content-Type':'application/json'},body:JSON.stringify({operation,commandId,payload}),signal:AbortSignal.timeout(120000)});
  return {status:response.status,body:await response.json(),commandId};
}
const createCommand='emp_'+randomUUID();
let response=await mutate(fuel,'emp.create',{fullName:'Φανταστική Δοκιμή'},createCommand);
assert.equal(response.status,200,JSON.stringify(response.body));
const created=response.body.id;
assert.equal((await dbAdmin.doc(`tenants/demo-fuel/employees/${created}`).get()).data().fullName,'Φανταστική Δοκιμή');
assert.equal((await dbAdmin.doc(`tenants/demo-fuel/publicEmployees/${created}`).get()).data().fullName,'Φανταστική Δοκιμή');
assert.deepEqual((await mutate(fuel,'emp.create',{fullName:'Φανταστική Δοκιμή'},createCommand)).body,response.body);
response=await mutate(fuel,'emp.update',{id:created,fullName:'Φανταστική Δοκιμή Β',color:'#112233',expectedRevision:0});
assert.equal(response.status,200,JSON.stringify(response.body));
response=await mutate(fuel,'emp.active',{id:created,isActive:false,expectedRevision:1});
assert.equal(response.status,200,JSON.stringify(response.body));
response=await mutate(fuel,'emp.active',{id:created,isActive:true,expectedRevision:2});
assert.equal(response.status,200,JSON.stringify(response.body));
response=await mutate(fuel,'set.save',{config:publicDemoFixture('demo-fuel',new Date()).config,expectedRevision:0,
  profiles:[{id:created,profile:(await dbAdmin.doc(`tenants/demo-fuel/employees/${created}`).get()).data().schedulerV3}]});
assert.equal(response.status,200,JSON.stringify(response.body));
const fixture=publicDemoFixture('demo-fuel',new Date());
response=await mutate(fuel,'abs.create',{employeeId:created,type:'OTHER',startDate:fixture.weekStart,
  endDate:fixture.weekStart,scope:'FULL_DAY',replacementMode:'AUTO',manualReplacementEmployeeId:'',
  note:'Φανταστική απουσία',status:'ACTIVE'});
assert.equal(response.status,200,JSON.stringify(response.body));
response=await mutate(fuel,'ann.create',{title:'Δοκιμαστική ανακοίνωση',body:'Μόνο φανταστικά δεδομένα.'});
assert.equal(response.status,200,JSON.stringify(response.body));
assert.equal((await dbAdmin.doc(`tenants/demo-fuel/publicAnnouncements/${response.body.id}`).get()).exists,true);
response=await mutate(fuel,'aud.export',{exportType:'PDF',exportScope:'WEEK',status:'SUCCESS'});
assert.equal(response.status,200,JSON.stringify(response.body));
console.log('PUBLIC_DEMO_TYPED_ENDPOINT_BASIC_PASS');

const settings=(await dbAdmin.doc('tenants/demo-fuel/settings/scheduler').get()).data();
const liveEmployees=(await dbAdmin.collection('tenants/demo-fuel/employees').get()).docs.map(row=>({id:row.id,...row.data()}));
const liveAbsences=(await dbAdmin.collection('tenants/demo-fuel/absences').get()).docs.map(row=>({id:row.id,...row.data()}));
const monthStart=fixture.weekStart.slice(0,7)+'-01';
const monthEnd=new Date(Date.UTC(Number(monthStart.slice(0,4)),Number(monthStart.slice(5,7)),0)).toISOString().slice(0,10);
const base=createDraftV3({config:settings.schedulerConfigV3,employees:liveEmployees,
  absences:mapAbsencesV3(liveAbsences,monthStart,monthEnd),periodType:'MONTH',
  periodStart:monthStart,periodEnd:monthEnd,
  options:{balanceWeeklyTargets:settings.schedulerConfigV3.generationDefaults.balanceWeeklyTargetsForMonth}},'emulator_449');
const times=[['00:00','08:00'],['08:00','16:00'],['16:00','00:00']];
const shifts=Array.from({length:449},(_,n)=>{
  const person=liveEmployees[Math.floor(n/3)%liveEmployees.length],slot=n%3;
  return {id:`stress-${String(n).padStart(3,'0')}`,date:new Date(Date.parse(monthStart+'T00:00:00Z')+
    Math.floor(n/(liveEmployees.length*3))*86400000).toISOString().slice(0,10),employeeId:person.id,
    employeeName:person.fullName,shiftTemplateId:null,startTime:times[slot][0],endTime:times[slot][1],
    durationHours:8,crossMidnight:slot===2,source:'MANUAL',isManualOverride:true,
    schedulerSchemaVersion:3,draftId:'emulator_449'};
});
const draft={...base,shifts};
const start=Date.now(),draftCommand='drf_'+randomUUID();
response=await mutate(fuel,'drf.save',{draft},draftCommand);
assert.equal(response.status,200,JSON.stringify(response.body));
const elapsed=Date.now()-start;
assert.equal((await dbAdmin.doc('tenants/demo-fuel/scheduleDrafts/emulator_449').get()).data().shiftDocumentIds.length,449);
const admission=(await dbAdmin.doc('demoAdmission/demo-fuel').get()).data();
assert.equal(admission.shiftWriteOps,449);
assert.equal(admission.shiftCreates,449);
assert.equal((await mutate(fuel,'drf.save',{draft},draftCommand)).body.revision,1);
assert.equal((await dbAdmin.doc('demoAdmission/demo-fuel').get()).data().shiftWriteOps,449,'replay cannot write shifts');
response=await mutate(fuel,'drf.save',{draft:{...draft,id:'emulator_450',shifts:[...shifts,{...shifts[0],id:'stress-449',draftId:'emulator_450'}]}});
assert.equal(response.status,400,JSON.stringify(response.body));
assert.equal((await dbAdmin.doc('tenants/demo-fuel/scheduleDrafts/emulator_450').get()).exists,false);
console.log(`PUBLIC_DEMO_TYPED_449_EMULATOR_PASS elapsedMs=${elapsed}`);

const foreign=await mutate(fuel,'emp.create',{fullName:'Ξένη δοκιμή'},undefined,'https://demo-cafe.shiftoryx.gr');
assert.equal(foreign.status,403,JSON.stringify(foreign.body));
assert.equal((await dbAdmin.collection('tenants/demo-cafe/employees').where('fullName','==','Ξένη δοκιμή').get()).empty,true);
console.log('PUBLIC_DEMO_TYPED_FOREIGN_ORIGIN_DENIED');
await close();
