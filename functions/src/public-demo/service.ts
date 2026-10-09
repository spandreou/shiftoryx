import {getApps,initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {DEMO_TENANTS,DEMO_LANDING_ORIGIN,assertDemoRuntime,resolveDemoResetStorageTarget,requireDemoTenant,assertEntryOrigin,assertDemoIdentity,demoOrigin,demoOwnerUid,type DemoTenant} from './policy.ts';
import {PdfError} from './pdf-authorization.ts';
import {createDemoResetAdapters} from './reset-adapters.ts';
import {createDemoResetEngine,type ResetOptions} from './reset-engine.ts';
import {resetHttpFailure} from './reset-errors.ts';
import {fenceDemoEntry} from './broker-fence.ts';
export {createAuthTicket,exchangeAuthTicket} from './broker-callables.ts';
export {publishPublicDemoPdf,downloadPublicDemoPdf} from './pdf-http.ts';
export {mutatePublicDemo} from './mutation-http.ts';

export function resolveDemoResetServices(env:Record<string,string|undefined>=process.env){
  const target=resolveDemoResetStorageTarget(env),name='shiftoryx-demo-reset-service';
  const app=getApps().find(item=>item.name===name)??initializeApp({projectId:target.projectId,storageBucket:target.bucket},name);
  if(app.options.projectId!==target.projectId||app.options.storageBucket!==target.bucket)throw new Error('DEMO_STORAGE_APP_MISMATCH');
  return {app,db:getFirestore(app),auth:getAuth(app),bucket:getStorage(app).bucket(target.bucket)};
}
function services(){return resolveDemoResetServices(process.env);}
function origin(request:any){return String(request.rawRequest?.headers?.origin||'');}
function failure(error:unknown):never{
  if(error instanceof HttpsError)throw error;
  if(error instanceof PdfError)throw new HttpsError(['ACCESS_DENIED','DEMO_GENERATION_CHANGED'].includes(error.code)?'permission-denied':'failed-precondition','Η ενέργεια δεν επιτρέπεται αυτή τη στιγμή.');
  if(error instanceof Error&&error.message.startsWith('DEMO_'))throw new HttpsError('permission-denied','Η ενέργεια δεν επιτρέπεται σε αυτό το demo.');
  throw new HttpsError('internal','Το demo δεν είναι διαθέσιμο αυτή τη στιγμή. Δοκίμασε ξανά.');
}
async function ensureIdentity(tenant:DemoTenant,generation:number){
  const {auth}=services(),uid=demoOwnerUid(tenant,generation);
  let existingClaims:Record<string,unknown>|undefined;
  try{existingClaims=(await auth.getUser(uid)).customClaims;}catch(error:any){if(error.code!=='auth/user-not-found')throw error;try{await auth.createUser({uid,displayName:'ShiftOryx Demo OWNER'});}catch(e:any){if(e.code!=='auth/uid-already-exists')throw e;}}
  const claims={publicDemo:true,demoTenant:tenant,demoGeneration:generation};
  if(!existingClaims||Object.keys(existingClaims).length!==3||Object.entries(claims).some(([key,value])=>existingClaims?.[key]!==value))await auth.setCustomUserClaims(uid,claims);
  return {uid,claims};
}
export async function resetTenant(tenantValue:unknown,options:ResetOptions={}){
  try{return await createDemoResetEngine(createDemoResetAdapters(services().app)).run(tenantValue,options);}
  catch(error){throw resetHttpFailure(error);}
}
const cors=[DEMO_LANDING_ORIGIN,...DEMO_TENANTS.map(demoOrigin)];
export const enterPublicDemo=onCall({cors,region:'us-central1',maxInstances:2,concurrency:20},fenceDemoEntry(async request=>{
  try{
    const tenant=requireDemoTenant(request.data?.tenantId);if(Object.keys(request.data||{}).some(k=>k!=='tenantId'))throw new Error('DEMO_INPUT');
    assertEntryOrigin(tenant,origin(request));const {db,auth}=services();
    const state=await db.doc(`demoState/${tenant}`).get();const data=state.data();
    if(!data||data.resetting)throw new HttpsError('unavailable','Το demo προετοιμάζεται. Δοκίμασε ξανά σε λίγο.');
    const uid=demoOwnerUid(tenant,data.generation);
    const membership=await db.doc(`tenantMemberships/${uid}_${tenant}`).get();
    if(membership.data()?.uid!==uid||membership.data()?.tenantId!==tenant||membership.data()?.status!=='ACTIVE'||membership.data()?.role!=='OWNER')throw new Error('DEMO_MEMBERSHIP');
    // Shared identity; no visitor registration or passwords. Limit token-issuer work.
    await db.runTransaction(async tx=>{const ref=db.doc(`demoEntryLimits/${tenant}`),s=await tx.get(ref),v=s.data();const second=Math.floor(Date.now()/1000);const count=v?.second===second?v.count:0;if(count>=10)throw new HttpsError('resource-exhausted','Υπάρχουν πολλές είσοδοι. Δοκίμασε σε λίγο.');tx.set(ref,{second,count:count+1});});
    // A visitor may delete this shared Auth UID. Restore only the exact current
    // generation's identity after checking membership; never create membership.
    await ensureIdentity(tenant,data.generation);
    const customToken=await auth.createCustomToken(uid,{publicDemo:true,demoTenant:tenant,demoGeneration:data.generation});
    const current=(await state.ref.get()).data();
    if(!current||current.resetting||current.generation!==data.generation)throw new HttpsError('unavailable','Το demo επαναφέρεται. Δοκίμασε ξανά.');
    return {customToken,tenantId:tenant,returnTo:demoOrigin(tenant),weekStart:data.weekStart};
  }catch(error){failure(error);}
}));
export const resetPublicDemo=onCall({cors,region:'us-central1',maxInstances:1,concurrency:4,timeoutSeconds:420,memory:'512MiB'},async request=>{
  try{
    if(!request.auth)throw new HttpsError('unauthenticated','Απαιτείται είσοδος στο demo.');
    if(Object.keys(request.data||{}).some(k=>k!=='tenantId'))throw new Error('DEMO_INPUT');
    const {auth}=services(),header=String(request.rawRequest.headers.authorization||'');
    if(!/^Bearer [^\s,]+$/.test(header))throw new HttpsError('unauthenticated','Απαιτείται είσοδος στο demo.');
    const verified=await auth.verifyIdToken(header.slice(7),true);
    const reverify=async()=>{const fresh=await auth.verifyIdToken(header.slice(7),true);
      if(fresh.uid!==verified.uid||fresh.demoTenant!==verified.demoTenant||fresh.demoGeneration!==verified.demoGeneration)
        throw new Error('DEMO_IDENTITY_CHANGED');};
    return await resetTenant(request.data?.tenantId,{uid:verified.uid,claims:verified,origin:origin(request),reverify});
  }catch(error){throw resetHttpFailure(error);}
});
export const resetPublicDemosDaily=onSchedule({schedule:'every day 04:00',timeZone:'Europe/Athens',region:'us-central1',maxInstances:1,timeoutSeconds:540,memory:'512MiB'},async()=>{assertDemoRuntime(process.env);for(const tenant of DEMO_TENANTS)await resetTenant(tenant,{scheduled:true});});
