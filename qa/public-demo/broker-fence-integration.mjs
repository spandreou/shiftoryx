// Real callable HTTP middleware and original broker code, synthetic emulators only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {signInWithCustomToken} from 'firebase/auth';
const required={GCLOUD_PROJECT:'demo-shiftoryx-public',GOOGLE_CLOUD_PROJECT:'demo-shiftoryx-public',
  FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',
  FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408',QA_BROKER_FENCE_LOCAL_ONLY:'true'};
if(Object.entries(required).some(([key,want])=>process.env[key]!==want))throw new Error('BROKER_FENCE_LOCAL_TARGET_REQUIRED');
Object.assign(process.env,{PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_AUTH_BROKER_ENABLED:'true',AUTH_BROKER_BASE_DOMAIN:'shiftoryx.gr',
  AUTH_BROKER_CENTRAL_DOMAIN:'demo.shiftoryx.gr',AUTH_BROKER_CENTRAL_ORIGINS:'https://demo.shiftoryx.gr',
  AUTH_BROKER_TENANT_ORIGINS:'https://demo-fuel.shiftoryx.gr,https://demo-cafe.shiftoryx.gr,https://demo-salon.shiftoryx.gr,https://demo-market.shiftoryx.gr'});
const {dbAdmin,authAdmin,login,close}=await import('./test-support.mjs');
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const express=require('express'),{Timestamp}=require('firebase-admin/firestore');
const demo=await import('../../functions/src/public-demo/entry.js');
const shared=await import('../../functions/src/index.js');
const {hashAuthTicket}=await import('../../functions/src/authBrokerCore.js');
const app=express();app.use(express.json());
for(const name of ['createAuthTicket','exchangeAuthTicket','enterPublicDemo'])app.post('/'+name,(req,res)=>demo[name](req,res));
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const origin='https://demo.shiftoryx.gr',tenantOrigin='https://demo-fuel.shiftoryx.gr';
let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;console.log('LOCAL_BROKER_HTTP_PASS '+label);};
async function call(name,data,{token,from=origin,raw}={}){
  const response=await fetch(`http://127.0.0.1:${server.address().port}/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:from,...(token?{Authorization:'Bearer '+token}:{})},
    body:raw??JSON.stringify({data}),signal:AbortSignal.timeout(10000)});
  return {status:response.status,body:await response.json(),cors:response.headers.get('access-control-allow-origin')};
}
const ticketRows=async()=>{const rows=await dbAdmin.collection('authTickets').get();return rows.docs.map(doc=>({id:doc.id,data:doc.data(),updateTime:doc.updateTime.toMillis()}));};
const authSnapshot=async uid=>{const user=await authAdmin.getUser(uid);return {uid:user.uid,disabled:user.disabled,claims:user.customClaims,tokensValidAfterTime:user.tokensValidAfterTime};};
const request={tenantId:'demo-fuel',returnTo:tenantOrigin+'/'};
try{
  check(Object.keys(demo).length===9,'exact nine exports');check(demo.createAuthTicket!==shared.createAuthTicket&&demo.exchangeAuthTicket!==shared.exchangeAuthTicket,'no original broker alias');
  const owner=await login('demo-fuel'),uid=owner.auth.currentUser.uid,token=await owner.auth.currentUser.getIdToken();
  check((await call('createAuthTicket',request)).status===403,'anonymous rejected by original auth checks');
  check((await call('createAuthTicket',request,{token:'not-a-valid-jwt'})).status===401,'outer middleware rejects invalid JWT');
  check((await call('createAuthTicket',request,{token,from:'https://unapproved.invalid'})).status===403,'raw origin still enforced');
  check((await call('createAuthTicket',request,{token,raw:'{"invalid":"envelope"}'})).status===400,'callable envelope enforced');
  const created=await call('createAuthTicket',request,{token});check(created.status===200&&created.cors===origin,'verified auth and exact origin reach original create');
  const ticket=new URLSearchParams(new URL(created.body.result.redirectUrl).hash.slice(1)).get('authTicket');assert.ok(ticket);
  const ticketRef=dbAdmin.doc('authTickets/'+hashAuthTicket(ticket));const pending=await ticketRef.get();
  check(pending.data().uid===uid&&pending.data().tenantId==='demo-fuel','verified UID and data forwarded unchanged');
  const beforeTickets=await ticketRows(),beforeUser=await authSnapshot(uid),memberRef=dbAdmin.doc(`tenantMemberships/${uid}_demo-fuel`),beforeMember=(await memberRef.get()).data();
  process.env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='false';
  for(const name of ['createAuthTicket','exchangeAuthTicket']){
    const result=await call(name,name==='createAuthTicket'?request:{ticket},{token:name==='createAuthTicket'?token:undefined,from:name==='createAuthTicket'?origin:tenantOrigin});
    check(result.status===503&&result.body.error.status==='UNAVAILABLE'&&!result.body.error.details,'fenced '+name+' generic unavailable');
    check(!/PUBLIC_DEMO|ENABLED|flag/i.test(JSON.stringify(result.body)),'fence error reveals no configuration');
  }
  assert.deepEqual(await ticketRows(),beforeTickets);assert.deepEqual(await authSnapshot(uid),beforeUser);assert.deepEqual((await memberRef.get()).data(),beforeMember);
  check(true,'disabled create/exchange leave ticket, Auth and membership untouched');
  const after=await ticketRef.get();check(after.updateTime.toMillis()===pending.updateTime.toMillis()&&after.data().status===pending.data().status,'valid pending ticket unconsumed');
  process.env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='true';
  const wrongTenant=await call('exchangeAuthTicket',{ticket},{from:'https://demo-cafe.shiftoryx.gr'});check(wrongTenant.status===403,'foreign origin denied before consumption');
  const exchanged=await call('exchangeAuthTicket',{ticket},{from:tenantOrigin});check(exchanged.status===200&&exchanged.cors===tenantOrigin,'outer exchange transport forwards raw request');
  await signInWithCustomToken(owner.auth,exchanged.body.result.customToken);
  check(owner.auth.currentUser.uid===uid&&(await owner.auth.currentUser.getIdTokenResult()).claims.publicDemo===true,'issued token signs in as same authorized demo identity');
  check((await call('exchangeAuthTicket',{ticket},{from:tenantOrigin})).status===403,'one-time ticket replay denied');
  const adminRef=dbAdmin.doc('platformAdmins/'+uid),beforeAdminTickets=await ticketRows();
  await adminRef.set({status:'ACTIVE'});
  try{check((await call('createAuthTicket',request,{token})).status===403,'platform-admin membership collision still denied');assert.deepEqual(await ticketRows(),beforeAdminTickets);}
  finally{await adminRef.delete();}
  // Global flag fences entry independently; no live configuration is changed.
  const beforeEntry=(await dbAdmin.doc('demoEntryLimits/demo-fuel').get()).data(),userBeforeEntry=await authSnapshot(uid);
  for(const value of [undefined,'false','TRUE']){
    if(value===undefined)delete process.env.PUBLIC_DEMO_ENABLED;else process.env.PUBLIC_DEMO_ENABLED=value;
    check((await call('enterPublicDemo',{tenantId:'demo-fuel'})).status===503,'global entry disabled '+String(value));
    assert.deepEqual((await dbAdmin.doc('demoEntryLimits/demo-fuel').get()).data(),beforeEntry);assert.deepEqual(await authSnapshot(uid),userBeforeEntry);
  }
  process.env.PUBLIC_DEMO_ENABLED='true';process.env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='false';
  check((await call('enterPublicDemo',{tenantId:'demo-fuel'})).status===200,'global enabled still distinct from disabled broker');
  await authAdmin.deleteUser(uid);process.env.PUBLIC_DEMO_ENABLED='false';
  check((await call('enterPublicDemo',{tenantId:'demo-fuel'})).status===503,'disabled entry does not repair a missing identity');
  await assert.rejects(authAdmin.getUser(uid),error=>error.code==='auth/user-not-found');
  process.env.PUBLIC_DEMO_ENABLED='true';
  check((await call('enterPublicDemo',{tenantId:'demo-fuel'})).status===200,'ordinary enabled entry repairs only current local identity');
  // Safe expiry cleanup stays available and preserves an unexpired pending row.
  const expired=dbAdmin.doc('authTickets/local-fence-expired'),valid=dbAdmin.doc('authTickets/local-fence-unexpired');
  await expired.set({status:'PENDING',expiresAt:Timestamp.fromMillis(Date.now()-120000)});
  await valid.set({status:'PENDING',expiresAt:Timestamp.fromMillis(Date.now()+120000)});
  await demo.cleanupAuthTickets.run({});check(!(await expired.get()).exists&&(await valid.get()).exists,'cleanup operates safely with broker disabled');
  await valid.delete();
  console.log('LOCAL_BROKER_CALLABLE_INTEGRATION_PASS checks='+checks+' CLOUD_MUTATION=NO');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await close();}
