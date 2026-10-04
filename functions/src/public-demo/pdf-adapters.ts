import type {App} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {assertDemoRuntime,DEMO_PROJECT_ID,DEMO_EMULATOR_PROJECT_ID,isDemoTenant} from './policy.ts';
import {fail,UUID_V4} from './pdf-authorization.ts';
import {StorageCreateError,type PdfDatabase,type ImmutablePdfStorage} from './pdf-coordinator.ts';
import {validatePdfBytes} from './pdf-transport.ts';
import * as immutableGcsPrimitives from './gcs-immutable-primitives.ts';

export const demoPdfImmutableGcsPrimitives=immutableGcsPrimitives;

export function assertPdfApp(app:App,env:Record<string,string|undefined>=process.env){
  try{assertDemoRuntime(env);}catch{fail('ACCESS_DENIED');}
  const emulator=env.FUNCTIONS_EMULATOR==='true',project=emulator?DEMO_EMULATOR_PROJECT_ID:DEMO_PROJECT_ID;
  if(app.options.projectId!==project)fail('ACCESS_DENIED');
  if(emulator){
    for(const key of ['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']){
      if(!/^127\.0\.0\.1:\d{2,5}$/.test(env[key]||''))fail('ACCESS_DENIED');
    }
  }else if(['FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST'].some(k=>env[k]))fail('ACCESS_DENIED');
  const bucket=emulator?project+'.appspot.com':project+'.firebasestorage.app';
  if(app.options.storageBucket!==bucket)fail('ACCESS_DENIED');
  return {project,bucket};
}
export function assertDemoPublicationPath(path:string){
  const match=/^tenants\/([^/]+)\/schedule-publications\/([^/]+)\/schedule\.pdf$/.exec(path);
  if(!match||!isDemoTenant(match[1])||!UUID_V4.test(match[2]))fail('ACCESS_DENIED');
  return {tenant:match[1],publicationId:match[2]};
}
export function createDemoPdfAdapters(app:App,env:Record<string,string|undefined>=process.env):{database:PdfDatabase;storage:ImmutablePdfStorage}{
  const target=assertPdfApp(app,env),db=getFirestore(app),bucket=getStorage(app).bucket(target.bucket);
  // This SDK client belongs to the dedicated demo app. No automatic write retries:
  // an uncertain write stays accounted for by the coordinator.
  immutableGcsPrimitives.disableImmutableGcsRetries(bucket as any);
  const database:PdfDatabase={transaction:run=>db.runTransaction(async tx=>{
    let wrote=false;const read=()=>{if(wrote)fail('PDF_INTEGRITY_FAILURE');};
    return run({get:async path=>{read();return (await tx.get(db.doc(path))).data();},list:async(path,limit)=>{read();if(!Number.isInteger(limit)||limit<1||limit>1001)fail('PDF_INTEGRITY_FAILURE');return (await tx.get(db.collection(path).limit(limit))).docs.map(d=>({id:d.id,data:d.data()}));},
      set:(path,value)=>{wrote=true;tx.set(db.doc(path),value);},create:(path,value)=>{wrote=true;tx.create(db.doc(path),value);},delete:path=>{wrote=true;tx.delete(db.doc(path));}});
  })};
  const storage:ImmutablePdfStorage={
    async create(path,bytes,options){
      assertDemoPublicationPath(path);validatePdfBytes(bytes);
      if(options.ifGenerationMatch!==0||options.contentType!=='application/pdf')fail('PDF_INTEGRITY_FAILURE');
      try{return await immutableGcsPrimitives.createImmutableObject(bucket as any,path,bytes,{contentType:'application/pdf'});}catch(error){
        if(error instanceof immutableGcsPrimitives.ImmutableGcsError&&error.code==='CONFLICT')throw new StorageCreateError('CONFLICT');
        if(error instanceof immutableGcsPrimitives.ImmutableGcsError&&error.code==='REJECTED')throw new StorageCreateError('REJECTED');
        throw error;
      }
    },
    async read(path,generation){
      assertDemoPublicationPath(path);if(generation===undefined||!/^\d+$/.test(generation))fail('PDF_INTEGRITY_FAILURE');
      const object=await immutableGcsPrimitives.readExactGeneration(bucket as any,path,generation,2*1024*1024-1);
      if(object.contentType!=='application/pdf'||object.bytes.length<1||object.bytes.length>=2*1024*1024)fail('PDF_INTEGRITY_FAILURE');validatePdfBytes(object.bytes);
      return object;
    },
    async remove(path,generation){
      const {tenant,publicationId}=assertDemoPublicationPath(path);if(!/^\d+$/.test(generation))fail('PDF_INTEGRITY_FAILURE');
      await db.runTransaction(async tx=>{
        const root=`tenants/${tenant}`,[reservation,control,publication,manifest]=await Promise.all([tx.get(db.doc(`${root}/schedulePublicationReservations/${publicationId}`)),tx.get(db.doc(`demoPdfControls/${tenant}`)),tx.get(db.doc(`${root}/schedulePublications/${publicationId}`)),tx.get(db.doc(`${root}/demoPublicationArtifacts/${publicationId}`))]);
        const r=reservation.data(),c=control.data();
        if(publication.exists||manifest.exists||r?.state!=='CANCEL_PENDING'||c?.stage!=='CANCEL_PENDING'||r.tenantId!==tenant||r.receipt?.generation!==generation||c.operationId!==r.intentId||c.attemptId!==r.attemptId)fail('ACCESS_DENIED');
      });
      await immutableGcsPrimitives.deleteExactGeneration(bucket as any,path,generation);
    },
  };
  return {database,storage};
}
