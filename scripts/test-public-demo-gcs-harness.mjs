import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';

let checks=0;
async function test(name,fn){await fn();checks++;console.log('PASS '+name);}
const root=new URL('../',import.meta.url);
const primitivesPath=new URL('../functions/src/public-demo/gcs-immutable-primitives.ts',import.meta.url);
const guardPath=new URL('../functions/src/public-demo/gcs-qualification-guard.ts',import.meta.url);
const adapterPath=new URL('../functions/src/public-demo/pdf-adapters.ts',import.meta.url);
const scriptPath=new URL('./qualify-public-demo-gcs-immutability.mjs',import.meta.url);
assert.ok(existsSync(primitivesPath),'shared immutable GCS primitive module is not implemented');
assert.ok(existsSync(guardPath),'qualification prefix guard is not implemented');
assert.ok(existsSync(scriptPath),'qualification dry-run script is not implemented');
const primitive=await import(primitivesPath),guard=await import(guardPath),adapter=await import(adapterPath),harness=await import(scriptPath);
const runId='12345678-1234-4123-8123-123456789abc';
const validPath='qualification/gcs-immutability/'+runId+'/create-only.pdf';

class FakeFile {
  constructor(bucket,path,options){this.bucket=bucket;this.path=path;this.options=options;}
  async save(bytes,options){this.bucket.saves.push({path:this.path,fileOptions:this.options,bytes:Buffer.from(bytes),options});if(this.bucket.saveError)throw this.bucket.saveError;}
  async getMetadata(){this.bucket.metadataCalls.push({path:this.path,fileOptions:this.options});if(this.bucket.metadataError)throw this.bucket.metadataError;return [this.bucket.metadata];}
  createReadStream(options){this.bucket.reads.push({path:this.path,fileOptions:this.options,options});if(this.bucket.readError)throw this.bucket.readError;return Readable.from([this.bucket.bytes]);}
  async delete(options){this.bucket.deletes.push({path:this.path,fileOptions:this.options,options});if(this.bucket.deleteError)throw this.bucket.deleteError;}
}
class FakeBucket {
  constructor(){this.saves=[];this.reads=[];this.deletes=[];this.metadataCalls=[];this.bytes=Buffer.from('%PDF-1.3\n%%EOF');this.metadata={name:validPath,generation:'17',contentType:'application/pdf',size:String(this.bytes.length)};this.storage={retryOptions:{autoRetry:true,maxRetries:3}};}
  file(path,options){return new FakeFile(this,path,options);}
}
class StatefulFile {
  constructor(bucket,path,options){this.bucket=bucket;this.path=path;this.options=options;}
  async save(bytes,options){this.bucket.events.push({kind:'save',path:this.path,options});if(options.preconditionOpts?.ifGenerationMatch===0&&this.bucket.objects.has(this.path)){if(this.bucket.corruptOnConflict&&this.path===validPath){const object=this.bucket.objects.get(this.path);object.bytes=Buffer.alloc(object.bytes.length,0x58);}throw {code:412};}const generation=String(++this.bucket.sequence);this.bucket.objects.set(this.path,{bytes:Buffer.from(bytes),generation,contentType:options.metadata.contentType});}
  async getMetadata(){if(this.bucket.failCreateMetadata&&this.options===undefined)throw {code:this.bucket.metadataFailureCode??500};const value=this.bucket.objects.get(this.path);if(!value||this.options?.generation&&this.options.generation!==value.generation&&!(this.bucket.fallbackToLatestOnMissing&&this.path.endsWith('/exact-generation.pdf')))throw {code:404};return [{name:this.path,generation:value.generation,contentType:value.contentType,size:String(value.bytes.length)}];}
  createReadStream(options){this.bucket.events.push({kind:'read',path:this.path,fileOptions:this.options,options});const value=this.bucket.objects.get(this.path);if(!value||this.options?.generation!==value.generation)throw {code:404};return Readable.from([value.bytes]);}
  async delete(options){this.bucket.events.push({kind:'delete',path:this.path,fileOptions:this.options,options});const value=this.bucket.objects.get(this.path);if(!value||this.options?.generation!==value.generation||options.ifGenerationMatch!==value.generation)throw {code:412};if(!this.bucket.ignoreDeletes)this.bucket.objects.delete(this.path);}
}
class StatefulBucket {constructor(){this.objects=new Map();this.events=[];this.sequence=0;this.storage={retryOptions:{autoRetry:true,maxRetries:3}};}file(path,options){return new StatefulFile(this,path,options);}}

