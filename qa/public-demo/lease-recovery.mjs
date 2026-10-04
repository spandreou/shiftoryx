import assert from 'node:assert/strict';
import {doc,setDoc} from 'firebase/firestore';
import {login,rpc,denied,dbAdmin,close,project} from './test-support.mjs';
import {randomUUID} from 'node:crypto';
import {resetTenant} from '../../functions/src/public-demo/generated.js';
try{
  const tenant='demo-salon',old=await login(tenant),uid=old.auth.currentUser.uid,token=await old.auth.currentUser.getIdToken();
  const stateRef=dbAdmin.doc('demoState/'+tenant),controlRef=dbAdmin.doc('demoControl/'+tenant),prior=(await stateRef.get()).data();
  // Emulator-only fixture: interrupted server reset after the generation fence,
  // with incomplete data. No client can install or clear this control state.
  const fixtureAt=Date.now();
  await dbAdmin.runTransaction(async tx=>{
    const member=await tx.get(dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`));
    tx.set(stateRef,{...prior,generation:prior.generation+1,phase:'DESTRUCTIVE',resetting:true});
    tx.set(controlRef,{phase:'DESTRUCTIVE',lease:randomUUID(),leaseUntil:fixtureAt+60000,previousOwner:uid,
      baseGeneration:prior.generation,generation:prior.generation+1,fixtureAt,initial:false,requestKind:'SCHEDULED',authRevoked:false,oldAuthDeleted:false});
    tx.set(member.ref,{...member.data(),status:'REVOKED'});
  });
  await dbAdmin.doc(`tenants/${tenant}/employees/${tenant}-e1`).delete();
  assert.equal((await rpc('enterPublicDemo',{tenantId:tenant})).status,503);
  assert.equal((await rpc('resetPublicDemo',{tenantId:tenant},token)).status,409,'old generation remains denied with explicit conflict');
  await denied(()=>setDoc(doc(old.db,'tenants',tenant,'employees','old-during-recovery'),{fullName:'Παλιό demo'}));
  await assert.rejects(()=>resetTenant(tenant,{scheduled:true}),error=>error.code==='aborted','active server lease cannot be stolen');
  await controlRef.update({leaseUntil:Date.now()-1});
  const result=await resetTenant(tenant,{scheduled:true});assert.equal(result.generation,prior.generation+1,'recovery completes the fenced generation instead of reusing old authority');
  assert.equal((await stateRef.get()).data().resetting,false);
  assert.equal((await dbAdmin.collection(`tenants/${tenant}/employees`).get()).size,6);
  assert.equal((await dbAdmin.doc(`tenantMemberships/${uid}_${tenant}`).get()).exists,false);
  await denied(()=>setDoc(doc(old.db,'tenants',tenant,'employees','old-after-recovery'),{fullName:'Παλιό demo'}));
  const fresh=await login(tenant),freshToken=await fresh.auth.currentUser.getIdToken();
  const create=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',
    headers:{Origin:`https://${tenant}.shiftoryx.gr`,Authorization:`Bearer ${freshToken}`,'Content-Type':'application/json'},
    body:JSON.stringify({operation:'emp.create',commandId:'emp_'+randomUUID(),payload:{fullName:'Νέα φανταστική συνεδρία'}}),
    signal:AbortSignal.timeout(120000)});
  assert.equal(create.status,200);const created=await create.json();
  assert.equal((await dbAdmin.doc(`tenants/${tenant}/employees/${created.id}`).get()).exists,true);
  console.log('DEMO_INTERRUPTED_LEASE_RECOVERY_PASS');
}finally{await close();}
