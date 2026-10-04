import assert from 'node:assert/strict';
const state=await import('../functions/src/public-demo/reset-state.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;
});
assert.equal(typeof state.acquireResetLease,'function','B3 exact-phase reset lease primitive missing');
const tenant='demo-fuel',now=Date.parse('2026-10-02T12:00:00Z'),
  first='12345678-1234-4123-8123-123456789abc',second='12345678-1234-4123-8123-123456789abd';
class Database{
  constructor(){this.rows=new Map([
    [`demoState/${tenant}`,{generation:7,resetting:false,phase:'OPEN',weekStart:'2026-09-28',lastResetAt:0}],
    [`demoControl/${tenant}`,{phase:'OPEN',lease:null,leaseUntil:0,previousOwner:null}],
    [`tenants/${tenant}`,{id:tenant,slug:tenant,status:'ACTIVE',isDemo:true}],
    [`tenantMemberships/${tenant}-owner-g7_${tenant}`,{uid:tenant+'-owner-g7',tenantId:tenant,role:'OWNER',status:'ACTIVE'}],
    [`tenants/${tenant}/employees/sentinel`,{fullName:'Φανταστικός'}],
  ]);this.tail=Promise.resolve();}
  async transaction(run){const before=this.tail;let release;this.tail=new Promise(r=>release=r);await before;
    const next=structuredClone(this.rows);let wrote=false;
    const tx={get:async path=>{assert.equal(wrote,false,'read before write');return structuredClone(next.get(path));},
      set:(path,value)=>{wrote=true;next.set(path,structuredClone(value));},delete:path=>{wrote=true;next.delete(path)}};
    try{const result=await run(tx);this.rows=next;return result;}finally{release();}}
}
const request={kind:'SCHEDULED'};
const db=new Database(),lease=await state.acquireResetLease(db,tenant,request,now,first);
assert.equal(lease.phase,'PRECHECK');assert.equal(lease.generation,7);assert.equal(lease.baseGeneration,7);
assert.equal(db.rows.get(`demoState/${tenant}`).generation,7);assert.equal(db.rows.get(`demoState/${tenant}`).resetting,true);
assert.equal(db.rows.get(`tenantMemberships/${tenant}-owner-g7_${tenant}`).status,'ACTIVE');
await assert.rejects(()=>state.acquireResetLease(db,tenant,request,now+1,second),{code:'RESET_IN_PROGRESS'});
assert.equal(await state.rollbackPrecheck(db,lease,now+2),true);
assert.deepEqual(db.rows.get(`demoState/${tenant}`),{generation:7,resetting:false,phase:'OPEN',weekStart:'2026-09-28',lastResetAt:0});
assert.equal(db.rows.get(`demoControl/${tenant}`).lease,null);
assert.equal(db.rows.get(`tenantMemberships/${tenant}-owner-g7_${tenant}`).status,'ACTIVE');
assert.equal(db.rows.get(`tenants/${tenant}/employees/sentinel`).fullName,'Φανταστικός');
console.log('B3_PRECHECK_PHASE_ROLLBACK_PASS');

const expired=new Database(),old=await state.acquireResetLease(expired,tenant,request,now,first);
expired.rows.get(`demoControl/${tenant}`).leaseUntil=now+10;
const renewed=await state.acquireResetLease(expired,tenant,request,now+11,second);
assert.equal(renewed.generation,7);assert.equal(renewed.phase,'PRECHECK');
const unchanged=structuredClone(expired.rows);
assert.equal(await state.rollbackPrecheck(expired,old,now+12),false);
assert.deepEqual(expired.rows,unchanged,'old worker cannot clear successor lease');
await assert.rejects(()=>expired.transaction(tx=>state.assertResetLease(tx,old,now+12)),{code:'RESET_LEASE_LOST'});
assert.equal(expired.rows.get(`tenantMemberships/${tenant}-owner-g7_${tenant}`).status,'ACTIVE');
console.log('B3_PRECHECK_WORKER_LOSS_CAS_PASS');

