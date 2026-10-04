// Real endpoint rollback: every precondition leaves the previous OWNER usable.
import assert from 'node:assert/strict';
import {getDoc,doc} from 'firebase/firestore';
import {dbAdmin,authAdmin,bucket,login,rpc,close,tenants} from './test-support.mjs';
import {tombstone,fixtureRows,clearFixtureRows} from './reset-test-support.mjs';
const tenant='demo-fuel',client=await login(tenant),uid=client.auth.currentUser.uid;
const stateRef=dbAdmin.doc('demoState/'+tenant),limit=dbAdmin.doc('demoPdfLimits/'+tenant),
  intents='demoPdfRequests/'+tenant+'/intents',control=dbAdmin.doc('demoPdfControls/'+tenant);
try{
  const state=(await stateRef.get()).data(),owner=(await dbAdmin.doc('tenantMemberships/'+uid+'_'+tenant).get()).data(),
    identity=await authAdmin.getUser(uid),path='tenants/'+tenant+'/schedule-publications/precheck-sentinel/schedule.pdf';
  await bucket.file(path).save('%PDF-fictional-precheck-sentinel',{contentType:'application/pdf'});
  const [meta]=await bucket.file(path).getMetadata();
  const employees=(await dbAdmin.collection('tenants/'+tenant+'/employees').get()).docs.map(row=>({id:row.id,data:row.data()}));
  const foreign=new Map();for(const other of tenants.filter(id=>id!==tenant))foreign.set(other,(await dbAdmin.doc('demoState/'+other).get()).data());
  let checks=0;
  async function unchanged(label){
    const after=(await stateRef.get()).data();assert.equal(after.generation,state.generation);assert.equal(after.resetting,false);assert.equal(after.phase,'OPEN');
    assert.deepEqual((await dbAdmin.doc('tenantMemberships/'+uid+'_'+tenant).get()).data(),owner);
    const afterAuth=await authAdmin.getUser(uid);assert.equal(afterAuth.tokensValidAfterTime,identity.tokensValidAfterTime);assert.deepEqual(afterAuth.customClaims,identity.customClaims);
    assert.deepEqual((await dbAdmin.collection('tenants/'+tenant+'/employees').get()).docs.map(row=>({id:row.id,data:row.data()})),employees);
    assert.equal((await bucket.file(path).getMetadata())[0].generation,meta.generation);
    assert.ok((await getDoc(doc(client.db,'tenants',tenant,'employees',employees[0].id))).exists(),'prior OWNER read works after rollback');
    for(const [other,before]of foreign)assert.deepEqual((await dbAdmin.doc('demoState/'+other).get()).data(),before);
    checks++;console.log('B3_PRECHECK_ROLLBACK_PASS '+label);
  }
  async function rejected(label,setup,cleanup=async()=>{}){
    await setup();const beforeCounter=(await limit.get()).data();
    const response=await rpc('resetPublicDemo',{tenantId:tenant},await client.auth.currentUser.getIdToken());
    assert.equal(response.status,400,label+' must be a controlled precondition, not INTERNAL');
    assert.deepEqual((await limit.get()).data(),beforeCounter,'no blind repair/decrement on failed precondition');
    await unchanged(label);await cleanup();
  }
  for(const value of [1,'bad']){
    await rejected('counter-'+value,()=>limit.set({retainedIntentCount:value}),async()=>limit.set({retainedIntentCount:0}));
    // No blind counter repair.
    // Persisted check is performed inside setup-specific cases below.
  }
  await rejected('missing-counter',()=>limit.delete(),()=>limit.set({retainedIntentCount:0}));
  const row=tombstone(tenant,state.generation);
  await rejected('counter-lower-than-actual',()=>dbAdmin.doc(intents+'/'+row.intentId).set(row),async()=>{
    assert.equal((await limit.get()).data().retainedIntentCount,0);await clearFixtureRows(intents);});
  await rejected('uncertain-control',()=>control.set({stage:'IO_UNCERTAIN'}),async()=>{assert.equal((await control.get()).data().stage,'IO_UNCERTAIN');await control.delete();});
  await rejected('malformed-control',()=>control.set({stage:'RESERVED',operationId:'invalid'}),()=>control.delete());
  const extra=Array.from({length:801},()=>tombstone(tenant,state.generation));
  await rejected('801-intents',async()=>{await fixtureRows(intents,extra.map(data=>({id:data.intentId,data})));await limit.set({retainedIntentCount:800});},
    async()=>{assert.equal((await dbAdmin.collection(intents).get()).size,801);assert.equal((await limit.get()).data().retainedIntentCount,800);
      await clearFixtureRows(intents);await limit.set({retainedIntentCount:0});});
  await rejected('storage33',async()=>{for(let n=0;n<32;n++)await bucket.file('tenants/'+tenant+'/capacity-fixture-'+n+'.pdf').save('%PDF-fictional');},
    async()=>{const [files]=await bucket.getFiles({prefix:'tenants/'+tenant+'/capacity-fixture-'});assert.equal(files.length,32);for(const file of files)await file.delete();});
  for(const [collection,count]of [['tenants/demo-fuel/auditLogs',10000],['monthly_schedule_exports',9750]]){
    const rows=Array.from({length:count},(_,n)=>({id:'b3-capacity-'+n,data:{tenantId:tenant,fictional:true}}));
    await rejected(collection+'-ceiling',()=>fixtureRows(collection,rows),async()=>{
      assert.equal((await dbAdmin.collection(collection).count().get()).data().count,count);await clearFixtureRows(collection);});
  }
  console.log('B3_PRECHECK_EMULATOR_PASS checks='+checks+' generation OWNER Auth tenantData Storage foreignState unchanged');
}finally{await close();}
