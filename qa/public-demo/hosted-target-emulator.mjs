// LOCAL SYNTHETIC integration of the hosted scenario engine; never a hosted driver.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {dbAdmin,login,close,project,tenants} from './test-support.mjs';
import {doc,collection,getDocFromServer,getDocsFromServer,setDoc,updateDoc,deleteDoc} from 'firebase/firestore';
import {ref,getBytes,uploadBytes,deleteObject} from 'firebase/storage';
import {createDemoMutationTransport} from '../../src/demo/mutationTransport.ts';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {validateHostedQualification,foreignPairMatrix} from './hosted-qualification.ts';
import {verifyCanonicalBaseline,runTypedPositiveWorkflow,runOwnerSdkDenials,runOwnerStorageDenials,runForeignDenials,runSessionDenial,resetQualificationTenant,assertCanonicalRows,readCanonicalSnapshot} from './hosted-runner.ts';
assert.equal(project,'demo-shiftoryx-public');assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8197');
const base='http://127.0.0.1:5111/demo-shiftoryx-public/us-central1/',clients=[];
const capturedAt=new Date().toISOString(),states=Object.fromEntries(await Promise.all(tenants.map(async t=>[t,(await dbAdmin.doc('demoState/'+t).get()).data()])));
const baseline={schemaVersion:1,projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app',qualificationSha:'e795677e3896f99ca99346bdd848367dfcd9495e',
  contextHash:'b'.repeat(64),fixtureSourceHash:'c'.repeat(64),fixtureVersion:'shiftoryx-public-demo-v1',capturedAt,
  hostnames:['demo.shiftoryx.gr',...tenants.map(t=>t+'.shiftoryx.gr')],
  privateEvidence:Object.fromEntries(tenants.map(t=>[t,{generation:states[t].generation,evidenceSha256:'d'.repeat(64),
    privateCollectionCounts:{demoPublicationArtifacts:0,exportAuditLogs:0,monthlyScheduleArchives:0},monthlyExportCount:0,storageObjectCount:0,resetControlPhase:'OPEN'}])),
  tenants:Object.fromEntries(tenants.map(t=>{const f=publicDemoFixture(t,new Date(states[t].weekStart+'T00:00:00Z'));return [t,{generation:states[t].generation,
    lastResetAt:states[t].lastResetAt,fixtureAt:states[t].weekStart+'T00:00:00.000Z',weekStart:f.weekStart,
    counts:{employees:f.employees.length,absences:f.absences.length,drafts:0,publications:0}}];}))};
const baselineText=JSON.stringify(baseline),p=validateHostedQualification({config:{projectId:'shiftoryx-public-demo',authDomain:'shiftoryx-public-demo.firebaseapp.com',storageBucket:'shiftoryx-public-demo.firebasestorage.app',apiKey:'emulator-only',appId:'local-only',messagingSenderId:'local-only'},
  env:{EXPECTED_PROJECT_ID:'shiftoryx-public-demo',EXPECTED_BUCKET:'shiftoryx-public-demo.firebasestorage.app',EXPECTED_QUALIFICATION_MODE:'true',EXPECTED_RESET_QUALIFICATION_MODE:'true'},
  baselineText,baselineHash:createHash('sha256').update(baselineText).digest('hex'),sha:baseline.qualificationSha,contextHash:baseline.contextHash,fixtureSourceHash:baseline.fixtureSourceHash});
// Explicit localhost adapter. It cannot call the live createSdkAdapter factory.
const a={
  async read(c,path){const row=await getDocFromServer(doc(c.db,path));return row.exists()?row.data():undefined;},
  async list(c,path){return (await getDocsFromServer(collection(c.db,path))).docs.map(r=>({id:r.id,data:r.data()}));},
  async http(c,name,body,options={}){assert.ok(['mutatePublicDemo','publishPublicDemoPdf','downloadPublicDemoPdf','resetPublicDemo'].includes(name));
    const token=options.anonymous?null:options.token??await c.auth.currentUser.getIdToken();
    return fetch(base+name,{method:'POST',redirect:'error',headers:{Origin:options.origin??`https://${c.tenant}.shiftoryx.gr`,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
      body:JSON.stringify(name==='resetPublicDemo'?{data:body}:body),signal:AbortSignal.timeout(450000)});},
  async typed(c,operation,payload){c.changed=true;return c.transport.run(operation,payload);},
  async sdkRead(c,path,list=false){return list?getDocsFromServer(collection(c.db,path)):getDocFromServer(doc(c.db,path));},
  async sdkWrite(c,op,path,data){const target=doc(c.db,path);return op==='set'?setDoc(target,data):op==='update'?updateDoc(target,data):deleteDoc(target);},
  async storage(c,op,path){const target=ref(c.storage,path);return op==='read'?getBytes(target):op==='write'?uploadBytes(target,new TextEncoder().encode('%PDF-local-denial\n%%EOF\n'),{contentType:'application/pdf'}):deleteObject(target);},
};
try{
  for(const tenant of tenants){const c=await login(tenant);c.uid=c.auth.currentUser.uid;c.generation=states[tenant].generation;c.fixture=publicDemoFixture(tenant,new Date(states[tenant].weekStart+'T00:00:00Z'));
    const pending=new Map();c.transport=createDemoMutationTransport({tenant,projectId:project,demoEnabled:true,local:true,
      storage:{getItem:k=>pending.get(k)??null,setItem:(k,v)=>pending.set(k,v),removeItem:k=>pending.delete(k)},
      identity:async()=>({tenant,uid:c.uid,generation:c.generation,getToken:force=>c.auth.currentUser.getIdToken(force)}),
      fetch:(url,options)=>{assert.equal(String(url),base+'mutatePublicDemo');return fetch(url,{...options,headers:{...options.headers,Origin:`https://${tenant}.shiftoryx.gr`}});}});
    clients.push(c);await verifyCanonicalBaseline(a,c,p);
  }
  for(const c of clients){await runSessionDenial(a,c,{name:'anonymous'});await runOwnerSdkDenials(a,c);await runOwnerStorageDenials(a,c);await runTypedPositiveWorkflow(a,c,p);await runOwnerStorageDenials(a,c);console.log('LOCAL_HOSTED_ENGINE_POSITIVE '+c.tenant);}
  for(const pair of foreignPairMatrix()){await runForeignDenials(a,clients.find(c=>c.tenant===pair.from),clients.find(c=>c.tenant===pair.to));}
  console.log('LOCAL_HOSTED_ENGINE_PAIRS=12_PASS');
  for(const c of clients){const reset=await resetQualificationTenant(a,c);const fresh=await login(c.tenant);fresh.uid=fresh.auth.currentUser.uid;fresh.fixture=publicDemoFixture(c.tenant,new Date(reset.weekStart+'T00:00:00Z'));
    assertCanonicalRows(fresh.fixture,await readCanonicalSnapshot(a,fresh));console.log('LOCAL_HOSTED_ENGINE_RESET '+c.tenant+' generation='+reset.generation);}
  console.log('LOCAL_HOSTED_TARGET_ENGINE=PASS LIVE_HOSTED_MUTATION_TESTS=NO');
}finally{await close();}
