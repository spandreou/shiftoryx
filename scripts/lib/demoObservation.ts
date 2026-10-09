import {createHash} from 'node:crypto';
import {parseStrictJson} from './auditExceptionPolicy.ts';

export const DEMO_IDENTITY=Object.freeze({projectId:'shiftoryx-public-demo',projectNumber:'848554493137',database:'(default)',
  region:'us-central1',bucket:'shiftoryx-public-demo.firebasestorage.app'});
export const DEMO_HOSTS=Object.freeze(['demo.shiftoryx.gr','demo-fuel.shiftoryx.gr','demo-cafe.shiftoryx.gr','demo-salon.shiftoryx.gr','demo-market.shiftoryx.gr']);
export const DEMO_TENANT_IDS=Object.freeze(['demo-fuel','demo-cafe','demo-salon','demo-market']);
export const DEMO_FUNCTIONS=Object.freeze(['createAuthTicket','exchangeAuthTicket','cleanupAuthTickets','enterPublicDemo','resetPublicDemo',
  'resetPublicDemosDaily','publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo']);
export const DEMO_SCHEDULES=Object.freeze(['cleanupAuthTickets','resetPublicDemosDaily']);
export const DEMO_AUTH_DOMAINS=Object.freeze([...DEMO_HOSTS,'shiftoryx-public-demo.firebaseapp.com']);
export const DEMO_RUNTIME_SA='public-demo-runtime@shiftoryx-public-demo.iam.gserviceaccount.com';
export const OBSERVATION_WINDOW_MS=60*60*1000;
type Row=Record<string,any>;
export class ObservationError extends Error{readonly code:string;constructor(code:string){super('OBS_'+code);this.code='OBS_'+code;}}
const fail=(code:string):never=>{throw new ObservationError(code);};
export function exactObject(value:unknown,keys:string[],code='SCHEMA'):Row{
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).length!==keys.length||Object.keys(value).some(key=>!keys.includes(key)))fail(code);
  return value as Row;
}
export function requireDigest(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))fail('DIGEST');return value;}
export function requireSha(value:unknown){if(typeof value!=='string'||!/^[a-f0-9]{40}$/.test(value))fail('QUALIFICATION_SHA');return value;}
export function timestamp(value:unknown):number{
  if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(value)||
    !Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,19)!==value.slice(0,19))fail('TIMESTAMP');
  return Date.parse(value);
}
export const byteDigest=(bytes:Buffer|string)=>createHash('sha256').update(bytes).digest('hex');
export function exactSet(value:unknown,want:readonly string[]){
  if(!Array.isArray(value)||value.length!==want.length||value.some(x=>typeof x!=='string')||new Set(value).size!==want.length||
    JSON.stringify([...value].sort())!==JSON.stringify([...want].sort()))fail('EXACT_SET');
}
const integer=(v:unknown,min=0)=>{if(!Number.isSafeInteger(v)||Number(v)<min)fail('INTEGER');};
const id=(v:unknown)=>{if(typeof v!=='string'||!/^[A-Za-z0-9._-]{1,160}$/.test(v))fail('IDENTIFIER');};
const date=(v:unknown)=>{if(typeof v!=='string'||!/^\d{4}-\d\d-\d\d$/.test(v)||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)fail('DATE');};
const freeze=(v:any):any=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const release=(type:string)=>`projects/${DEMO_IDENTITY.projectId}/releases/`+(type==='FIRESTORE_RULES'?'cloud.firestore':`firebase.storage/${DEMO_IDENTITY.bucket}`);
function resource(type:string,path:string){
  const project=DEMO_IDENTITY.projectId;
  const admitted=type==='PROJECT'?path===`projects/${project}`:type==='AUTH'?path===`projects/${project}/auth-config`:
    ['FIRESTORE_RULES','STORAGE_RULES'].includes(type)?path===release(type):
    type==='FUNCTION'?DEMO_FUNCTIONS.some(name=>path===`projects/${project}/locations/us-central1/functions/${name}`):
    type==='SCHEDULE'?DEMO_SCHEDULES.some(name=>path===`projects/${project}/locations/us-central1/jobs/firebase-schedule-${name}-us-central1`):
    type==='HOST_ASSIGNMENT'?DEMO_HOSTS.some(host=>path===`vercel/projects/prj_E2ORHb1pVLrUtEppzyusna56ZPiH/domains/${host}`):
    type==='CONTROL'?DEMO_TENANT_IDS.some(tenant=>path===`controls/${tenant}`):
    type==='RETENTION'?['demoAdmission','demoAuditReceipts','demoPdfLimits'].some(collection=>DEMO_TENANT_IDS.some(tenant=>path===`${collection}/${tenant}`)):
    type==='STORAGE_INVENTORY'?path===`buckets/${DEMO_IDENTITY.bucket}`:false;
  if(!admitted)fail('RESOURCE_IDENTITY');
}
function presentValue(item:Row,start:number,end:number):string|undefined{
  const value=item.value,type=item.resourceType;
  const observed=(at:unknown)=>{const n=timestamp(at);if(n<start||n>end||n>timestamp(item.observedAt))fail('MIXED_OBSERVATION_TIME');};
  if(type==='PROJECT'){
    const row=exactObject(value,['projectId','projectNumber','database','region','bucket','runtimeServiceAccount']);
    for(const [key,want]of Object.entries({...DEMO_IDENTITY,runtimeServiceAccount:DEMO_RUNTIME_SA}))if(row[key]!==want)fail('PROJECT_IDENTITY');
  }else if(type==='AUTH')exactSet(exactObject(value,['domains']).domains,DEMO_AUTH_DOMAINS);
  else if(['FIRESTORE_RULES','STORAGE_RULES'].includes(type)){
    const row=exactObject(value,['release','rulesetId','sha256','updateTime']);
    if(row.release!==release(type)||typeof row.rulesetId!=='string'||!/^projects\/shiftoryx-public-demo\/rulesets\/[a-zA-Z0-9_-]+$/.test(row.rulesetId))fail('RULES_IDENTITY');
    requireDigest(row.sha256);if(timestamp(row.updateTime)>timestamp(item.observedAt))fail('RULES_UPDATE_TIME');
  }else if(type==='CONTROL'){
    const row=exactObject(value,['tenantId','representation','stateObservedAt','controlObservedAt','raw']);
    if(!DEMO_TENANT_IDS.includes(row.tenantId)||item.resource!==`controls/${row.tenantId}`)fail('CONTROL_TENANT');
    observed(row.stateObservedAt);observed(row.controlObservedAt);
    const legacy=row.representation==='OBSERVED_LEGACY_IDLE';
    if(!legacy&&row.representation!=='OBSERVED_TARGET_OPEN')fail('CONTROL_REPRESENTATION');
    const raw=exactObject(row.raw,['generation','resetting','weekStart','lastResetAt','lease','leaseUntil','previousOwner',...(legacy?[]:['phase','controlPhase'])]);
    integer(raw.generation,1);integer(raw.lastResetAt);date(raw.weekStart);
    if(raw.resetting!==false||raw.lease!==null||raw.leaseUntil!==0||raw.previousOwner!==null||
      raw.lastResetAt>Math.min(timestamp(row.stateObservedAt),timestamp(row.controlObservedAt))||
      !legacy&&(raw.phase!=='OPEN'||raw.controlPhase!=='OPEN'))fail('CONTROL_NOT_IDLE');
    return legacy?'LEGACY_IDLE_COMPATIBLE':'TARGET_OPEN_OBSERVED';
  }else if(type==='FUNCTION'){
    const row=exactObject(value,['name','revision','runtime','region','state','serviceIdentity','trigger','source','timeoutSeconds','memory','flags']);
    if(!DEMO_FUNCTIONS.includes(row.name)||!item.resource.endsWith('/functions/'+row.name)||row.runtime!=='nodejs22'||row.region!=='us-central1'||
      row.serviceIdentity!==DEMO_RUNTIME_SA||!['ACTIVE','FAILED','INACTIVE'].includes(row.state))fail('FUNCTION_IDENTITY');
    id(row.revision);if(!row.revision.startsWith(row.name.toLowerCase()+'-'))fail('FUNCTION_REVISION');
    const trigger=DEMO_SCHEDULES.includes(row.name)?'SCHEDULE':['publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'].includes(row.name)?'HTTP':'CALLABLE';
    if(row.trigger!==trigger)fail('FUNCTION_TRIGGER');integer(row.timeoutSeconds,1);
    if(!['256Mi','512Mi','1Gi','2Gi'].includes(row.memory))fail('FUNCTION_MEMORY');
    const source=exactObject(row.source,['bucket','object','generation']);
    if(source.bucket!=='gcf-v2-sources-848554493137-us-central1'||source.object!==row.name+'/function-source.zip'||typeof source.generation!=='string'||!/^[1-9]\d*$/.test(source.generation))fail('FUNCTION_SOURCE');
    const flags=exactObject(row.flags,['PUBLIC_DEMO_ENABLED','PUBLIC_DEMO_AUTH_BROKER_ENABLED','PUBLIC_DEMO_PDF_SERVER_ENABLED','PUBLIC_DEMO_MUTATION_SERVER_ENABLED']);
    if(Object.values(flags).some(v=>![null,'true','false'].includes(v)))fail('FUNCTION_FLAGS');
  }else if(type==='SCHEDULE'){
    const row=exactObject(value,['functionName','id','target','state','cadence','timeZone']);
    if(!DEMO_SCHEDULES.includes(row.functionName)||row.id!==item.resource||row.target!==`https://us-central1-shiftoryx-public-demo.cloudfunctions.net/${row.functionName}`||
      !['ENABLED','PAUSED'].includes(row.state)||row.cadence!==(row.functionName==='cleanupAuthTickets'?'every 15 minutes':'every day 04:00')||
      row.timeZone!==(row.functionName==='cleanupAuthTickets'?'UTC':'Europe/Athens'))fail('SCHEDULE_IDENTITY');
  }else if(type==='HOST_ASSIGNMENT'){
    const row=exactObject(value,['hostname','projectId','deploymentId']);
    if(!DEMO_HOSTS.includes(row.hostname)||!item.resource.endsWith('/domains/'+row.hostname)||row.projectId!=='prj_E2ORHb1pVLrUtEppzyusna56ZPiH'||
      typeof row.deploymentId!=='string'||!/^dpl_[A-Za-z0-9]+$/.test(row.deploymentId))fail('HOST_IDENTITY');
  }else if(type==='RETENTION'){
    const row=exactObject(value,['tenantId','generation','metadataSha256']);
    if(!DEMO_TENANT_IDS.includes(row.tenantId)||!item.resource.endsWith('/'+row.tenantId))fail('RETENTION_IDENTITY');
    integer(row.generation,1);requireDigest(row.metadataSha256);
  }else if(type==='STORAGE_INVENTORY'){
    const row=exactObject(value,['paginationComplete','objects']);
    if(row.paginationComplete!==true||!Array.isArray(row.objects)||row.objects.length>1000)fail('STORAGE_INCOMPLETE');
    const seen=new Set<string>();
    for(const value of row.objects){const obj=exactObject(value,['name','generation','size','contentType','crc32c','md5Hash','updatedAt']);
      if(typeof obj.name!=='string'||obj.name.includes('..')||!DEMO_TENANT_IDS.some(t=>obj.name.startsWith(`tenants/${t}/schedule-publications/`)||obj.name.startsWith(`monthly_schedule_pdfs/${t}/`))||
        !/^[A-Za-z0-9._/-]+$/.test(obj.name)||typeof obj.generation!=='string'||!/^[1-9]\d*$/.test(obj.generation)||obj.contentType!=='application/pdf')fail('STORAGE_OBJECT_IDENTITY');
      integer(obj.size);if(timestamp(obj.updatedAt)>timestamp(item.observedAt))fail('STORAGE_UPDATED_TIME');
      for(const k of ['crc32c','md5Hash'])if(obj[k]!==null&&(typeof obj[k]!=='string'||!/^[A-Za-z0-9+/=]{1,128}$/.test(obj[k])))fail('STORAGE_HASH');
      const key=obj.name+'#'+obj.generation;if(seen.has(key))fail('STORAGE_DUPLICATE');seen.add(key);
    }
  }
}
export function parseObservationDossier(input:string|Buffer,expectedDigest:string,now=Date.now()){
  const bytes=Buffer.isBuffer(input)?Buffer.from(input):typeof input==='string'?Buffer.from(input):fail('INPUT');
  if(bytes.length===0||bytes.length>512*1024)fail('INPUT_SIZE');requireDigest(expectedDigest);
  if(byteDigest(bytes)!==expectedDigest)fail('SEAL');
  let parsed:unknown;try{parsed=parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{fail('JSON');}
  const dossier=exactObject(parsed,['schemaVersion','kind','qualificationSha','projectId','projectNumber','database','region','bucket','captureStartedAt','captureCompletedAt','observations']);
  if(dossier.schemaVersion!==1||dossier.kind!=='OBSERVATION_DOSSIER')fail('KIND');requireSha(dossier.qualificationSha);
  for(const [key,want]of Object.entries(DEMO_IDENTITY))if(dossier[key]!==want)fail('IDENTITY');
  const start=timestamp(dossier.captureStartedAt),end=timestamp(dossier.captureCompletedAt);
  if(!Number.isSafeInteger(now)||start>end||end>now||end-start>OBSERVATION_WINDOW_MS||now-end>OBSERVATION_WINDOW_MS)fail('STALE_OR_MIXED_WINDOW');
  if(!Array.isArray(dossier.observations)||!dossier.observations.length||dossier.observations.length>200)fail('OBSERVATIONS');
  const resources=new Set<string>(),sources=new Set<string>(),classifications:Record<string,string>={};
  for(const v of dossier.observations){
    if(!v||typeof v!=='object')fail('OBSERVATION_SCHEMA');
    const present=v.state==='OBSERVED_PRESENT';
    const item=exactObject(v,['resourceType','resource','state','observedAt','source',...(present?['value']:[])]);
    if(!['OBSERVED_PRESENT','AUTHORITATIVELY_ABSENT','NOT_OBSERVED','UNREADABLE'].includes(item.state))fail('STATE');
    resource(item.resourceType,item.resource);if(resources.has(item.resource))fail('DUPLICATE_RESOURCE');resources.add(item.resource);
    const at=timestamp(item.observedAt);if(at<start||at>end)fail('OBSERVATION_WINDOW');
    const source=exactObject(item.source,['id','method','httpStatus']);id(source.id);if(sources.has(source.id))fail('DUPLICATE_SOURCE');sources.add(source.id);
    if(item.state==='NOT_OBSERVED'){if(source.method!=='NONE'||source.httpStatus!==null)fail('NOT_OBSERVED_SOURCE');}
    else if(source.method!=='GET'||present&&source.httpStatus!==200||item.state==='AUTHORITATIVELY_ABSENT'&&
      (source.httpStatus!==404||!['RETENTION','FUNCTION'].includes(item.resourceType))||item.state==='UNREADABLE'&&![0,401,403,429,500,502,503,504].includes(source.httpStatus))fail('SOURCE_STATUS');
    if(present){const classification=presentValue(item,start,end);if(classification)classifications[item.resource]=classification;}
  }
  return freeze({dossier,classifications,sha256:expectedDigest,restorationAuthority:false,cutoverAuthorized:false});
}
