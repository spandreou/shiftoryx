import assert from 'node:assert/strict';
import {cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, join, relative, sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateRecoveryBaseline} from './lib/demoMaintenance.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
const source=fileURLToPath(new URL('../maintenance/public-demo/',import.meta.url));
const script=fileURLToPath(new URL('./build-demo-maintenance.mjs',import.meta.url));
const scratch=mkdtempSync(join(tmpdir(),'shiftoryx-maintenance-test-'));
let checks=0;
function build(dir){return spawnSync(process.execPath,[script,'--source',dir,'--parent',scratch],{cwd:root,encoding:'utf8'});}
function expectRejected(name,mutate,expected){
  const dir=join(scratch,`input-${checks}`);cpSync(source,dir,{recursive:true});mutate(dir);
  const result=build(dir);assert.notEqual(result.status,0,`${name}: ${result.stdout}\n${result.stderr}`);
  if(expected)assert.match(result.stderr,new RegExp(expected),`${name}: wrong failure`);checks++;
}
function change(dir,file,mutate){const path=join(dir,file);writeFileSync(path,mutate(readFileSync(path,'utf8')));}
function relock(dir,file){const lockPath=join(dir,'integrity.json'),lock=JSON.parse(readFileSync(lockPath,'utf8'));lock.files[file]=createHash('sha256').update(readFileSync(join(dir,file))).digest('hex');writeFileSync(lockPath,JSON.stringify(lock));}
function changeAndRelock(dir,file,mutate){change(dir,file,mutate);relock(dir,file);}
const digest='a'.repeat(64),stamp='2026-10-05T10:00:00.000Z';
const hosts=['demo.shiftoryx.gr','demo-fuel.shiftoryx.gr','demo-cafe.shiftoryx.gr','demo-salon.shiftoryx.gr','demo-market.shiftoryx.gr'];
const tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
const historical=['createAuthTicket','exchangeAuthTicket','cleanupAuthTickets','enterPublicDemo','resetPublicDemo','resetPublicDemosDaily'];
function verifiedFixture(){
  const record=JSON.parse(readFileSync(join(source,'live-baseline.empty.json'),'utf8'));
  Object.assign(record,{status:'VERIFIED',captureWindowStartedAt:'2026-10-05T09:30:00.000Z',captureWindowEndedAt:'2026-10-05T10:30:00.000Z',capturedAt:stamp,approvedWindowId:'offline-test-window',functionInventoryShape:'HISTORICAL_SIX',
    authDomains:[...hosts,'shiftoryx-public-demo.firebaseapp.com'],
    authDomainsObservedAt:stamp,
    hostAssignments:hosts.map(hostname=>({hostname,projectId:'shiftoryx-public-demo',deploymentId:'test-deployment',observedAt:stamp,proofSha256:digest})),
    frontendArtifacts:[{deploymentId:'test-deployment',sha256:digest,sourceRef:'offline-test-reference',observedAt:stamp}],
    firestoreRules:{rulesetId:'projects/shiftoryx-public-demo/rulesets/test-firestore',sha256:digest,sourceRef:'offline-test-rules',observedAt:stamp},
    storageRules:{rulesetId:'projects/shiftoryx-public-demo/rulesets/test-storage',sha256:digest,sourceRef:'offline-test-rules',observedAt:stamp},
    functions:historical.map(name=>({name,revisionId:'rev-test',artifactSha256:digest,runtimeServiceAccount:'public-demo-runtime@shiftoryx-public-demo.iam.gserviceaccount.com',runtime:'nodejs22',region:'us-central1',trigger:['cleanupAuthTickets','resetPublicDemosDaily'].includes(name)?'SCHEDULE':'CALLABLE',state:'ACTIVE',nonsecretConfigSha256:digest,observedAt:stamp})),
    schedules:['cleanupAuthTickets','resetPublicDemosDaily'].map(functionName=>({functionName,scheduleId:`demo-${functionName}`,state:'ENABLED',observedAt:stamp})),
    demoState:tenants.map(tenantId=>({tenantId,documentPath:`demoState/${tenantId}`,generation:3,resetting:false,phase:'OPEN',weekStart:'2026-10-05',lastResetAt:0,stateDigest:digest,controlDocumentPath:`demoControl/${tenantId}`,controlPhase:'OPEN',leaseIdDigest:null,leaseUntil:0,baseGeneration:null,controlDigest:digest,observedAt:stamp})),
    admissionAndRetention:tenants.map(tenantId=>({tenantId,admissionDocumentPath:`demoAdmission/${tenantId}`,admissionDigest:digest,auditReceiptsDocumentPath:`demoAuditReceipts/${tenantId}`,auditReceiptsDigest:digest,pdfLimitsDocumentPath:`demoPdfLimits/${tenantId}`,pdfLimitsDigest:digest,retainedIntentCount:0,pdfIntentCount:0,observedAt:stamp})),
    storageObjects:[{bucket:'shiftoryx-public-demo.firebasestorage.app',name:'demo-fuel/test.pdf',generation:'123',sizeBytes:42,crc32c:null,md5Hash:null,metadataDigest:digest,updatedAt:stamp,observedAt:stamp}],
    backup:{offlineLocation:'offline-test-only',sha256:digest,restoreDrillId:'test-drill',observedAt:stamp},
    verification:{independentReviewer:'offline-test-reviewer',verifiedAt:stamp,evidenceDigest:digest}});
  return record;
}
try{
  const first=build(source);
  assert.equal(first.status,0,`valid package must build: ${first.stdout}\n${first.stderr}`);checks++;
  const second=build(source);
  assert.equal(second.status,0,`repeat build must succeed: ${second.stdout}\n${second.stderr}`);checks++;
  const outputOf=result=>JSON.parse(result.stdout.trim());
  const a=outputOf(first),b=outputOf(second);
  assert.equal(a.sha256,b.sha256,'repeat build digest must be identical');checks++;
  assert.deepEqual(a.files,b.files,'repeat build files must be byte-identical');checks++;
  assert.deepEqual(a.hosts,['demo.shiftoryx.gr','demo-fuel.shiftoryx.gr','demo-cafe.shiftoryx.gr','demo-salon.shiftoryx.gr','demo-market.shiftoryx.gr']);checks++;
  assert.equal(existsSync(join(a.directory,'web','index.html')),true,'deployable web subdirectory is required');checks++;
  assert.equal(existsSync(join(a.directory,'web','firestore.rules')),false,'Rules must not be in web root');checks++;
  const html=readFileSync(join(a.directory,'web','index.html'),'utf8');
  assert.doesNotMatch(html,/<script|firebase|analytics|https?:\/\//i);checks++;
  assert.match(readFileSync(join(a.directory,'controls','firestore.rules'),'utf8'),/allow read, write: if false;/);checks++;
  assert.match(readFileSync(join(a.directory,'controls','storage.rules'),'utf8'),/allow read, write: if false;/);checks++;
  assert.equal(a.files['README.md']!==undefined,true);checks++;
  expectRejected('foreign project',dir=>changeAndRelock(dir,'target.json',s=>s.replace('shiftoryx-public-demo','gasstationproject-9dd89')),'MAINTENANCE_TARGET_REJECTED');
  expectRejected('foreign host',dir=>changeAndRelock(dir,'target.json',s=>s.replace('demo-cafe.shiftoryx.gr','bp-kallis.shiftoryx.gr')),'MAINTENANCE_TARGET_REJECTED');
  expectRejected('traversal path',dir=>changeAndRelock(dir,'target.json',s=>s.replace('index.html','../index.html')),'MAINTENANCE_TARGET_REJECTED');
  expectRejected('active script',dir=>changeAndRelock(dir,'index.html',s=>s.replace('</body>','<script>alert(1)</script></body>')),'MAINTENANCE_HTML_REJECTED');
  expectRejected('external CSS fetch',dir=>changeAndRelock(dir,'style.css',s=>s+'\n@import url(https://example.com/x.css);'),'MAINTENANCE_CSS_REJECTED');
  expectRejected('broad Firestore rule',dir=>changeAndRelock(dir,'firestore.rules',s=>s.replace('if false','if true')),'MAINTENANCE_FIRESTORE_RULES_REJECTED');
  expectRejected('broad Storage rule',dir=>changeAndRelock(dir,'storage.rules',s=>s.replace('if false','if true')),'MAINTENANCE_STORAGE_RULES_REJECTED');
  expectRejected('verified-looking empty baseline',dir=>changeAndRelock(dir,'live-baseline.empty.json',s=>s.replace('EMPTY_UNVERIFIED','VERIFIED')),'MAINTENANCE_BASELINE_NOT_EMPTY');
  expectRejected('tampered static copy',dir=>change(dir,'index.html',s=>s.replace('προσωρινά','μόνιμα')),'MAINTENANCE_HTML_REJECTED');
  expectRejected('relocked external rewrite',dir=>changeAndRelock(dir,'vercel.json',s=>s.replace('/index.html','https://example.com/collect')),'MAINTENANCE_VERCEL_REJECTED');
  expectRejected('relocked weak CSP',dir=>changeAndRelock(dir,'vercel.json',s=>s.replace("default-src 'none'","default-src *")),'MAINTENANCE_VERCEL_REJECTED');
  expectRejected('relocked preload link',dir=>changeAndRelock(dir,'index.html',s=>s.replace('</head>','<link rel="preload" href="/collect"></head>')),'MAINTENANCE_HTML_REJECTED');
  expectRejected('relocked source tag',dir=>changeAndRelock(dir,'index.html',s=>s.replace('</body>','<source srcset="/collect"></body>')),'MAINTENANCE_HTML_REJECTED');
  expectRejected('relocked CSS escape',dir=>changeAndRelock(dir,'style.css',s=>s+'\n.x{background:u\\72l(/collect)}'),'MAINTENANCE_CSS_REJECTED');
  expectRejected('relocked weak schema',dir=>changeAndRelock(dir,'live-baseline.schema.json',s=>s.replace('"additionalProperties": false','"additionalProperties": true')),'MAINTENANCE_SCHEMA_REJECTED');
  expectRejected('relocked incomplete inventory schema',dir=>changeAndRelock(dir,'live-baseline.schema.json',s=>{const schema=JSON.parse(s);schema.allOf[1].then.properties.hostAssignments.minItems=0;return JSON.stringify(schema);}),'MAINTENANCE_SCHEMA_REJECTED');
  const empty=JSON.parse(readFileSync(join(source,'live-baseline.empty.json'),'utf8'));
  assert.equal(validateRecoveryBaseline(empty),'EMPTY_UNVERIFIED');checks++;
  const captured={...empty,status:'CAPTURED_UNVERIFIED',captureWindowStartedAt:'2026-10-05T09:30:00.000Z',captureWindowEndedAt:'2026-10-05T10:30:00.000Z',capturedAt:stamp,approvedWindowId:'offline-test-window'};
  assert.equal(validateRecoveryBaseline(captured),'CAPTURED_UNVERIFIED');checks++;
  const verified=verifiedFixture();assert.equal(validateRecoveryBaseline(verified),'VERIFIED');checks++;
  const bad=(name,mutate)=>{const record=structuredClone(verified);mutate(record);assert.throws(()=>validateRecoveryBaseline(record),/BASELINE_/,name);checks++;};
  bad('duplicate host',v=>v.hostAssignments[1].hostname=v.hostAssignments[0].hostname);
  bad('alias lacks preserved frontend artifact',v=>v.hostAssignments[0].deploymentId='unpreserved-deployment');
  bad('stale function observation',v=>v.functions[0].observedAt='2026-10-05T08:00:00.000Z');
  bad('stale reviewer verification',v=>v.verification.verifiedAt='2026-10-05T08:00:00.000Z');
  bad('observation after capture',v=>v.hostAssignments[0].observedAt='2026-10-05T10:10:00.000Z');
  bad('verification after window',v=>v.verification.verifiedAt='2026-10-05T11:00:00.000Z');
  bad('capture window over one hour',v=>v.captureWindowStartedAt='2026-10-05T08:00:00.000Z');
  bad('capture before window',v=>v.capturedAt='2026-10-05T09:00:00.000Z');
  bad('missing capture window',v=>v.captureWindowStartedAt=null);
  bad('invalid observation date',v=>v.schedules[0].observedAt='2026-13-05T10:00:00.000Z');
  bad('stale Auth domains observation',v=>v.authDomainsObservedAt='2026-10-05T08:00:00.000Z');
  bad('stale frontend observation',v=>v.frontendArtifacts[0].observedAt='2026-10-05T08:00:00.000Z');
  bad('stale reset control observation',v=>v.demoState[0].observedAt='2026-10-05T08:00:00.000Z');
  bad('stale Storage metadata observation',v=>v.storageObjects[0].observedAt='2026-10-05T08:00:00.000Z');
  const oldSourceTimestamp=structuredClone(verified);oldSourceTimestamp.storageObjects[0].updatedAt='2026-09-01T00:00:00.000Z';
  assert.equal(validateRecoveryBaseline(oldSourceTimestamp),'VERIFIED','old source update time is distinct from fresh observation');checks++;
  bad('duplicate function',v=>v.functions[1].name=v.functions[0].name);
  bad('duplicate tenant retention',v=>v.admissionAndRetention[1].tenantId=v.admissionAndRetention[0].tenantId);
  bad('missing function',v=>v.functions.pop());
  bad('wrong function trigger',v=>v.functions[0].trigger='HTTP');
  bad('wrong runtime identity',v=>v.functions[0].runtimeServiceAccount='default@production.iam.gserviceaccount.com');
  bad('wrong project number',v=>v.projectNumber='000000000000');
  bad('wrong database',v=>v.databaseId='customer-db');
  bad('wrong region',v=>v.region='europe-west1');
  bad('wrong bucket',v=>v.storageObjects[0].bucket='production.firebasestorage.app');
  bad('wrong auth domain',v=>v.authDomains[0]='bp-kallis.shiftoryx.gr');
  bad('missing auth domain',v=>v.authDomains.pop());
  bad('wrong rules release',v=>v.firestoreRules.rulesetId='projects/production/rulesets/unsafe');
  bad('missing tenant control',v=>v.demoState.pop());
  bad('busy reset without lease',v=>{v.demoState[0].phase='DESTRUCTIVE';v.demoState[0].controlPhase='DESTRUCTIVE';v.demoState[0].resetting=true;});
  bad('wrong admission path',v=>v.admissionAndRetention[0].admissionDocumentPath='tenants/production');
  bad('missing object size',v=>delete v.storageObjects[0].sizeBytes);
  bad('invalid object generation',v=>v.storageObjects[0].generation='0');
  bad('PII injection',v=>v.hostAssignments[0].email='person@example.com');
  bad('raw credential injection',v=>v.verification.privateKey='secret');
  bad('PII in object name',v=>v.storageObjects[0].name='demo-fuel/person@example.com.pdf');
  bad('old mandatory object checksum',v=>v.storageObjects[0].sha256=digest);
  const targetNine=structuredClone(verified);targetNine.functionInventoryShape='TARGET_NINE';
  for(const name of ['publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'])targetNine.functions.push({...targetNine.functions[0],name,trigger:'HTTP'});
  assert.equal(validateRecoveryBaseline(targetNine),'VERIFIED');checks++;
  console.log(`DEMO_MAINTENANCE_OFFLINE_PASS checks=${checks} sha256=${a.sha256} scratch=removed`);
}finally{
  const realTemp=realpathSync(tmpdir()),realScratch=realpathSync(scratch),rel=relative(realTemp,realScratch);
  assert.ok(rel&&rel!=='..'&&!rel.startsWith('..'+sep)&&basename(realScratch).startsWith('shiftoryx-maintenance-test-'),'unsafe test scratch path');
  rmSync(realScratch,{recursive:true,force:true});
}
