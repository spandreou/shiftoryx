import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getDoc,doc} from 'firebase/firestore';
import {getApps} from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import {dbAdmin,authAdmin,bucket,login,rpc,denied,close,tenants,project} from './test-support.mjs';
import {createDemoResetAdapters} from '../../functions/src/public-demo/reset-adapters.ts';
import {createDemoResetEngine} from '../../functions/src/public-demo/reset-engine.ts';
import {acquireResetLease,rollbackPrecheck,ResetError} from '../../functions/src/public-demo/reset-state.ts';
const deps=createDemoResetAdapters(getApps()[0]),tenant='demo-fuel',state=dbAdmin.doc(`demoState/${tenant}`),control=dbAdmin.doc(`demoControl/${tenant}`);
try{
  const old=await login(tenant),uid=old.auth.currentUser.uid,before=(await state.get()).data(),oldAuth=await authAdmin.getUser(uid);
  const roster=(await dbAdmin.collection(`tenants/${tenant}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()}));
  const foreign=new Map();for(const other of tenants.filter(id=>id!==tenant))foreign.set(other,
    {state:(await dbAdmin.doc(`demoState/${other}`).get()).data(),roster:(await dbAdmin.collection(`tenants/${other}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()}))});
  const path=`tenants/${tenant}/schedule-publications/recovery-sentinel/schedule.pdf`;await bucket.file(path).save('%PDF-fictional-recovery');
  const first=await acquireResetLease(deps.database,tenant,{kind:'SCHEDULED'},Date.now(),randomUUID(),Date.now);
  await denied(()=>getDoc(doc(old.db,'tenants',tenant,'employees',roster[0].id)));
  const publicUrl=`http://127.0.0.1:8197/v1/projects/${project}/databases/(default)/documents/tenants/${tenant}/publicEmployees/${roster[0].id}`;
  assert.equal((await fetch(publicUrl,{signal:AbortSignal.timeout(15000)})).status,403,'PRECHECK fences anonymous public projection');
  const fencedMutation=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',
    headers:{Origin:`https://${tenant}.shiftoryx.gr`,Authorization:'Bearer '+await old.auth.currentUser.getIdToken(),'Content-Type':'application/json'},
    body:JSON.stringify({operation:'emp.create',commandId:'emp_'+randomUUID(),payload:{fullName:'Φανταστική fenced εγγραφή'}}),signal:AbortSignal.timeout(120000)});
  assert.ok([409,503].includes(fencedMutation.status),'PRECHECK fences authenticated typed mutations');
  assert.equal((await state.get()).data().generation,before.generation);
  assert.equal((await dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`).get()).data().status,'ACTIVE');
  await control.update({leaseUntil:Date.now()-1});
  const replacement=await acquireResetLease(deps.database,tenant,{kind:'SCHEDULED'},Date.now(),randomUUID(),Date.now);
  assert.equal(replacement.phase,'PRECHECK');assert.equal(replacement.generation,before.generation);assert.equal(replacement.fixtureAt,first.fixtureAt);
  const live=(await control.get()).data();assert.equal(await rollbackPrecheck(deps.database,first,Date.now()),false);
  assert.deepEqual((await control.get()).data(),live);assert.equal(await rollbackPrecheck(deps.database,replacement,Date.now()),true);
  assert.equal((await state.get()).data().generation,before.generation);assert.equal((await state.get()).data().resetting,false);
  assert.equal((await authAdmin.getUser(uid)).tokensValidAfterTime,oldAuth.tokensValidAfterTime);
  assert.equal((await bucket.file(path).exists())[0],true);
  assert.deepEqual((await dbAdmin.collection(`tenants/${tenant}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()})),roster);
  console.log('B3_PRECHECK_WORKER_LOSS_EMULATOR_PASS sameGeneration staleLeaseCannotUnlock AuthDataStorageUnchanged');

  // Worker loses its lease while doing read-only Storage preflight. Successor
  // must remain fenced; the catch-path is not allowed to clear its live lease.
  let successorLease;
  const lostStorage={...deps.storage,list:async(...args)=>{
    const rows=await deps.storage.list(...args);successorLease=randomUUID();await control.update({lease:successorLease});return rows;}};
  await assert.rejects(()=>createDemoResetEngine({...deps,storage:lostStorage}).run(tenant,{scheduled:true}),{code:'RESET_LEASE_LOST'});
  assert.equal((await control.get()).data().lease,successorLease);assert.equal((await state.get()).data().generation,before.generation);
  assert.equal((await state.get()).data().phase,'PRECHECK');assert.equal((await bucket.file(path).exists())[0],true);
  assert.equal((await authAdmin.getUser(uid)).tokensValidAfterTime,oldAuth.tokensValidAfterTime);
  await control.update({leaseUntil:Date.now()-1});
  const renewed=await acquireResetLease(deps.database,tenant,{kind:'SCHEDULED'},Date.now(),randomUUID(),Date.now);
  assert.equal(await rollbackPrecheck(deps.database,renewed,Date.now()),true);
  console.log('B3_PRECHECK_READONLY_LEASE_LOSS_EMULATOR_PASS');

  // Worker loss after tenant cleanup but before an external delete can finish.
  const failedStorage={...deps.storage,remove:async()=>{throw new ResetError('RESET_TRANSIENT');}};
  await assert.rejects(()=>createDemoResetEngine({...deps,storage:failedStorage}).run(tenant,{scheduled:true}),{code:'RESET_TRANSIENT'});
  const interrupted=(await state.get()).data(),metadata=(await control.get()).data();
  assert.equal(interrupted.phase,'DESTRUCTIVE');assert.equal(interrupted.generation,before.generation+1);assert.equal(interrupted.resetting,true);
  assert.equal((await dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`).get()).data().status,'REVOKED');
  assert.equal((await rpc('enterPublicDemo',{tenantId:tenant})).status,503);
  await denied(()=>getDoc(doc(old.db,'tenants',tenant,'employees',roster[0].id)));
  await assert.rejects(()=>createDemoResetEngine(deps).run(tenant,{scheduled:true}),{code:'RESET_IN_PROGRESS'});
  await control.update({leaseUntil:Date.now()-1});
  let finalizeChecked=false;
  const auth={...deps.auth,verify:async(...args)=>{
    await deps.auth.verify(...args);const fenced=(await state.get()).data();assert.equal(fenced.phase,'FINALIZE');assert.equal(fenced.resetting,true);
    assert.equal((await rpc('enterPublicDemo',{tenantId:tenant})).status,503);
    assert.equal((await fetch(publicUrl,{signal:AbortSignal.timeout(15000)})).status,403,'FINALIZE does not expose canonical projection prematurely');
    const token=await authAdmin.createCustomToken(`${tenant}-owner-g${fenced.generation}`);
    const session=await fetch('http://127.0.0.1:9308/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=emulator-only',
      {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
    assert.equal(session.status,200);const identity=await session.json();
    const premature=await fetch(`http://127.0.0.1:8197/v1/projects/${project}/databases/(default)/documents/tenants/${tenant}/employees/${roster[0].id}`,
      {headers:{Authorization:'Bearer '+identity.idToken},signal:AbortSignal.timeout(15000)});assert.equal(premature.status,403,'valid new Auth cannot expose partial fixture before FINALIZE');
    assert.equal((await control.get()).data().fixtureAt,metadata.fixtureAt);finalizeChecked=true;
  }};
  const result=await createDemoResetEngine({...deps,auth}).run(tenant,{scheduled:true});
  assert.equal(result.generation,interrupted.generation);assert.equal(finalizeChecked,true);assert.equal((await state.get()).data().phase,'OPEN');
  assert.equal((await state.get()).data().resetting,false);assert.equal((await bucket.getFiles({prefix:`tenants/${tenant}/`,autoPaginate:false,maxResults:33}))[0].length,0);
  assert.equal((await dbAdmin.collection(`tenants/${tenant}/employees`).get()).size,6);
  assert.equal((await dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`).get()).exists,false);
  await assert.rejects(()=>authAdmin.getUser(uid),error=>error.code==='auth/user-not-found');
  const fresh=await login(tenant);assert.ok((await getDoc(doc(fresh.db,'tenants',tenant,'employees',roster[0].id))).exists());
  await denied(()=>getDoc(doc(old.db,'tenants',tenant,'employees',roster[0].id)));
  for(const [other,snapshot]of foreign){assert.deepEqual((await dbAdmin.doc(`demoState/${other}`).get()).data(),snapshot.state);
    assert.deepEqual((await dbAdmin.collection(`tenants/${other}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()})),snapshot.roster);}
  console.log('B3_DESTRUCTIVE_FORWARD_RECOVERY_EMULATOR_PASS canonicalFixture oldGenerationNeverReactivated exactStorageDeletion FINALIZEFence foreignUntouched');
}finally{await close();}
