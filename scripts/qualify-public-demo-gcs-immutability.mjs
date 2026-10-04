import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {QUALIFICATION_PREFIX_ROOT,QUALIFICATION_OBJECT_NAMES,qualificationObjectPath} from '../functions/src/public-demo/gcs-qualification-guard.ts';
import * as immutableGcsPrimitives from '../functions/src/public-demo/gcs-immutable-primitives.ts';

export const QUALIFICATION_PROJECT='shiftoryx-public-demo';
export const QUALIFICATION_BUCKET='shiftoryx-public-demo.firebasestorage.app';
export const qualificationImmutableGcsPrimitives=immutableGcsPrimitives;
const required=['storage.objects.create','storage.objects.get','storage.objects.delete','storage.objects.list'];
const emulatorKeys=['FIREBASE_AUTH_EMULATOR_HOST','FIRESTORE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST','STORAGE_EMULATOR_HOST','FUNCTIONS_EMULATOR'];
const invalid=message=>{const error=new Error(message);error.code=message;throw error;};
function parse(args){
  const execute=args.includes('--execute-real-gcs');
  if(args.some(arg=>arg!=='--execute-real-gcs'&&!arg.startsWith('--project=')&&!arg.startsWith('--bucket=')))invalid('QUALIFICATION_ARGUMENT_DENIED');
  for(const arg of args.filter(arg=>arg.startsWith('--project=')))if(arg.slice(10)!==QUALIFICATION_PROJECT)invalid('QUALIFICATION_PROJECT_DENIED');
  for(const arg of args.filter(arg=>arg.startsWith('--bucket=')))if(arg.slice(9)!==QUALIFICATION_BUCKET)invalid('QUALIFICATION_BUCKET_DENIED');
  return {execute};
}
export async function inspectCurrentOperatorPermissions(){
  const command=process.platform==='win32'
    ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','gcloud.cmd auth application-default print-access-token'],{encoding:'utf8',windowsHide:true})
    :spawnSync('gcloud',['auth','application-default','print-access-token'],{encoding:'utf8',windowsHide:true});
  if(command.status!==0||!command.stdout.trim())invalid('QUALIFICATION_IDENTITY_UNAVAILABLE');
  const token=command.stdout.trim();
  try{const query=required.map(permission=>'permissions='+encodeURIComponent(permission)).join('&');const response=await fetch(`https://storage.googleapis.com/storage/v1/b/${QUALIFICATION_BUCKET}/iam/testPermissions?${query}`,{headers:{Authorization:`Bearer ${token}`}});if(!response.ok)invalid('QUALIFICATION_PERMISSION_CHECK_FAILED');const granted=new Set((await response.json()).permissions||[]);return {create:granted.has(required[0]),get:granted.has(required[1]),delete:granted.has(required[2]),list:granted.has(required[3])};}finally{token.fill?.('');}
}
function capable(permission){return permission.create===true&&permission.get===true&&permission.delete===true&&permission.list===true;}
function planned(runId){const paths=QUALIFICATION_OBJECT_NAMES.map(name=>qualificationObjectPath(runId,name));return {runId,prefix:QUALIFICATION_PREFIX_ROOT+runId+'/',objects:paths,cleanup:'EXACT_NAMES_AND_EXACT_GENERATIONS_ONLY'};}
function assertQualificationPlan(plan){
  if(!plan||typeof plan.runId!=='string'||plan.prefix!==QUALIFICATION_PREFIX_ROOT+plan.runId+'/'||!Array.isArray(plan.objects))invalid('QUALIFICATION_PLAN_DENIED');
  const expected=QUALIFICATION_OBJECT_NAMES.map(name=>qualificationObjectPath(plan.runId,name));
  if(plan.objects.length!==expected.length||plan.objects.some((path,index)=>path!==expected[index]))invalid('QUALIFICATION_PLAN_DENIED');
  return expected;
}
const expectedFailure=async(operation,codes)=>{try{await operation();}catch(error){if(codes.includes(error?.code))return;throw error;}invalid('QUALIFICATION_EXPECTED_PRECONDITION_FAILURE');};
const wrongGeneration=generation=>generation==='1'?'2':'1';
export function createQualificationRunManifest(plan,objects,cleanupStatus,resultCategories=[],timestamp=new Date().toISOString()){
  try{assertQualificationPlan(plan);}catch{invalid('QUALIFICATION_MANIFEST_DENIED');}
  if(!Array.isArray(objects)||typeof cleanupStatus!=='string'||typeof timestamp!=='string'||!Number.isFinite(Date.parse(timestamp)))invalid('QUALIFICATION_MANIFEST_DENIED');
  const manifestObjects=objects.map(item=>{
    const uncertain=item?.resultCategory==='CREATE_OUTCOME_UNCERTAIN';
    if(!item||typeof item.name!=='string'||!plan.objects.includes(item.name)||!(uncertain?item.generation===null:typeof item.generation==='string'&&/^\d+$/.test(item.generation))||typeof item.sha256!=='string'||!/^[0-9a-f]{64}$/.test(item.sha256)||!Number.isSafeInteger(item.byteLength)||item.byteLength<1||typeof item.resultCategory!=='string')invalid('QUALIFICATION_MANIFEST_DENIED');
    return {name:item.name,generation:item.generation,sha256:item.sha256,byteLength:item.byteLength,resultCategory:item.resultCategory};
  });
  const categories=resultCategories.length?resultCategories:[...new Set(manifestObjects.map(item=>item.resultCategory))];
  if(!Array.isArray(categories)||categories.some(category=>typeof category!=='string'||!category))invalid('QUALIFICATION_MANIFEST_DENIED');
  return {runId:plan.runId,project:QUALIFICATION_PROJECT,bucket:QUALIFICATION_BUCKET,prefix:plan.prefix,objects:manifestObjects,resultCategories:[...categories],timestamp,cleanupStatus};
}
export function exactCleanupTargets(manifest){
  if(!manifest||manifest.project!==QUALIFICATION_PROJECT||manifest.bucket!==QUALIFICATION_BUCKET||typeof manifest.runId!=='string'||manifest.prefix!==QUALIFICATION_PREFIX_ROOT+manifest.runId+'/'||!Array.isArray(manifest.objects))invalid('QUALIFICATION_CLEANUP_DENIED');
  const expected=QUALIFICATION_OBJECT_NAMES.map(name=>qualificationObjectPath(manifest.runId,name));
  const targets=[];for(const item of manifest.objects){
    if(!item||typeof item.name!=='string'||!expected.includes(item.name)||!manifest.prefix.startsWith(QUALIFICATION_PREFIX_ROOT)||manifest.prefix.startsWith('tenants/'))invalid('QUALIFICATION_CLEANUP_DENIED');
    if(item.resultCategory==='CREATE_OUTCOME_UNCERTAIN'){if(item.generation!==null)invalid('QUALIFICATION_CLEANUP_DENIED');continue;}
    if(typeof item.generation!=='string'||!/^\d+$/.test(item.generation))invalid('QUALIFICATION_CLEANUP_DENIED');targets.push({name:item.name,generation:item.generation});
  }return targets;
}
export async function executeQualificationPlan({bucket,plan,now=()=>new Date()}){
  assertQualificationPlan(plan);
  const timestamp=now().toISOString();if(!Number.isFinite(Date.parse(timestamp)))invalid('QUALIFICATION_TIMESTAMP_DENIED');
  immutableGcsPrimitives.disableImmutableGcsRetries(bucket);
  const bytes=Buffer.from('%PDF-1.3\nShiftOryx qualification fixture\n%%EOF');
  const sha256=createHash('sha256').update(bytes).digest('hex');const live=[];const results=[];
  const create=async index=>{const name=plan.objects[index];try{const created=await immutableGcsPrimitives.createImmutableObject(bucket,name,bytes,{contentType:'application/pdf'});const entry={name,generation:created.generation,sha256,byteLength:bytes.length,resultCategory:'CREATE_OK'};live.push(entry);return entry;}catch(error){
    // save and the first metadata read are one SDK operation boundary. Without
    // proof of which step failed, retain this exact attempted name as uncertain.
    live.push({name,generation:null,sha256,byteLength:bytes.length,resultCategory:'CREATE_OUTCOME_UNCERTAIN'});throw error;
  }};
  const verify=async entry=>{const read=await immutableGcsPrimitives.readExactGeneration(bucket,entry.name,entry.generation,2*1024*1024-1);if(createHash('sha256').update(read.bytes).digest('hex')!==entry.sha256)invalid('QUALIFICATION_HASH_MISMATCH');};
  const verifyLive=async entry=>{const [metadata]=await bucket.file(entry.name).getMetadata();if(metadata?.name!==entry.name||String(metadata.generation)!==entry.generation||String(metadata.size)!==String(entry.byteLength))invalid('QUALIFICATION_LIVE_MISMATCH');await verify(entry);};
  try{
    const createOnly=await create(0);await verifyLive(createOnly);await expectedFailure(()=>immutableGcsPrimitives.createImmutableObject(bucket,createOnly.name,bytes,{contentType:'application/pdf'}),['CONFLICT']);await verifyLive(createOnly);results.push('A_CREATE_ONLY');
    const exact=await create(1);await verifyLive(exact);await expectedFailure(()=>immutableGcsPrimitives.readExactGeneration(bucket,exact.name,wrongGeneration(exact.generation),2*1024*1024-1),['NOT_FOUND']);results.push('B_EXACT_GENERATION');
    const conditional=await create(2);await expectedFailure(()=>immutableGcsPrimitives.deleteExactGeneration(bucket,conditional.name,wrongGeneration(conditional.generation)),['CONFLICT','NOT_FOUND']);await verifyLive(conditional);results.push('C_WRONG_GENERATION_DELETE');
    await immutableGcsPrimitives.deleteExactGeneration(bucket,conditional.name,conditional.generation);await immutableGcsPrimitives.assertNoLiveObject(bucket,conditional.name);live.splice(live.indexOf(conditional),1);results.push('D_CORRECT_GENERATION_DELETE');
    const mapping=await create(3);await expectedFailure(()=>immutableGcsPrimitives.createImmutableObject(bucket,mapping.name,bytes,{contentType:'application/pdf'}),['CONFLICT']);await verifyLive(mapping);results.push('E_SHARED_MAPPING');
    for(const entry of [...live]){await immutableGcsPrimitives.deleteExactGeneration(bucket,entry.name,entry.generation);await immutableGcsPrimitives.assertNoLiveObject(bucket,entry.name);live.splice(live.indexOf(entry),1);}
    const entries=[createOnly,exact,conditional,mapping].map(entry=>({...entry,resultCategory:entry===conditional?'DELETE_OK':entry.resultCategory}));
    return createQualificationRunManifest(plan,entries,'COMPLETE',results,timestamp);
  }catch(error){
    // An unexpected outcome is not a license for broad cleanup. The caller gets
    // only the exact known live entries and must stop for review.
    if(error&&typeof error==='object')error.qualificationManifest=createQualificationRunManifest(plan,live,'STOP_UNCERTAIN_OR_FAILED',results,timestamp);throw error;
  }
}
async function defaultMutationExecutor(plan){
  const require=createRequire(new URL('../functions/package.json',import.meta.url));const {initializeApp,getApps}=require('firebase-admin/app');const {getStorage}=require('firebase-admin/storage');
  const app=getApps().find(item=>item.name==='public-demo-gcs-qualification')??initializeApp({projectId:QUALIFICATION_PROJECT,storageBucket:QUALIFICATION_BUCKET},'public-demo-gcs-qualification');const bucket=getStorage(app).bucket(QUALIFICATION_BUCKET);immutableGcsPrimitives.disableImmutableGcsRetries(bucket);
  return executeQualificationPlan({bucket,plan});
}
export async function runQualificationHarness({args=process.argv.slice(2),env=process.env,permissionInspector=inspectCurrentOperatorPermissions,mutationExecutor=defaultMutationExecutor}={}){
  const {execute}=parse(args);const runId=randomUUID();const plan=planned(runId);
  const permissions=await permissionInspector();
  if(!execute)return {mode:'DRY_RUN',mutations:0,project:QUALIFICATION_PROJECT,bucket:QUALIFICATION_BUCKET,permissions,...plan,tests:['A_CREATE_ONLY','B_EXACT_GENERATION','C_WRONG_GENERATION_DELETE','D_CORRECT_GENERATION_DELETE','E_SHARED_MAPPING'],cleanup:'EXACT_MANIFEST_OBJECTS_ONLY'};
  if(emulatorKeys.some(key=>Object.hasOwn(env,key)))invalid('QUALIFICATION_EMULATOR_DENIED');
  if(!capable(permissions))invalid('QUALIFICATION_PERMISSION_DENIED');
  return mutationExecutor(plan);
}
const self=fileURLToPath(import.meta.url),invoked=process.argv[1]&&fileURLToPath(new URL('file:///'+process.argv[1].replaceAll('\\','/')));
if(self===invoked){
  runQualificationHarness().then(result=>{if(result.mode==='DRY_RUN'){console.log(`PROJECT=${result.project}`);console.log(`BUCKET=${result.bucket}`);console.log(`CURRENT_OPERATOR_STORAGE_PERMISSIONS=CREATE:${result.permissions.create?'YES':'NO'},GET:${result.permissions.get?'YES':'NO'},DELETE:${result.permissions.delete?'YES':'NO'},LIST:${result.permissions.list?'YES':'NO'}`);console.log(`PROPOSED_GCS_TEST_PREFIX=${result.prefix}`);console.log('PLANNED_TESTS=A,B,C,D,E');console.log('CLEANUP=EXACT_MANIFEST_OBJECTS_AND_GENERATIONS_ONLY');console.log('DRY_RUN_ZERO_MUTATION=PASS');}else console.log(JSON.stringify(result));}).catch(error=>{if(error?.qualificationManifest)console.error('QUALIFICATION_MANIFEST='+JSON.stringify(error.qualificationManifest));console.error(`QUALIFICATION_FAILED=${error.code||'INTERNAL'}`);process.exitCode=1;});
}
