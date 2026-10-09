import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {parseStrictJson} from './auditExceptionPolicy.ts';
import {captureReviewedContext} from './auditGateRuntime.ts';
import {validateRecoveryBaseline,validateMaintenanceSource} from './demoMaintenance.ts';
import {parseObservationDossier,byteDigest,exactObject,exactSet,requireDigest,requireSha,timestamp,
  DEMO_IDENTITY,DEMO_HOSTS,DEMO_FUNCTIONS,DEMO_RUNTIME_SA} from './demoObservation.ts';

type Row=Record<string,any>;type Sealed={bytes:Buffer|string;sha256:string};
export class CutoverError extends Error{readonly code:string;constructor(code:string){super('CUTOVER_'+code);this.code='CUTOVER_'+code;}}
const reject=(code:string):never=>{throw new CutoverError(code);};
const canonical=(v:any):string=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const observedFacts=(row:Row)=>row.resourceType==='CONTROL'?{
  tenantId:row.value.tenantId,representation:row.value.representation,raw:row.value.raw,
}:row.value??null;
function sealed(pair:Sealed){
  if(!pair||!['string','object'].includes(typeof pair.bytes)||!(typeof pair.bytes==='string'||Buffer.isBuffer(pair.bytes)))reject('INPUT');
  requireDigest(pair.sha256);const bytes=Buffer.from(pair.bytes);if(!bytes.length||bytes.length>4*1024*1024||byteDigest(bytes)!==pair.sha256)reject('INPUT_SEAL');
  try{return parseStrictJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as Row;}catch{reject('INPUT_JSON');}
}
export function maintenancePackageDigest(files:Map<string,Buffer>){
  const hash=createHash('sha256');for(const name of [...files.keys()].sort())hash.update(name+'\0').update(files.get(name)!).update('\0');return hash.digest('hex');
}
const artifactPath=(path:unknown)=>{
  if(typeof path!=='string'||!path||path.length>240||path.split('/').some(part=>!part||part==='.'||part==='..'||!/^[A-Za-z0-9._-]+$/.test(part)))reject('ARTIFACT_PATH');return path;
};
type Input={qualificationSha:string;expected:Row;observation:Sealed;currentObservation:Sealed;recovery:Sealed;target:Sealed;capabilities:Sealed;
  maintenance:{files:Map<string,Buffer>;sha256:string};targetArtifact:(path:string)=>Buffer;contextSha256:string;
  reviewedRuleDigests:{firestore:string;storage:string};now?:number};
