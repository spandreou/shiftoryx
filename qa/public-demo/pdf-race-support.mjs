import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,login,close,bucket} from './test-support.mjs';
import {getApps} from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import {createDemoPdfAdapters} from '../../functions/src/public-demo/pdf-adapters.ts';
import {createDemoPdfAuthenticator} from '../../functions/src/public-demo/pdf-authorization.ts';
import {createPdfPublicationCore,StorageCreateError} from '../../functions/src/public-demo/pdf-coordinator.ts';
import {createPdfDownloadCore} from '../../functions/src/public-demo/pdf-download.ts';
import {resetTenant} from '../../functions/src/public-demo/generated.js';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {createDraftV3,mapAbsencesV3} from '../../src/services/schedulerV3Service.ts';
import {hashPreviewV3} from '../../src/services/publicationIntentV3.ts';
export {dbAdmin,close,bucket,resetTenant};
export const latch=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
export async function until(fn){const stop=Date.now()+15000;while(Date.now()<stop){if(await fn())return;await new Promise(r=>setTimeout(r,50));}assert.fail('Emulator race predicate timed out');}
export class ControlledAtomicStorage {
  objects=new Map();sequence=0;
  async create(path,bytes,options){assert.equal(options.ifGenerationMatch,0);if(this.objects.has(path))throw new StorageCreateError('CONFLICT');const generation=String(++this.sequence);this.objects.set(path,{bytes:Uint8Array.from(bytes),generation,contentType:'application/pdf'});return {generation};}
  async read(path,generation){const object=this.objects.get(path);if(!object||generation!==undefined&&object.generation!==generation)throw Error('generation unavailable');return structuredClone(object);}
  async remove(path,generation){const object=this.objects.get(path);if(object&&object.generation!==generation)throw Error('generation conflict');this.objects.delete(path);}
}
export async function context(tenant='demo-fuel',storageOverride){
  await resetTenant(tenant,{scheduled:true});const client=await login(tenant),token=await client.auth.currentUser.getIdToken(),app=getApps()[0],adapters=createDemoPdfAdapters(app),authenticate=createDemoPdfAuthenticator(app);
  const f=publicDemoFixture(tenant,new Date()),d=createDraftV3({config:f.config,employees:f.employees,absences:mapAbsencesV3(f.absences,f.weekStart,f.weekEnd),periodType:'WEEK',periodStart:f.weekStart,periodEnd:f.weekEnd,options:{balanceWeeklyTargets:true}},randomUUID());
  const {shifts,...metadata}=d,ids=shifts.map((_,n)=>d.id+'_'+n),batch=dbAdmin.batch();shifts.forEach((s,n)=>batch.set(dbAdmin.doc(`tenants/${tenant}/shifts/${ids[n]}`),{...s,type:'work'}));batch.set(dbAdmin.doc(`tenants/${tenant}/scheduleDrafts/${d.id}`),{...metadata,tenantId:tenant,schemaVersion:3,revision:1,updatedBy:client.auth.currentUser.uid,shiftDocumentIds:ids});await batch.commit();
  const input={intentId:randomUUID(),draftId:d.id,draftRevision:1,previewHash:await hashPreviewV3(d),acceptWarnings:true};
  const request=(body=input)=>({method:'POST',query:{},headers:{'content-type':'application/json',origin:`https://${tenant}.shiftoryx.gr`,authorization:'Bearer '+token},body:new TextEncoder().encode(JSON.stringify(body))});
  const storage=storageOverride??adapters.storage;
  return {tenant,client,input,request,storage,database:adapters.database,authenticate,publish:createPdfPublicationCore({database:adapters.database,storage,authenticate}).publish,
    download:createPdfDownloadCore({database:adapters.database,storage,authenticate}),state:async()=>(await dbAdmin.doc('demoState/'+tenant).get()).data(),control:async()=>(await dbAdmin.doc('demoPdfControls/'+tenant).get()).data()};
}
