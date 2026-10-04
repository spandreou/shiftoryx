// Phase 2A: entirely local, no Firebase app initialization or cloud credentials.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,mkdtempSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {buildPublicationV3} from '../src/services/schedulePublicationService.ts';
import {renderPublicationPdfV3} from '../src/services/schedulePublicationPdf.ts';
import {publicDemoFixture} from '../functions/src/public-demo/fixtures.ts';
import {createDraftV3, mapAbsencesV3} from '../src/services/schedulerV3Service.ts';
import {initialAdmissionState} from '../functions/src/public-demo/admission.ts';

const groups=new Set(process.argv.filter(a=>a.startsWith('--group=')).map(a=>a.slice(8)));
let passed=0,failed=0;
async function test(group,name,run){if(groups.size&&!groups.has(group))return;try{await run();passed++;console.log('PASS '+group+': '+name);}catch(e){failed++;console.error('FAIL '+group+': '+name+' ['+(e.code||e.name)+'] '+e.message.slice(0,180));}}
async function moduleAt(path){return existsSync(new URL(path,import.meta.url))?import(path):{};}
function need(module,name){assert.equal(typeof module[name],'function',name+' is not implemented');return module[name];}
const canonical=await moduleAt('../src/services/publicationIntentV3.ts');
function draft(periodType='WEEK'){
  const f=publicDemoFixture('demo-fuel',new Date('2026-09-21T12:00:00Z'));
  const periodStart=periodType==='WEEK'?f.weekStart:'2026-09-01',periodEnd=periodType==='WEEK'?f.weekEnd:'2026-09-30';
  return createDraftV3({config:f.config,employees:f.employees,absences:mapAbsencesV3(f.absences,periodStart,periodEnd),periodType,periodStart,periodEnd,options:{balanceWeeklyTargets:true}},'local-draft');
}
const serialize=v=>need(canonical,'serializePreviewV3')(v);
const hash=v=>need(canonical,'hashPreviewV3')(v);
await test('canonical','sorted keys and undefined omission use exact JSON',()=>assert.equal(need(canonical,'canonicalJson')({z:1,a:{y:true,b:undefined,a:2},array:[3,1]}),'{'+'"a":{"a":2,"y":true},"array":[3,1],"z":1}'));
await test('canonical','WebCrypto matches Node SHA256',async()=>{const d=draft(),value=await hash(d);assert.match(value,/^[0-9a-f]{64}$/);assert.equal(value,createHash('sha256').update(serialize(d),'utf8').digest('hex'));});
await test('canonical','object key order has no effect',async()=>{const d=draft();const reordered=JSON.parse(JSON.stringify(d),(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).reverse()):v);assert.equal(await hash(d),await hash(reordered));});
await test('canonical','wrapper fields/defaults do not change semantic preview',async()=>{const d=draft(),other=structuredClone(d);other.revision=7;other.updatedBy='ignored-wrapper';other.employees[0].activeFrom=undefined;other.employees[0].activeTo=undefined;other.shifts.forEach(s=>{s.type='work';s.employeeName='stale display cache';});assert.equal(await hash(d),await hash(other));});
for(const [name,edit] of [['shift',d=>{d.shifts[0].startTime='06:15';d.shifts[0].durationHours-=.25;}],['profile',d=>{d.employees[0].schedulerV3.targetWeeklyHours=32;}],['absence',d=>{d.absences[0].endDate='2026-09-26';}],['array order',d=>d.employees.reverse()]])await test('canonical',name+' change changes hash',async()=>{const a=draft(),b=structuredClone(a);edit(b);assert.notEqual(await hash(a),await hash(b));});
await test('canonical','normalizes exact fields without private details',()=>{const d=draft();d.absences[0].note='must not publish';const p=JSON.parse(serialize(d));assert.equal(p.employees[0].activeFrom,null);assert.equal(p.shifts[0].draftId,'local-draft');assert.equal(p.shifts[0].employeeName,d.employees.find(e=>e.id===p.shifts[0].employeeId).fullName);assert.equal('note' in p.absences[0],false);assert.deepEqual(Object.keys(p.options),['balanceWeeklyTargets']);});
for(const [name,value] of [['NaN',NaN],['Infinity',Infinity],['function',()=>{}],['bigint',1n],['symbol',Symbol('bad')],['date',new Date()],['prototype',JSON.parse('{"__proto__":{}}')],['constructor',{constructor:1}],['undefined array',[undefined]]])await test('canonical','reject '+name,()=>{const fn=need(canonical,'canonicalJson');assert.throws(()=>fn(value),e=>e.code==='INVALID_PREVIEW');});
for(const [name,edit]of [['unknown option',d=>d.options.path='bad'],['unknown shift field',d=>d.shifts[0].bucket='bad'],['invalid reference',d=>d.shifts[0].employeeId='foreign'],['wrong boolean',d=>d.employees[0].isActive='true'],['null profile',d=>d.employees[0].schedulerV3=null]])await test('canonical','malformed '+name,()=>{const d=draft();edit(d);assert.throws(()=>serialize(d),e=>e.code==='INVALID_PREVIEW');});

