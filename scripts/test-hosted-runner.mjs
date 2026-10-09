import test from 'node:test';
import assert from 'node:assert/strict';
import {publicDemoFixture} from '../functions/src/public-demo/fixtures.ts';
let runner={};try{runner=await import('../qa/public-demo/hosted-runner.ts');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const need=name=>{assert.equal(typeof runner[name],'function',`Missing typed hosted runner: ${name}`);return runner[name];};
const f=publicDemoFixture('demo-fuel',new Date('2026-10-05T08:00:00.000Z'));
const snapshot=()=>structuredClone({employees:f.employees.map(({id,...data})=>({id,data})),absences:f.absences.map(a=>({id:a.id,data:a})),
  settings:{schedulerSchemaVersion:3,schedulerConfigV3:f.config},drafts:[],publications:[],
  publicEmployees:f.employees.map(e=>({id:e.id,data:{tenantId:f.slug,fullName:e.fullName,role:e.role??'',color:e.color??'',isActive:e.isActive!==false}})),
  emptyCollections:{schedulePublicationCounters:[],schedulePublicationReservations:[],schedulePublicationPeriods:[],weekHistory:[],weekLocks:[],weekTemplates:[],
    attendanceHistory:[],shiftTemplates:[],announcements:[],publicAnnouncements:[],publicSchedules:[],publicMonths:[],shifts:[],auditLogs:[]}});
test('canonical baseline checks full fixture content, not just roster counts',()=>{
  need('assertCanonicalRows')(f,snapshot());const changed=snapshot();changed.employees[0].data.schedulerV3.targetWeeklyHours=12;
  assert.throws(()=>need('assertCanonicalRows')(f,changed));
  const history=snapshot();history.publications.push({id:'visitor-publication'});assert.throws(()=>need('assertCanonicalRows')(f,history));
  const counter=snapshot();counter.emptyCollections.schedulePublicationCounters.push({id:'old-version',data:{version:99}});assert.throws(()=>need('assertCanonicalRows')(f,counter));
  const projection=snapshot();projection.publicEmployees[0].data.fullName='Changed';assert.throws(()=>need('assertCanonicalRows')(f,projection));
});
test('complete foreign pair invokes authorization probes rather than just counting labels',async()=>{
  const seen=[];
  const adapter={
    async sdkRead(c,path,list=false){seen.push(['read',path,list]);throw Object.assign(new Error(),{code:'permission-denied'});},
    async sdkWrite(c,op,path){seen.push([op,path]);throw Object.assign(new Error(),{code:'permission-denied'});},
    async storage(c,op,path){seen.push(['storage-'+op,path]);throw Object.assign(new Error(),{code:'storage/unauthorized'});},
    async http(c,name,body,options={}){seen.push(['http',name,body,options]);return new Response(JSON.stringify({error:{code:name==='downloadPublicDemoPdf'?'PDF_NOT_AVAILABLE':options.origin?'ACCESS_DENIED':name==='resetPublicDemo'?'PERMISSION_DENIED':'INVALID_REQUEST'}}),{status:name==='downloadPublicDemoPdf'?404:options.origin||name==='resetPublicDemo'?403:400});},
  };
  const a={tenant:'demo-fuel',uid:'demo-fuel-owner-g12'},b={tenant:'demo-cafe',uid:'demo-cafe-owner-g12',
    fixture:publicDemoFixture('demo-cafe',new Date('2026-10-05T08:00:00.000Z')),publicationId:'12345678-1234-4123-8123-123456789abc'};
  await need('runForeignDenials')(adapter,a,b);
  for(const col of ['employees','settings','absences','scheduleDrafts','schedulePublications','schedulePublicationCounters','schedulePublicationReservations','schedulePublicationPeriods'])
    assert.ok(seen.some(x=>x[0]==='read'&&x[1].includes('/'+col)),col+' not probed');
  assert.ok(seen.some(x=>x[0]==='delete'&&x[1].includes('employees')));
  assert.ok(seen.some(x=>x[0]==='http'&&x[1]==='downloadPublicDemoPdf'&&x[2].publicationId===b.publicationId));
  assert.ok(seen.some(x=>x[0]==='http'&&x[3].origin==='https://demo-cafe.shiftoryx.gr'));
  assert.ok(seen.some(x=>x[0]==='set'&&x[1].startsWith('tenantMemberships/')));
});
test('foreign SDK acceptance fails the actual pair runner',async()=>{
  const a={tenant:'demo-fuel',uid:'demo-fuel-owner-g12'},b={tenant:'demo-cafe',uid:'demo-cafe-owner-g12',fixture:f};
  await assert.rejects(()=>need('runForeignDenials')({sdkRead:async()=>({ok:true})},a,b),e=>e.code==='HOSTED_UNEXPECTED_ACCESS');
});
test('same-tenant SDK matrix rejects a success for create, update or delete',async()=>{
  for(const accepted of ['set','update','delete']){
    const c={tenant:'demo-fuel',fixture:f};
    const adapter={sdkWrite:async(c,op)=>{if(op===accepted)return {};throw Object.assign(new Error(),{code:'permission-denied'});}};
    await assert.rejects(()=>need('runOwnerSdkDenials')(adapter,c),e=>e.code==='HOSTED_UNEXPECTED_ACCESS');
  }
});
test('direct Storage success fails including monthly and fabricated object paths',async()=>{
  const seen=[];
  await assert.rejects(()=>need('runOwnerStorageDenials')({storage:async(c,op,path)=>{seen.push(path);return {}; }},
    {tenant:'demo-fuel',fixture:f}),e=>e.code==='HOSTED_UNEXPECTED_ACCESS');
  assert.ok(seen[0].includes('monthly_schedule_pdfs'));
});
test('adversarial HTTP probe uses a supplied in-memory session and fails on acceptance',async()=>{
  await assert.rejects(()=>need('runSessionDenial')({http:async()=>new Response('{}',{status:200})},
    {tenant:'demo-fuel'},{name:'platform-admin-collision',token:'opaque-local-fixture'}),e=>e.code==='HOSTED_HTTP_UNEXPECTED_ACCESS');
  const observed=[];await need('runSessionDenial')({http:async(c,name,body,options)=>{observed.push(options.token);return new Response(JSON.stringify({error:{code:'ACCESS_DENIED'}}),{status:403});}},
    {tenant:'demo-fuel'},{name:'wrong-demo-tenant-claim',token:'opaque-local-fixture'});
  assert.deepEqual(observed,['opaque-local-fixture']);
});
test('distinct revoked and stale probes demand their distinct server outcomes',async()=>{
  await assert.rejects(()=>need('runSessionDenial')({http:async()=>new Response(JSON.stringify({error:{code:'UNAUTHENTICATED'}}),{status:401})},
    {tenant:'demo-fuel'},{name:'stale-generation',token:'opaque-fixture'}));
  await assert.rejects(()=>need('runSessionDenial')({http:async()=>new Response(JSON.stringify({error:{code:'DEMO_GENERATION_CHANGED'}}),{status:409})},
    {tenant:'demo-fuel'},{name:'revoked-session',token:'opaque-fixture'}));
});
test('prepared adversarial controller is required, invokes each case and never returns token material',async()=>{
  await assert.rejects(()=>need('runPreparedSessionCases')({},[],undefined));
  const asked=[],clients=['demo-fuel','demo-cafe','demo-salon','demo-market'].map(tenant=>({tenant,uid:tenant+'-owner-g12',generation:12}));
  const a={http:async(c,name,body,options)=>new Response(JSON.stringify({error:{code:options.token==='stale'?'DEMO_GENERATION_CHANGED':options.token==='revoked'?'UNAUTHENTICATED':'ACCESS_DENIED'}}),{status:options.token==='stale'?409:options.token==='revoked'?401:403})};
  const report=await need('runPreparedSessionCases')(a,clients,async request=>{asked.push(request);return {token:request.name==='stale-generation'?'stale':request.name==='revoked-session'?'revoked':'admin',evidenceHash:'a'.repeat(64)};});
  assert.equal(asked.length,12);assert.equal(report.length,12);assert.equal(JSON.stringify(report).includes('"token"'),false);
  assert.ok(asked.some(x=>x.name==='platform-admin-collision'&&x.tenant==='demo-market'));
});
test('post-reset private cleanup receipt must be fresh, explicit and match the new generation',async()=>{
  const c={tenant:'demo-fuel'},result={generation:13};
  await assert.rejects(()=>need('requirePostResetPrivateEvidence')(c,result,undefined));
  const valid={projectId:'shiftoryx-public-demo',bucket:'shiftoryx-public-demo.firebasestorage.app',tenantId:'demo-fuel',generation:13,evidenceHash:'a'.repeat(64),observedAt:new Date().toISOString(),
    privateCollectionCounts:{demoPublicationArtifacts:0,exportAuditLogs:0,monthlyScheduleArchives:0},monthlyExportCount:0,storageObjectCount:0,resetControlPhase:'OPEN'};
  const out=await need('requirePostResetPrivateEvidence')(c,result,async()=>valid);assert.equal(out.evidenceHash,valid.evidenceHash);
  for(const edit of [p=>p.generation=12,p=>p.projectId='foreign',p=>p.bucket='foreign',p=>p.tenantId='demo-cafe',p=>p.storageObjectCount=1,p=>p.observedAt='2026-01-01T00:00:00.000Z']){
    const bad=structuredClone(valid);edit(bad);await assert.rejects(()=>need('requirePostResetPrivateEvidence')(c,result,async()=>bad));
  }
});
function fakeFixtureAdapter(){
  const rows=c=>{const fixture=publicDemoFixture(c.tenant,new Date('2026-10-05T08:00:00Z'));const s=snapshot();if(c.tenant!==f.slug){s.employees=fixture.employees.map(({id,...data})=>({id,data}));s.absences=fixture.absences.map(a=>({id:a.id,data:a}));s.publicEmployees=fixture.employees.map(e=>({id:e.id,data:{tenantId:c.tenant,fullName:e.fullName,role:e.role??'',color:e.color??'',isActive:e.isActive!==false}}));s.settings={schedulerSchemaVersion:3,schedulerConfigV3:fixture.config};}return s;};
  return {async login(tenant){return {tenant,uid:tenant+'-owner-g12',fixture:publicDemoFixture(tenant,new Date('2026-10-05T08:00:00Z'))};},
    async read(c,path){if(path.startsWith('demoState/'))return {generation:12,lastResetAt:0,phase:'OPEN',resetting:false,weekStart:'2026-10-05'};
      if(path.startsWith('tenantMemberships/'))return {uid:c.uid,tenantId:c.tenant,status:'ACTIVE',role:'OWNER'};
      if(path.endsWith('settings/scheduler'))return rows(c).settings;return undefined;},
    async list(c,path){const col=path.split('/').at(-1),s=rows(c);return s[col==='scheduleDrafts'?'drafts':col==='schedulePublications'?'publications':col]??s.emptyCollections[col]??[];}};
}
test('all four baselines are preflighted before caller can begin positives',async()=>{
  const a=fakeFixtureAdapter(),original=a.list;let logged=0;const login=a.login;a.login=async t=>{logged++;return login(t);};
  a.list=async(c,path)=>c.tenant==='demo-salon'&&path.endsWith('/employees')?[]:original(c,path);
  const p={baseline:{tenants:Object.fromEntries(['demo-fuel','demo-cafe','demo-salon','demo-market'].map(t=>[t,{generation:12,lastResetAt:0,weekStart:'2026-10-05'}]))}};
  await assert.rejects(()=>need('preflightHostedClients')(a,p));assert.equal(logged,3);
});
test('a typed create response without persisted employee cannot count as positive',async()=>{
  const a=fakeFixtureAdapter(),c=await a.login('demo-fuel');a.typed=async()=>({id:'de_probe'});
  const p={baseline:{tenants:{'demo-fuel':{generation:12,lastResetAt:0,weekStart:'2026-10-05'}}}};
  await assert.rejects(()=>need('runTypedPositiveWorkflow')(a,c,p),e=>e.code==='HOSTED_EMPLOYEE_PERSISTENCE');
});
