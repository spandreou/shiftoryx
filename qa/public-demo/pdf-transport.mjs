// Phase2B real Firebase emulator evidence; never a hosted qualification.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
const adapterPath=new URL('../../functions/src/public-demo/pdf-adapters.ts',import.meta.url);
assert.ok(existsSync(adapterPath),'Real demo Firestore/Storage adapter is not implemented');
const {createDemoPdfAdapters}=await import(adapterPath);
assert.equal(typeof createDemoPdfAdapters,'function');
const {dbAdmin,bucket,login,rpc,project,tenants,close}=await import('./test-support.mjs');
const {getApps}=await import('../../functions/node_modules/firebase-admin/lib/app/index.js');
const {createDemoPdfAuthenticator}=await import('../../functions/src/public-demo/pdf-authorization.ts');
const {createPdfPublicationCore}=await import('../../functions/src/public-demo/pdf-coordinator.ts');
const {publicDemoFixture}=await import('../../functions/src/public-demo/fixtures.ts');
const {createDraftV3,mapAbsencesV3}=await import('../../src/services/schedulerV3Service.ts');
const {hashPreviewV3}=await import('../../src/services/publicationIntentV3.ts');
const {randomUUID,createHash}=await import('node:crypto');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,writeBatch}=await import('firebase/firestore');
const {ref,getBytes,uploadBytes}=await import('firebase/storage');
let checks=0;const pass=name=>{checks++;console.log('PASS '+name);};
export async function saveDraft(tenant,period='WEEK'){
  const f=publicDemoFixture(tenant,new Date()),start=period==='WEEK'?f.weekStart:f.weekStart.slice(0,7)+'-01',lastDate=new Date(start+'T00:00:00Z');lastDate.setUTCMonth(lastDate.getUTCMonth()+1);lastDate.setUTCDate(0);
  const end=period==='WEEK'?f.weekEnd:lastDate.toISOString().slice(0,10),d=createDraftV3({config:f.config,employees:f.employees,absences:mapAbsencesV3(f.absences,start,end),periodType:period,periodStart:start,periodEnd:end,options:{balanceWeeklyTargets:true}},randomUUID());
  const ids=d.shifts.map((_,n)=>d.id+'_'+n),{shifts,...metadata}=d,batch=dbAdmin.batch();
  shifts.forEach((s,n)=>batch.set(dbAdmin.doc(`tenants/${tenant}/shifts/${ids[n]}`),{...s,type:'work'}));
  batch.set(dbAdmin.doc(`tenants/${tenant}/scheduleDrafts/${d.id}`),{...metadata,tenantId:tenant,schemaVersion:3,revision:1,shiftDocumentIds:ids,updatedBy:(await dbAdmin.doc('demoState/'+tenant).get()).data().generation===0?'':tenant+'-owner-g'+(await dbAdmin.doc('demoState/'+tenant).get()).data().generation});await batch.commit();
  return {intentId:randomUUID(),draftId:d.id,draftRevision:1,previewHash:await hashPreviewV3(d),acceptWarnings:true};
}
export async function pdfRpc(name,input,client){assert.ok(['publishPublicDemoPdf','downloadPublicDemoPdf'].includes(name));const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:`https://${client.tenant}.shiftoryx.gr`,Authorization:'Bearer '+await client.auth.currentUser.getIdToken()},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});return response;}
try{
  const app=getApps()[0],{database,storage}=createDemoPdfAdapters(app),clients=[];
  for(const tenant of tenants){
    const client=await login(tenant),input=await saveDraft(tenant,tenant==='demo-cafe'?'MONTH':'WEEK');clients.push({...client,input});
    const response=await pdfRpc('publishPublicDemoPdf',input,client);assert.equal(response.status,200);const published=await response.json();client.publication=published;clients.at(-1).publication=published;
    const publication=(await dbAdmin.doc(`tenants/${tenant}/schedulePublications/${published.publicationId}`).get()).data(),manifest=(await dbAdmin.doc(`tenants/${tenant}/demoPublicationArtifacts/${published.publicationId}`).get()).data();assert.equal(publication.version,published.version);assert.equal(manifest.status,'FINALIZED');assert.equal(publication.publishedWithWarnings,true);assert.ok(publication.warningsAtPublish.length>0);
    const download=await pdfRpc('downloadPublicDemoPdf',{publicationId:published.publicationId},client);assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/pdf');assert.match(download.headers.get('content-disposition'),/^attachment; filename="schedule-/);assert.equal(download.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(download.headers.get('x-content-type-options'),'nosniff');
    const bytes=Buffer.from(await download.arrayBuffer()),stored=await storage.read(publication.pdfStoragePath,manifest.storageObjectGeneration);assert.deepEqual(bytes,Buffer.from(stored.bytes));assert.equal(createHash('sha256').update(bytes).digest('hex'),manifest.sha256);assert.equal(bytes.length,manifest.byteLength);assert.equal(download.headers.get('content-length'),String(bytes.length));assert.match(download.headers.get('vary'),/Origin/);assert.match(download.headers.get('vary'),/Authorization/);pass(tenant+' own publish/download exact bytes and headers');
    const retry=await pdfRpc('publishPublicDemoPdf',input,client);assert.equal(retry.status,200);assert.equal((await retry.json()).publicationId,published.publicationId);pass(tenant+' replay same intent');
    const probeId=randomUUID(),probePublication={...publication,id:probeId,pdfStoragePath:`tenants/${tenant}/schedule-publications/${probeId}/schedule.pdf`};
    await dbAdmin.doc(`tenants/${tenant}/schedulePublicationReservations/${probeId}`).set({tenantId:tenant,periodKey:published.periodKey,version:publication.version,publishedByUid:client.auth.currentUser.uid});
    for(const operation of [()=>getBytes(ref(client.storage,publication.pdfStoragePath)),()=>uploadBytes(ref(client.storage,probePublication.pdfStoragePath),bytes,{contentType:'application/pdf'}),()=>setDoc(doc(client.db,'tenants',tenant,'schedulePublications',probeId),probePublication)])await assert.rejects(operation,e=>['permission-denied','storage/unauthorized'].includes(e.code));pass(tenant+' direct Storage and valid finalization denied');
    const counter=doc(client.db,'tenants',tenant,'schedulePublicationCounters',published.periodKey),next={tenantId:tenant,version:publication.version+1,lastReservedId:probeId};
    await assert.rejects(()=>updateDoc(counter,next),e=>e.code==='permission-denied');
    const batch=writeBatch(client.db),newReservation=randomUUID();batch.set(counter,{...next,lastReservedId:newReservation});batch.set(doc(client.db,'tenants',tenant,'schedulePublicationReservations',newReservation),{tenantId:tenant,periodKey:published.periodKey,version:next.version,publishedByUid:client.auth.currentUser.uid});await assert.rejects(()=>batch.commit(),e=>e.code==='permission-denied');
    const index=doc(client.db,'tenants',tenant,'schedulePublicationPeriods',published.periodKey);await assert.rejects(()=>setDoc(index,{tenantId:tenant,periodKey:published.periodKey,latestVersion:publication.version,latestPublicationId:publication.id,updatedAt:publication.publishedAt}),e=>e.code==='permission-denied');
    for(const name of ['publicSchedules','publicMonths']){const projection=(await dbAdmin.collection(`tenants/${tenant}/${name}`).get()).docs[0];assert.ok(projection);await assert.rejects(()=>setDoc(doc(client.db,'tenants',tenant,name,projection.id),projection.data()),e=>e.code==='permission-denied');}
    for(const target of [counter,index,doc(client.db,'tenants',tenant,'schedulePublications',publication.id)])await assert.rejects(()=>deleteDoc(target),e=>e.code==='permission-denied');
    for(const path of [['demoPdfControls',tenant],['demoPdfLimits',tenant],['demoPdfRequests',tenant,'intents',input.intentId],['tenants',tenant,'demoPublicationArtifacts',publication.id]])await assert.rejects(()=>getDoc(doc(client.db,...path)),e=>e.code==='permission-denied');pass(tenant+' lifecycle/projection writes and coordination reads denied');
    client.bytes=bytes;clients.at(-1).bytes=bytes;
  }
  let pairs=0;
  for(const client of clients)for(const foreign of clients.filter(c=>c.tenant!==client.tenant)){
    const bad=await pdfRpc('downloadPublicDemoPdf',{publicationId:foreign.publication.publicationId},client),missing=await pdfRpc('downloadPublicDemoPdf',{publicationId:randomUUID()},client);assert.equal(bad.status,404);assert.equal(missing.status,404);assert.equal((await bad.json()).error.code,(await missing.json()).error.code);
    const publish=await pdfRpc('publishPublicDemoPdf',{...foreign.input,intentId:randomUUID()},client);assert.equal(publish.status,409);
    await assert.rejects(()=>getBytes(ref(client.storage,`tenants/${foreign.tenant}/schedule-publications/${foreign.publication.publicationId}/schedule.pdf`)),e=>e.code==='storage/unauthorized');
    const own=await pdfRpc('downloadPublicDemoPdf',{publicationId:client.publication.publicationId},client);assert.equal(own.status,200);assert.deepEqual(Buffer.from(await own.arrayBuffer()),client.bytes);pairs++;pass(client.tenant+' -> '+foreign.tenant+' denied; own positive control');
  }
  assert.equal(pairs,12);
  const fuel=clients[0],token=await fuel.auth.currentUser.getIdToken(),base=`http://127.0.0.1:5111/${project}/us-central1/`;
  const http=(name,body,headers={},method='POST')=>fetch(base+name,{method,headers:{'Content-Type':'application/json',Origin:'https://demo-fuel.shiftoryx.gr',Authorization:'Bearer '+token,...headers},...(method==='GET'?{}:{body}),signal:AbortSignal.timeout(45000)});
  for(const [name,body,headers,method,status] of [
    ['anonymous',JSON.stringify(fuel.input),{Authorization:''},'POST',401],['bad bearer token',JSON.stringify(fuel.input),{Authorization:'Bearer invalid-emulator-fixture'},'POST',401],['wrong Origin',JSON.stringify(fuel.input),{Origin:'https://demo-cafe.shiftoryx.gr'},'POST',403],['wrong type','pdf',{'Content-Type':'application/pdf'},'POST',415],['method',null,{},'GET',405],['unknown field',JSON.stringify({...fuel.input,path:'arbitrary'}),{},'POST',400],['duplicate key',JSON.stringify(fuel.input).replace('{','{"intentId":"'+fuel.input.intentId+'",'),{},'POST',400],['oversized',JSON.stringify(fuel.input)+' '.repeat(4097),{},'POST',413]
  ]){const response=await http('publishPublicDemoPdf',body,headers,method);assert.equal(response.status,status,name);const error=await response.json();assert.ok(error.error.code);assert.equal(JSON.stringify(error).includes(token),false);pass('HTTP '+name+' safe rejection');}
  assert.equal((await http('publishPublicDemoPdf',null,{'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'Authorization, Content-Type'},'OPTIONS')).status,204);pass('bounded OPTIONS');
  assert.equal((await http('downloadPublicDemoPdf',JSON.stringify({publicationId:fuel.publication.publicationId}),{Range:'bytes=0-1'})).status,400);pass('download Range denied');
  const second=await pdfRpc('publishPublicDemoPdf',{...fuel.input,intentId:randomUUID()},fuel);assert.equal(second.status,200);assert.equal((await second.json()).version,2);const prior=await pdfRpc('downloadPublicDemoPdf',{publicationId:fuel.publication.publicationId},fuel);assert.equal(prior.status,200);assert.deepEqual(Buffer.from(await prior.arrayBuffer()),fuel.bytes);pass('v1 bytes unchanged after v2');
  const quota=dbAdmin.doc('demoPdfLimits/demo-fuel'),before=(await quota.get()).data();await quota.set({...before,downloadMinute:Math.floor(Date.now()/60000),downloadCount:60});assert.equal((await pdfRpc('downloadPublicDemoPdf',{publicationId:fuel.publication.publicationId},fuel)).status,429);pass('download rate cap');
  await quota.set({...before,hour:Math.floor(Date.now()/3600000),count:30});assert.equal((await pdfRpc('publishPublicDemoPdf',{...fuel.input,intentId:randomUUID()},fuel)).status,429);pass('new publication rate cap');
  await quota.set({...before,publishMinute:Math.floor(Date.now()/60000),publishRequestCount:60});assert.equal((await pdfRpc('publishPublicDemoPdf',fuel.input,fuel)).status,429);pass('finalized replay request rate cap');
  await quota.set({...before,publishMinute:Math.floor(Date.now()/60000)+1,publishRequestCount:60});assert.equal((await pdfRpc('publishPublicDemoPdf',{...fuel.input,intentId:randomUUID()},fuel)).status,429);pass('future publish minute cannot reset request cap');
  await quota.set({...before,downloadMinute:Math.floor(Date.now()/60000)+1,downloadCount:60});assert.equal((await pdfRpc('downloadPublicDemoPdf',{publicationId:fuel.publication.publicationId},fuel)).status,429);pass('future download minute cannot reset request cap');
  console.log(`PDF_SERVER_EMULATOR_PASS checks=${checks} orderedPairs=${pairs} GENERATION_FIDELITY=UNSUPPORTED REAL_GCS_IMMUTABILITY_GATE=PENDING`);
}finally{await close();}
