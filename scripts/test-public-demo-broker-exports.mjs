import test from 'node:test';
import assert from 'node:assert/strict';
Object.assign(process.env,{GCLOUD_PROJECT:'demo-shiftoryx-public',GOOGLE_CLOUD_PROJECT:'demo-shiftoryx-public',
  FUNCTIONS_EMULATOR:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',PUBLIC_DEMO_ENABLED:'true',
  PUBLIC_DEMO_AUTH_BROKER_ENABLED:'false',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',
  FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'});
const demo=await import('../functions/src/public-demo/entry.js');
const shared=await import('../functions/src/index.js');
test('dedicated entry contains exactly nine callable/scheduled exports',()=>{
  assert.deepEqual(Object.keys(demo).sort(),['createAuthTicket','exchangeAuthTicket','cleanupAuthTickets','enterPublicDemo',
    'resetPublicDemo','resetPublicDemosDaily','publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'].sort());
  assert.ok(Object.values(demo).every(value=>value.__endpoint));
});
for(const name of ['createAuthTicket','exchangeAuthTicket']){
  test('dedicated entry rejects before original broker: '+name,async()=>{
    assert.notEqual(demo[name],shared[name],'unfenced original broker must not be exported');
    await assert.rejects(demo[name].run({data:{},rawRequest:{headers:{origin:'https://demo-fuel.shiftoryx.gr'}}}),{code:'unavailable'});
    assert.deepEqual(demo[name].__endpoint.region,['us-central1']);
    assert.ok(demo[name].__endpoint.callableTrigger);
  });
}
test('cleanup is preserved separately rather than inheriting issuance fence',()=>{
  assert.equal(demo.cleanupAuthTickets,shared.cleanupAuthTickets);
  assert.equal(demo.cleanupAuthTickets.__endpoint.scheduleTrigger.schedule,'every 15 minutes');
});
for(const [name,data,origin]of [['createAuthTicket',{tenantId:'bp-kallis',returnTo:'https://bp-kallis.shiftoryx.gr/'},'https://demo.shiftoryx.gr'],
  ['exchangeAuthTicket',{ticket:'a'.repeat(64)},'https://bp-kallis.shiftoryx.gr']]){
  test('demo request allowlist blocks before shared handler '+name,async()=>{
    process.env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='true';
    try{await assert.rejects(demo[name].run({data,auth:{uid:'synthetic-unrelated-owner'},rawRequest:{headers:{origin}}}),
      error=>error.code==='permission-denied'&&error.details===undefined);}
    finally{process.env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='false';}
  });
}
test('actual enter callback is fenced by global flag with generic unavailable response',async()=>{
  process.env.PUBLIC_DEMO_ENABLED='false';
  try{await assert.rejects(demo.enterPublicDemo.run({data:{tenantId:'demo-fuel'},rawRequest:{headers:{origin:'https://demo.shiftoryx.gr'}}}),{code:'unavailable'});}
  finally{process.env.PUBLIC_DEMO_ENABLED='true';}
});