const boundary=new Database(),before=await state.acquireResetLease(boundary,tenant,request,now,first);
const destructive=await boundary.transaction(tx=>state.advanceResetBoundary(tx,before,now+1));
assert.equal(destructive.phase,'DESTRUCTIVE');assert.equal(destructive.generation,8);
assert.equal(boundary.rows.get(`demoState/${tenant}`).generation,8);
assert.equal(boundary.rows.get(`demoState/${tenant}`).resetting,true);
assert.equal(boundary.rows.get(`demoControl/${tenant}`).phase,'DESTRUCTIVE');
assert.equal(boundary.rows.get(`tenantMemberships/${tenant}-owner-g7_${tenant}`).status,'REVOKED');
assert.equal(await state.rollbackPrecheck(boundary,before,now+2),false,'boundary cannot be rolled back');
boundary.rows.get(`demoControl/${tenant}`).leaseUntil=now+3;
const recovered=await state.acquireResetLease(boundary,tenant,request,now+4,second);
assert.equal(recovered.generation,8);assert.equal(recovered.baseGeneration,7);
assert.equal(boundary.rows.get(`tenantMemberships/${tenant}-owner-g7_${tenant}`).status,'REVOKED');
await assert.rejects(()=>boundary.transaction(tx=>state.advanceResetFinalize(tx,recovered,now+5)),{code:'RESET_FINALIZE_INVALID'});
await boundary.transaction(tx=>state.heartbeatResetLease(tx,recovered,now+5,{authRevoked:true,oldAuthDeleted:true}));
boundary.rows.set(`tenantMemberships/${tenant}-owner-g8_${tenant}`,{uid:tenant+'-owner-g8',tenantId:tenant,role:'OWNER',status:'ACTIVE'});
const finalizing=await boundary.transaction(tx=>state.advanceResetFinalize(tx,recovered,now+5));
assert.equal(finalizing.phase,'FINALIZE');assert.equal(boundary.rows.get(`demoState/${tenant}`).resetting,true);
console.log('B3_DESTRUCTIVE_FORWARD_RECOVERY_PASS');

const legacy=new Database();delete legacy.rows.get(`demoState/${tenant}`).phase;delete legacy.rows.get(`demoControl/${tenant}`).phase;
assert.equal((await state.acquireResetLease(legacy,tenant,request,now,first)).phase,'PRECHECK');
const ambiguous=new Database();ambiguous.rows.set(`demoState/${tenant}`,{generation:8,resetting:true,weekStart:'2026-09-28',lastResetAt:0});
ambiguous.rows.set(`demoControl/${tenant}`,{lease:first,leaseUntil:now-1,previousOwner:tenant+'-owner-g7'});
const baseline=structuredClone(ambiguous.rows);
await assert.rejects(()=>state.acquireResetLease(ambiguous,tenant,request,now,second),{code:'RESET_RECOVERY_REQUIRED'});
assert.deepEqual(ambiguous.rows,baseline,'legacy busy phase must never be guessed');
await assert.rejects(()=>state.acquireResetLease(new Database(),'bp-kallis',request,now,first));
console.log('B3_LEGACY_OPEN_ONLY_COMPATIBILITY_PASS');

const initial=new Database();initial.rows.clear();
const bootstrap=await state.acquireResetLease(initial,tenant,{kind:'INITIAL'},now,first);
assert.equal(bootstrap.generation,0);assert.equal(bootstrap.initial,true);
assert.equal(await state.rollbackPrecheck(initial,bootstrap,now+1),true);
assert.equal(initial.rows.has(`demoState/${tenant}`),false,'failed initial PRECHECK restores prior absence');
assert.equal(initial.rows.has(`demoControl/${tenant}`),false);
console.log('B3_INITIAL_PRECHECK_ROLLBACK_PASS');

const changedInitial=new Database();changedInitial.rows.clear();
const initialLease=await state.acquireResetLease(changedInitial,tenant,{kind:'INITIAL'},now,first);
changedInitial.rows.set(`tenants/${tenant}`,{id:tenant,slug:tenant,isDemo:true,status:'ACTIVE'});
await assert.rejects(()=>changedInitial.transaction(tx=>state.advanceResetBoundary(tx,initialLease,now+1)),{code:'RESET_ALREADY_EXISTS'});
assert.equal(changedInitial.rows.get(`demoState/${tenant}`).generation,0);
console.log('B3_INITIAL_ROOT_CHANGE_BLOCKS_BOUNDARY_PASS');

const retried=new Database();await state.acquireResetLease(retried,tenant,request,now+1,first);
await assert.rejects(()=>state.acquireResetLease(retried,tenant,request,now,second,()=>now+2),{code:'RESET_IN_PROGRESS'},
  'transaction retry must classify a newer live lease rather than reject its timestamp as corruption');
console.log('B3_TRANSACTION_RETRY_CLOCK_PASS');
