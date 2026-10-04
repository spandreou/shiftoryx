// Upstream semantic characterization: real Admin SDK -> fixed local Storage emulator.
// No credentials, hosted endpoints, application data or third-party services.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';

const project='demo-shiftoryx-public',host='127.0.0.1:9408';
Object.assign(process.env,{GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FIREBASE_STORAGE_EMULATOR_HOST:host,STORAGE_EMULATOR_HOST:'http://'+host,FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197'});
const health=await fetch('http://127.0.0.1:4462/emulators',{signal:AbortSignal.timeout(5000)});
assert.equal(health.ok,true,'Start a fresh existing local demo runtime first');
const emulators=await health.json();assert.equal(emulators.storage?.port,9408);
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const {initializeApp,deleteApp}=require('firebase-admin/app');
const app=initializeApp({projectId:project,storageBucket:project+'.appspot.com'},'pdf-storage-capabilities');
const bucket=require('firebase-admin/storage').getStorage(app).bucket();
assert.equal(bucket.name,'demo-shiftoryx-public.appspot.com');
const path=`tenants/demo-fuel/schedule-publications/${randomUUID()}/schedule.pdf`,file=bucket.file(path);
const first=Buffer.from('%PDF-1.3\nfictional capability probe A\n%%EOF'),second=Buffer.from('%PDF-1.3\nfictional capability probe B\n%%EOF');
const checks=[];let created=false;
function check(name,ok,details={}){checks.push({name,result:ok?'PASS':'FAIL',...details});console.log(JSON.stringify(checks.at(-1)));}
try{
  const [exists]=await file.exists();assert.equal(exists,false,'Never touch a pre-existing object');
  await file.save(first,{resumable:false,metadata:{contentType:'application/pdf'},preconditionOpts:{ifGenerationMatch:0}});created=true;
  const [metadata]=await file.getMetadata();assert.match(String(metadata.generation),/^\d+$/);
  // Fresh UUID object: generation 1 has never existed. Avoid a millisecond
  // successor that could accidentally equal the emulator's next generation.
  const wrongGeneration='1';assert.notEqual(String(metadata.generation),wrongGeneration);
  let overwriteCode=null;
  try{await file.save(second,{resumable:false,metadata:{contentType:'application/pdf'},preconditionOpts:{ifGenerationMatch:0}});}catch(error){overwriteCode=Number(error.code);}
  const [after]=await file.download();
  const [afterMetadata]=await file.getMetadata();assert.notEqual(String(afterMetadata.generation),wrongGeneration);
  check('immutable-create-precondition',overwriteCode===412&&after.equals(first),{rejectedWith412:overwriteCode===412,originalBytesPreserved:after.equals(first)});
  let generationReadRejected=false;
  try{await bucket.file(path,{generation:wrongGeneration}).download();}catch(error){generationReadRejected=[404,412].includes(Number(error.code));}
  check('nonexistent-generation-never-reads-latest',generationReadRejected);
  let deleteCode=null;
  try{await file.delete({ifGenerationMatch:wrongGeneration});}catch(error){deleteCode=Number(error.code);}
  const [remaining]=await file.exists();
  check('wrong-generation-delete-rejected',deleteCode===412&&remaining,{rejectedWith412:deleteCode===412,objectPreserved:remaining});
  const failures=checks.filter(c=>c.result==='FAIL').length;
  console.log(`PDF_STORAGE_CAPABILITIES passed=${checks.length-failures} failed=${failures} mode=LOCAL_EMULATOR`);
  if(failures)process.exitCode=1;
}finally{
  // Only this run's random, fictional probe; no prefix/list/bucket deletion.
  if(created)await file.delete({ignoreNotFound:true});
  await deleteApp(app);
}
