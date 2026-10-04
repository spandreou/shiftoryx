import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {getApps} from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import {dbAdmin,close} from './test-support.mjs';
import {createDemoResetAdapters} from '../../functions/src/public-demo/reset-adapters.ts';
import {acquireResetLease,rollbackPrecheck} from '../../functions/src/public-demo/reset-state.ts';
import {inspectRetainedIntents,reconcileRetainedIntents} from '../../functions/src/public-demo/reset-retention.ts';
import {tombstone,fixtureRows,clearFixtureRows} from './reset-test-support.mjs';
const {database}=createDemoResetAdapters(getApps()[0]),tenant='demo-fuel',path=`demoPdfRequests/${tenant}/intents`,limit=dbAdmin.doc(`demoPdfLimits/${tenant}`);
try{
  await assert.rejects(()=>fixtureRows('tenants/bp-kallis/employees',[]),/Fixture path denied/);
  await assert.rejects(()=>clearFixtureRows('demoPdfRequests/demo-cafe/intents'),/Fixture path denied/);
  await assert.rejects(()=>fixtureRows(path,[{id:'../foreign',data:{}}]),/Fixture rows denied/);
  const generation=(await dbAdmin.doc(`demoState/${tenant}`).get()).data().generation,now=Date.now();
  const expired=tombstone(tenant,generation,now-8*86400000),young=tombstone(tenant,generation,now-86400000);
  await fixtureRows(path,[expired,young].map(data=>({id:data.intentId,data})));await limit.update({retainedIntentCount:2});
  const lease=await acquireResetLease(database,tenant,{kind:'SCHEDULED'},now,randomUUID());
  assert.equal((await database.transaction(tx=>inspectRetainedIntents(tx,lease,Date.now()))).actual,2);
  for(const count of [1,3]){await limit.update({retainedIntentCount:count});
    await assert.rejects(()=>database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now())),{code:'RESET_INTENT_MISMATCH'});
    assert.equal((await dbAdmin.doc(path+'/'+expired.intentId).get()).exists,true);assert.equal((await limit.get()).data().retainedIntentCount,count);}
  await limit.update({retainedIntentCount:2});
  assert.deepEqual(await database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now())),{actual:1,deleted:1});
  assert.equal((await limit.get()).data().retainedIntentCount,1);assert.equal((await dbAdmin.doc(path+'/'+expired.intentId).get()).exists,false);
  assert.equal((await dbAdmin.doc(path+'/'+young.intentId).get()).data().invalidatedAt,young.invalidatedAt);
  assert.deepEqual(await database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now())),{actual:1,deleted:0});
  await clearFixtureRows(path);
  const rows=Array.from({length:800},()=>tombstone(tenant,generation));
  await fixtureRows(path,rows.map(data=>({id:data.intentId,data})));await limit.update({retainedIntentCount:800});
  assert.equal((await database.transaction(tx=>inspectRetainedIntents(tx,lease,Date.now()))).actual,800);
  const extra=tombstone(tenant,generation);await dbAdmin.doc(path+'/'+extra.intentId).set(extra);
  await assert.rejects(()=>database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now())),{code:'RESET_INTENT_CAPACITY'});
  assert.equal((await limit.get()).data().retainedIntentCount,800);assert.equal((await dbAdmin.collection(path).get()).size,801);
  await dbAdmin.doc(path+'/'+extra.intentId).delete();
  await fixtureRows(path,rows.map(data=>({id:data.intentId,data:{...data,invalidatedAt:now-8*86400000}})));
  for(let page=0;page<4;page++){const result=await database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now()));
    assert.equal(result.deleted,200);assert.equal(result.actual,800-200*(page+1));}
  assert.deepEqual(await database.transaction(tx=>reconcileRetainedIntents(tx,lease,Date.now())),{actual:0,deleted:0});
  assert.equal((await limit.get()).data().retainedIntentCount,0);assert.equal(await rollbackPrecheck(database,lease,Date.now()),true);
  console.log('B3_RETAINED_INTENTS_EMULATOR_PASS lower higher exact expiry young replay 800 801 fourAtomicPages noBlindRepair');
}finally{await close();}
