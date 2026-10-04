import assert from 'node:assert/strict';
import {expect} from 'playwright/test';
import {dbAdmin,login,rpc,denied,close} from './test-support.mjs';
import {doc,setDoc,getDoc} from 'firebase/firestore';
import {ref,getBytes,uploadBytes} from 'firebase/storage';
import {randomUUID} from 'node:crypto';
const latch=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function typedEmployeeCreate(tenant,token,name){const response=await fetch('http://127.0.0.1:5111/demo-shiftoryx-public/us-central1/mutatePublicDemo',{
  method:'POST',headers:{Origin:`https://${tenant}.shiftoryx.gr`,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({operation:'emp.create',commandId:'emp_'+randomUUID(),payload:{fullName:name}}),signal:AbortSignal.timeout(120000)});
  return {status:response.status,body:await response.json()};}
export async function authResetRaces(page,ctx,tenant,record){
  let releaseReset,releaseExchange;
  try{
    const c=await login(tenant),token=await c.auth.currentUser.getIdToken();
    const initialState=(await dbAdmin.doc('demoState/'+tenant).get()).data();
    assert.equal(initialState?.resetting,false,'Race suite requires an initialized, unlocked fixture');
    assert.equal(initialState?.lastResetAt,0,'Start a fresh emulator runtime for races; prior reset cooldown must remain enforced');
    const second=await ctx.newPage();await second.goto('https://'+tenant+'.shiftoryx.gr/app');await second.getByTestId('scheduler-v3-workspace').waitFor();
    const ticket=await rpc('createAuthTicket',{tenantId:tenant,returnTo:'https://'+tenant+'.shiftoryx.gr'},token);assert.equal(ticket.status,200);
    const started=latch(),exchange=latch(),delivered=latch();releaseExchange=exchange.resolve;
    const callback=await ctx.newPage();
    await callback.route('**/us-central1/exchangeAuthTicket',async route=>{const response=await route.fetch();assert.equal(response.status(),200);started.resolve();await exchange.promise;await route.fulfill({response});delivered.resolve();});
    await callback.goto(ticket.result.redirectUrl);await started.promise;
    // Hold the first employee document with a real emulator transaction. The
    // reset can acquire its generation lock, but cannot finish deleting data.
    const locked=latch(),release=latch();releaseReset=release.resolve;
    const holder=dbAdmin.runTransaction(async tx=>{await tx.get(dbAdmin.doc(`tenants/${tenant}/employees/${tenant}-e1`));locked.resolve();await release.promise;});await locked.promise;
    const reset=rpc('resetPublicDemo',{tenantId:tenant},token);
    await expect.poll(async()=>(await dbAdmin.doc('demoState/'+tenant).get()).data()?.resetting,{timeout:15000}).toBe(true);
    await denied(()=>setDoc(doc(c.db,'tenants',tenant,'employees','old-write-during-reset'),{fullName:'Φανταστικός παλιός επισκέπτης'}));
    await denied(()=>getDoc(doc(c.db,'tenants',tenant,'employees',tenant+'-e1')));
    assert.equal((await rpc('enterPublicDemo',{tenantId:tenant})).status,503);
    record(tenant,'A: reset lock denies old writes/reads and entry during partial reset');
    const staleTabWrite=await second.evaluate(async tenant=>{const {db}=await import('/src/firebase/config.js');const url=performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>new URL(url).pathname.endsWith('/firebase_firestore.js'));const fs=await import(url);try{await fs.setDoc(fs.doc(db,'tenants',tenant,'employees','stale-tab-write'),{fullName:'Φανταστική παλιά καρτέλα'});return false;}catch(e){return e.code==='permission-denied';}},tenant);assert.equal(staleTabWrite,true);record(tenant,'D: second tab cannot write during first tab reset');
    release.resolve();await holder;assert.equal((await reset).status,200);
    exchange.resolve();await delivered.promise;
    // The already-issued old custom token may authenticate, but the removed
    // membership and generation fence must never restore operational authority.
    await expect(callback.getByTestId('scheduler-v3-workspace')).toHaveCount(0);
    await expect(callback.getByText('Ολοκλήρωση ασφαλούς σύνδεσης...',{exact:true})).toBeHidden({timeout:30000});
    await expect(callback.getByText(/Το κοινόχρηστο demo επαναφέρθηκε|Δεν επιτρέπεται η πρόσβαση/).first()).toBeVisible({timeout:30000});
    assert.equal(new URL(callback.url()).hostname,tenant+'.shiftoryx.gr');
    await denied(()=>setDoc(doc(c.db,'tenants',tenant,'employees','old-write-after-reset'),{fullName:'Παλιό session'}));record(tenant,'C: in-flight ticket resumes after reset without authority or portal loop');
    const staleTyped=await typedEmployeeCreate(tenant,token,'Παλιό typed session');
    assert.ok([401,403,409,503].includes(staleTyped.status),'old generation typed mutation must be denied');
    const oldPdf=ref(c.storage,`tenants/${tenant}/schedule-publications/stale-generation/schedule.pdf`);
    await denied(()=>getBytes(oldPdf));await denied(()=>uploadBytes(oldPdf,new TextEncoder().encode('%PDF-fictional'),{contentType:'application/pdf'}));record(tenant,'stale generation cannot read or write Storage after reset');
      assert.ok([401,403,409].includes((await rpc('resetPublicDemo',{tenantId:tenant},token)).status),'stale reset denied, including explicit generation conflict');
    const fresh=await login(tenant),freshCreated=await typedEmployeeCreate(tenant,await fresh.auth.currentUser.getIdToken(),'Νέα φανταστική συνεδρία');
    assert.equal(freshCreated.status,200,JSON.stringify(freshCreated.body));
    assert.equal((await getDoc(doc(fresh.db,'tenants',tenant,'employees',freshCreated.body.id))).exists(),true);
    record(tenant,'E: immediately fresh login can write through typed admission; old reset credentials denied');
    const freshTicket=await rpc('createAuthTicket',{tenantId:tenant,returnTo:'https://'+tenant+'.shiftoryx.gr'},await fresh.auth.currentUser.getIdToken());assert.equal(freshTicket.status,200);
    // An already-issued old custom token can recreate the deleted Auth user.
    // It cannot recreate membership; keep this real stale session during handoff.
    await page.evaluate(async customToken=>{const {auth}=await import('/src/firebase/config.js');const url=performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>new URL(url).pathname.endsWith('/firebase_auth.js'));await (await import(url)).signInWithCustomToken(auth,customToken);},c.issuedToken);
    const freshStarted=latch(),freshRelease=latch();releaseExchange=freshRelease.resolve;
    await page.route('**/us-central1/exchangeAuthTicket',async route=>{const response=await route.fetch();assert.equal(response.status(),200);freshStarted.resolve();await freshRelease.promise;await route.fulfill({response});});
    await page.goto(freshTicket.result.redirectUrl);await freshStarted.promise;
    await expect(page.getByText('Το κοινόχρηστο demo επαναφέρθηκε.',{exact:true})).toBeVisible({timeout:30000});
    freshRelease.resolve();await page.getByTestId('scheduler-v3-workspace').waitFor({timeout:30000});
    record(tenant,'B: valid handoff survives the stale-generation reset notice');
    await page.waitForURL(u=>u.pathname==='/app'&&!u.hash.includes('authTicket'),{timeout:30000});
    await page.reload();await page.getByTestId('scheduler-v3-workspace').waitFor({timeout:90000});await denied(()=>setDoc(doc(c.db,'tenants',tenant,'employees','old-generation-replay'),{fullName:'Παλιό session'}));record(tenant,'B: fresh navigation works while old generation writes stay denied');
    await denied(()=>getDoc(doc(fresh.db,'tenants','demo-cafe','employees','demo-cafe-e1')));record(tenant,'fresh generation retains cross-tenant denial');
    await second.close();await callback.close();
  }finally{releaseReset?.();releaseExchange?.();await close();}
}
