// Emulator-only integration: fails if a private collection bypasses membership,
// if reset leaves visitor records, or if stale identities regain write access.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,setDoc,updateDoc,setLogLevel} from 'firebase/firestore';
import {getStorage,connectStorageEmulator,ref,getBytes,uploadBytes} from 'firebase/storage';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
const project='demo-shiftoryx-public',tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
Object.assign(process.env,{GCLOUD_PROJECT:project,FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'});
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const adminApp=require('firebase-admin/app').initializeApp({projectId:project,storageBucket:project+'.appspot.com'});
const adminDb=require('firebase-admin/firestore').getFirestore(adminApp),adminStorage=require('firebase-admin/storage').getStorage(adminApp);
setLogLevel('silent');let checks=0,pairs=0;const clients=[];
const check=(condition,label)=>{assert.ok(condition,label);checks++;console.log('PASS '+label);};
async function rpc(name,tenant,token,extra={}){const r=await fetch(`http://127.0.0.1:5111/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://demo.shiftoryx.gr',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data:{tenantId:tenant,...extra}}),signal:AbortSignal.timeout(450000)});return {status:r.status,...await r.json()};}
async function client(tenant){const entered=await rpc('enterPublicDemo',tenant);assert.equal(entered.status,200,'demo entry');const app=initializeApp({projectId:project,apiKey:'emulator-only',storageBucket:project+'.appspot.com'},tenant+'-'+clients.length);const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);connectAuthEmulator(auth,'http://127.0.0.1:9308',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8197);connectStorageEmulator(storage,'127.0.0.1',9408);await signInWithCustomToken(auth,entered.result.customToken);const c={app,auth,db,storage,tenant};clients.push(c);return c;}
async function typed(client,operation,payload){const token=await client.auth.currentUser.getIdToken();const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`https://${client.tenant}.shiftoryx.gr`,Authorization:`Bearer ${token}`},body:JSON.stringify({operation,commandId:`${operation.split('.')[0]}_${randomUUID()}`,payload}),signal:AbortSignal.timeout(120000)});return {status:response.status,body:await response.json()};}
async function denied(fn,label){try{await fn();assert.fail('UNEXPECTED ACCESS: '+label);}catch(e){assert.ok(['permission-denied','storage/unauthorized'].includes(e.code),label+' must fail with authorization denial, not '+e.code);checks++;}}
try{
  const visitorIds=new Map();
  for(const tenant of tenants){const c=await client(tenant);check((await getDocs(collection(c.db,'tenants',tenant,'employees'))).size==={ 'demo-fuel':6,'demo-cafe':8,'demo-salon':6,'demo-market':9}[tenant],tenant+' own employees readable');const created=await typed(c,'emp.create',{fullName:'Δοκιμαστικός εργαζόμενος'});assert.equal(created.status,200,JSON.stringify(created.body));visitorIds.set(tenant,created.body.id);check((await getDoc(doc(c.db,'tenants',tenant,'employees',created.body.id))).exists(),tenant+' own typed write');await denied(()=>updateDoc(doc(c.db,'tenants',tenant,'employees',created.body.id),{email:'fictional@example.invalid'}),tenant+' contact fields forbidden');}
  for(const c of [...clients])for(const foreign of tenants.filter(t=>t!==c.tenant)){
    const base=['tenants',foreign],target=(coll,id='probe')=>doc(c.db,...base,coll,id);
    for(const coll of ['employees','settings','absences','scheduleDrafts','schedulePublications','schedulePublicationPeriods','schedulePublicationReservations'])await denied(()=>getDoc(target(coll)),c.tenant+' -> '+foreign+' '+coll+' read');
    await denied(()=>getDocs(collection(c.db,...base,'schedulePublications')),foreign+' history');
    await denied(()=>setDoc(target('employees'),{fullName:'Δοκιμή'}),foreign+' employee write');
    await denied(()=>updateDoc(target('employees',foreign+'-e1'),{schedulerV3:{targetWeeklyHours:20}}),foreign+' profile write');
    for(const coll of ['settings','absences','scheduleDrafts','schedulePublications'])await denied(()=>setDoc(target(coll),{tenantId:foreign}),foreign+' '+coll+' write');
    const foreignState=await getDoc(doc(c.db,'demoState',foreign));const uid=foreign+'-owner-g'+foreignState.data().generation;
    await denied(()=>getDoc(doc(c.db,'tenantMemberships',uid+'_'+foreign)),foreign+' membership read');
    await denied(()=>setDoc(doc(c.db,'tenantMemberships',c.auth.currentUser.uid+'_'+foreign),{uid:c.auth.currentUser.uid,tenantId:foreign,role:'OWNER',status:'ACTIVE'}),foreign+' membership escalation');
    const path=`tenants/${foreign}/schedule-publications/guessed/schedule.pdf`;
    await denied(()=>getBytes(ref(c.storage,path)),foreign+' stored PDF read');await denied(()=>uploadBytes(ref(c.storage,path),new TextEncoder().encode('%PDF-fake'),{contentType:'application/pdf'}),foreign+' Storage write');
    const response=await rpc('resetPublicDemo',foreign,await c.auth.currentUser.getIdToken());check(response.status===403,c.tenant+' -> '+foreign+' reset denied');pairs++;
  }
  const fuel=clients[0],oldToken=await fuel.auth.currentUser.getIdToken();
  check((await rpc('resetPublicDemo','bp-kallis',oldToken)).status===403,'normal tenant reset denied');
  check((await rpc('resetPublicDemo','demo-fuel',oldToken,{arbitraryPath:'tenants/bp-kallis'})).status===403,'reset extra input denied');
  // Seed every visitor-writeable auxiliary collection to catch incomplete cleanup.
  for(const coll of ['attendanceHistory','weekLocks','subscription','tokenRequests'])await adminDb.doc(`tenants/demo-fuel/${coll}/reset-probe`).set({probe:true});
  await adminStorage.bucket().file('tenants/demo-fuel/schedule-publications/reset-probe/schedule.pdf').save('%PDF-demo',{contentType:'application/pdf'});
  const foreignBefore=(await adminDb.collection('tenants/demo-cafe/employees').get()).size;
  const concurrent=await Promise.all([rpc('resetPublicDemo','demo-fuel',oldToken),rpc('resetPublicDemo','demo-fuel',oldToken)]);
  console.log('RESET_CONCURRENT_STATUS '+JSON.stringify(concurrent.map(r=>({status:r.status,code:r.error?.status||r.error?.code||null}))));
  check(concurrent.filter(r=>r.status===200).length===1,'concurrent resets have exactly one winner');
  check(concurrent.every(r=>r.status===200||[403,409,429].includes(r.status)),'competing reset safely rejected');
  await denied(()=>getDoc(doc(fuel.db,'tenants','demo-fuel','employees','demo-fuel-e1')),'stale generation read');
  await denied(()=>setDoc(doc(fuel.db,'tenants','demo-fuel','employees','offline-replay'),{fullName:'Παλιό session'}),'stale generation write');
  for(const coll of ['attendanceHistory','weekLocks','subscription','tokenRequests'])check((await adminDb.collection(`tenants/demo-fuel/${coll}`).get()).empty,'reset clears '+coll);
  check((await adminStorage.bucket().getFiles({prefix:'tenants/demo-fuel/'}))[0].length===0,'reset clears stored PDFs');
  check((await adminDb.collection('tenants/demo-cafe/employees').get()).size===foreignBefore,'reset leaves foreign tenant unchanged');
  const renewed=await client('demo-fuel'),rows=await getDocs(collection(renewed.db,'tenants','demo-fuel','employees'));
  check(rows.size===6&&!rows.docs.some(d=>d.id===visitorIds.get('demo-fuel')),'reset restores six canonical employees');
  const expected=publicDemoFixture('demo-fuel',new Date());
  for(const employee of expected.employees)assert.deepEqual(rows.docs.find(d=>d.id===employee.id)?.data().schedulerV3,employee.schedulerV3);
  check(true,'reset restores all employee V3 profiles');
  check((await rpc('resetPublicDemo','demo-fuel',await renewed.auth.currentUser.getIdToken())).status===429,'reset cooldown enforced');
  assert.equal(pairs,12);console.log(`PUBLIC_DEMO_ISOLATION_PASS checks=${checks} orderedPairs=${pairs}`);
}finally{await Promise.all(clients.map(c=>deleteApp(c.app)));await require('firebase-admin/app').deleteApp(adminApp);}
