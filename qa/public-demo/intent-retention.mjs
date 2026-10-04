import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,close} from './test-support.mjs';
import {resetTenant} from '../../functions/src/public-demo/generated.js';
import {tombstone,settled} from './reset-test-support.mjs';

const tenant='demo-fuel',now=Date.now(),paths=[randomUUID(),randomUUID(),randomUUID()].map(id=>`demoPdfRequests/${tenant}/intents/${id}`);
try{
  const [expired,young,finalized]=paths;
  const generation=(await dbAdmin.doc(`demoState/${tenant}`).get()).data().generation;
  await dbAdmin.doc(expired).set(tombstone(tenant,generation,now-8*86400000,expired.split('/').at(-1)));
  await dbAdmin.doc(young).set(tombstone(tenant,generation,now-86400000,young.split('/').at(-1)));
  await dbAdmin.doc(finalized).set({...settled(tenant,generation,finalized.split('/').at(-1)),state:'FINALIZED'});
  await dbAdmin.doc(`demoPdfLimits/${tenant}`).update({retainedIntentCount:3});
  const before=(await dbAdmin.doc(`demoState/${tenant}`).get()).data();
  const result=await resetTenant(tenant,{scheduled:true});
  assert.equal(result.generation,before.generation+1);
  assert.equal((await dbAdmin.doc(expired).get()).exists,false);
  assert.equal((await dbAdmin.doc(young).get()).data().invalidatedAt,now-86400000);
  assert.equal((await dbAdmin.doc(finalized).get()).data().state,'INVALIDATED');
  assert.equal((await dbAdmin.doc(`demoPdfLimits/${tenant}`).get()).data().retainedIntentCount,2,'reset retains exactly two live intent docs');
  assert.equal((await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().pdfIntentCreates,0,'new generation has fresh per-generation count');
  assert.deepEqual((await dbAdmin.doc(`demoAuditReceipts/${tenant}`).get()).data().receipts,{});
  console.log('PUBLIC_DEMO_INTENT_RETENTION_EMULATOR_PASS');
}finally{await close();}
