import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,login,close,project} from './test-support.mjs';

const tenant='demo-fuel',client=await login(tenant),uid=client.auth.currentUser.uid;
const stateRef=dbAdmin.doc(`demoState/${tenant}`),memberRef=dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`),
  admissionRef=dbAdmin.doc(`demoAdmission/${tenant}`),adminRef=dbAdmin.doc(`platformAdmins/${uid}`);
const originalState=(await stateRef.get()).data(),originalMember=(await memberRef.get()).data(),
  originalAdmission=(await admissionRef.get()).data();
const token=await client.auth.currentUser.getIdToken();
async function attempt({auth=true,id='emp_'+randomUUID(),payload={fullName:'Forbidden fictional employee'}}={}){
  const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',
    headers:{Origin:`https://${tenant}.shiftoryx.gr`,'Content-Type':'application/json',...(auth?{Authorization:`Bearer ${token}`}:{})},
    body:JSON.stringify({operation:'emp.create',commandId:id,payload}),signal:AbortSignal.timeout(120000)});
  return {status:response.status,body:await response.json(),id};
}
try{
  assert.equal((await attempt({auth:false})).status,401);
  assert.equal((await attempt({id:'emp_malformed'})).status,400);
  await memberRef.update({status:'REVOKED'});assert.equal((await attempt()).status,403);await memberRef.set(originalMember);
  await adminRef.set({status:'ACTIVE'});assert.equal((await attempt()).status,403);await adminRef.delete();
  await stateRef.update({resetting:true});assert.equal((await attempt()).status,503);await stateRef.set(originalState);
  await stateRef.update({generation:originalState.generation+1});assert.equal((await attempt()).status,409);await stateRef.set(originalState);
  await admissionRef.set({...originalAdmission,employeeCreates:32});
  const over=await attempt();assert.equal(over.status,429,JSON.stringify(over.body));
  const derived='de_'+over.id.slice(4);
  assert.equal((await dbAdmin.doc(`tenants/${tenant}/employees/${derived}`).get()).exists,false);
  assert.equal((await dbAdmin.doc(`tenants/${tenant}/publicEmployees/${derived}`).get()).exists,false);
  const blocked=(await admissionRef.get()).data();
  assert.equal(blocked.successfulMutations,originalAdmission.successfulMutations);
  assert.deepEqual(blocked.receipts,originalAdmission.receipts);
  assert.equal((await dbAdmin.collection(`tenants/${tenant}/auditLogs`).get()).empty,true);
  assert.equal((await dbAdmin.collection(`tenants/${tenant}/employees`).where('fullName','==','Forbidden fictional employee').get()).empty,true);
  console.log('PUBLIC_DEMO_TYPED_NEGATIVE_PASS anonymous malformed membership platformAdmin resetting staleGeneration quotaRollback');
}finally{
  await stateRef.set(originalState);await memberRef.set(originalMember);await admissionRef.set(originalAdmission);
  await adminRef.delete();await close();
}
