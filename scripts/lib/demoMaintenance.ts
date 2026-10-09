import {createHash} from 'node:crypto';
import {lstatSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,realpathSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,isAbsolute,join,relative,resolve,sep} from 'node:path';

const PROJECT='shiftoryx-public-demo';
const PROJECT_NUMBER='848554493137',DATABASE='(default)',REGION='us-central1';
const BUCKET='shiftoryx-public-demo.firebasestorage.app';
const RUNTIME_SA='public-demo-runtime@shiftoryx-public-demo.iam.gserviceaccount.com';
const HOSTS=['demo.shiftoryx.gr','demo-fuel.shiftoryx.gr','demo-cafe.shiftoryx.gr','demo-salon.shiftoryx.gr','demo-market.shiftoryx.gr'];
const TENANTS=['demo-fuel','demo-cafe','demo-salon','demo-market'];
const AUTH_DOMAINS=[...HOSTS,'shiftoryx-public-demo.firebaseapp.com'];
const HISTORICAL=['createAuthTicket','exchangeAuthTicket','cleanupAuthTickets','enterPublicDemo','resetPublicDemo','resetPublicDemosDaily'];
const TARGET=[...HISTORICAL,'publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'];
const SCHEDULES=['cleanupAuthTickets','resetPublicDemosDaily'];
const FILES=['FUNCTION_CONTAINMENT.md','README.md','ROLLBACK.md','firestore.rules','index.html','live-baseline.empty.json','live-baseline.schema.json','storage.rules','style.css','target.json','vercel.json'];
const EXPECTED_TARGET={projectId:PROJECT,hosts:HOSTS,frontendEntry:'index.html',stylesheet:'style.css',firestoreRules:'firestore.rules',storageRules:'storage.rules',baselineTemplate:'live-baseline.empty.json',baselineSchema:'live-baseline.schema.json'};
const EMPTY_BASELINE={schemaVersion:1,status:'EMPTY_UNVERIFIED',projectId:PROJECT,projectNumber:PROJECT_NUMBER,databaseId:DATABASE,region:REGION,bucket:BUCKET,runtimeServiceAccount:RUNTIME_SA,captureWindowStartedAt:null,captureWindowEndedAt:null,capturedAt:null,approvedWindowId:null,functionInventoryShape:null,authDomains:[],authDomainsObservedAt:null,hostAssignments:[],frontendArtifacts:[],firestoreRules:null,storageRules:null,functions:[],schedules:[],demoState:[],admissionAndRetention:[],storageObjects:[],backup:null,verification:{independentReviewer:null,verifiedAt:null,evidenceDigest:null}};
const FIRESTORE="rules_version = '2'; service cloud.firestore { match /databases/{database}/documents { match /{document=**} { allow read, write: if false; } } }";
const STORAGE="rules_version = '2'; service firebase.storage { match /b/{bucket}/o { match /{object=**} { allow read, write: if false; } } }";
const HTML_SHA='da60c3a38006361e6d05426574e8d0511204c6e7c83b79a892bf2cf04b1d4870';
const CSS_SHA='d661dd3b8b9347c72c3bf851b6f551497e9a59caa1d2b513319dd33d75b032d0';
const VERCEL_SHA='eebe1e95ccd7cbbe06afa206e2ccb7b389296e36c7400c0d5d659ab6cbebc4a5';
const SCHEMA_SHA='e211fa7551a19b202ce5b5fcec87da5e569107d5d3db06a43d6e82f453928a65';
const EXPECTED_VERCEL={headers:[{source:'/:path*',headers:[
  {key:'Content-Security-Policy',value:"default-src 'none'; style-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"},
  {key:'X-Content-Type-Options',value:'nosniff'},
  {key:'Referrer-Policy',value:'no-referrer'},
  {key:'Cache-Control',value:'no-store'}
]}],rewrites:[{source:'/((?!style\\.css$).*)',destination:'/index.html'}]};
type DigestMap=Record<string,string>;
const sha=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function deny(code:string):never{throw new Error(code);}
function normalizedRules(s:string){return s.replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').trim();}
function exactRules(actual:string,want:string,code:string){if(normalizedRules(actual)!==normalizedRules(want))deny(code);}
function parseJson(buffer:Buffer,code:string){try{return JSON.parse(buffer.toString('utf8'));}catch{deny(code);}}
function inside(candidate:string,parent:string){const rel=relative(parent,candidate);return rel===''||(!rel.startsWith('..'+sep)&&rel!=='..'&&!isAbsolute(rel));}

export function validateMaintenanceSource(source:string){
  const sourcePath=realpathSync(resolve(source));
  if(!lstatSync(sourcePath).isDirectory())deny('MAINTENANCE_SOURCE_NOT_DIRECTORY');
  const expected=[...FILES,'integrity.json'].sort();
  if(!same(readdirSync(sourcePath).sort(),expected))deny('MAINTENANCE_FILE_SET_REJECTED');
  const bytes=new Map<string,Buffer>();
  for(const file of expected){
    if(basename(file)!==file||file.includes('..')||file.includes('\\')||file.includes('/'))deny('MAINTENANCE_PATH_REJECTED');
    const path=join(sourcePath,file);if(!lstatSync(path).isFile())deny('MAINTENANCE_NONFILE_REJECTED');
    bytes.set(file,readFileSync(path));
  }
  const target=parseJson(bytes.get('target.json')!,'MAINTENANCE_TARGET_JSON_REJECTED');
  if(!same(target,EXPECTED_TARGET))deny('MAINTENANCE_TARGET_REJECTED');
  const baseline=parseJson(bytes.get('live-baseline.empty.json')!,'MAINTENANCE_BASELINE_JSON_REJECTED');
  if(!same(baseline,EMPTY_BASELINE))deny('MAINTENANCE_BASELINE_NOT_EMPTY');
  const schema=parseJson(bytes.get('live-baseline.schema.json')!,'MAINTENANCE_SCHEMA_JSON_REJECTED');
  if(sha(bytes.get('live-baseline.schema.json')!)!==SCHEMA_SHA||schema.additionalProperties!==false||!same(schema.properties?.projectId,{const:PROJECT})||!schema.properties?.status?.enum?.includes('VERIFIED'))deny('MAINTENANCE_SCHEMA_REJECTED');
  const html=bytes.get('index.html')!.toString('utf8');
  if(sha(bytes.get('index.html')!)!==HTML_SHA||!/^<!doctype html>/i.test(html)||!html.includes('<html lang="el">')||!html.includes('<link rel="stylesheet" href="/style.css">')||!html.includes('προσωρινά')||/<script|<form|<iframe|<img|<base|<meta[^>]+refresh|\bon\w+\s*=|https?:\/\/|\/\//i.test(html))deny('MAINTENANCE_HTML_REJECTED');
  const css=bytes.get('style.css')!.toString('utf8');
  if(sha(bytes.get('style.css')!)!==CSS_SHA||/@import|@font-face|url\s*\(|https?:|\/\//i.test(css))deny('MAINTENANCE_CSS_REJECTED');
  exactRules(bytes.get('firestore.rules')!.toString('utf8'),FIRESTORE,'MAINTENANCE_FIRESTORE_RULES_REJECTED');
  exactRules(bytes.get('storage.rules')!.toString('utf8'),STORAGE,'MAINTENANCE_STORAGE_RULES_REJECTED');
  const vercel=parseJson(bytes.get('vercel.json')!,'MAINTENANCE_VERCEL_JSON_REJECTED');
  if(sha(bytes.get('vercel.json')!)!==VERCEL_SHA||!same(vercel,EXPECTED_VERCEL))deny('MAINTENANCE_VERCEL_REJECTED');
  const lock=parseJson(bytes.get('integrity.json')!,'MAINTENANCE_INTEGRITY_JSON_REJECTED');
  if(lock.version!==1||!same(Object.keys(lock.files||{}).sort(),FILES))deny('MAINTENANCE_INTEGRITY_REJECTED');
  for(const file of FILES)if(lock.files[file]!==sha(bytes.get(file)!))deny('MAINTENANCE_INTEGRITY_MISMATCH:'+file);
  return {sourcePath,bytes};
}

export function buildMaintenance(source:string,parent=tmpdir()){
  const validated=validateMaintenanceSource(source);
  const temporaryRoot=realpathSync(tmpdir());
  const outputParent=realpathSync(resolve(parent));
  if(!inside(outputParent,temporaryRoot))deny('MAINTENANCE_OUTPUT_NOT_TEMP');
  const directory=mkdtempSync(join(outputParent,'shiftoryx-demo-maintenance-'));
  const web=join(directory,'web'),controls=join(directory,'controls');
  mkdirSync(web);mkdirSync(controls);
  const files:DigestMap={};const packageHash=createHash('sha256');
  for(const file of [...validated.bytes.keys()].sort()){
    const content=validated.bytes.get(file)!;
    writeFileSync(join(['index.html','style.css','vercel.json'].includes(file)?web:controls,file),content);
    files[file]=sha(content);packageHash.update(file+'\0').update(content).update('\0');
  }
  const sha256=packageHash.digest('hex');
  writeFileSync(join(directory,'build-manifest.json'),JSON.stringify({schemaVersion:1,projectId:PROJECT,hosts:HOSTS,files,sha256},null,2)+'\n');
  return {directory,sha256,files,hosts:HOSTS};
}

type RecordValue=Record<string,unknown>;
const SHA_PATTERN=/^[a-f0-9]{64}$/;
const DATE_PATTERN=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/;
const ID_PATTERN=/^[A-Za-z0-9._:/+\\-]{1,240}$/;
function object(value:unknown,fields:string[],code:string):RecordValue{
  if(value===null||typeof value!=='object'||Array.isArray(value)||!same(Object.keys(value).sort(),[...fields].sort()))deny(code);
  return value as RecordValue;
}
function array(value:unknown,code:string):unknown[]{if(!Array.isArray(value))deny(code);return value as unknown[];}
function id(value:unknown,code:string){if(typeof value!=='string'||!ID_PATTERN.test(value)||/password|secret|bearer|private.?key|api.?key|token/i.test(value))deny(code);}
function digest(value:unknown,code:string){if(typeof value!=='string'||!SHA_PATTERN.test(value))deny(code);}
function optionalDigest(value:unknown,code:string){if(value!==null)digest(value,code);}
function stamp(value:unknown,code:string){if(typeof value!=='string'||value.length>40||!DATE_PATTERN.test(value)||Number.isNaN(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))deny(code);}
function integer(value:unknown,min:number,code:string){if(!Number.isSafeInteger(value)||Number(value)<min)deny(code);}
function names(values:unknown[],want:string[],pick:(item:unknown)=>unknown,code:string){
  const actual=values.map(pick);
  if(actual.some(value=>typeof value!=='string')||actual.length!==want.length||new Set(actual).size!==want.length||!same([...actual].sort(),[...want].sort()))deny(code);
}
function validateRuleEvidence(value:unknown,code:string){
  if(value===null)return;
  const item=object(value,['rulesetId','sha256','sourceRef','observedAt'],code);
  if(typeof item.rulesetId!=='string'||!/^projects\/shiftoryx-public-demo\/rulesets\/[A-Za-z0-9_-]+$/.test(item.rulesetId))deny(code);
  digest(item.sha256,code);id(item.sourceRef,code);stamp(item.observedAt,code);
}
function validateFunction(value:unknown){
  const code='BASELINE_FUNCTION_REJECTED';
  const item=object(value,['name','revisionId','artifactSha256','runtimeServiceAccount','runtime','region','trigger','state','nonsecretConfigSha256','observedAt'],code);
  if(!TARGET.includes(String(item.name))||item.runtimeServiceAccount!==RUNTIME_SA||item.runtime!=='nodejs22'||item.region!==REGION||!['ACTIVE','INACTIVE','FAILED'].includes(String(item.state)))deny(code);
  const expectedTrigger=SCHEDULES.includes(String(item.name))?'SCHEDULE':['publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'].includes(String(item.name))?'HTTP':'CALLABLE';
  if(item.trigger!==expectedTrigger)deny(code);
  id(item.revisionId,code);digest(item.artifactSha256,code);digest(item.nonsecretConfigSha256,code);stamp(item.observedAt,code);
}
function validateDemoState(value:unknown){
  const code='BASELINE_DEMO_STATE_REJECTED';
  const item=object(value,['tenantId','documentPath','generation','resetting','phase','weekStart','lastResetAt','stateDigest','controlDocumentPath','controlPhase','leaseIdDigest','leaseUntil','baseGeneration','controlDigest','observedAt'],code);
  if(!TENANTS.includes(String(item.tenantId))||item.documentPath!==`demoState/${item.tenantId}`||item.controlDocumentPath!==`demoControl/${item.tenantId}`||!['OPEN','PRECHECK','DESTRUCTIVE','FINALIZE'].includes(String(item.phase))||item.controlPhase!==item.phase)deny(code);
  integer(item.generation,1,code);integer(item.lastResetAt,0,code);integer(item.leaseUntil,0,code);
  if(typeof item.weekStart!=='string'||!/^\d{4}-\d\d-\d\d$/.test(item.weekStart))deny(code);
  if(item.phase==='OPEN'){
    if(item.resetting!==false||item.leaseIdDigest!==null||item.leaseUntil!==0||item.baseGeneration!==null)deny(code);
  }else{
    if(item.resetting!==true)deny(code);digest(item.leaseIdDigest,code);integer(item.leaseUntil,1,code);integer(item.baseGeneration,0,code);
  }
  digest(item.stateDigest,code);digest(item.controlDigest,code);
  stamp(item.observedAt,code);
}
function validateRetention(value:unknown){
  const code='BASELINE_RETENTION_REJECTED';
  const item=object(value,['tenantId','admissionDocumentPath','admissionDigest','auditReceiptsDocumentPath','auditReceiptsDigest','pdfLimitsDocumentPath','pdfLimitsDigest','retainedIntentCount','pdfIntentCount','observedAt'],code);
  if(!TENANTS.includes(String(item.tenantId))||item.admissionDocumentPath!==`demoAdmission/${item.tenantId}`||item.auditReceiptsDocumentPath!==`demoAuditReceipts/${item.tenantId}`||item.pdfLimitsDocumentPath!==`demoPdfLimits/${item.tenantId}`)deny(code);
  for(const field of ['admissionDigest','auditReceiptsDigest','pdfLimitsDigest'])digest(item[field],code);
  integer(item.retainedIntentCount,0,code);integer(item.pdfIntentCount,0,code);stamp(item.observedAt,code);
}
function validateStorageObject(value:unknown){
  const code='BASELINE_STORAGE_OBJECT_REJECTED';
  const item=object(value,['bucket','name','generation','sizeBytes','crc32c','md5Hash','metadataDigest','updatedAt','observedAt'],code);
  if(item.bucket!==BUCKET||typeof item.name!=='string'||!item.name||item.name.includes('..')||/@|password|secret|token|credential/i.test(item.name)||typeof item.generation!=='string'||!/^[1-9]\d*$/.test(item.generation))deny(code);
  integer(item.sizeBytes,0,code);
  for(const field of ['crc32c','md5Hash'])if(item[field]!==null&&(typeof item[field]!=='string'||!/^[A-Za-z0-9+/=]{1,128}$/.test(item[field])))deny(code);
  optionalDigest(item.metadataDigest,code);stamp(item.updatedAt,code);stamp(item.observedAt,code);
}
export function validateRecoveryBaseline(value:unknown){
  const code='BASELINE_REJECTED';
  const record=object(value,Object.keys(EMPTY_BASELINE),code);
  for(const [key,want] of Object.entries({schemaVersion:1,projectId:PROJECT,projectNumber:PROJECT_NUMBER,databaseId:DATABASE,region:REGION,bucket:BUCKET,runtimeServiceAccount:RUNTIME_SA}))if(record[key]!==want)deny('BASELINE_IDENTITY_REJECTED');
  if(!['EMPTY_UNVERIFIED','CAPTURED_UNVERIFIED','VERIFIED'].includes(String(record.status)))deny(code);
  if(record.status==='EMPTY_UNVERIFIED'){
    if(!same(record,EMPTY_BASELINE))deny('BASELINE_EMPTY_REJECTED');
    return 'EMPTY_UNVERIFIED';
  }
  stamp(record.capturedAt,code);id(record.approvedWindowId,code);
  stamp(record.captureWindowStartedAt,code);stamp(record.captureWindowEndedAt,code);
  const start=Date.parse(String(record.captureWindowStartedAt)),end=Date.parse(String(record.captureWindowEndedAt)),captured=Date.parse(String(record.capturedAt));
  if(end<start||end-start>60*60*1000||captured<start||captured>end)deny('BASELINE_CAPTURE_WINDOW');
  const observed=(value:unknown)=>{stamp(value,'BASELINE_OBSERVATION');const at=Date.parse(String(value));if(at<start||at>captured)deny('BASELINE_OBSERVATION');};
  if(record.functionInventoryShape!==null&&!['HISTORICAL_SIX','TARGET_NINE'].includes(String(record.functionInventoryShape)))deny(code);
  const authDomains=array(record.authDomains,code);
  if(authDomains.some(domain=>!AUTH_DOMAINS.includes(String(domain)))||new Set(authDomains).size!==authDomains.length)deny('BASELINE_AUTH_DOMAINS_REJECTED');
  if(record.authDomainsObservedAt!==null)observed(record.authDomainsObservedAt);
  const assignments=array(record.hostAssignments,code);
  for(const value of assignments){
    const item=object(value,['hostname','projectId','deploymentId','observedAt','proofSha256'],'BASELINE_HOST_REJECTED');
    if(!HOSTS.includes(String(item.hostname))||item.projectId!==PROJECT)deny('BASELINE_HOST_REJECTED');
    id(item.deploymentId,'BASELINE_HOST_REJECTED');stamp(item.observedAt,'BASELINE_HOST_REJECTED');digest(item.proofSha256,'BASELINE_HOST_REJECTED');
  }
  if(new Set(assignments.map(item=>(item as RecordValue).hostname)).size!==assignments.length)deny('BASELINE_HOST_DUPLICATE');
  const frontends=array(record.frontendArtifacts,code);
  for(const value of frontends){const item=object(value,['deploymentId','sha256','sourceRef','observedAt'],'BASELINE_FRONTEND_REJECTED');id(item.deploymentId,'BASELINE_FRONTEND_REJECTED');digest(item.sha256,'BASELINE_FRONTEND_REJECTED');id(item.sourceRef,'BASELINE_FRONTEND_REJECTED');stamp(item.observedAt,'BASELINE_FRONTEND_REJECTED');}
  validateRuleEvidence(record.firestoreRules,'BASELINE_FIRESTORE_RULES_REJECTED');validateRuleEvidence(record.storageRules,'BASELINE_STORAGE_RULES_REJECTED');
  const functions=array(record.functions,code);for(const item of functions)validateFunction(item);
  if(new Set(functions.map(item=>(item as RecordValue).name)).size!==functions.length)deny('BASELINE_FUNCTION_DUPLICATE');
  const schedules=array(record.schedules,code);
  for(const value of schedules){const item=object(value,['functionName','scheduleId','state','observedAt'],'BASELINE_SCHEDULE_REJECTED');if(!SCHEDULES.includes(String(item.functionName))||!['ENABLED','PAUSED'].includes(String(item.state)))deny('BASELINE_SCHEDULE_REJECTED');id(item.scheduleId,'BASELINE_SCHEDULE_REJECTED');stamp(item.observedAt,'BASELINE_SCHEDULE_REJECTED');}
  if(new Set(schedules.map(item=>(item as RecordValue).functionName)).size!==schedules.length)deny('BASELINE_SCHEDULE_DUPLICATE');
  const states=array(record.demoState,code);for(const item of states)validateDemoState(item);
  if(new Set(states.map(item=>(item as RecordValue).tenantId)).size!==states.length)deny('BASELINE_DEMO_STATE_DUPLICATE');
  const retention=array(record.admissionAndRetention,code);for(const item of retention)validateRetention(item);
  if(new Set(retention.map(item=>(item as RecordValue).tenantId)).size!==retention.length)deny('BASELINE_RETENTION_DUPLICATE');
  const storage=array(record.storageObjects,code);for(const item of storage)validateStorageObject(item);
  if(new Set(storage.map(item=>{const object=item as RecordValue;return `${object.bucket}/${object.name}#${object.generation}`;})).size!==storage.length)deny('BASELINE_STORAGE_DUPLICATE');
  if(record.backup!==null){const backup=object(record.backup,['offlineLocation','sha256','restoreDrillId','observedAt'],'BASELINE_BACKUP_REJECTED');id(backup.offlineLocation,'BASELINE_BACKUP_REJECTED');digest(backup.sha256,'BASELINE_BACKUP_REJECTED');id(backup.restoreDrillId,'BASELINE_BACKUP_REJECTED');observed(backup.observedAt);}
  for(const rows of [assignments,frontends,functions,schedules,states,retention,storage])for(const item of rows)observed((item as RecordValue).observedAt);
  for(const item of [record.firestoreRules,record.storageRules])if(item!==null)observed((item as RecordValue).observedAt);
  const verification=object(record.verification,['independentReviewer','verifiedAt','evidenceDigest'],'BASELINE_VERIFICATION_REJECTED');
  if(verification.independentReviewer!==null)id(verification.independentReviewer,'BASELINE_VERIFICATION_REJECTED');
  if(verification.verifiedAt!==null)stamp(verification.verifiedAt,'BASELINE_VERIFICATION_REJECTED');
  if(verification.verifiedAt!==null&&(Date.parse(String(verification.verifiedAt))<captured||Date.parse(String(verification.verifiedAt))>end))deny('BASELINE_VERIFICATION_WINDOW');
  optionalDigest(verification.evidenceDigest,'BASELINE_VERIFICATION_REJECTED');
  if(record.status==='VERIFIED'){
    if(!same([...authDomains].sort(),[...AUTH_DOMAINS].sort()))deny('BASELINE_AUTH_DOMAINS_INCOMPLETE');
    if(record.authDomainsObservedAt===null)deny('BASELINE_AUTH_DOMAINS_INCOMPLETE');
    names(assignments,HOSTS,item=>(item as RecordValue).hostname,'BASELINE_HOSTS_INCOMPLETE');
    if(!frontends.length||record.firestoreRules===null||record.storageRules===null||record.backup===null)deny('BASELINE_RECOVERY_EVIDENCE_INCOMPLETE');
    const frontendIds=frontends.map(item=>(item as RecordValue).deploymentId);
    if(new Set(frontendIds).size!==frontendIds.length||assignments.some(item=>!frontendIds.includes((item as RecordValue).deploymentId)))deny('BASELINE_ALIAS_ARTIFACT_MISMATCH');
    if(record.functionInventoryShape===null)deny('BASELINE_FUNCTION_SHAPE_MISSING');
    names(functions,record.functionInventoryShape==='HISTORICAL_SIX'?HISTORICAL:TARGET,item=>(item as RecordValue).name,'BASELINE_FUNCTIONS_INCOMPLETE');
    names(schedules,SCHEDULES,item=>(item as RecordValue).functionName,'BASELINE_SCHEDULES_INCOMPLETE');
    names(states,TENANTS,item=>(item as RecordValue).tenantId,'BASELINE_CONTROLS_INCOMPLETE');
    names(retention,TENANTS,item=>(item as RecordValue).tenantId,'BASELINE_RETENTION_INCOMPLETE');
    if(verification.independentReviewer===null||verification.verifiedAt===null||verification.evidenceDigest===null)deny('BASELINE_VERIFICATION_INCOMPLETE');
  }
  return record.status;
}
