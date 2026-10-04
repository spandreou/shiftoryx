import assert from 'node:assert/strict';
import {dbAdmin,login,rpc,close,tenants} from './test-support.mjs';

let rounds=0,losers=0;
async function race(tenant,callers){
  const client=await login(tenant),token=await client.auth.currentUser.getIdToken();
  // Each round is an independent emulator fixture. Never disable/change the
  // deployed cooldown; reset only its fixture timestamp between test rounds.
  await dbAdmin.doc(`demoState/${tenant}`).update({lastResetAt:0});
  const before=(await dbAdmin.doc(`demoState/${tenant}`).get()).data();
  const foreign=new Map();for(const other of tenants.filter(id=>id!==tenant))foreign.set(other,
    {state:(await dbAdmin.doc(`demoState/${other}`).get()).data(),
      roster:(await dbAdmin.collection(`tenants/${other}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()}))});
  const results=await Promise.all(Array.from({length:callers},()=>rpc('resetPublicDemo',{tenantId:tenant},token)));
  const summary=results.map(result=>({status:result.status,code:result.error?.status??null,detail:result.error?.details?.code??null}));
  if(results.some(result=>result.status===500))console.log('B3_CONCURRENT_RED='+JSON.stringify(summary));
  assert.equal(results.filter(result=>result.status===200).length,1,'each race must have exactly one winner');
  assert.ok(results.every(result=>result.status===200||[403,409,429].includes(result.status)),
    'losers must have controlled authorization/contention/cooldown status, never INTERNAL: '+JSON.stringify(summary));
  const after=(await dbAdmin.doc(`demoState/${tenant}`).get()).data();
  assert.equal(after.generation,before.generation+1);assert.equal(after.resetting,false);assert.equal(after.phase,'OPEN');
  assert.equal((await dbAdmin.doc(`tenantMemberships/${client.auth.currentUser.uid}_${tenant}`).get()).exists,false);
  for(const [other,snapshot]of foreign){
    assert.deepEqual((await dbAdmin.doc(`demoState/${other}`).get()).data(),snapshot.state,'foreign state untouched');
    assert.deepEqual((await dbAdmin.collection(`tenants/${other}/employees`).get()).docs.map(row=>({id:row.id,data:row.data()})),
      snapshot.roster,'foreign roster untouched');
  }
  rounds++;losers+=callers-1;
}
try{
  for(const tenant of tenants){for(let n=0;n<20;n++)await race(tenant,2);
    console.log(`B3_CONCURRENT_TENANT_PASS tenant=${tenant} twoWayRaces=20`);}
  await race('demo-fuel',4);
  console.log(`B3_CONCURRENT_RESET_PASS races=${rounds} winners=${rounds} controlledLosers=${losers} INTERNAL=0 foreignMutations=0`);
}finally{await close();}