const authorization=await moduleAt('../functions/src/public-demo/pdf-authorization.ts');
const transport=await moduleAt('../functions/src/public-demo/pdf-transport.ts');
const intentId='12345678-1234-4123-8123-123456789abc';
const envelope={intentId,draftId:'local-draft',draftRevision:1,previewHash:'a'.repeat(64),acceptWarnings:true};
const runtime={PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',GCLOUD_PROJECT:'shiftoryx-public-demo'};
const claim={uid:'demo-fuel-owner-g1',sub:'demo-fuel-owner-g1',aud:'shiftoryx-public-demo',iss:'https://securetoken.google.com/shiftoryx-public-demo',publicDemo:true,demoTenant:'demo-fuel',demoGeneration:1};
function request(body=JSON.stringify(envelope),headers={}){return {method:'POST',query:{},body:new TextEncoder().encode(body),headers:{'content-type':'application/json',authorization:'Bearer local-unit-fixture',origin:'https://demo-fuel.shiftoryx.gr',...headers}};}
const parse=r=>need(authorization,'parsePublishRequest')(r);
await test('request','valid exact envelope',()=>assert.deepEqual(parse(request()),envelope));
const invalidBodies=[['unknown key',JSON.stringify({...envelope,path:'tenants/foreign'})],['duplicate key',JSON.stringify(envelope).replace('{','{"intentId":"'+intentId+'",')],['nested object',JSON.stringify({...envelope,acceptWarnings:{yes:true}})],['null','null'],['array','[]'],['malformed JSON','{'],['trailing tokens',JSON.stringify(envelope)+'{}'],['escaped key',JSON.stringify(envelope).replace('intentId','\\u0069ntentId')]];
for(const [name,body]of invalidBodies)await test('request','reject '+name,()=>{need(authorization,'parsePublishRequest');assert.throws(()=>parse(request(body)),e=>e.code==='INVALID_REQUEST');});
for(const [field,values]of Object.entries({intentId:['x',intentId.toUpperCase()],draftId:['../a','a/b','a\\b','a%2fb','a∕b','a'.repeat(101)],draftRevision:[0,-1,1.1,Number.MAX_SAFE_INTEGER+1,'1'],previewHash:['A'.repeat(64),'0'.repeat(63)],acceptWarnings:['true',1,null]}))for(const value of values)await test('request',`reject invalid ${field} ${JSON.stringify(value)}`,()=>assert.throws(()=>parse(request(JSON.stringify({...envelope,[field]:value}))),e=>e.code==='INVALID_REQUEST'));
for(const field of ['tenantId','uid','generation','publicationId','version','periodKey','timestamp','snapshot','warnings','totals','storagePath','bucket','url','pdf','base64','mime','projections'])await test('request','reject authority field '+field,()=>assert.throws(()=>parse(request(JSON.stringify({...envelope,[field]:'untrusted'}))),e=>e.code==='INVALID_REQUEST'));
await test('request','body cap',()=>assert.throws(()=>parse(request(' '.repeat(4097))),e=>e.code==='PAYLOAD_TOO_LARGE'));
for(const headers of [{'content-type':'application/pdf'},{'content-type':'multipart/form-data; boundary=bad'},{'content-encoding':'gzip'},{'content-type':['application/json','application/json']},{'content-length':'1'}])await test('request','reject transport headers '+JSON.stringify(headers),()=>assert.throws(()=>parse(request(undefined,headers)),e=>['INVALID_REQUEST','UNSUPPORTED_MEDIA_TYPE'].includes(e.code)));
await test('request','reject invalid UTF8',()=>assert.throws(()=>parse({...request(),body:Uint8Array.of(0xff)}),e=>e.code==='INVALID_REQUEST'));
await test('request','reject query token or non POST',()=>{assert.throws(()=>parse({...request(),query:{token:'bad'}}),e=>e.code==='INVALID_REQUEST');assert.throws(()=>parse({...request(),method:'GET'}),e=>e.code==='METHOD_NOT_ALLOWED');});
async function authenticate(req=request(),claims=claim,env=runtime){return need(authorization,'authenticatePdfRequest')(req,{projectId:'shiftoryx-public-demo',verifyIdToken:async(token,revoked)=>{assert.equal(token,'local-unit-fixture');assert.equal(revoked,true);return structuredClone(claims);}},env);}
function authorityDocs(){return new Map([['demoState/demo-fuel',{generation:1,resetting:false}],['tenantMemberships/demo-fuel-owner-g1_demo-fuel',{uid:claim.uid,tenantId:'demo-fuel',role:'OWNER',status:'ACTIVE'}],['tenants/demo-fuel',{id:'demo-fuel',slug:'demo-fuel',isDemo:true,status:'ACTIVE'}]]);}
async function authorized(docs=authorityDocs()){const identity=await authenticate();await need(authorization,'authorizePdfTransaction')({get:async path=>structuredClone(docs.get(path))},identity);return identity;}
await test('auth','valid OWNER with revocation checked',async()=>{const i=await authorized();assert.equal(i.tenant,'demo-fuel');assert.equal(i.uid,claim.uid);assert.equal(i.generation,1);await i.reverify();});
await test('auth','anonymous denied',async()=>assert.rejects(()=>authenticate(request(undefined,{authorization:undefined})),e=>e.code==='UNAUTHENTICATED'));
for(const [name,patch]of [['wrong project',{aud:'production'}],['wrong issuer',{iss:'https://bad.invalid'}],['wrong tenant claim',{demoTenant:'demo-cafe'}],['unknown tenant',{demoTenant:'demo-not-allowed'}],['wrong UID',{uid:'foreign'}],['missing public demo',{publicDemo:false}],['bad generation',{demoGeneration:0}]])await test('auth',name,async()=>assert.rejects(()=>authenticate(request(),{...claim,...patch}),e=>['ACCESS_DENIED','UNAUTHENTICATED'].includes(e.code)));
await test('auth','invalid token verifier failure has safe error',async()=>{const fn=need(authorization,'authenticatePdfRequest');await assert.rejects(()=>fn(request(),{projectId:'shiftoryx-public-demo',verifyIdToken:async()=>{throw Error('do-not-expose-provider-secret');}},runtime),e=>e.code==='UNAUTHENTICATED'&&!e.message.includes('provider'));});
await test('auth','wrong Origin and production runtime denied',async()=>{await assert.rejects(()=>authenticate(request(undefined,{origin:'https://demo-cafe.shiftoryx.gr'})),e=>e.code==='ACCESS_DENIED');await assert.rejects(()=>authenticate(request(),claim,{...runtime,GCLOUD_PROJECT:'gasstationproject-9dd89'}),e=>e.code==='ACCESS_DENIED');});
for(const [name,path,value]of [['inactive membership','tenantMemberships/demo-fuel-owner-g1_demo-fuel',{uid:claim.uid,tenantId:'demo-fuel',role:'OWNER',status:'REVOKED'}],['wrong role','tenantMemberships/demo-fuel-owner-g1_demo-fuel',{uid:claim.uid,tenantId:'demo-fuel',role:'MANAGER',status:'ACTIVE'}],['wrong uid','tenantMemberships/demo-fuel-owner-g1_demo-fuel',{uid:'foreign',tenantId:'demo-fuel',role:'OWNER',status:'ACTIVE'}],['missing member','tenantMemberships/demo-fuel-owner-g1_demo-fuel',undefined],['platform overlap','platformAdmins/'+claim.uid,{status:'ACTIVE'}],['malformed platform','platformAdmins/'+claim.uid,{}],['stale generation','demoState/demo-fuel',{generation:2,resetting:false}],['resetting','demoState/demo-fuel',{generation:1,resetting:true}],['missing state','demoState/demo-fuel',undefined],['malformed reset state','demoState/demo-fuel',{generation:1}],['missing tenant','tenants/demo-fuel',undefined],['not demo tenant','tenants/demo-fuel',{id:'demo-fuel',slug:'demo-fuel',status:'ACTIVE',isDemo:false}]])await test('auth',name,async()=>{const docs=authorityDocs();docs.set(path,value);await assert.rejects(()=>authorized(docs),e=>['ACCESS_DENIED','DEMO_GENERATION_CHANGED','DEMO_RESETTING'].includes(e.code));});
await test('path','server UUID and exact canonical path',()=>{const id=need(transport,'newPublicationId')();assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(need(transport,'publicationObjectPath')('demo-fuel',intentId),'tenants/demo-fuel/schedule-publications/'+intentId+'/schedule.pdf');});
for(const value of ['../x','a/b','a\\b','a%2fb','a∕b',intentId+'/extra','bucket/object'])await test('path','reject ID injection '+value,()=>assert.throws(()=>need(transport,'publicationObjectPath')('demo-fuel',value),e=>e.code==='INVALID_REQUEST'));
await test('path','reject non-allowlisted tenant',()=>assert.throws(()=>need(transport,'publicationObjectPath')('bp-kallis',intentId),e=>e.code==='ACCESS_DENIED'));

function publication(){return buildPublicationV3(draft(),{tenantId:'demo-fuel',uid:claim.uid,id:intentId,version:1,timestamp:'2026-09-21T12:00:00.000Z'});}
await test('renderer','deterministic options freeze PDF bytes',async()=>{const p=publication(),options={creationDate:p.pdfGeneratedAt,fileId:'0123456789abcdef0123456789abcdef'};const a=await renderPublicationPdfV3(p,options),b=await renderPublicationPdfV3(p,options);assert.deepEqual(a,b);assert.ok(Buffer.from(a).includes(Buffer.from('/ID [ <0123456789ABCDEF0123456789ABCDEF>')));});
await test('renderer','default normal rendering remains valid',async()=>{const b=await renderPublicationPdfV3(publication());assert.equal(Buffer.from(b).subarray(0,5).toString(),'%PDF-');assert.match(Buffer.from(b).subarray(-30).toString(),/%%EOF\s*$/);});
for(const [name,value]of [['empty',new Uint8Array()],['oversized',new Uint8Array(2*1024*1024)],['bad header',Buffer.from('not a pdf\n%%EOF')],['missing EOF',Buffer.from('%PDF-1.3\nbody')],['not bytes','%PDF-1.3\n%%EOF']])await test('renderer','reject '+name,()=>{const validate=need(transport,'validatePdfBytes');assert.throws(()=>validate(value),e=>e.code==='PDF_INTEGRITY_FAILURE');});
await test('renderer','server artifact exact digest and size',async()=>{const render=need(transport,'renderServerPublication');const bytes=await render(publication());const metadata=need(transport,'validatePdfBytes')(bytes);assert.equal(metadata.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(metadata.byteLength,bytes.length);assert.equal(metadata.contentType,'application/pdf');assert.match(need(transport,'rendererDigest')(),/^[0-9a-f]{64}$/);});
await test('renderer','isolated Node22 bundle without dependency tree or network',()=>{
  const bundle=new URL('../functions/src/public-demo/pdf-renderer.cjs',import.meta.url);assert.ok(existsSync(bundle),'server bundle is not implemented');
  const folder=mkdtempSync(join(tmpdir(),'shiftoryx-pdf-isolated-'));copyFileSync(bundle,join(folder,'pdf-renderer.cjs'));
  const result=spawnSync(process.execPath,['--input-type=commonjs','-e',`global.fetch=()=>{throw Error('network forbidden')};const M=require('node:module'),load=M._load;M._load=function(id,...args){if(!id.startsWith('.')&&!M.isBuiltin(id))throw Error('dependency forbidden');return load.call(this,id,...args)};const {renderPublicationPdfV3}=require('./pdf-renderer.cjs');const s=JSON.parse(require('node:fs').readFileSync(0,'utf8'));renderPublicationPdfV3(s,{creationDate:s.pdfGeneratedAt,fileId:'0123456789abcdef0123456789abcdef'}).then(b=>{if(!Buffer.from(b).subarray(0,5).equals(Buffer.from('%PDF-'))||!Buffer.from(b).subarray(-30).toString().includes('%%EOF'))process.exit(2);console.log('ISOLATED_RENDERER_PASS')});`],{cwd:folder,input:JSON.stringify(publication()),encoding:'utf8',timeout:30000,env:{SystemRoot:process.env.SystemRoot,PATH:process.env.PATH,TEMP:process.env.TEMP}});
  assert.equal(result.status,0,result.stderr.slice(0,400));assert.match(result.stdout,/ISOLATED_RENDERER_PASS/);
});

const coordinator=await moduleAt('../functions/src/public-demo/pdf-coordinator.ts');
// Transactional test double: isolated snapshots, atomic commit, serialized callers,
// optional callback replay. Only DB/Storage boundaries are fake; core is real.
class LocalDatabase {
  rows=authorityDocs(); tail=Promise.resolve(); depth=0; retryOnce=false; commits=[]; beforeCommit=null;
  async transaction(run){const previous=this.tail;let release;this.tail=new Promise(r=>release=r);await previous;
    try{let result,next;for(let attempt=0;attempt<(this.retryOnce?2:1);attempt++){
      next=structuredClone(this.rows);let wrote=false;
      const tx={get:async path=>{assert.equal(wrote,false,'read after write');return structuredClone(next.get(path));},list:async(path,limit)=>{assert.equal(wrote,false);return [...next].filter(([key])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')).slice(0,limit).map(([key,data])=>({id:key.slice(path.length+1),data:structuredClone(data)}));},set:(path,data)=>{wrote=true;next.set(path,structuredClone(data));},create:(path,data)=>{wrote=true;assert.equal(next.has(path),false,'create cannot overwrite');next.set(path,structuredClone(data));},delete:path=>{wrote=true;next.delete(path);}};
      this.depth++;try{result=await run(tx);}finally{this.depth--;}
    }this.retryOnce=false;await this.beforeCommit?.(next);this.rows=next;this.commits.push(structuredClone(next));return result;}finally{release();}
  }
}
class LocalStorage {
  objects=new Map();sequence=0;onCreate=null;onRead=null;onRemove=null;creates=0;deletes=0;
  constructor(db){this.db=db;}
  async create(path,bytes,options){assert.equal(this.db.depth,0,'Storage side effect in transaction');assert.deepEqual(options,{ifGenerationMatch:0,contentType:'application/pdf'});this.creates++;
    if(this.objects.has(path))throw new coordinator.StorageCreateError('CONFLICT');
    await this.onCreate?.(path,bytes);const generation=String(++this.sequence);this.objects.set(path,{bytes:Uint8Array.from(bytes),generation,contentType:'application/pdf'});return {generation};
  }
  async read(path,generation){assert.equal(this.db.depth,0);await this.onRead?.();const value=this.objects.get(path);if(!value||generation&&value.generation!==generation)throw Error('generation unavailable');return structuredClone(value);}
  async remove(path,generation){assert.equal(this.db.depth,0);await this.onRemove?.();const value=this.objects.get(path);if(value&&value.generation!==generation)throw Error('generation conflict');this.deletes++;this.objects.delete(path);}
}
async function fixture(period='WEEK',renderOverride){
  const d=draft(period),db=new LocalDatabase(),storage=new LocalStorage(db),f=publicDemoFixture('demo-fuel',new Date('2026-09-21T12:00:00Z'));
  db.rows.set('demoAdmission/demo-fuel',initialAdmissionState('demo-fuel',1,f.employees.length,f.absences.length));
  db.rows.set('demoPdfLimits/demo-fuel',{retainedIntentCount:0});
  const ids=d.shifts.map((s,n)=>`${d.id}_${n}`);const {shifts,...metadata}=d;
  db.rows.set('tenants/demo-fuel/scheduleDrafts/'+d.id,{...metadata,tenantId:'demo-fuel',schemaVersion:3,revision:1,updatedBy:claim.uid,shiftDocumentIds:ids});
  d.shifts.forEach((s,n)=>db.rows.set('tenants/demo-fuel/shifts/'+ids[n],{...s,type:'work'}));
  for(const e of f.employees){const {id,...data}=e;db.rows.set('tenants/demo-fuel/employees/'+id,data);}
  for(const a of f.absences)db.rows.set('tenants/demo-fuel/absences/'+a.id,a);
  db.rows.set('tenants/demo-fuel/settings/scheduler',{schedulerSchemaVersion:3,schedulerConfigV3:f.config});
  const input={...envelope,previewHash:await hash(d)},api=need(coordinator,'createPdfPublicationCore')({database:db,storage,authenticate:req=>authenticate(req),render:async snapshot=>{assert.equal(db.depth,0,'renderer inside transaction');return renderOverride?renderOverride(snapshot):need(transport,'renderServerPublication')(snapshot);},rendererDigest:need(transport,'rendererDigest')(),now:()=>Date.parse('2026-09-21T12:00:00Z')});
  return {d,db,storage,input,publish:(overrides={})=>api.publish(request(JSON.stringify({...input,...overrides}))),api};
}
const privatePubs=db=>[...db.rows].filter(([key])=>/^tenants\/demo-fuel\/schedulePublications\//.test(key));
const intentState=f=>f.db.rows.get(`demoPdfRequests/demo-fuel/intents/${intentId}`)?.state;
await test('intent-cap','first intent charges once and exact replay does not recharge',async()=>{
  const f=await fixture();await f.publish();
  assert.equal(f.db.rows.get('demoPdfLimits/demo-fuel').retainedIntentCount,1);
  assert.equal(f.db.rows.get('demoAdmission/demo-fuel').pdfIntentCreates,1);
  await f.publish();
  assert.equal(f.db.rows.get('demoPdfLimits/demo-fuel').retainedIntentCount,1);
  assert.equal(f.db.rows.get('demoAdmission/demo-fuel').pdfIntentCreates,1);
});
await test('intent-cap','retained 800 refuses the next first intent before reservation',async()=>{
  const f=await fixture();f.db.rows.set('demoPdfLimits/demo-fuel',{retainedIntentCount:800});
  await assert.rejects(()=>f.publish(),e=>e.code==='RATE_LIMITED');
  assert.equal(intentState(f),undefined);
  assert.equal(f.db.rows.get('demoPdfLimits/demo-fuel').retainedIntentCount,800);
});
await test('intent-cap','missing retained counter fails closed without intent',async()=>{
  const f=await fixture();f.db.rows.set('demoPdfLimits/demo-fuel',{hour:1,count:0});
  await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');
  assert.equal(intentState(f),undefined);
});
await test('intent-cap','per-generation limit includes canceled attempts',async()=>{
  const f=await fixture();f.db.rows.get('demoAdmission/demo-fuel').pdfIntentCreates=32;
  await assert.rejects(()=>f.publish(),e=>e.code==='RATE_LIMITED');
  assert.equal(intentState(f),undefined);
});
await test('intent-cap','future hourly or daily quota cannot be reset by an older clock',async()=>{
  for(const quota of [{retainedIntentCount:0,hour:Math.floor(Date.parse('2026-09-21T12:00:00Z')/3600000)+1,count:30},
    {retainedIntentCount:0,utcDay:'2026-09-22',dayCount:100}]){
    const f=await fixture();f.db.rows.set('demoPdfLimits/demo-fuel',quota);
    await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');
    assert.equal(intentState(f),undefined);
  }
});
for(const period of ['WEEK','MONTH'])await test('core','valid '+period+' publication and digest',async()=>{
  const f=await fixture(period),r=await f.publish();assert.equal(r.version,1);assert.equal(r.replayed,false);const p=privatePubs(f.db);assert.equal(p.length,1);assert.equal(p[0][1].id,r.publicationId);assert.ok(p[0][1].publishedWithWarnings);
  const path=`tenants/demo-fuel/schedule-publications/${r.publicationId}/schedule.pdf`,object=f.storage.objects.get(path),manifest=f.db.rows.get(`tenants/demo-fuel/demoPublicationArtifacts/${r.publicationId}`);assert.ok(object);assert.equal(manifest.sha256,createHash('sha256').update(object.bytes).digest('hex'));assert.equal(manifest.byteLength,object.bytes.length);assert.equal(manifest.storageObjectGeneration,object.generation);
  assert.equal(f.db.rows.get(`tenants/demo-fuel/schedulePublicationPeriods/${r.periodKey}`).latestPublicationId,r.publicationId);
  const stages=f.db.commits.map(rows=>rows.get(`demoPdfRequests/demo-fuel/intents/${intentId}`)?.state).filter(Boolean);for(const state of ['RESERVED','RENDERED','IO_INTENT','OBJECT_STORED','FINALIZED'])assert.ok(stages.includes(state),state);
});
await test('core','publication remains invisible until object confirmed',async()=>{const f=await fixture();f.storage.onCreate=()=>{assert.equal(privatePubs(f.db).length,0);assert.equal(intentState(f),'IO_INTENT');};f.storage.onRead=()=>assert.equal(privatePubs(f.db).length,0);await f.publish();});
await test('core','same-intent replay never allocates another version or PDF',async()=>{const f=await fixture();const first=await f.publish();f.db.rows.delete('tenants/demo-fuel/scheduleDrafts/local-draft');const repeat=await f.publish();assert.deepEqual({...repeat,replayed:false},first);assert.equal(repeat.replayed,true);assert.equal(f.storage.creates,1);assert.equal(privatePubs(f.db).length,1);assert.equal(f.db.rows.get(`tenants/demo-fuel/schedulePublicationCounters/${first.periodKey}`).version,1);});
await test('core','transaction callback replay cannot repeat external effects',async()=>{const f=await fixture();f.db.retryOnce=true;await f.publish();assert.equal(f.storage.creates,1);assert.equal(privatePubs(f.db).length,1);});
await test('core','v2 leaves finalized v1 bytes untouched',async()=>{const f=await fixture(),a=await f.publish(),old=structuredClone([...f.storage.objects]);const b=await f.publish({intentId:'22345678-1234-4123-8123-123456789abc'});assert.equal(b.version,2);assert.equal(f.db.rows.get(`tenants/demo-fuel/schedulePublicationCounters/${a.periodKey}`).version,2);assert.deepEqual(f.storage.objects.get(old[0][0]),old[0][1]);});
for(const [name,edit,code]of [
  ['foreign draft',f=>f.input.draftId='foreign-id','PREVIEW_CHANGED'],['stale revision',f=>f.input.draftRevision=2,'PREVIEW_CHANGED'],['wrong preview',f=>f.input.previewHash='0'.repeat(64),'PREVIEW_CHANGED'],['warnings not accepted',f=>f.input.acceptWarnings=false,'WARNINGS_NOT_ACKNOWLEDGED'],
  ['inactive membership',f=>f.db.rows.get('tenantMemberships/'+claim.uid+'_demo-fuel').status='REVOKED','ACCESS_DENIED'],['platform overlap',f=>f.db.rows.set('platformAdmins/'+claim.uid,{status:'ACTIVE'}),'ACCESS_DENIED'],['stale generation',f=>f.db.rows.get('demoState/demo-fuel').generation=2,'DEMO_GENERATION_CHANGED'],
  ['malformed saved shift',f=>f.db.rows.get('tenants/demo-fuel/shifts/local-draft_0').durationHours=NaN,'PDF_INTEGRITY_FAILURE'],['wrong draft binding',f=>f.db.rows.get('tenants/demo-fuel/shifts/local-draft_0').draftId='foreign','PDF_INTEGRITY_FAILURE'],['wrong tenant binding',f=>f.db.rows.get('tenants/demo-fuel/scheduleDrafts/local-draft').tenantId='demo-cafe','PDF_INTEGRITY_FAILURE'],['bad WEEK period',f=>f.db.rows.get('tenants/demo-fuel/scheduleDrafts/local-draft').periodEnd='2026-09-26','PDF_INTEGRITY_FAILURE']
])await test('core',name+' rejected before reservation',async()=>{const f=await fixture();edit(f);await assert.rejects(()=>f.publish(),e=>e.code===code);assert.equal(privatePubs(f.db).length,0);assert.equal(f.storage.objects.size,0);assert.equal(intentState(f),undefined);});
await test('core','anonymous/wrong origin rejected by core boundary',async()=>{const f=await fixture();for(const patch of [{authorization:undefined},{origin:'https://demo-cafe.shiftoryx.gr'}])await assert.rejects(()=>f.api.publish(request(JSON.stringify(f.input),patch)),e=>['UNAUTHENTICATED','ACCESS_DENIED'].includes(e.code));assert.equal(intentState(f),undefined);});
for(const [name,render]of [['throw',()=>{throw Error('private-provider-error');}],['empty',()=>new Uint8Array()],['oversized',()=>new Uint8Array(2*1024*1024)],['invalid',()=>Buffer.from('not PDF')]])await test('core','renderer '+name+' leaves no publication',async()=>{const f=await fixture('WEEK',render);await assert.rejects(()=>f.publish(),e=>['SERVICE_UNAVAILABLE','PDF_INTEGRITY_FAILURE'].includes(e.code));assert.equal(intentState(f),'CANCELLED');assert.equal(privatePubs(f.db).length,0);assert.equal(f.storage.objects.size,0);});
await test('core','known Storage rejection cancels without visible publication',async()=>{const f=await fixture();f.storage.onCreate=()=>{throw new coordinator.StorageCreateError('REJECTED');};await assert.rejects(()=>f.publish());assert.equal(intentState(f),'CANCELLED');assert.equal(privatePubs(f.db).length,0);});
await test('core','ambiguous I/O never expires into takeover or cleanup',async()=>{const f=await fixture();f.storage.onCreate=()=>{throw Error('network timeout');};await assert.rejects(()=>f.publish(),e=>e.code==='PDF_RECOVERY_REQUIRED');assert.equal(intentState(f),'IO_UNCERTAIN');const control=f.db.rows.get('demoPdfControls/demo-fuel');control.startedAt=0;control.heartbeatAt=0;for(let n=0;n<3;n++)await assert.rejects(()=>f.publish(),e=>e.code==='PDF_RECOVERY_REQUIRED');assert.equal(intentState(f),'IO_UNCERTAIN');assert.equal(f.storage.creates,1);assert.equal(f.storage.deletes,0);assert.equal(privatePubs(f.db).length,0);});
await test('core','conflicting object cannot be overwritten or deleted',async()=>{const f=await fixture();f.storage.onCreate=path=>{f.storage.objects.set(path,{bytes:Buffer.from('%PDF-foreign\n%%EOF'),generation:'external',contentType:'application/pdf'});throw new coordinator.StorageCreateError('CONFLICT');};await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');assert.equal(f.storage.objects.size,1);assert.equal(f.storage.deletes,0);assert.equal(privatePubs(f.db).length,0);});
await test('core','changed tuple under finalized intent rejected',async()=>{const f=await fixture();await f.publish();await assert.rejects(()=>f.publish({draftRevision:2}),e=>e.code==='INTENT_CONFLICT');assert.equal(privatePubs(f.db).length,1);assert.equal(f.storage.creates,1);});
for(const [name,edit]of [['generation',f=>f.db.rows.get('demoState/demo-fuel').generation=2],['membership',f=>f.db.rows.get('tenantMemberships/'+claim.uid+'_demo-fuel').status='REVOKED'],['platform admin',f=>f.db.rows.set('platformAdmins/'+claim.uid,{status:'ACTIVE'})]])await test('core',name+' change after upload cannot finalize',async()=>{const f=await fixture();f.storage.onRead=()=>edit(f);await assert.rejects(()=>f.publish());assert.equal(privatePubs(f.db).length,0);assert.equal(intentState(f),'CANCELLED');assert.equal(f.storage.objects.size,0);assert.equal([...f.db.rows.keys()].some(k=>k.includes('/schedulePublicationPeriods/')),false);});
await test('core','Storage success plus finalization failure remains tracked and retryable',async()=>{const f=await fixture();let failed=false;f.db.beforeCommit=rows=>{if(!failed&&[...rows.keys()].some(k=>k.includes('/schedulePublications/'))){failed=true;throw Error('transaction unavailable');}};await assert.rejects(()=>f.publish(),e=>e.code==='SERVICE_UNAVAILABLE');assert.equal(intentState(f),'OBJECT_STORED');assert.equal(f.storage.objects.size,1);assert.equal(privatePubs(f.db).length,0);const r=await f.publish();assert.equal(r.version,1);assert.equal(f.storage.creates,1);assert.equal(privatePubs(f.db).length,1);});
await test('core','saved draft later edits cannot mutate frozen snapshot',async()=>{const f=await fixture();f.storage.onCreate=()=>{f.db.rows.get('tenants/demo-fuel/scheduleDrafts/local-draft').employees[0].fullName='Later edit';};await f.publish();assert.notEqual(privatePubs(f.db)[0][1].employeeSnapshot[0].displayName,'Later edit');});

await test('auth','malformed verified token result fails safely',async()=>assert.rejects(()=>authenticate(request(),null),e=>e.code==='UNAUTHENTICATED'));
await test('auth','production authenticator rejects wrong app before SDK work',()=>assert.throws(()=>need(authorization,'createDemoPdfAuthenticator')({options:{projectId:'gasstationproject-9dd89'}},runtime),e=>e.code==='ACCESS_DENIED'));
await test('core','numeric array is not accepted as renderer bytes',async()=>{const f=await fixture('WEEK',()=>[...Buffer.from('%PDF-1.3\n%%EOF')]);await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');assert.equal(privatePubs(f.db).length,0);});
await test('core','missing create receipt generation cannot be treated as latest',async()=>{const f=await fixture(),create=f.storage.create.bind(f.storage);f.storage.create=async(...args)=>{await create(...args);return {};};await assert.rejects(()=>f.publish(),e=>['PDF_INTEGRITY_FAILURE','PDF_RECOVERY_REQUIRED'].includes(e.code));assert.equal(intentState(f),'IO_UNCERTAIN');assert.equal(privatePubs(f.db).length,0);assert.equal(f.storage.deletes,0);});
await test('core','concurrent duplicate intent remains single-version',async()=>{let release,started;const wait=new Promise(r=>release=r),ready=new Promise(r=>started=r);const f=await fixture('WEEK',async s=>{started();await wait;return need(transport,'renderServerPublication')(s);});const first=f.publish();await ready;try{await assert.rejects(()=>f.publish(),e=>e.code==='PDF_BUSY');}finally{release();}await first;assert.equal(privatePubs(f.db).length,1);assert.equal(f.storage.creates,1);});
await test('core','revocation during render prevents any upload',async()=>{let f;f=await fixture('WEEK',async s=>{f.db.rows.get('tenantMemberships/'+claim.uid+'_demo-fuel').status='REVOKED';return need(transport,'renderServerPublication')(s);});await assert.rejects(()=>f.publish(),e=>e.code==='ACCESS_DENIED');assert.equal(intentState(f),'CANCELLED');assert.equal(f.storage.creates,0);});
await test('core','changed reserved snapshot fails closed before I/O',async()=>{let f;f=await fixture('WEEK',async s=>{for(const [path,row]of f.db.rows)if(path.includes('/schedulePublicationReservations/'))row.snapshot.employeeSnapshot[0].displayName='tampered';return need(transport,'renderServerPublication')(s);});await assert.rejects(()=>f.publish(),e=>e.code==='PDF_RECOVERY_REQUIRED');assert.equal(f.storage.creates,0);assert.equal(privatePubs(f.db).length,0);});
await test('core','cleanup failure retains durable CANCEL_PENDING barrier',async()=>{const f=await fixture();f.storage.onRead=()=>f.db.rows.get('demoState/demo-fuel').generation=2;f.storage.onRemove=()=>{throw Error('delete outcome unknown');};await assert.rejects(()=>f.publish(),e=>e.code==='PDF_RECOVERY_REQUIRED');assert.equal(intentState(f),'CANCEL_PENDING');assert.ok(f.db.rows.get('demoPdfControls/demo-fuel'));assert.equal(privatePubs(f.db).length,0);});

await test('core','adoption rejects rehashed replacement reservation snapshot',async()=>{
  const f=await fixture();f.db.beforeCommit=rows=>{if([...rows.keys()].some(k=>k.includes('/schedulePublications/')))throw Error('final transaction failed');};
  await assert.rejects(()=>f.publish(),e=>e.code==='SERVICE_UNAVAILABLE');assert.equal(intentState(f),'OBJECT_STORED');
  for(const [path,row]of f.db.rows)if(path.includes('/schedulePublicationReservations/')){row.snapshot.employeeSnapshot[0].displayName='REPLACED AFTER PDF';row.snapshotHash=createHash('sha256').update(need(canonical,'canonicalJson')(row.snapshot)).digest('hex');}
  f.db.beforeCommit=null;await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');assert.equal(privatePubs(f.db).length,0);assert.equal(f.storage.creates,1);
});
for(const field of ['activeFrom','activeTo'])for(const value of [false,0,'','2026-02-30']){
  await test('canonical',`invalid ${field} ${JSON.stringify(value)} cannot normalize to null`,()=>{const d=draft();d.employees[0][field]=value;assert.throws(()=>serialize(d),e=>e.code==='INVALID_PREVIEW');});
  for(const source of ['saved','current'])await test('core',`${source} invalid ${field} ${JSON.stringify(value)} cannot publish`,async()=>{const f=await fixture();const row=source==='saved'?f.db.rows.get('tenants/demo-fuel/scheduleDrafts/local-draft').employees[0]:f.db.rows.get('tenants/demo-fuel/employees/demo-fuel-e1');row[field]=value;await assert.rejects(()=>f.publish(),e=>e.code==='PDF_INTEGRITY_FAILURE');assert.equal(intentState(f),undefined);assert.equal(f.storage.creates,0);});
}

await test('core','download quota survives new publication and does not block missing hourly quota',async()=>{const f=await fixture();f.db.rows.set('demoPdfLimits/demo-fuel',{retainedIntentCount:0,downloadMinute:1,downloadCount:7});await f.publish();assert.equal(f.db.rows.get('demoPdfLimits/demo-fuel').downloadCount,7);assert.equal(f.db.rows.get('demoPdfLimits/demo-fuel').retainedIntentCount,1);});

console.log(`PUBLIC_DEMO_PDF_POLICY passed=${passed} failed=${failed}`);
if(failed)process.exitCode=1;