await test('production adapter rejects qualification prefix before SDK work',async()=>{
  const fn=adapter.assertDemoPublicationPath;
  assert.equal(typeof fn,'function');
  assert.throws(()=>fn(validPath),e=>e.code==='ACCESS_DENIED');
});
await test('production adapter and qualification harness reference the identical primitive functions',async()=>{
  assert.strictEqual(adapter.demoPdfImmutableGcsPrimitives.createImmutableObject,primitive.createImmutableObject);
  assert.strictEqual(harness.qualificationImmutableGcsPrimitives.readExactGeneration,primitive.readExactGeneration);
  assert.strictEqual(harness.qualificationImmutableGcsPrimitives.deleteExactGeneration,primitive.deleteExactGeneration);
});
await test('qualification guard accepts only an allowlisted object under lowercase UUID run',async()=>{
  assert.equal(guard.qualificationObjectPath(runId,'create-only.pdf'),validPath);
  for(const value of ['../create-only.pdf','nested/create-only.pdf','create-only.pdf/extra','create-only.pdf%2fextra','create-only.pdf\\extra','create-only.PDF','arbitrary.pdf','tenants/demo-fuel/schedule.pdf','create-only.pdf∕extra'])assert.throws(()=>guard.qualificationObjectPath(runId,value));
  for(const value of ['ABCDEF12-1234-4123-8123-123456789abc','x','12345678-1234-4123-8123-123456789abc/extra'])assert.throws(()=>guard.qualificationObjectPath(value,'create-only.pdf'));
});
await test('immutable create emits create-only precondition with retries disabled',async()=>{
  const bucket=new FakeBucket();primitive.disableImmutableGcsRetries(bucket);
  const result=await primitive.createImmutableObject(bucket,validPath,Buffer.from('fixture'),{contentType:'application/pdf'});
  assert.deepEqual(result,{generation:'17'});assert.equal(bucket.storage.retryOptions.autoRetry,false);assert.equal(bucket.storage.retryOptions.maxRetries,0);
  assert.deepEqual(bucket.saves[0].options,{resumable:false,preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:'application/pdf',cacheControl:'private, no-store, max-age=0'}});
  assert.equal(bucket.saves.length,1);
});
await test('immutable create maps 412 without overwrite fallback',async()=>{
  const bucket=new FakeBucket();bucket.saveError={code:412};
  await assert.rejects(()=>primitive.createImmutableObject(bucket,validPath,Buffer.from('fixture'),{contentType:'application/pdf'}),e=>e.code==='CONFLICT');
  assert.equal(bucket.saves.length,1);assert.equal(bucket.deletes.length,0);assert.equal(bucket.reads.length,0);
});
await test('exact generation read pins requested generation and rejects mismatch without latest fallback',async()=>{
  const bucket=new FakeBucket();const got=await primitive.readExactGeneration(bucket,validPath,'17',1024);
  assert.equal(got.generation,'17');assert.deepEqual(bucket.reads[0].fileOptions,{generation:'17'});assert.deepEqual(bucket.reads[0].options,{start:0,end:1024,validation:false});assert.deepEqual(bucket.metadataCalls[0].fileOptions,{generation:'17'});
  const mismatch=new FakeBucket();mismatch.metadata={...mismatch.metadata,generation:'18'};
  await assert.rejects(()=>primitive.readExactGeneration(mismatch,validPath,'17',1024),e=>e.code==='GENERATION_MISMATCH');
  assert.equal(mismatch.reads.length,0);assert.deepEqual(mismatch.metadataCalls[0].fileOptions,{generation:'17'});
});
await test('exact generation read rejects metadata byte-length mismatch before returning bytes',async()=>{
  const bucket=new FakeBucket();bucket.metadata={...bucket.metadata,size:String(bucket.bytes.length+1)};
  await assert.rejects(()=>primitive.readExactGeneration(bucket,validPath,'17',1024),e=>e.code==='GENERATION_MISMATCH');
});
await test('exact generation delete preserves precondition and has no latest fallback',async()=>{
  const bucket=new FakeBucket();await primitive.deleteExactGeneration(bucket,validPath,'17');
  assert.deepEqual(bucket.deletes,[{path:validPath,fileOptions:{generation:'17'},options:{ifGenerationMatch:'17'}}]);
  const conflict=new FakeBucket();conflict.deleteError={code:412};
  await assert.rejects(()=>primitive.deleteExactGeneration(conflict,validPath,'17'),e=>e.code==='CONFLICT');assert.equal(conflict.deletes.length,1);
});
await test('dry run plans only qualification objects and never invokes mutation executor',async()=>{
  let mutations=0;const result=await harness.runQualificationHarness({args:[],env:{},permissionInspector:async()=>({create:true,get:false,delete:true,list:true}),mutationExecutor:async()=>{mutations++;}});
  assert.equal(result.mode,'DRY_RUN');assert.equal(result.mutations,0);assert.equal(mutations,0);assert.equal(result.permissions.get,false);assert.match(result.prefix,/^qualification\/gcs-immutability\/[0-9a-f-]+\/$/);
});
await test('run manifest contains only allowlisted metadata and cleanup is exact-generation only',async()=>{
  const plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  const manifest=harness.createQualificationRunManifest(plan,[{name:plan.objects[0],generation:'17',sha256:'a'.repeat(64),byteLength:13,resultCategory:'CREATE_OK'}],'COMPLETE');
  assert.deepEqual(Object.keys(manifest).sort(),['bucket','cleanupStatus','objects','prefix','project','resultCategories','runId','timestamp'].sort());
  assert.deepEqual(Object.keys(manifest.objects[0]).sort(),['byteLength','generation','name','resultCategory','sha256'].sort());assert.equal(JSON.stringify(manifest).includes('%PDF-'),false);
  assert.deepEqual(manifest.resultCategories,['CREATE_OK']);assert.deepEqual(harness.exactCleanupTargets(manifest),[{name:plan.objects[0],generation:'17'}]);
  assert.throws(()=>harness.exactCleanupTargets({...manifest,prefix:'tenants/demo-fuel/'}));
});
await test('future A-E executor uses shared primitives and exact cleanup with no latest fallback',async()=>{
  const bucket=new StatefulBucket(),plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  const manifest=await harness.executeQualificationPlan({bucket,plan,now:()=>new Date('2026-09-28T00:00:00.000Z')});
  assert.equal(manifest.cleanupStatus,'COMPLETE');assert.equal(manifest.timestamp,'2026-09-28T00:00:00.000Z');assert.deepEqual(manifest.resultCategories,['A_CREATE_ONLY','B_EXACT_GENERATION','C_WRONG_GENERATION_DELETE','D_CORRECT_GENERATION_DELETE','E_SHARED_MAPPING']);assert.equal(bucket.objects.size,0);assert.equal(manifest.objects.length,4);
  assert.ok(bucket.events.filter(e=>e.kind==='save').every(e=>e.options.preconditionOpts.ifGenerationMatch===0));
  assert.ok(bucket.events.filter(e=>e.kind==='read').every(e=>typeof e.fileOptions?.generation==='string'));
  assert.ok(bucket.events.filter(e=>e.kind==='delete').every(e=>e.options.ifGenerationMatch===e.fileOptions.generation));
});
await test('Test A rejects a conflict response that leaves different bytes at the original live object',async()=>{
  const bucket=new StatefulBucket();bucket.corruptOnConflict=true;
  const plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  await assert.rejects(()=>harness.executeQualificationPlan({bucket,plan}),error=>error.code==='QUALIFICATION_HASH_MISMATCH');
});
await test('Test B rejects latest-generation metadata returned for a nonexistent requested generation',async()=>{
  const bucket=new StatefulBucket();bucket.fallbackToLatestOnMissing=true;
  const plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  await assert.rejects(()=>harness.executeQualificationPlan({bucket,plan}),error=>error.code==='GENERATION_MISMATCH');
});
await test('future Test D and cleanup verify that no live object remains after conditional delete',async()=>{
  const bucket=new StatefulBucket();bucket.ignoreDeletes=true;const plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  await assert.rejects(()=>harness.executeQualificationPlan({bucket,plan}),e=>e.code==='LIVE_OBJECT_REMAINS');
});
await test('any metadata failure after create records an uncertain object and never invents a cleanup generation',async()=>{
  for(const code of [500,403,404]){const bucket=new StatefulBucket();bucket.failCreateMetadata=true;bucket.metadataFailureCode=code;const plan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
    await assert.rejects(()=>harness.executeQualificationPlan({bucket,plan}),error=>{
      assert.equal(error.qualificationManifest.cleanupStatus,'STOP_UNCERTAIN_OR_FAILED');assert.deepEqual(error.qualificationManifest.objects[0],{name:validPath,generation:null,sha256:error.qualificationManifest.objects[0].sha256,byteLength:error.qualificationManifest.objects[0].byteLength,resultCategory:'CREATE_OUTCOME_UNCERTAIN'});assert.deepEqual(harness.exactCleanupTargets(error.qualificationManifest),[]);return true;
    });}
});
await test('executor and cleanup reject any caller-supplied non-allowlisted qualification object',async()=>{
  const bucket=new StatefulBucket(),badPlan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:[validPath,'qualification/gcs-immutability/'+runId+'/arbitrary.pdf']};
  await assert.rejects(()=>harness.executeQualificationPlan({bucket,plan:badPlan}));assert.equal(bucket.events.length,0);
  const validPlan={runId,prefix:guard.QUALIFICATION_PREFIX_ROOT+runId+'/',objects:guard.QUALIFICATION_OBJECT_NAMES.map(name=>guard.qualificationObjectPath(runId,name))};
  const manifest=harness.createQualificationRunManifest(validPlan,[{name:validPath,generation:'17',sha256:'a'.repeat(64),byteLength:13,resultCategory:'CREATE_OK'}],'COMPLETE');
  manifest.objects[0].name='qualification/gcs-immutability/'+runId+'/arbitrary.pdf';assert.throws(()=>harness.exactCleanupTargets(manifest));
});
await test('future execute hard-fails for wrong target, emulator state, or missing GET',async()=>{
  const capable=async()=>({create:true,get:true,delete:true,list:true});
  for(const item of [
    {args:['--project=production'],env:{},permissions:capable,code:'QUALIFICATION_PROJECT_DENIED'},
    {args:['--bucket=production.appspot.com'],env:{},permissions:capable,code:'QUALIFICATION_BUCKET_DENIED'},
    {args:['--execute-real-gcs'],env:{FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197'},permissions:capable,code:'QUALIFICATION_EMULATOR_DENIED'},
    {args:['--execute-real-gcs'],env:{STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'},permissions:capable,code:'QUALIFICATION_EMULATOR_DENIED'},
    {args:['--execute-real-gcs'],env:{STORAGE_EMULATOR_HOST:''},permissions:capable,code:'QUALIFICATION_EMULATOR_DENIED'},
    {args:['--execute-real-gcs'],env:{},permissions:async()=>({create:true,get:false,delete:true,list:true}),code:'QUALIFICATION_PERMISSION_DENIED'},
  ])await assert.rejects(()=>harness.runQualificationHarness({args:item.args,env:item.env,permissionInspector:item.permissions,mutationExecutor:async()=>{throw Error('must not execute')}}),error=>error.code===item.code);
});
await test('mutation executor requires explicit execute flag',async()=>{
  let calls=0;const result=await harness.runQualificationHarness({args:[],env:{},permissionInspector:async()=>({create:true,get:true,delete:true,list:true}),mutationExecutor:async()=>{calls++;}});
  assert.equal(result.mode,'DRY_RUN');assert.equal(calls,0);
});
await test('CLI default dry run prints no credentials and no mutation result',async()=>{
  const result=spawnSync(process.execPath,[fileURLToPath(scriptPath)],{cwd:fileURLToPath(root),encoding:'utf8',timeout:30000,env:{...process.env,FIRESTORE_EMULATOR_HOST:'',FIREBASE_STORAGE_EMULATOR_HOST:'',FIREBASE_AUTH_EMULATOR_HOST:''}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/DRY_RUN_ZERO_MUTATION=PASS/);assert.equal(/Bearer\s+|access[_ -]?token|refresh[_ -]?token/i.test(result.stdout),false);
});
console.log('PUBLIC_DEMO_GCS_HARNESS_LOCAL_PASS checks='+checks);
