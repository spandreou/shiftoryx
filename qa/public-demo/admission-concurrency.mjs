import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getApps} from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import {dbAdmin,login,close} from './test-support.mjs';
import {createDemoPdfAdapters} from '../../functions/src/public-demo/pdf-adapters.ts';
import {createDemoPdfAuthenticator} from '../../functions/src/public-demo/pdf-authorization.ts';
import {runAuditOnlyAdmission,runPrimaryAdmission} from '../../functions/src/public-demo/admission.ts';

const tenant='demo-fuel',app=getApps()[0],{database}=createDemoPdfAdapters(app),client=await login(tenant);
const token=await client.auth.currentUser.getIdToken();
const identity=await createDemoPdfAuthenticator(app)({method:'POST',query:{},body:new TextEncoder().encode('{}'),
  headers:{authorization:'Bearer '+token,origin:'https://demo-fuel.shiftoryx.gr','content-type':'application/json'}});
const created=[];
try{
  const now=Date.now();
  const audit=await Promise.allSettled(Array.from({length:20},()=>runAuditOnlyAdmission(database,identity,{
    commandId:'aud_'+randomUUID(),operation:'aud.export',input:{format:'PDF'},now})));
  const auditSuccess=audit.filter(x=>x.status==='fulfilled');assert.ok(auditSuccess.length>=1);
  let state=(await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data();
  const receipts=(await dbAdmin.doc(`demoAuditReceipts/${tenant}`).get()).data().receipts;
  assert.equal(state.auditOnlyCount,auditSuccess.length);
  assert.equal(Object.keys(receipts).length,auditSuccess.length);
  assert.deepEqual(auditSuccess.map(x=>x.value.sequence).sort((a,b)=>a-b),Array.from({length:auditSuccess.length},(_,n)=>n));
  const ring=await dbAdmin.collection(`tenants/${tenant}/auditLogs`).get();assert.equal(ring.size,auditSuccess.length);

  await dbAdmin.doc(`demoAdmission/${tenant}`).update({employeeCreates:31});
  const employee=await Promise.allSettled(Array.from({length:20},(_,n)=>{
    const id='qa-admission-'+n;created.push(id);
    return runPrimaryAdmission(database,identity,{commandId:'emp_'+randomUUID(),operation:'emp.create',input:{fullName:'Φανταστικός '+n},now:now+1000,
      write:async tx=>{tx.create(`tenants/${tenant}/employees/${id}`,{fullName:'Φανταστικός '+n});return {result:{id,status:'created'},delta:{employeeCreates:1}};}});
  }));
  const employeeSuccess=employee.filter(x=>x.status==='fulfilled');assert.equal(employeeSuccess.length,1);
  state=(await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data();
  assert.equal(state.employeeCreates,32);assert.equal(state.successfulMutations,1);
  assert.equal(Object.keys(state.receipts).length,1);
  assert.equal(state.nextAuditSequence,auditSuccess.length+1);
  const existing=await Promise.all(created.map(id=>dbAdmin.doc(`tenants/${tenant}/employees/${id}`).get()));
  assert.equal(existing.filter(doc=>doc.exists).length,1);
  console.log(`PUBLIC_DEMO_ADMISSION_CONCURRENCY_PASS audit=${auditSuccess.length}/20 employees=${employeeSuccess.length}/20`);
}finally{
  await Promise.all(created.map(id=>dbAdmin.doc(`tenants/${tenant}/employees/${id}`).delete()));
  await close();
}
