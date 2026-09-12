import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';
import {realisticTenants,QA_PROJECT} from './fixtures.ts';
const output=resolve(process.argv[2]||'');if(!process.argv[2])throw new Error('Pass the QA runtime directory.');
const credentials=JSON.parse(await readFile(resolve(output,'credentials.json'),'utf8'));
const tenants=realisticTenants();const domains=new Set(['shiftoryx.gr',...tenants.map(t=>t.domain)]);
const runId=Date.now().toString(36);
const browser=await chromium.launch({headless:!process.argv.includes('--interactive')});
const results=[];let assertions=0;
const record=(tenant,scenario,actual)=>{assertions++;assert.equal(actual,true,tenant+': '+scenario);results.push({tenant,scenario,result:'PASS'});console.log('QA_BROWSER_PASS '+tenant+' '+scenario);};
async function context(){
  const ctx=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true,serviceWorkers:'block'});
  for(const domain of domains)await ctx.grantPermissions(['local-network-access'],{origin:'https://'+domain});
  await ctx.routeWebSocket('**/*',socket=>socket.close());
  await ctx.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(domains.has(url.hostname)){
      if(url.pathname==='/__qa-origin'){await route.fulfill({contentType:'text/html',body:'<!doctype html><title>QA origin isolation probe</title>'});return;}
      const response=await route.fetch({url:'http://127.0.0.1:5191'+url.pathname+url.search,maxRedirects:0});
      await route.fulfill({response});return;
    }
    if(url.hostname==='127.0.0.1'&&['9298','8187','9398','5101','5191'].includes(url.port)){await route.continue();return;}
    if(['blob:','data:'].includes(url.protocol)){await route.continue();return;}
    await route.abort('blockedbyclient');
  });
  return ctx;
}
async function login(page,credential){
  await page.goto('https://shiftoryx.gr/login');
  await page.getByLabel('Email',{exact:true}).fill(credential.email);
  await page.getByLabel('Password',{exact:true}).fill(credential.password);
  await page.getByRole('button',{name:'Sign In',exact:true}).click();
  try{await page.waitForURL(url=>url.hostname===credential.domain&& !url.hash.includes('authTicket'),{timeout:45000});}
  catch(error){console.log('QA_LOGIN_DIAGNOSTIC '+new URL(page.url()).hostname+new URL(page.url()).pathname+' '+safeError({message:await page.locator('body').innerText()}));throw error;}
  try{await page.getByTestId('scheduler-v3-workspace').waitFor({timeout:20000});}
  catch(error){console.log('QA_WORKSPACE_DIAGNOSTIC '+new URL(page.url()).hostname+new URL(page.url()).pathname+' '+safeError({message:await page.locator('body').innerText()}));console.log(await page.evaluate(async()=>{const {useSchedulerStore}=await import('/src/hooks/useSchedulerStore.js');const s=useSchedulerStore.getState();return {isAdmin:s.isAdmin,isLoading:s.isLoading,isAuthLoading:s.isAuthLoading,employees:s.employees.length,version:s.schedulerSchemaVersion,error:s.errorMessage,warning:s.warningMessage};}));throw error;}
}
async function publishFromUi(workspace){
  const acknowledgement=workspace.getByLabel('Διάβασα τις προειδοποιήσεις και επιλέγω δημοσίευση.',{exact:true});
  if(await acknowledgement.count())await acknowledgement.check();
  await workspace.getByRole('button',{name:'Δημοσίευση νέας έκδοσης',exact:true}).click();
  await workspace.getByText(/Δημοσιεύτηκε η έκδοση \d+\./).waitFor({timeout:30000});
}
function safeError(error){let message=String(error.message||error);for(const c of credentials)message=message.replaceAll(c.password,'[REDACTED]');return message.replace(/([?&#](?:token|key|authTicket)=)[^\s&"']+/gi,'$1[REDACTED]').replace(/\beyJ[A-Za-z0-9_.-]+/g,'[REDACTED]');}
try{
  if(process.argv.includes('--interactive')){
    const ctx=await context(),page=await ctx.newPage();await page.goto('https://shiftoryx.gr/login');
    console.log('Manual QA browser opened. Credentials are in the runtime directory; domains in this browser are local emulator aliases.');
    await new Promise(resolve=>browser.on('disconnected',resolve));process.exit(0);
  }
  for(const credential of credentials){
    const t=tenants.find(t=>t.slug===credential.tenant),ctx=await context(),page=await ctx.newPage();page.setDefaultTimeout(20000);
    const errors=[];page.on('pageerror',error=>errors.push(safeError(error)));
    await login(page,credential);record(t.slug,'central login + membership + broker redirect',new URL(page.url()).hostname===t.domain);
    await page.reload();await page.getByTestId('scheduler-v3-workspace').waitFor();record(t.slug,'tenant refresh preserves authenticated access',true);
    await page.goto('https://'+t.domain+'/app');await page.getByTestId('scheduler-v3-workspace').waitFor();record(t.slug,'direct authorized tenant visit',true);
    const workspace=page.getByTestId('scheduler-v3-workspace');
    await workspace.getByLabel('Ημερομηνία',{exact:true}).fill('2026-09-07');await workspace.getByRole('button',{name:'Δημιουργία',exact:true}).click();
    await workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().waitFor();
    await page.screenshot({path:resolve(output,t.slug+'-week.png'),fullPage:true});
    await publishFromUi(workspace);
    await page.evaluate(async slug=>{const {schedulePublicationsRepository:r}=await import('/src/repositories/schedulePublicationsRepository.ts');const snapshot=(await r.list(slug)).find(p=>p.version===1);if(!snapshot)throw new Error('Initial version 1 missing');window.__qaUIV1={snapshot,bytes:new Uint8Array(await r.download(slug,snapshot.id))};},t.slug);
    const statsBefore=await workspace.getByRole('region',{name:'Ώρες εργαζομένων',exact:true}).innerText();
    const countBefore=await workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'}).count();
    await workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'}).first().click();
    record(t.slug,'manual Preview edit recalculates totals and coverage warning',
      await workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'}).count()===countBefore-1&&
      await workspace.getByRole('region',{name:'Ώρες εργαζομένων',exact:true}).innerText()!==statsBefore&&
      (await workspace.getByRole('region',{name:'Προειδοποιήσεις',exact:true}).innerText()).includes('Κάλυψη'));
    await publishFromUi(workspace);
    const uiPublication=await page.evaluate(async slug=>{const {schedulePublicationsRepository:r}=await import('/src/repositories/schedulePublicationsRepository.ts');const list=await r.list(slug),before=window.__qaUIV1,after=list.find(p=>p.id===before.snapshot.id),bytes=new Uint8Array(await r.download(slug,after.id));return list.some(p=>p.version===2&&p.publishedWithWarnings)&&JSON.stringify(after)===JSON.stringify(before.snapshot)&&bytes.length===before.bytes.length&&bytes.every((v,i)=>v===before.bytes[i]);},t.slug);
    record(t.slug,'actual Publish button creates warning-acknowledged v2 and preserves original v1/PDF',uiPublication);
    await workspace.getByRole('combobox',{name:'Περίοδος',exact:true}).selectOption('MONTH');
    await workspace.getByRole('button',{name:'Δημιουργία',exact:true}).click();
    record(t.slug,'MONTH generated in actual OWNER UI',(await workspace.getByRole('button',{name:'Αφαίρεση βάρδιας'}).count())>countBefore);
    await page.screenshot({path:resolve(output,t.slug+'-month.png')});
    // Real owner repository operations, using the authenticated browser Firebase instance.
    const persistence=await page.evaluate(async({t,runId})=>{
      const {db,auth}=await import('/src/firebase/config.js');
      const sdkUrl=performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>new URL(url).pathname.endsWith('/firebase_firestore.js'));
      const firestore=await import(sdkUrl);
      const {schedulePublicationsRepository:repo}=await import('/src/repositories/schedulePublicationsRepository.ts');
      const service=await import('/src/services/schedulerV3Service.ts');
      const {publishDraftV3}=await import('/src/services/schedulePublicationService.ts');
      const {renderPublicationPdfV3}=await import('/src/services/schedulePublicationPdf.ts');
      const canonical=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
      const same=(a,b)=>canonical(a)===canonical(b);
      const prefix=t.slug+'-'+runId;
      const rendered=new Map();
      const io={reserve:(key,id)=>repo.reserve(t.slug,key,id),renderPdf:async snapshot=>{const bytes=await renderPublicationPdfV3(snapshot);rendered.set(snapshot.id,bytes.slice());return bytes;},uploadPdf:(path,bytes)=>repo.uploadPdf(t.slug,path,bytes),finalize:snapshot=>repo.finalize(snapshot)};
      const states={};
      for(const periodType of ['WEEK','MONTH']){
        const first=periodType==='WEEK'?'2026-09-07':'2026-09-01',last=periodType==='WEEK'?'2026-09-13':'2026-09-30';
        const draft=service.createDraftV3({config:t.config,employees:t.employees,absences:service.mapAbsencesV3(t.absences,first,last),periodType,periodStart:first,periodEnd:last,options:{balanceWeeklyTargets:true}},prefix+'-stored-'+periodType);
        await repo.saveDraft(draft);const loaded=await repo.loadDraft(t.slug,draft.id);
        states[periodType]={shiftCount:loaded.shifts.length,roundtrip:same(loaded.shifts.map(s=>s.id),draft.shifts.map(s=>s.id))};
      }
      const week=await repo.loadDraft(t.slug,prefix+'-stored-WEEK');
      const context={tenantId:t.slug,uid:auth.currentUser.uid,id:prefix+'-v1',timestamp:'2026-09-07T12:00:00Z',acceptWarnings:true};
      const v1=await publishDraftV3(week,context,io);const bytes1=new Uint8Array(await repo.download(t.slug,v1.id));
      const template=t.config.shiftTemplates[0],employee=t.employees[0];
      const offDate=Array.from({length:7},(_,n)=>'2026-09-'+String(7+n).padStart(2,'0')).find(d=>new Date(d+'T00:00:00Z').getUTCDay()===employee.schedulerV3.fixedDayOff);
      const edited=service.editDraftV3(week,[...week.shifts,{...week.shifts[0],id:'manual-warning',employeeId:employee.id,employeeName:employee.fullName,date:offDate,shiftTemplateId:template.id,startTime:template.startTime,endTime:template.endTime,durationHours:template.durationHours,crossMidnight:false,source:'MANUAL',isManualOverride:true}]);
      const v2=await publishDraftV3(edited,{...context,id:prefix+'-v2'},io);
      const history=await repo.list(t.slug),storedV1=history.find(s=>s.id===v1.id),bytesAfter=new Uint8Array(await repo.download(t.slug,v1.id));
      const denied=async fn=>{try{await fn();return false;}catch(e){return e.code==='permission-denied'||e.code==='storage/unauthorized';}};
      const immutableDoc=await denied(()=>firestore.updateDoc(firestore.doc(db,'tenants',t.slug,'schedulePublications',v1.id),{version:99}));
      const immutablePdf=await denied(()=>repo.uploadPdf(t.slug,v1.pdfStoragePath,bytes1));
      return {states,versions:[v1.version,v2.version],withWarnings:v2.publishedWithWarnings,v1Unchanged:same(storedV1,v1),pdfMatchesSnapshotRender:bytes1.length===rendered.get(v1.id).length&&bytes1.every((v,i)=>v===rendered.get(v1.id)[i]),pdfUnchanged:bytes1.length===bytesAfter.length&&bytes1.every((v,i)=>v===bytesAfter[i]),pdfValid:new TextDecoder().decode(bytes1.slice(0,5))==='%PDF-',immutableDoc,immutablePdf};
    },{t,runId});
    await writeFile(resolve(output,t.slug+'-persistence.json'),JSON.stringify(persistence,null,2));
    record(t.slug,'WEEK and MONTH repository roundtrip',persistence.states.WEEK.roundtrip&&persistence.states.MONTH.roundtrip);
    record(t.slug,'OWNER publishes acknowledged warnings',persistence.withWarnings);
    record(t.slug,'v1 snapshot/PDF remain immutable after v2',persistence.v1Unchanged&&persistence.pdfMatchesSnapshotRender&&persistence.pdfUnchanged&&persistence.pdfValid&&persistence.immutableDoc&&persistence.immutablePdf);
    await workspace.getByRole('button',{name:'Φόρτωση ιστορικού',exact:true}).click();
    await workspace.getByRole('region',{name:'Ιστορικό δημοσιεύσεων',exact:true}).waitFor();
    await page.screenshot({path:resolve(output,t.slug+'-history.png'),fullPage:true});
    const isolation=await page.evaluate(async({own,otherSlugs})=>{
      const {db,auth}=await import('/src/firebase/config.js');
      const sdkUrl=performance.getEntriesByType('resource').map(e=>e.name).findLast(url=>new URL(url).pathname.endsWith('/firebase_firestore.js'));
      const fs=await import(sdkUrl);
      const {schedulePublicationsRepository:repo}=await import('/src/repositories/schedulePublicationsRepository.ts');
      const {verifyTenantAccessForHost}=await import('/src/services/tenantAccessService.js');
      const denied=async fn=>{try{await fn();return false;}catch(e){return e.code==='permission-denied'||e.code==='storage/unauthorized';}};
      const rows=[];
      for(const foreign of otherSlugs){
        const source={tenant:foreign};
        source.employeeRead=await denied(()=>fs.getDoc(fs.doc(db,'tenants',foreign,'employees',foreign+'-e1')));
        source.employeeWrite=await denied(()=>fs.updateDoc(fs.doc(db,'tenants',foreign,'employees',foreign+'-e1'),{fullName:'QA unauthorized attempt'}));
        source.history=await denied(()=>repo.list(foreign));source.draft=await denied(()=>repo.loadDraft(foreign,foreign+'-stored-WEEK'));
        source.pdf=await denied(()=>repo.download(foreign,foreign+'-v1'));
        source.publicationWrite=await denied(()=>repo.reserve(foreign,'WEEK_2026-09-07_2026-09-13','qa-forbidden-publication'));
        try{source.hostname=!(await verifyTenantAccessForHost({uid:auth.currentUser.uid,hostname:foreign+'.shiftoryx.gr'})).allowed;}
        catch(error){source.hostname=error.code==='permission-denied';}
        rows.push(source);
      }
      return rows;
    },{own:t.slug,otherSlugs:tenants.filter(other=>other.slug!==t.slug).map(other=>other.slug)});
    record(t.slug,'all foreign tenant IDs/documents/repositories/PDF denied',isolation.every(row=>Object.entries(row).every(([k,v])=>k==='tenant'||v===true)));
    const foreign=tenants.find(other=>other.slug!==t.slug);
    // First verify origin isolation, then sign the same OWNER into B's origin.
    // Authentication success must still not confer tenant B membership.
    const foreignPage=await ctx.newPage();await foreignPage.goto('https://'+foreign.domain+'/app');
    await foreignPage.waitForURL(url=>url.hostname==='shiftoryx.gr',{timeout:20000});
    record(t.slug,'direct foreign subdomain sends unauthenticated origin to portal',new URL(foreignPage.url()).hostname==='shiftoryx.gr');
    await foreignPage.goto('https://'+foreign.domain+'/__qa-origin');
    await foreignPage.evaluate(async credential=>{const {authRepository}=await import('/src/repositories/index.js');await authRepository.signInAdmin({email:credential.email,password:credential.password});},credential);
    await foreignPage.goto('https://'+foreign.domain+'/app');
    await foreignPage.getByRole('heading',{name:'Δεν επιτρέπεται η πρόσβαση',exact:true}).waitFor();
    record(t.slug,'authenticated OWNER A still denied on foreign hostname B',true);
    await foreignPage.screenshot({path:resolve(output,t.slug+'-foreign-denied.png')});
    await foreignPage.close();
    await workspace.getByRole('button',{name:'Αποσύνδεση',exact:true}).click();await page.waitForURL(url=>url.hostname==='shiftoryx.gr',{timeout:30000});
    await login(page,credential);record(t.slug,'logout and central re-login',true);
    record(t.slug,'no uncaught page errors',errors.length===0);
    results.push({tenant:t.slug,persistence,isolation});
    await ctx.close();
  }
  await writeFile(resolve(output,'browser-results.json'),JSON.stringify({assertions,results},null,2));
  console.log(`REALISTIC_AUTH_ROUTING_ISOLATION assertions=${assertions} tenants=4 PASS`);
}catch(error){await writeFile(resolve(output,'browser-failure.txt'),safeError(error));console.error(safeError(error));process.exitCode=1;}finally{await browser.close();}
