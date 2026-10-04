import assert from 'node:assert/strict';
const admission=await import('../functions/src/public-demo/admission.ts');
assert.equal(typeof admission.settleRetainedDemoIntents,'function','retained-intent cleanup primitive missing');
const settleRetainedDemoIntents=admission.settleRetainedDemoIntents;

const tenant='demo-fuel',now=Date.parse('2026-09-30T12:00:00Z'),cutoff=now-7*86400000;
const oldPath=`demoPdfRequests/${tenant}/intents/12345678-1234-4123-8123-123456789abc`;
const freshPath=`demoPdfRequests/${tenant}/intents/12345678-1234-4123-8123-123456789abd`;
class LocalDatabase {
  constructor(){this.rows=new Map([
    [`demoControl/${tenant}`,{lease:'exact-lease'}],
    [`demoPdfLimits/${tenant}`,{retainedIntentCount:2,hour:1,count:2}],
    [oldPath,{tenantId:tenant,intentId:oldPath.split('/').at(-1),state:'INVALIDATED',invalidatedAt:cutoff-1}],
    // Live coordinator intents carry request.intentId, not a top-level intentId.
    [freshPath,{tenantId:tenant,request:{intentId:freshPath.split('/').at(-1)},uid:'demo-fuel-owner-g7',generation:7,publicationId:'pub',inputHash:'hash',state:'FINALIZED'}],
  ]);}
  async transaction(run){const next=structuredClone(this.rows);const tx={get:async path=>structuredClone(next.get(path)),
    set:(path,value)=>next.set(path,structuredClone(value)),delete:path=>next.delete(path)};
    const result=await run(tx);this.rows=next;return result;}
}
const db=new LocalDatabase();
const removed=await db.transaction(tx=>settleRetainedDemoIntents(tx,tenant,[oldPath,freshPath],now,'exact-lease'));
assert.equal(removed,1);
assert.equal(db.rows.has(oldPath),false);
assert.equal(db.rows.get(freshPath).state,'INVALIDATED');
assert.equal(db.rows.get(freshPath).invalidatedAt,now);
assert.equal(db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount,1);
const replay=await db.transaction(tx=>settleRetainedDemoIntents(tx,tenant,[freshPath],now+1000,'exact-lease'));
assert.equal(replay,0);
assert.equal(db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount,1);
assert.equal(db.rows.get(freshPath).invalidatedAt,now);
const wrongLease=structuredClone(db.rows);
await assert.rejects(()=>db.transaction(tx=>settleRetainedDemoIntents(tx,tenant,[freshPath],now,'stale-lease')),{code:'ADMISSION_LEASE_LOST'});
assert.deepEqual(db.rows,wrongLease);
db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=0;
const beforeUnderflow=structuredClone(db.rows);
await assert.rejects(()=>db.transaction(tx=>settleRetainedDemoIntents(tx,tenant,[freshPath],now+8*86400000,'exact-lease')),{code:'ADMISSION_STATE_INVALID'});
assert.deepEqual(db.rows,beforeUnderflow);
await assert.rejects(()=>db.transaction(tx=>settleRetainedDemoIntents(tx,tenant,['demoPdfRequests/demo-cafe/intents/12345678-1234-4123-8123-123456789abc'],now,'exact-lease')),{code:'ADMISSION_INVALID_COMMAND'});
console.log('PUBLIC_DEMO_PDF_INTENT_RETENTION_PASS');
