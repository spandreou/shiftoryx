import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {canonicalJson} from '../src/services/publicationIntentV3.ts';
import {acquireResetLease,advanceResetBoundary} from '../functions/src/public-demo/reset-state.ts';
const retention=await import('../functions/src/public-demo/reset-retention.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;
});
assert.equal(typeof retention.reconcileRetainedIntents,'function','B3 actual-document intent reconciliation missing');
const tenant='demo-fuel',now=Date.parse('2026-10-02T12:00:00Z'),root=`demoPdfRequests/${tenant}/intents`,
  leaseId='12345678-1234-4123-8123-123456789abc';
const id=n=>`22345678-1234-4123-8123-${String(n).padStart(12,'0')}`;
const tombstone=(n,time=now-86400000)=>({intentId:id(n),tenantId:tenant,uid:tenant+'-owner-g7',generation:7,
  publicationId:'32345678-1234-4123-8123-123456789abc',inputHash:'0'.repeat(64),state:'INVALIDATED',invalidatedAt:time});
function settled(n){const request={intentId:id(n),draftId:'draft1',draftRevision:1,previewHash:'1'.repeat(64),acceptWarnings:true};
  return {request,inputHash:createHash('sha256').update(canonicalJson(request)).digest('hex'),tenantId:tenant,
    uid:tenant+'-owner-g7',generation:7,publicationId:'32345678-1234-4123-8123-123456789abd',version:1,
    periodKey:'WEEK_2026-09-28_2026-10-04',publishedAt:'2026-10-02T11:00:00.000Z',snapshotHash:'2'.repeat(64),
    rendererDigest:'3'.repeat(64),attemptId:'42345678-1234-4123-8123-123456789abc',state:'CANCELLED'};}
class Database{
  constructor(){this.rows=new Map([
    [`demoState/${tenant}`,{generation:7,resetting:false,phase:'OPEN',weekStart:'2026-09-28',lastResetAt:0}],
    [`demoControl/${tenant}`,{phase:'OPEN',lease:null,leaseUntil:0,previousOwner:null}],
    [`tenants/${tenant}`,{id:tenant,slug:tenant,status:'ACTIVE',isDemo:true}],
    [`tenantMemberships/${tenant}-owner-g7_${tenant}`,{uid:tenant+'-owner-g7',tenantId:tenant,role:'OWNER',status:'ACTIVE'}],
    [`demoPdfLimits/${tenant}`,{retainedIntentCount:2}],
    [`${root}/${id(1)}`,tombstone(1,now-8*86400000)],
    [`${root}/${id(2)}`,tombstone(2)],
  ]);}
  async transaction(run){const next=structuredClone(this.rows);let wrote=false;
    const tx={get:async path=>{assert.equal(wrote,false);return structuredClone(next.get(path));},
      list:async(path,limit)=>{assert.equal(wrote,false);return [...next.entries()].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/'))
        .slice(0,limit).map(([key,data])=>({id:key.slice(path.length+1),data:structuredClone(data)}));},
      set:(path,value)=>{wrote=true;next.set(path,structuredClone(value));},delete:path=>{wrote=true;next.delete(path)}};
    const result=await run(tx);this.rows=next;return result;}
}
async function setup(){const db=new Database(),lease=await acquireResetLease(db,tenant,{kind:'SCHEDULED'},now,leaseId);return {db,lease};}
const valid=await setup();
assert.deepEqual(await valid.db.transaction(tx=>retention.reconcileRetainedIntents(tx,valid.lease,now+1)),{actual:1,deleted:1});
assert.equal(valid.db.rows.has(`${root}/${id(1)}`),false);assert.equal(valid.db.rows.get(`${root}/${id(2)}`).invalidatedAt,now-86400000);
assert.equal(valid.db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount,1);
assert.deepEqual(await valid.db.transaction(tx=>retention.reconcileRetainedIntents(tx,valid.lease,now+2)),{actual:1,deleted:0});
console.log('B3_ACTUAL_COUNT_EXPIRED_DECREMENT_REPLAY_PASS');

