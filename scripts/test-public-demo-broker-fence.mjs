import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');

const api=await import('../functions/src/public-demo/broker-fence.ts').catch(()=>({}));
const enabled={GCLOUD_PROJECT:'shiftoryx-public-demo',GOOGLE_CLOUD_PROJECT:'shiftoryx-public-demo',
  PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_AUTH_BROKER_ENABLED:'true'};
const request={data:{ticket:'a'.repeat(64)},auth:{uid:'synthetic-owner',token:{uid:'synthetic-owner'}},
  rawRequest:{headers:{origin:'https://demo-fuel.shiftoryx.gr',authorization:'Bearer synthetic-test-only'}}};
function handler(env,forward){
  assert.equal(typeof api.fenceDemoBroker,'function','missing broker fence');
  return api.fenceDemoBroker(forward,()=>env);
}
for(const value of [undefined,false,'false',1,'1','yes','TRUE',' true ','garbage','']){
  test('broker disabled without exact canonical true: '+String(value),async()=>{
    const state={pending:{status:'PENDING'},tickets:0,auth:0,membership:0,tokens:0,transactions:0};
    const before=structuredClone(state);
    const run=handler({...enabled,PUBLIC_DEMO_AUTH_BROKER_ENABLED:value},async()=>{
      state.transactions++;state.tickets++;state.auth++;state.membership++;state.tokens++;state.pending.status='USED';
    });
    await assert.rejects(run(request),error=>error.code==='unavailable'&&error.details===undefined&&
      !/PUBLIC_DEMO|ENABLED|GCLOUD|flag|configuration/i.test(error.message));
    assert.deepEqual(state,before,'disabled exchange must preserve pending ticket and all mutable state');
  });
}
test('enabled broker preserves verified callable request and result',async()=>{
  const seen=[];const result={customToken:'synthetic-not-a-real-token',tenantId:'demo-fuel'};
  assert.equal(await handler(enabled,async actual=>{seen.push(actual);return result;})(request),result);
  assert.deepEqual(seen,[request]);assert.equal(seen[0].rawRequest,request.rawRequest);assert.equal(seen[0].auth,request.auth);
});
for(const change of [{GCLOUD_PROJECT:'unknown'},{GOOGLE_CLOUD_PROJECT:'different'},{GCLOUD_PROJECT:undefined,GOOGLE_CLOUD_PROJECT:undefined},
  {PUBLIC_DEMO_PROJECT_ID:'different'},{FUNCTIONS_EMULATOR:'true'},{FIRESTORE_EMULATOR_HOST:'127.0.0.1:1'}]){
  test('broker refuses wrong/missing/mixed runtime: '+JSON.stringify(change),async()=>{
    let forwarded=false;await assert.rejects(handler({...enabled,...change},async()=>{forwarded=true;})(request),{code:'unavailable'});
    assert.equal(forwarded,false);
  });
}
for(const value of ['{','{}','{"projectId":"unapproved"}','{"projectId":"shiftoryx-public-demo","storageBucket":"foreign.appspot.com"}']){
  test('explicit Firebase config cannot contradict demo runtime '+value,async()=>{
    let calls=0;await assert.rejects(handler({...enabled,FIREBASE_CONFIG:value},async()=>{calls++;})(request),{code:'unavailable'});assert.equal(calls,0);
  });
}
test('initialized default Admin app cannot point at another project',async()=>{
  const app=initializeApp({projectId:'unapproved-runtime-app'});
  try{await assert.rejects(handler(enabled,async()=>42)(request),{code:'unavailable'});}
  finally{await deleteApp(app);}
});
const emulator={...enabled,GCLOUD_PROJECT:'demo-shiftoryx-public',GOOGLE_CLOUD_PROJECT:'demo-shiftoryx-public',FUNCTIONS_EMULATOR:'true',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',
  FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'};
test('emulator requires explicit broker enable without fallback',async()=>{
  await assert.rejects(handler({...emulator,PUBLIC_DEMO_AUTH_BROKER_ENABLED:undefined},async()=>42)(request),{code:'unavailable'});
  assert.equal(await handler(emulator,async()=>42)(request),42);
});
for(const value of [undefined,'false','TRUE','yes']){
  test('global entry rejects before identity work: '+String(value),async()=>{
    assert.equal(typeof api.fenceDemoEntry,'function');let mutations=0;
    const run=api.fenceDemoEntry(async()=>{mutations++;return 'identity';},()=>({...enabled,PUBLIC_DEMO_ENABLED:value}));
    await assert.rejects(run(request),{code:'unavailable'});assert.equal(mutations,0);
    await assert.rejects(handler({...enabled,PUBLIC_DEMO_ENABLED:value},async()=>{mutations++;})(request),{code:'unavailable'});
    assert.equal(mutations,0);
  });
}
test('global entry and broker are separate controls',async()=>{
  assert.equal(typeof api.fenceDemoEntry,'function');const env={...enabled,PUBLIC_DEMO_AUTH_BROKER_ENABLED:'false'};
  assert.equal(await api.fenceDemoEntry(async()=>42,()=>env)(request),42);
  await assert.rejects(handler(env,async()=>42)(request),{code:'unavailable'});
});
test('global entry rejects wrong project before forwarding',async()=>{
  assert.equal(typeof api.fenceDemoEntry,'function');let calls=0;
  await assert.rejects(api.fenceDemoEntry(async()=>{calls++;},()=>({...enabled,GCLOUD_PROJECT:'other'}))(request),{code:'unavailable'});
  assert.equal(calls,0);
});
test('enabled wrapper does not rewrite original broker denial',async()=>{
  const denial=Object.assign(new Error('original denial'),{code:'permission-denied'});
  await assert.rejects(handler(enabled,async()=>{throw denial;})(request),error=>error===denial);
});