export function validateCutoverPreconditions(input:Input){
  requireSha(input.qualificationSha);requireDigest(input.contextSha256);
  const expected=exactObject(input.expected,[...Object.keys(DEMO_IDENTITY),'aliases']);
  for(const [key,want]of Object.entries(DEMO_IDENTITY))if(expected[key]!==want)reject('EXPECTED_IDENTITY');exactSet(expected.aliases,DEMO_HOSTS);
  const recovery=sealed(input.recovery);
  if(recovery.status!=='VERIFIED')reject('RECOVERY_NOT_VERIFIED');
  try{if(validateRecoveryBaseline(recovery)!=='VERIFIED')reject('RECOVERY_NOT_VERIFIED');}catch(error){if(error instanceof CutoverError)throw error;reject('RECOVERY_INVALID');}
  const now=input.now??Date.now();
  if(timestamp(recovery.capturedAt)>now||now-timestamp(recovery.capturedAt)>60*60*1000)reject('RECOVERY_STALE');
  const previous=parseObservationDossier(input.observation.bytes,input.observation.sha256,now).dossier;
  const current=parseObservationDossier(input.currentObservation.bytes,input.currentObservation.sha256,now).dossier;
  if(previous.qualificationSha!==input.qualificationSha||current.qualificationSha!==input.qualificationSha)reject('QUALIFICATION_DRIFT');
  if(input.currentObservation.sha256===input.observation.sha256||timestamp(current.captureCompletedAt)<=timestamp(previous.captureCompletedAt)||
    timestamp(current.captureStartedAt)<timestamp(previous.captureCompletedAt))reject('OBSERVATION_REUSED');
  const maps=[previous,current].map(record=>new Map<string,Row>(record.observations.map((item:Row)=>[item.resource,item])));
  const [before,after]=maps;
  if(before.size!==after.size)reject('OBSERVATION_INVENTORY_DRIFT');
  const priorReads=new Set(previous.observations.map((row:Row)=>row.source.id));
  for(const [path,row]of before){const next=after.get(path);
    if(!next||row.state!==next.state||row.resourceType!==next.resourceType||canonical(observedFacts(row))!==canonical(observedFacts(next)))reject('OBSERVATION_DRIFT');
    if(priorReads.has(next.source.id)||timestamp(next.observedAt)<=timestamp(row.observedAt))reject('OBSERVATION_REUSED');
  }
  const observation=(type:string,match:(value:Row)=>boolean=()=>true)=>{
    const found=current.observations.filter((row:Row)=>row.resourceType===type&&row.state==='OBSERVED_PRESENT'&&match(row.value));
    if(found.length!==1)reject('REQUIRED_OBSERVATION');return found[0].value;
  };
  observation('PROJECT');exactSet(observation('AUTH').domains,recovery.authDomains);
  for(const [type,key]of [['FIRESTORE_RULES','firestoreRules'],['STORAGE_RULES','storageRules']]){
    const row=observation(type);if(row.rulesetId!==recovery[key].rulesetId||row.sha256!==recovery[key].sha256)reject('RECOVERY_RULES_DRIFT');
  }
  for(const row of recovery.hostAssignments){const host=observation('HOST_ASSIGNMENT',v=>v.hostname===row.hostname);
    if(host.deploymentId!==row.deploymentId)reject('RECOVERY_ALIAS_DRIFT');}
  const seenFunctions=current.observations.filter((row:Row)=>row.resourceType==='FUNCTION');
  exactSet(seenFunctions.map((row:Row)=>row.value?.name),recovery.functions.map((row:Row)=>row.name));
  for(const row of recovery.functions){const fn=observation('FUNCTION',v=>v.name===row.name);
    if(fn.revision!==row.revisionId||fn.state!==row.state||fn.runtime!==row.runtime||fn.region!==row.region||fn.serviceIdentity!==row.runtimeServiceAccount||fn.trigger!==row.trigger)reject('RECOVERY_FUNCTION_DRIFT');}
  for(const row of recovery.schedules){const schedule=observation('SCHEDULE',v=>v.functionName===row.functionName);
    if(schedule.id!==row.scheduleId||schedule.state!==row.state)reject('RECOVERY_SCHEDULE_DRIFT');}
  for(const row of recovery.demoState){const control=observation('CONTROL',v=>v.tenantId===row.tenantId);
    if(control.representation!=='OBSERVED_TARGET_OPEN'||control.raw.generation!==row.generation||control.raw.resetting!==row.resetting||
      control.raw.phase!==row.phase||control.raw.controlPhase!==row.controlPhase||control.raw.weekStart!==row.weekStart||control.raw.lastResetAt!==row.lastResetAt||
      control.raw.leaseUntil!==row.leaseUntil)reject('RECOVERY_CONTROL_DRIFT');
    if(Math.abs(timestamp(control.stateObservedAt)-timestamp(control.controlObservedAt))>60000)reject('CONTROL_READ_WINDOW');
  }
  for(const row of recovery.admissionAndRetention)for(const [type,digest]of [['demoAdmission','admissionDigest'],['demoAuditReceipts','auditReceiptsDigest'],['demoPdfLimits','pdfLimitsDigest']]){
    const retained=observation('RETENTION',v=>v.tenantId===row.tenantId&&after.get(`${type}/${row.tenantId}`)?.value===v);
    if(retained.metadataSha256!==row[digest])reject('RECOVERY_RETENTION_DRIFT');
  }
  const objects=observation('STORAGE_INVENTORY').objects;
  if(objects.length!==recovery.storageObjects.length)reject('RECOVERY_STORAGE_DRIFT');
  for(const row of recovery.storageObjects){const obj=objects.find((v:Row)=>v.name===row.name&&v.generation===row.generation);
    if(!obj||obj.size!==row.sizeBytes||obj.crc32c!==row.crc32c||obj.md5Hash!==row.md5Hash||obj.updatedAt!==row.updatedAt)reject('RECOVERY_STORAGE_DRIFT');}
  const target=exactObject(sealed(input.target),['schemaVersion','kind','qualificationSha','contextSha256',...Object.keys(DEMO_IDENTITY),'aliases','frontend','firestoreRules','storageRules','functions']);
  if(target.schemaVersion!==1||target.kind!=='DEMO_TARGET_PACKAGE'||target.qualificationSha!==input.qualificationSha||target.contextSha256!==input.contextSha256)reject('TARGET_CONTEXT');
  for(const [key,want]of Object.entries(DEMO_IDENTITY))if(target[key]!==want)reject('TARGET_IDENTITY');exactSet(target.aliases,DEMO_HOSTS);
  if(!Array.isArray(target.functions))reject('TARGET_FUNCTIONS');exactSet(target.functions.map((row:Row)=>row.name),DEMO_FUNCTIONS);
  const artifacts=new Map<string,string>();
  const checkArtifact=(row:Row)=>{const path=artifactPath(row.path);requireDigest(row.sha256);const bytes=input.targetArtifact(path);
    if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>64*1024*1024||byteDigest(Buffer.from(bytes))!==row.sha256)reject('ARTIFACT_DIGEST');
    if(artifacts.has(path)&&artifacts.get(path)!==row.sha256)reject('ARTIFACT_CONFLICT');artifacts.set(path,row.sha256);};
  for(const key of ['frontend','firestoreRules','storageRules'])checkArtifact(exactObject(target[key],['path','sha256']));
  if(!input.reviewedRuleDigests||target.firestoreRules.sha256!==input.reviewedRuleDigests.firestore||target.storageRules.sha256!==input.reviewedRuleDigests.storage)reject('TARGET_RULES_NOT_REVIEWED');
  for(const value of target.functions){const row=exactObject(value,['name','path','sha256','runtime','region','serviceIdentity']);
    if(row.runtime!=='nodejs22'||row.region!=='us-central1'||row.serviceIdentity!==DEMO_RUNTIME_SA)reject('TARGET_FUNCTION_IDENTITY');checkArtifact(row);}
  const cap=exactObject(sealed(input.capabilities),['schemaVersion','kind','qualificationSha','contextSha256','broker','globalEntry','testEvidenceSha256','reviewEvidenceSha256','observedAt']);
  if(cap.schemaVersion!==1||cap.kind!=='LOCAL_CONTAINMENT_ATTESTATION'||cap.qualificationSha!==input.qualificationSha||cap.contextSha256!==input.contextSha256||
    cap.broker!=='AVAILABLE_AND_TESTED_LOCAL'||cap.globalEntry!=='AVAILABLE_AND_TESTED_LOCAL')reject('CAPABILITY_NOT_TESTED');
  requireDigest(cap.testEvidenceSha256);requireDigest(cap.reviewEvidenceSha256);
  if(timestamp(cap.observedAt)>now||now-timestamp(cap.observedAt)>60*60*1000)reject('CAPABILITY_STALE');
  requireDigest(input.maintenance.sha256);
  if(maintenancePackageDigest(input.maintenance.files)!==input.maintenance.sha256)reject('MAINTENANCE_DIGEST');
  // Recheck caller-owned bytes and artifacts after all validation/hooks. A PASS
  // is only a local evidence decision, never a durable deployment capability.
  for(const pair of [input.recovery,input.observation,input.currentObservation,input.target,input.capabilities])if(byteDigest(pair.bytes)!==pair.sha256)reject('EVIDENCE_CHANGED');
  for(const [path,digest]of artifacts)if(byteDigest(input.targetArtifact(path))!==digest)reject('ARTIFACT_CHANGED');
  if(maintenancePackageDigest(input.maintenance.files)!==input.maintenance.sha256)reject('MAINTENANCE_CHANGED');
  return {status:'LOCAL_PRECONDITIONS_VALID',deploymentAuthorized:false};
}
export function captureCutoverContext(root:string){
  const extras=['scripts/lib/demoObservation.ts','scripts/lib/demoCutover.ts','scripts/validate-public-demo-cutover-preconditions.mjs',
    'scripts/lib/demoMaintenance.ts','maintenance/public-demo/live-baseline.schema.json','maintenance/public-demo/FUNCTION_CONTAINMENT.md'];
  return byteDigest(canonical({source:captureReviewedContext(root),validator:Object.fromEntries(extras.map(path=>[path,byteDigest(readFileSync(join(root,path)))]))}));
}
export function safeArtifactReader(parent:string){
  const base=realpathSync(parent);
  return (name:string)=>{artifactPath(name);const path=join(base,name),real=realpathSync(path),rel=relative(base,real);
    if(isAbsolute(rel)||rel==='..'||rel.startsWith('..'+sep)||lstatSync(path).isSymbolicLink()||!lstatSync(real).isFile())reject('ARTIFACT_OUTSIDE_PACKAGE');
    if(lstatSync(real).size>64*1024*1024)reject('ARTIFACT_SIZE');return readFileSync(real);};
}
export function loadSealedFile(path:string,sha256:string):Sealed{
  requireDigest(sha256);if(!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()||lstatSync(path).size>4*1024*1024)reject('INPUT_FILE');
  const pair={bytes:readFileSync(path),sha256};sealed(pair);return pair;
}
export function assertQualificationHead(root:string,sha:string){requireSha(sha);let actual:string;
  try{actual=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();}catch{reject('GIT_HEAD_UNAVAILABLE');}
  if(actual!==sha)reject('GIT_HEAD_DRIFT');
}
export const CUTOVER_ROOT=fileURLToPath(new URL('../../',import.meta.url));
export function readMaintenanceArtifact(directory:string,expectedDigest:string,source=join(CUTOVER_ROOT,'maintenance/public-demo')){
  const checked=validateMaintenanceSource(source),files=new Map<string,Buffer>();
  for(const [name,want]of checked.bytes){const file=join(directory,['index.html','style.css','vercel.json'].includes(name)?'web':'controls',name);
    if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())reject('MAINTENANCE_FILE');const bytes=readFileSync(file);
    if(byteDigest(bytes)!==byteDigest(want))reject('MAINTENANCE_SOURCE_DRIFT');files.set(name,bytes);}
  if(maintenancePackageDigest(files)!==expectedDigest)reject('MAINTENANCE_DIGEST');return {files,sha256:expectedDigest};
}
