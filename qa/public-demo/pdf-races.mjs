import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,close,bucket,resetTenant,latch,until,context,ControlledAtomicStorage} from './pdf-race-support.mjs';
import {createPdfPublicationCore} from '../../functions/src/public-demo/pdf-coordinator.ts';
import {renderServerPublication} from '../../functions/src/public-demo/pdf-transport.ts';
import {rpc} from './test-support.mjs';
let checks=0;async function test(name,run){await run();checks++;console.log('PASS '+name);}
async function noPublished(c){assert.equal((await dbAdmin.collection(`tenants/${c.tenant}/schedulePublications`).get()).size,0);}
async function deleteSettledTestIntent(tenant,id){
  const intent=dbAdmin.doc(`demoPdfRequests/${tenant}/intents/${id}`),limit=dbAdmin.doc(`demoPdfLimits/${tenant}`);
  await dbAdmin.runTransaction(async tx=>{
    const [row,quota]=await Promise.all([tx.get(intent),tx.get(limit)]);
    if(!row.exists)return;
    assert.ok(Number.isSafeInteger(quota.data()?.retainedIntentCount)&&quota.data().retainedIntentCount>0);
    tx.delete(intent);tx.update(limit,{retainedIntentCount:quota.data().retainedIntentCount-1});
  });
}
try{
  await test('controlled atomic contract create/read/delete',async()=>{
    const s=new ControlledAtomicStorage(),bytes=Buffer.from('%PDF-1.3\nA\n%%EOF'),path='controlled-contract';const r=await s.create(path,bytes,{ifGenerationMatch:0});
    await assert.rejects(()=>s.create(path,Buffer.from('changed'),{ifGenerationMatch:0}));await assert.rejects(()=>s.read(path,'999'));await assert.rejects(()=>s.remove(path,'999'));assert.deepEqual(Buffer.from((await s.read(path,r.generation)).bytes),bytes);await s.remove(path,r.generation);assert.equal(s.objects.size,0);
  });
  await test('reset before admission denies old identity',async()=>{const c=await context();await resetTenant(c.tenant,{scheduled:true});await assert.rejects(()=>c.publish(c.request()));await noPublished(c);});
  for(const stage of ['RESERVED','IO_INTENT','OBJECT_STORED'])await test('controlled reset at '+stage+' drains before unlock',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-fuel',atomic),hold=latch(),started=latch();let core;
    if(stage==='RESERVED')core=createPdfPublicationCore({database:c.database,storage:atomic,authenticate:c.authenticate,render:async snapshot=>{started.resolve();await hold.promise;return renderServerPublication(snapshot);}});
    else{const method=stage==='IO_INTENT'?'create':'read',base=atomic[method].bind(atomic);atomic[method]=async(...args)=>{started.resolve();await hold.promise;return base(...args);};core=createPdfPublicationCore({database:c.database,storage:atomic,authenticate:c.authenticate});}
    const publishing=core.publish(c.request()).then(()=>false,()=>true);await started.promise;const reset=resetTenant(c.tenant,{scheduled:true});await until(async()=>(await c.state()).resetting);await noPublished(c);hold.resolve();assert.equal(await publishing,true);await reset;assert.equal(atomic.objects.size,0);await noPublished(c);assert.equal((await c.state()).resetting,false);
  });
  await test('basic emulator late upload tracked and removed before reset success',async()=>{
    const c=await context(),hold=latch(),started=latch(),base=c.storage.create.bind(c.storage);c.storage.create=async(...args)=>{started.resolve();await hold.promise;return base(...args);};
    const publishing=c.publish(c.request()).then(()=>false,()=>true);await started.promise;const reset=resetTenant(c.tenant,{scheduled:true});await until(async()=>(await c.state()).resetting);hold.resolve();assert.equal(await publishing,true);await reset;assert.equal((await bucket.getFiles({prefix:`tenants/${c.tenant}/schedule-publications/`}))[0].length,0);await noPublished(c);
  });
  await test('duplicate and concurrent intents serialized',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-fuel',atomic),hold=latch(),started=latch(),base=atomic.create.bind(atomic);atomic.create=async(...args)=>{started.resolve();await hold.promise;return base(...args);};
    const first=c.publish(c.request());await started.promise;await assert.rejects(()=>c.publish(c.request()),e=>e.code==='PDF_RECOVERY_REQUIRED');await assert.rejects(()=>c.publish(c.request({...c.input,intentId:randomUUID()})),e=>e.code==='PDF_BUSY');hold.resolve();const result=await first,repeat=await c.publish(c.request());assert.equal(result.publicationId,repeat.publicationId);assert.equal(repeat.replayed,true);assert.equal(atomic.objects.size,1);
  });
  for(const authority of ['membership','platform','reservation'])await test('changed '+authority+' cannot finalize',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-fuel',atomic),base=atomic.read.bind(atomic);let changed=false;
    atomic.read=async(...args)=>{const value=await base(...args);if(!changed){changed=true;if(authority==='membership')await dbAdmin.doc(`tenantMemberships/${c.client.auth.currentUser.uid}_${c.tenant}`).update({status:'REVOKED'});else if(authority==='platform')await dbAdmin.doc('platformAdmins/'+c.client.auth.currentUser.uid).set({status:'ACTIVE'});else{const rows=await dbAdmin.collection(`tenants/${c.tenant}/schedulePublicationReservations`).get();await rows.docs[0].ref.update({version:999});}}return value;};
    await assert.rejects(()=>c.publish(c.request()));await noPublished(c);await dbAdmin.doc('platformAdmins/'+c.client.auth.currentUser.uid).delete();
    if(authority==='reservation'){assert.equal(atomic.objects.size,1);await dbAdmin.doc('demoPdfControls/'+c.tenant).delete();await deleteSettledTestIntent(c.tenant,c.input.intentId);atomic.objects.clear();} // Test-only corruption fixture with conclusively settled controlled I/O.
  });
  await test('buffered download reset before byte admission denied',async()=>{
    const c=await context(),p=await c.publish(c.request()),hold=latch(),started=latch(),base=c.storage.read.bind(c.storage);c.storage.read=async(...args)=>{const result=await base(...args);started.resolve();await hold.promise;return result;};
    const prepared=c.download.prepare(c.request({publicationId:p.publicationId}));await started.promise;const reset=resetTenant(c.tenant,{scheduled:true});await until(async()=>(await c.state()).resetting);hold.resolve();const d=await prepared;await assert.rejects(()=>d.authorizeRelease());await d.finish();await reset;await noPublished(c);
  });
  await test('admitted download holds reset until response finishes',async()=>{
    const c=await context(),p=await c.publish(c.request()),d=await c.download.prepare(c.request({publicationId:p.publicationId}));await d.authorizeRelease();let done=false;const reset=resetTenant(c.tenant,{scheduled:true}).then(()=>done=true);await until(async()=>(await c.state()).resetting);assert.equal(done,false);await d.finish();await reset;assert.equal(done,true);
  });
  await test('old intent cannot be recreated after reset',async()=>{
    const c=await context(),old=await c.publish(c.request());await resetTenant(c.tenant,{scheduled:true});await assert.rejects(()=>c.publish(c.request()));assert.equal((await dbAdmin.doc(`demoPdfRequests/${c.tenant}/intents/${c.input.intentId}`).get()).data().state,'INVALIDATED');assert.equal((await dbAdmin.doc(`tenants/${c.tenant}/schedulePublications/${old.publicationId}`).get()).exists,false);
  });
  await test('old attempt loses CAS authority after ownership changes',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-fuel',atomic),base=atomic.read.bind(atomic);atomic.read=async(...args)=>{const object=await base(...args);await dbAdmin.doc('demoPdfControls/'+c.tenant).update({attemptId:randomUUID()});return object;};await assert.rejects(()=>c.publish(c.request()),e=>e.code==='PDF_RECOVERY_REQUIRED');await noPublished(c);assert.equal(atomic.objects.size,1);
    await dbAdmin.doc('demoPdfControls/'+c.tenant).delete();await deleteSettledTestIntent(c.tenant,c.input.intentId);atomic.objects.clear(); // Only settled controlled-corruption fixture, no GCS I/O.
  });
  await test('public reset rejects platform overlap and owner preserves quota',async()=>{
    const c=await context(),uid=c.client.auth.currentUser.uid,token=await c.client.auth.currentUser.getIdToken(),before=await c.state();await dbAdmin.doc('platformAdmins/'+uid).set({status:'ACTIVE'});
    assert.equal((await rpc('resetPublicDemo',{tenantId:c.tenant},token)).status,403);assert.equal((await c.state()).generation,before.generation);await dbAdmin.doc('platformAdmins/'+uid).delete();
    await dbAdmin.doc('demoState/'+c.tenant).update({lastResetAt:0});const quota=dbAdmin.doc('demoPdfLimits/'+c.tenant),beforeQuota=(await quota.get()).data();await quota.set({...beforeQuota,hour:1,count:30,downloadMinute:1,downloadCount:60});assert.equal((await rpc('resetPublicDemo',{tenantId:c.tenant},token)).status,200);assert.equal((await quota.get()).data().downloadCount,60);
  });
  await test('trusted reset prunes expired tombstones without renewing recent age',async()=>{
    const c=await context(),oldId=randomUUID(),recentId=randomUUID(),old=Date.now()-8*86400000,recent=Date.now()-86400000;
    for(const [id,time]of [[oldId,old],[recentId,recent]])await dbAdmin.doc(`demoPdfRequests/${c.tenant}/intents/${id}`).set({intentId:id,tenantId:c.tenant,uid:c.client.auth.currentUser.uid,generation:(await c.state()).generation,publicationId:randomUUID(),inputHash:'0'.repeat(64),state:'INVALIDATED',invalidatedAt:time});
    const quota=dbAdmin.doc(`demoPdfLimits/${c.tenant}`),prior=(await quota.get()).data().retainedIntentCount;await quota.update({retainedIntentCount:prior+2});
    await resetTenant(c.tenant,{scheduled:true});assert.equal((await dbAdmin.doc(`demoPdfRequests/${c.tenant}/intents/${oldId}`).get()).exists,false);assert.equal((await dbAdmin.doc(`demoPdfRequests/${c.tenant}/intents/${recentId}`).get()).data().invalidatedAt,recent);assert.equal((await quota.get()).data().retainedIntentCount,prior+1);
  });
  await test('uncertain worker blocks reset despite expired timestamps',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-market',atomic),before=await c.state();atomic.create=async()=>{throw Error('ambiguous outcome');};await assert.rejects(()=>c.publish(c.request()),e=>e.code==='PDF_RECOVERY_REQUIRED');await dbAdmin.doc('demoPdfControls/'+c.tenant).update({startedAt:0,heartbeatAt:0});await assert.rejects(()=>resetTenant(c.tenant,{scheduled:true}),e=>e.code==='failed-precondition');assert.equal((await c.control()).stage,'IO_UNCERTAIN');assert.equal((await c.state()).resetting,false);assert.equal((await c.state()).generation,before.generation);await noPublished(c);
  });
  await test('cleanup failure blocks reset and preserves evidence',async()=>{
    const atomic=new ControlledAtomicStorage(),c=await context('demo-salon',atomic),base=atomic.read.bind(atomic);atomic.read=async(...args)=>{const value=await base(...args);await dbAdmin.doc(`tenantMemberships/${c.client.auth.currentUser.uid}_${c.tenant}`).update({status:'REVOKED'});return value;};atomic.remove=async()=>{throw Error('delete outcome uncertain');};await assert.rejects(()=>c.publish(c.request()),e=>e.code==='PDF_RECOVERY_REQUIRED');assert.equal((await c.control()).stage,'CANCEL_PENDING');await assert.rejects(()=>resetTenant(c.tenant,{scheduled:true}),e=>e.code==='failed-precondition');assert.equal(atomic.objects.size,1);await noPublished(c);
  });
  console.log(`PDF_RACE_EVIDENCE_PASS checks=${checks} realFirestore=true controlledAtomicContract=true emulatorGenerationFidelity=UNSUPPORTED REAL_GCS_IMMUTABILITY_GATE=PENDING`);
}finally{await close();}