for(const [label,alter,code]of [
  ['lower',db=>db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=1,'RESET_INTENT_MISMATCH'],
  ['higher',db=>db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=3,'RESET_INTENT_MISMATCH'],
  ['missing',db=>db.rows.delete(`demoPdfLimits/${tenant}`),'RESET_RECOVERY_REQUIRED'],
  ['malformed',db=>db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount='2','RESET_RECOVERY_REQUIRED'],
  ['foreign doc',db=>db.rows.get(`${root}/${id(2)}`).tenantId='demo-cafe','RESET_PDF_RECOVERY_REQUIRED'],
  ['uncertain',db=>db.rows.set(`${root}/${id(2)}`,{...settled(2),state:'IO_UNCERTAIN'}),'RESET_PDF_RECOVERY_REQUIRED'],
]){
  const {db,lease}=await setup();alter(db);const before=structuredClone(db.rows);
  await assert.rejects(()=>db.transaction(tx=>retention.reconcileRetainedIntents(tx,lease,now+1)),{code},label);
  assert.deepEqual(db.rows,before,'failure cannot prune expired docs or repair the counter');
}
console.log('B3_MISMATCH_MALFORMED_UNCERTAIN_FAIL_CLOSED_PASS');

for(const length of [800,801]){
  const {db,lease}=await setup();for(const key of [...db.rows.keys()])if(key.startsWith(root+'/'))db.rows.delete(key);
  for(let n=1;n<=length;n++)db.rows.set(`${root}/${id(n)}`,tombstone(n));
  db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=800;
  if(length===800)assert.deepEqual(await db.transaction(tx=>retention.reconcileRetainedIntents(tx,lease,now+1)),{actual:800,deleted:0});
  else{const before=structuredClone(db.rows);await assert.rejects(()=>db.transaction(tx=>retention.reconcileRetainedIntents(tx,lease,now+1)),{code:'RESET_INTENT_CAPACITY'});assert.deepEqual(db.rows,before);}
}
console.log('B3_INTENT_800_ALLOWED_801_BLOCKED_PASS');

const destruct=await setup();destruct.db.rows.set(`${root}/${id(3)}`,settled(3));destruct.db.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=3;
const boundary=await destruct.db.transaction(tx=>advanceResetBoundary(tx,destruct.lease,now+1));
assert.deepEqual(await destruct.db.transaction(tx=>retention.invalidateRetainedIntents(tx,boundary,now+2)),{actual:2,deleted:1,invalidated:1});
assert.equal(destruct.db.rows.get(`${root}/${id(3)}`).state,'INVALIDATED');
assert.equal(destruct.db.rows.get(`${root}/${id(2)}`).invalidatedAt,now-86400000);
assert.deepEqual(await destruct.db.transaction(tx=>retention.invalidateRetainedIntents(tx,boundary,now+3)),{actual:2,deleted:0,invalidated:0});
console.log('B3_DESTRUCTIVE_TOMBSTONE_IDEMPOTENCY_PASS');

const active={operationId:id(1),attemptId:id(2),kind:'PUBLISH',generation:7,stage:'RESERVED',startedAt:now-20,heartbeatAt:now-10};
assert.equal(retention.classifyPdfResetControl(undefined,7,now),'CLEAR');
assert.equal(retention.classifyPdfResetControl(active,7,now),'WAIT');
for(const patch of [{stage:'IO_UNCERTAIN'},{stage:'CANCEL_PENDING',cleanupUncertain:true},{stage:'FINALIZED'},
  {heartbeatAt:now-121000,startedAt:now-122000},{generation:8},{heartbeatAt:now+1},{kind:'UNKNOWN'}])
  assert.throws(()=>retention.classifyPdfResetControl({...active,...patch},7,now),{code:'RESET_PDF_RECOVERY_REQUIRED'});
console.log('B3_PDF_CONTROL_CLASSIFICATION_PASS');

const observed=await setup(),live=settled(3);live.state='IO_INTENT';
observed.db.rows.set(`${root}/${id(3)}`,live);
observed.db.rows.set(`demoPdfControls/${tenant}`,{...active,operationId:id(3),attemptId:live.attemptId,stage:'IO_INTENT',heartbeatAt:now+5});
observed.db.rows.set(`tenants/${tenant}/schedulePublicationReservations/${live.publicationId}`,{
  transportVersion:1,tenantId:tenant,generation:7,publishedByUid:live.uid,intentId:id(3),attemptId:live.attemptId,
  state:'IO_INTENT',version:live.version,snapshotHash:live.snapshotHash});
assert.equal(await observed.db.transaction(tx=>retention.inspectPdfResetOperation(tx,observed.lease,now,()=>now+6)),'WAIT',
  'live heartbeat read after validation-clock sampling is not a future/corrupt operation');
console.log('B3_PDF_ASYNC_READ_CLOCK_PASS');
