import {randomUUID,createHash} from 'node:crypto';
import {canonicalJson} from '../../../src/services/publicationIntentV3.ts';
import {authorizePdfTransaction,parseFlatRequest,header,fail,UUID_V4,type PdfRequest,type PdfIdentity} from './pdf-authorization.ts';
import type {PdfDatabase,ImmutablePdfStorage} from './pdf-coordinator.ts';
import {publicationObjectPath,validatePdfBytes} from './pdf-transport.ts';
export function parseDownloadRequest(request:PdfRequest):{publicationId:string}{
  if(header(request,'range')!==undefined||header(request,'if-none-match')!==undefined||header(request,'if-modified-since')!==undefined)fail('INVALID_REQUEST');
  const data=parseFlatRequest(request,['publicationId'],1024);
  if(Object.keys(data).length!==1||typeof data.publicationId!=='string'||!UUID_V4.test(data.publicationId))fail('INVALID_REQUEST');
  return {publicationId:data.publicationId};
}
export function createPdfDownloadCore(deps:{database:PdfDatabase;storage:ImmutablePdfStorage;authenticate:(request:PdfRequest)=>Promise<PdfIdentity>;now?:()=>number}){
  const clock=deps.now??Date.now;
  return {async prepare(request:PdfRequest){
    const input=parseDownloadRequest(request),identity=await deps.authenticate(request),tenant=identity.tenant,operationId=randomUUID(),attemptId=randomUUID(),controlPath=`demoPdfControls/${tenant}`;
    const root=`tenants/${tenant}`,publicationPath=`${root}/schedulePublications/${input.publicationId}`,artifactPath=`${root}/demoPublicationArtifacts/${input.publicationId}`;
    const selected=await deps.database.transaction(async tx=>{
      await authorizePdfTransaction(tx,identity);
      const [publication,manifest,control,quota]=await Promise.all([tx.get(publicationPath),tx.get(artifactPath),tx.get(controlPath),tx.get(`demoPdfLimits/${tenant}`)]);
      if(!publication||!manifest||manifest.status!=='FINALIZED'||manifest.generation!==identity.generation)fail('PDF_NOT_AVAILABLE');
      const snapshotHash=createHash('sha256').update(canonicalJson(publication)).digest('hex');
      if(publication.tenantId!==tenant||publication.id!==input.publicationId||publication.publishedByUid!==identity.uid||manifest.tenantId!==tenant||manifest.publicationId!==input.publicationId||manifest.snapshotHash!==snapshotHash||publication.pdfStoragePath!==publicationObjectPath(tenant,input.publicationId)||
          !/^\d+$/.test(manifest.storageObjectGeneration)||manifest.contentType!=='application/pdf'||!Number.isSafeInteger(manifest.byteLength)||manifest.byteLength<1||manifest.byteLength>=2*1024*1024||!/^[0-9a-f]{64}$/.test(manifest.sha256)||!Number.isSafeInteger(publication.version)||publication.version<1||! /^(WEEK|MONTH)_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(publication.periodKey))fail('PDF_INTEGRITY_FAILURE');
      if(control)fail(['IO_UNCERTAIN','CANCEL_PENDING'].includes(control.stage)?'PDF_RECOVERY_REQUIRED':'PDF_BUSY');
      const minute=Math.floor(clock()/60000),count=quota?.downloadMinute===minute?quota.downloadCount:0;
      if(quota?.downloadMinute>minute)fail('RATE_LIMITED');
      if(!Number.isSafeInteger(count)||count<0)fail('PDF_INTEGRITY_FAILURE');if(count>=60)fail('RATE_LIMITED');
      tx.set(`demoPdfLimits/${tenant}`,{...(quota||{}),downloadMinute:minute,downloadCount:count+1});
      tx.set(controlPath,{operationId,attemptId,kind:'DOWNLOAD',generation:identity.generation,stage:'DOWNLOAD_BUFFERING',startedAt:clock(),heartbeatAt:clock()});
      return {publication,manifest,snapshotHash,manifestHash:createHash('sha256').update(canonicalJson(manifest)).digest('hex')};
    });
    const finish=async()=>{await deps.database.transaction(async tx=>{const control=await tx.get(controlPath);if(control?.operationId===operationId&&control.attemptId===attemptId&&control.kind==='DOWNLOAD')tx.delete(controlPath);});};
    try{
      const object=await deps.storage.read(publicationObjectPath(tenant,input.publicationId),selected.manifest.storageObjectGeneration),metadata=validatePdfBytes(object.bytes);
      if(object.generation!==selected.manifest.storageObjectGeneration||object.contentType!=='application/pdf'||metadata.sha256!==selected.manifest.sha256||metadata.byteLength!==selected.manifest.byteLength)fail('PDF_INTEGRITY_FAILURE');
      return {bytes:Buffer.from(object.bytes),filename:`schedule-${selected.publication.periodKey}-v${selected.publication.version}.pdf`,finish,
        authorizeRelease:async()=>{
          await identity.reverify();
          await deps.database.transaction(async tx=>{
            await authorizePdfTransaction(tx,identity);
            const [control,publication,manifest]=await Promise.all([tx.get(controlPath),tx.get(publicationPath),tx.get(artifactPath)]);
            if(control?.operationId!==operationId||control.attemptId!==attemptId||control.kind!=='DOWNLOAD'||control.stage!=='DOWNLOAD_BUFFERING')fail('PDF_BUSY');
            if(!publication||!manifest||createHash('sha256').update(canonicalJson(publication)).digest('hex')!==selected.snapshotHash||createHash('sha256').update(canonicalJson(manifest)).digest('hex')!==selected.manifestHash)fail('PDF_NOT_AVAILABLE');
            tx.set(controlPath,{...control,stage:'DOWNLOAD_ADMITTED',heartbeatAt:clock()});
          });
        }};
    }catch(error){await finish();throw error;}
  }};
}
