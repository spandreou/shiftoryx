import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

let policy={};
try { policy=await import('../qa/public-demo/hosted-qualification.ts'); }
catch(error){ if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
const need=name=>{assert.equal(typeof policy[name],'function',`Missing fail-closed hosted policy: ${name}`);return policy[name];};
const tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
const digest=value=>createHash('sha256').update(value).digest('hex');
const sha='e795677e3896f99ca99346bdd848367dfcd9495e';
function input(){
  const baseline={schemaVersion:1,projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app',
    qualificationSha:sha,contextHash:'b'.repeat(64),fixtureSourceHash:'c'.repeat(64),fixtureVersion:'shiftoryx-public-demo-v1',
    capturedAt:'2026-10-05T08:00:00.000Z',hostnames:['demo.shiftoryx.gr',...tenants.map(t=>t+'.shiftoryx.gr')],
    privateEvidence:Object.fromEntries(tenants.map(t=>[t,{generation:12,evidenceSha256:'d'.repeat(64),
      privateCollectionCounts:{demoPublicationArtifacts:0,exportAuditLogs:0,monthlyScheduleArchives:0},monthlyExportCount:0,storageObjectCount:0,resetControlPhase:'OPEN'}])),
    tenants:Object.fromEntries(tenants.map((t,n)=>[t,{generation:12,lastResetAt:0,fixtureAt:'2026-10-05T07:59:00.000Z',
      weekStart:'2026-10-05',counts:{employees:[6,8,6,9][n],absences:[1,1,0,1][n],drafts:0,publications:0}}]))};
  const baselineText=JSON.stringify(baseline);
  return {config:{projectId:'shiftoryx-public-demo',authDomain:'shiftoryx-public-demo.firebaseapp.com',
    storageBucket:'shiftoryx-public-demo.firebasestorage.app',apiKey:'local-test-only',appId:'local-test-only',messagingSenderId:'local-test-only'},
    env:{EXPECTED_PROJECT_ID:'shiftoryx-public-demo',EXPECTED_BUCKET:'shiftoryx-public-demo.firebasestorage.app',
      EXPECTED_QUALIFICATION_MODE:'true',EXPECTED_RESET_QUALIFICATION_MODE:'true'},baselineText,baselineHash:digest(baselineText),
    sha,contextHash:'b'.repeat(64),fixtureSourceHash:'c'.repeat(64),now:new Date('2026-10-05T08:01:00.000Z')};
}
test('exact independently supplied qualification identity and sealed baseline are accepted',()=>{
  const p=need('validateHostedQualification')(input());assert.equal(p.projectId,'shiftoryx-public-demo');
  assert.equal(p.baseline.tenants['demo-fuel'].generation,12);
});
for(const [name,change]of [
  ['missing project',d=>delete d.env.EXPECTED_PROJECT_ID],['wrong project',d=>d.config.projectId='production'],
  ['wrong bucket',d=>d.config.storageBucket='foreign.firebasestorage.app'],
  ['production auth domain',d=>d.config.authDomain='production.firebaseapp.com'],
  ['missing qualification flag',d=>delete d.env.EXPECTED_QUALIFICATION_MODE],
  ['missing reset approval',d=>delete d.env.EXPECTED_RESET_QUALIFICATION_MODE],
  ['missing baseline',d=>d.baselineText=''],['wrong external hash',d=>d.baselineHash='0'.repeat(64)],
  ['wrong SHA',d=>d.sha='0'.repeat(40)],['context drift',d=>d.contextHash='d'.repeat(64)],
  ['fixture drift',d=>d.fixtureSourceHash='d'.repeat(64)],
  ['expired baseline',d=>d.now=new Date('2026-10-05T12:00:00.000Z')],
  ['emulator environment',d=>d.env.FIRESTORE_EMULATOR_HOST='127.0.0.1:8197'],
])test('reject '+name+' before any authentication or mutation',()=>{
  const d=input();change(d);assert.throws(()=>need('validateHostedQualification')(d),e=>e.code?.startsWith('HOSTED_'));
});
for(const [name,edit]of [
  ['wildcard',b=>b.hostnames[0]='*.shiftoryx.gr'],['production apex',b=>b.hostnames[0]='shiftoryx.gr'],
  ['unknown hostname',b=>b.hostnames[0]='unknown.shiftoryx.gr'],
  ['noncanonical employee count',b=>b.tenants['demo-fuel'].counts.employees=7],
  ['nonempty history',b=>b.tenants['demo-fuel'].counts.publications=1],
  ['unknown tenant',b=>b.tenants['demo-evil']=b.tenants['demo-fuel']],
  ['token in baseline',b=>b.token='opaque-test-value'],
])test('reject sealed but invalid baseline '+name,()=>{
  const d=input(),b=JSON.parse(d.baselineText);edit(b);d.baselineText=JSON.stringify(b);d.baselineHash=digest(d.baselineText);
  assert.throws(()=>need('validateHostedQualification')(d),e=>e.code?.startsWith('HOSTED_'));
});
test('generation drift and partial reset fail before own positive path',()=>{
  const p=need('validateHostedQualification')(input());
  assert.throws(()=>need('assertHostedGeneration')(p,'demo-fuel',{generation:13,lastResetAt:0,resetting:false,weekStart:'2026-10-05'}));
  assert.throws(()=>need('assertHostedGeneration')(p,'demo-fuel',{generation:12,lastResetAt:0,resetting:true,weekStart:'2026-10-05'}));
  assert.throws(()=>need('assertHostedGeneration')(p,'demo-fuel',{generation:12,lastResetAt:0,resetting:false,weekStart:'2026-10-05'}));
  need('assertHostedGeneration')(p,'demo-fuel',{generation:12,lastResetAt:0,resetting:false,phase:'OPEN',weekStart:'2026-10-05'});
});
test('qualification cannot start before generation-safe reset cleanup cooldown',()=>{
  const d=input(),b=JSON.parse(d.baselineText);b.tenants['demo-fuel'].lastResetAt=Date.parse('2026-10-05T07:59:59.000Z');
  d.baselineText=JSON.stringify(b);d.baselineHash=digest(d.baselineText);assert.throws(()=>need('validateHostedQualification')(d));
});
test('private recovery proof must be explicit and bound to each current generation',()=>{
  for(const edit of [b=>delete b.privateEvidence,b=>b.privateEvidence['demo-fuel'].generation=11,
    b=>b.privateEvidence['demo-fuel'].storageObjectCount=1]){
    const d=input(),b=JSON.parse(d.baselineText);edit(b);d.baselineText=JSON.stringify(b);d.baselineHash=digest(d.baselineText);
    assert.throws(()=>need('validateHostedQualification')(d));
  }
});
test('direct SDK success cannot count as a denial',async()=>{
  await assert.rejects(()=>need('requireSdkDenied')(async()=>({ok:true}),'firestore'),e=>e.code==='HOSTED_UNEXPECTED_ACCESS');
  await assert.rejects(()=>need('requireSdkDenied')(async()=>({ok:true}),'storage'),e=>e.code==='HOSTED_UNEXPECTED_ACCESS');
});
test('network errors cannot manufacture authorization denial',async()=>{
  await assert.rejects(()=>need('requireSdkDenied')(async()=>{throw Object.assign(new Error(),{code:'unavailable'});},'firestore'));
  await need('requireSdkDenied')(async()=>{throw Object.assign(new Error(),{code:'permission-denied'});},'firestore');
  await need('requireSdkDenied')(async()=>{throw Object.assign(new Error(),{code:'storage/unauthorized'});},'storage');
});
test('all twelve directions carry every required foreign denial surface',()=>{
  const p=need('foreignPairMatrix')();assert.equal(p.length,12);assert.equal(new Set(p.map(x=>x.from+'>'+x.to)).size,12);
  assert.ok(p.some(x=>x.from==='demo-fuel'&&x.to==='demo-cafe'));assert.ok(p.some(x=>x.from==='demo-market'&&x.to==='demo-salon'));
  for(const row of p)assert.deepEqual(row.surfaces,['privateReads','sdkWrites','profiles','settings','absences','drafts','history','pdf','storage','membership','tenantId','origin']);
});
test('required typed positives and server PDF stages cannot be omitted',()=>{
  const complete=['emp.create','emp.update','emp.active','emp.delete','abs.create','abs.update','abs.delete','ann.create','ann.delete','set.save','drf.save','aud.export','publishPublicDemoPdf','downloadPublicDemoPdf'];
  need('assertPositiveCoverage')(complete);
  assert.throws(()=>need('assertPositiveCoverage')(complete.filter(x=>x!=='set.save')));
  assert.throws(()=>need('assertPositiveCoverage')([...complete,'sdk.create']));
});
test('cleanup cannot select direct SDK or a generic deletion primitive',()=>{
  need('assertCleanupMechanism')('emp.delete');need('assertCleanupMechanism')('resetPublicDemo');
  for(const bad of ['deleteDoc','setDoc','bucket.delete','deletePrefix','admin.delete'])assert.throws(()=>need('assertCleanupMechanism')(bad));
});
test('validated baseline is immutable after guard acceptance',()=>{
  const p=need('validateHostedQualification')(input());
  assert.throws(()=>{p.baseline.tenants['demo-fuel'].generation=13;},TypeError);
});
test('plain JSON or copied identity cannot forge an executable qualification receipt',()=>{
  const p=need('validateHostedQualification')(input());need('assertQualifiedReceipt')(p);
  assert.throws(()=>need('assertQualifiedReceipt')({...p}));
  assert.throws(()=>need('assertQualifiedReceipt')({projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app'}));
});
test('HTTP service/network failure cannot count as tenant authorization denial',async()=>{
  await assert.rejects(()=>need('requireHttpDenied')(new Response(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE'}}),{status:503}),[401,403],['ACCESS_DENIED','UNAUTHENTICATED']));
  await assert.rejects(()=>need('requireHttpDenied')(new Response('{}',{status:200}),[401,403],['ACCESS_DENIED']));
  assert.equal(await need('requireHttpDenied')(new Response(JSON.stringify({error:{code:'ACCESS_DENIED'}}),{status:403}),[403],['ACCESS_DENIED']),'ACCESS_DENIED');
});
test('post-reset re-entry accepts only exactly one monotonic generation advance',()=>{
  const p=need('validateHostedQualification')(input());
  need('assertResetAdvance')(p,'demo-fuel',{tenantId:'demo-fuel',generation:13,weekStart:'2026-10-05'});
  for(const bad of [{tenantId:'demo-cafe',generation:13,weekStart:'2026-10-05'},
    {tenantId:'demo-fuel',generation:12,weekStart:'2026-10-05'},
    {tenantId:'demo-fuel',generation:11,weekStart:'2026-10-05'}])assert.throws(()=>need('assertResetAdvance')(p,'demo-fuel',bad));
});
test('browser network guard rejects foreign project and non-TLS traffic without exposing credentials',()=>{
  const p=need('validateHostedQualification')(input()),allowed=need('isQualificationBrowserRequest');
  assert.equal(allowed(p,'https://demo-fuel.shiftoryx.gr/app'),true);
  assert.equal(allowed(p,'https://firestore.googleapis.com/v1/projects/shiftoryx-public-demo/databases/(default)/documents'),true);
  assert.equal(allowed(p,'https://firestore.googleapis.com/v1/projects/foreign/databases/(default)/documents'),false);
  assert.equal(allowed(p,'https://firestore.googleapis.com/v1/projects/foreign/databases/(default)/documents?database=projects/shiftoryx-public-demo/databases/(default)'),false);
  assert.equal(allowed(p,'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects/shiftoryx-public-demo/databases/(default)'),true);
  assert.equal(allowed(p,'https://firestore.googleapis.com/unreviewed?database=projects/shiftoryx-public-demo/databases/(default)'),false);
  assert.equal(allowed(p,'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=local-test-only'),true);
  assert.equal(allowed(p,'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=foreign'),false);
  for(const bad of ['http://demo-fuel.shiftoryx.gr','https://shiftoryx.gr/app','https://unknown.shiftoryx.gr',
    'https://us-central1-foreign.cloudfunctions.net/mutatePublicDemo','https://analytics.example/collect'])assert.equal(allowed(p,bad),false);
});
