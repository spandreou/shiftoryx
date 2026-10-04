import assert from 'node:assert/strict';

const transport=await import('../src/demo/mutationTransport.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};
  throw error;
});
assert.equal(typeof transport.createDemoMutationTransport,'function','demo mutation transport missing');
const rows=new Map(),storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),
  removeItem:key=>rows.delete(key)};
let generation=7,attempts=0;
const commands=[];
const deps={tenant:'demo-fuel',projectId:'demo-shiftoryx-public',demoEnabled:true,local:true,storage,
  identity:async()=>({tenant:'demo-fuel',uid:`demo-fuel-owner-g${generation}`,generation,getToken:async()=>'<test-token>'}),
  fetch:async(_url,request)=>{attempts++;commands.push(JSON.parse(request.body));
    if(attempts===1)throw new Error('network interruption');
    return {ok:true,status:200,json:async()=>({id:'demo-result',status:'created'})};}};
const client=transport.createDemoMutationTransport(deps);
await assert.rejects(()=>client.run('emp.create',{fullName:'Demo'}),{code:'NETWORK'});
assert.equal(rows.size,1);
assert.equal([...rows.values()][0].includes('<test-token>'),false,'token cannot be persisted');
assert.equal([...rows.values()][0].includes('Demo'),false,'raw mutation payload cannot be persisted');
assert.deepEqual(await client.run('emp.create',{fullName:'Demo'}),{id:'demo-result',status:'created'});
assert.equal(commands[0].commandId,commands[1].commandId,'same logical retry keeps command ID');
assert.deepEqual(await client.run('emp.create',{fullName:'Demo'}),{id:'demo-result',status:'created'});
assert.notEqual(commands[1].commandId,commands[2].commandId,'new action after success gets new ID');
assert.equal(rows.size,0);
assert.throws(()=>transport.createDemoMutationTransport({...deps,projectId:'production-project'}),
  {code:'ACCESS_DENIED'});
generation=8;
assert.deepEqual(await client.run('emp.create',{fullName:'Demo Two'}),{id:'demo-result',status:'created'});
assert.equal(commands[3].commandId.startsWith('emp_'),true);
console.log('PUBLIC_DEMO_MUTATION_TRANSPORT_RETRY_PASS');

const revisionRows=new Map(),revisionStorage={getItem:key=>revisionRows.get(key)??null,
  setItem:(key,value)=>revisionRows.set(key,value),removeItem:key=>revisionRows.delete(key)};
const revisionCommands=[];
const revisionClient=transport.createDemoMutationTransport({...deps,storage:revisionStorage,
  fetch:async(_url,request)=>{revisionCommands.push(JSON.parse(request.body));
    if(revisionCommands.length===1)throw new Error('response lost');
    return {ok:true,status:200,json:async()=>({id:'demo-e1',status:'updated',revision:1})};}});
await assert.rejects(()=>revisionClient.run('emp.update',{id:'demo-e1',fullName:'Demo Two',color:'#112233',expectedRevision:0}),
  {code:'NETWORK'});
assert.deepEqual(await revisionClient.run('emp.update',{id:'demo-e1',fullName:'Demo Two',color:'#112233',expectedRevision:1}),
  {id:'demo-e1',status:'updated',revision:1});
assert.equal(revisionCommands[0].commandId,revisionCommands[1].commandId);
assert.equal(revisionCommands[1].payload.expectedRevision,0,'retry must replay the original revision');
console.log('PUBLIC_DEMO_MUTATION_REVISION_RETRY_PASS');

const interleavedRows=new Map(),interleavedStorage={getItem:key=>interleavedRows.get(key)??null,
  setItem:(key,value)=>interleavedRows.set(key,value),removeItem:key=>interleavedRows.delete(key)};
const interleavedCommands=[];
const interleaved=transport.createDemoMutationTransport({...deps,storage:interleavedStorage,
  fetch:async(_url,request)=>{interleavedCommands.push(JSON.parse(request.body));
    if(interleavedCommands.length===1)throw new Error('lost A response');
    return {ok:true,status:200,json:async()=>({status:'recorded'})};}});
await assert.rejects(()=>interleaved.run('emp.create',{fullName:'Action A'}),{code:'NETWORK'});
await interleaved.run('aud.export',{exportType:'PDF',exportScope:'WEEK',status:'SUCCESS'});
await interleaved.run('emp.create',{fullName:'Action A'});
assert.equal(interleavedCommands[0].commandId,interleavedCommands[2].commandId,
  'independent action B must not discard ambiguous action A');
assert.equal(interleavedRows.size,0);
console.log('PUBLIC_DEMO_MUTATION_INTERLEAVED_RETRY_PASS');

const deleteRows=new Map(),deleteStorage={getItem:key=>deleteRows.get(key)??null,
  setItem:(key,value)=>deleteRows.set(key,value),removeItem:key=>deleteRows.delete(key)};
const deleteCommands=[];
const deleteClient=transport.createDemoMutationTransport({...deps,storage:deleteStorage,
  fetch:async(_url,request)=>{deleteCommands.push(JSON.parse(request.body));
    if(deleteCommands.length===1)throw new Error('delete committed but response lost');
    return {ok:true,status:200,json:async()=>({id:'demo-deleted',status:'deleted'})};}});
await assert.rejects(()=>deleteClient.run('emp.delete',{id:'demo-deleted',expectedRevision:4}),{code:'NETWORK'});
assert.equal(await deleteClient.hasPending('emp.delete',{id:'demo-deleted',expectedRevision:0}),true);
assert.equal(await deleteClient.hasPending('emp.delete',{id:'another-id',expectedRevision:0}),false);
await deleteClient.run('emp.delete',{id:'demo-deleted',expectedRevision:0});
assert.equal(deleteCommands[0].commandId,deleteCommands[1].commandId);
assert.equal(deleteCommands[1].payload.expectedRevision,4);
console.log('PUBLIC_DEMO_MUTATION_DELETE_REPLAY_PASS');

const boundedRows=new Map(),boundedStorage={getItem:key=>boundedRows.get(key)??null,
  setItem:(key,value)=>boundedRows.set(key,value),removeItem:key=>boundedRows.delete(key)};
let boundedRequests=0;
const bounded=transport.createDemoMutationTransport({...deps,storage:boundedStorage,
  fetch:async()=>{boundedRequests++;throw new Error('unconfirmed');}});
for(let n=0;n<16;n++)await assert.rejects(()=>bounded.run('emp.create',{fullName:`Action ${n}`}),{code:'NETWORK'});
await assert.rejects(()=>bounded.run('emp.create',{fullName:'Action 17'}),{code:'PENDING_LIMIT'});
assert.equal(boundedRequests,16);assert.equal(JSON.parse([...boundedRows.values()][0]).length,16);
await assert.rejects(()=>bounded.run('emp.create',{fullName:'Action 0'}),{code:'NETWORK'});
assert.equal(JSON.parse([...boundedRows.values()][0]).length,16,'retry must preserve bounded pending set');
console.log('PUBLIC_DEMO_MUTATION_PENDING_BOUND_PASS');
