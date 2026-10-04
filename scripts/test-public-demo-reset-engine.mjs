import assert from 'node:assert/strict';
import {ResetError} from '../functions/src/public-demo/reset-state.ts';
const module=await import('../functions/src/public-demo/reset-engine.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;
});
assert.equal(typeof module.createDemoResetEngine,'function','B3 reset orchestrator missing');
const tenant='demo-fuel',uid=tenant+'-owner-g7',now=Date.parse('2026-10-02T12:00:00Z');
function setup(){
  const rows=new Map([
    [`demoState/${tenant}`,{generation:7,resetting:false,phase:'OPEN',weekStart:'2026-09-28',lastResetAt:0}],
    [`demoControl/${tenant}`,{phase:'OPEN',lease:null,leaseUntil:0,previousOwner:null}],
    [`tenants/${tenant}`,{id:tenant,slug:tenant,status:'ACTIVE',isDemo:true}],
    [`tenantMemberships/${uid}_${tenant}`,{uid,tenantId:tenant,role:'OWNER',status:'ACTIVE'}],
    [`tenants/${tenant}/employees/sentinel`,{fullName:'Φανταστικός'}],
    ['tenants/demo-cafe/employees/foreign',{fullName:'Ξένος φανταστικός'}],
    [`demoPdfLimits/${tenant}`,{retainedIntentCount:0}],
  ]);
  const state={rows,active:false,countOverride:null};
  const database={transaction:async run=>{
    assert.equal(state.active,false);state.active=true;const next=structuredClone(state.rows);let wrote=false;
    const list=(path,limit,filter)=>[...next.entries()].filter(([key,data])=>key.startsWith(path+'/')&&
      !key.slice(path.length+1).includes('/')&&(!filter||data.tenantId===filter.tenantId)).slice(0,limit)
      .map(([key,data])=>({id:key.slice(path.length+1),data:structuredClone(data)}));
    const tx={get:async path=>{assert.equal(wrote,false);return structuredClone(next.get(path));},
      list:async(path,limit,filter)=>{assert.equal(wrote,false);return list(path,limit,filter);},
      count:async(path,limit,filter)=>{assert.equal(wrote,false);return state.countOverride?.(path,limit)??list(path,limit,filter).length;},
      set:(path,data)=>{wrote=true;next.set(path,structuredClone(data));},delete:path=>{wrote=true;next.delete(path)}};
    try{const result=await run(tx);state.rows=next;return result;}finally{state.active=false;}
  }};
  const users=new Set([uid]),objects=new Map([[`tenants/${tenant}/schedule-publications/sentinel/schedule.pdf`,'1']]),effects=[];
  function destructive(action){assert.equal(state.active,false,'external effects never inside Firestore transaction');
    const current=state.rows.get(`demoState/${tenant}`);assert.equal(current.phase,'DESTRUCTIVE');
    assert.equal(current.generation,8);assert.equal(current.resetting,true);effects.push(action);}
  const auth={revoke:async id=>{destructive('revoke');assert.equal(id,uid);},
    remove:async id=>{destructive('removeAuth');users.delete(id);},
    ensure:async(id,generation)=>{destructive('ensure');assert.equal(id,tenant);assert.equal(generation,8);
      users.add(tenant+'-owner-g8');return tenant+'-owner-g8';},
    verify:async(id,generation)=>{assert.equal(users.has(`${id}-owner-g${generation}`),true);}};
  const storage={list:async()=>[...objects].map(([name,generation])=>({name,generation})),
    remove:async(id,object)=>{destructive('removeStorage');assert.equal(id,tenant);assert.equal(objects.get(object.name),object.generation);objects.delete(object.name);}};
  return {state,database,auth,storage,users,objects,effects,engine:()=>module.createDemoResetEngine({database,auth,storage,now:()=>now,sleep:async()=>{}})};
}
for(const failure of ['counter','capacity','uncertain']){
  const fixture=setup();
  if(failure==='counter')fixture.state.rows.get(`demoPdfLimits/${tenant}`).retainedIntentCount=1;
  if(failure==='capacity')fixture.state.countOverride=path=>path===`tenants/${tenant}/employees`?10000:undefined;
  if(failure==='uncertain')fixture.state.rows.set(`demoPdfControls/${tenant}`,{stage:'IO_UNCERTAIN'});
  const before=structuredClone(fixture.state.rows);
  await assert.rejects(()=>fixture.engine().run(tenant,{scheduled:true}),{code:failure==='counter'?'RESET_INTENT_MISMATCH':
    failure==='capacity'?'RESET_CAPACITY_EXCEEDED':'RESET_PDF_RECOVERY_REQUIRED'});
  assert.deepEqual(fixture.state.rows,before);assert.equal(fixture.effects.length,0);assert.equal(fixture.users.has(uid),true);assert.equal(fixture.objects.size,1);
}
console.log('B3_ENGINE_PRECHECK_ZERO_EFFECTS_ROLLBACK_PASS');
const normal=setup(),result=await normal.engine().run(tenant,{scheduled:true});
assert.equal(result.generation,8);assert.equal(normal.state.rows.get(`demoState/${tenant}`).phase,'OPEN');
assert.equal(normal.state.rows.get(`demoState/${tenant}`).resetting,false);
assert.equal(normal.state.rows.has(`tenantMemberships/${uid}_${tenant}`),false);
assert.equal(normal.users.has(uid),false);assert.equal(normal.users.has(tenant+'-owner-g8'),true);assert.equal(normal.objects.size,0);
assert.equal([...normal.state.rows.keys()].filter(key=>key.startsWith(`tenants/${tenant}/employees/`)).length,6);
assert.deepEqual(normal.state.rows.get('tenants/demo-cafe/employees/foreign'),{fullName:'Ξένος φανταστικός'});
assert.equal(normal.state.rows.get(`demoAdmission/${tenant}`).generation,8);
console.log('B3_ENGINE_COMPLETE_CANONICAL_FINALIZE_PASS');
const lost=setup(),revoke=lost.auth.revoke;let crashed=false;
lost.auth.revoke=async id=>{if(!crashed){crashed=true;throw new ResetError('RESET_TRANSIENT');}await revoke(id);};
await assert.rejects(()=>lost.engine().run(tenant,{scheduled:true}),{code:'RESET_TRANSIENT'});
assert.equal(lost.state.rows.get(`demoState/${tenant}`).generation,8);assert.equal(lost.state.rows.get(`demoState/${tenant}`).phase,'DESTRUCTIVE');
assert.equal(lost.state.rows.get(`tenantMemberships/${uid}_${tenant}`).status,'REVOKED');
lost.state.rows.get(`demoControl/${tenant}`).leaseUntil=now-1;
assert.equal((await lost.engine().run(tenant,{scheduled:true})).generation,8);
assert.equal(lost.state.rows.get(`demoState/${tenant}`).resetting,false);assert.equal(lost.users.has(uid),false);
console.log('B3_ENGINE_POST_BOUNDARY_FORWARD_RECOVERY_PASS');

const corrupt=setup(),originalVerify=corrupt.auth.verify;
corrupt.auth.verify=async(...args)=>{await originalVerify(...args);corrupt.state.rows.delete(`demoAdmission/${tenant}`);};
await assert.rejects(()=>corrupt.engine().run(tenant,{scheduled:true}),{code:'RESET_FINALIZE_INVALID'});
assert.equal(corrupt.state.rows.get(`demoState/${tenant}`).phase,'FINALIZE');
assert.equal(corrupt.state.rows.get(`demoState/${tenant}`).resetting,true);
console.log('B3_MISSING_FINALIZE_INVARIANT_FAILS_CLOSED_PASS');
