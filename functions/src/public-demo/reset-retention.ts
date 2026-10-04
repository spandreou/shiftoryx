import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../src/services/publicationIntentV3.ts';
import {isIsoDateV3} from '../../../src/scheduler-engine-v3/config.ts';
import {demoOwnerUid,type DemoTenant} from './policy.ts';
import {UUID_V4,validatePublishTuple} from './pdf-authorization.ts';
import {ADMISSION_LIMITS,assertRetainedIntentCount,validatePdfLimitState,settleRetainedDemoIntents} from './admission.ts';
import {assertResetLease,RESET_LEASE_MS,resetFail,type ResetLease,type ResetTransaction} from './reset-state.ts';

const plain=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value:Record<string,any>,keys:readonly string[])=>Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const int=(value:unknown,min=0)=>Number.isSafeInteger(value)&&Number(value)>=min;
const uuid=(value:unknown)=>typeof value==='string'&&UUID_V4.test(value);
const hash=(value:unknown)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
const bad=():never=>resetFail('RESET_PDF_RECOVERY_REQUIRED');
const tombstoneKeys=['intentId','tenantId','uid','generation','publicationId','inputHash','state','invalidatedAt'];
const liveKeys=['request','inputHash','tenantId','uid','generation','publicationId','version','periodKey','publishedAt',
  'snapshotHash','rendererDigest','attemptId','state'];
const liveStates=['RESERVED','RENDERED','IO_INTENT','OBJECT_STORED','FINALIZED','CANCEL_PENDING','CANCELLED','IO_UNCERTAIN'];
function retainedRecord(data:unknown,id:string,tenant:DemoTenant,baseGeneration:number,now:number){
  if(!uuid(id)||!plain(data))bad();
  try{if(Buffer.byteLength(canonicalJson(data),'utf8')>4096)bad();}catch{bad();}
  if(data.tenantId!==tenant||!int(data.generation,1)||data.generation>baseGeneration||
    data.uid!==demoOwnerUid(tenant,data.generation)||!uuid(data.publicationId)||!hash(data.inputHash))bad();
  if(data.state==='INVALIDATED'){
    if(!exact(data,tombstoneKeys)||data.intentId!==id||!int(data.invalidatedAt,1)||data.invalidatedAt>now)bad();
    return {id,data,expired:data.invalidatedAt<now-7*86400000};
  }
  if(!exact(data,liveKeys)||!liveStates.includes(data.state)||data.generation!==baseGeneration||
    !int(data.version,1)||!uuid(data.attemptId)||!hash(data.snapshotHash)||!hash(data.rendererDigest)||
    typeof data.publishedAt!=='string'||data.publishedAt.length!==24)bad();
  let request;try{request=validatePublishTuple(data.request);}catch{bad();}
  if(request.intentId!==id||createHash('sha256').update(canonicalJson(request)).digest('hex')!==data.inputHash)bad();
  const published=Date.parse(data.publishedAt);
  if(!Number.isFinite(published)||published>now||new Date(published).toISOString()!==data.publishedAt)bad();
  const period=/^(WEEK|MONTH)_(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(data.periodKey);
  if(!period||!isIsoDateV3(period[2])||!isIsoDateV3(period[3])||period[2]>period[3])bad();
  return {id,data,expired:false};
}
export function classifyPdfResetControl(value:unknown,generation:number,now:number):'CLEAR'|'WAIT'{
  if(value===undefined)return 'CLEAR';
  if(!plain(value)||Object.keys(value).some(key=>!['operationId','attemptId','kind','generation','stage','startedAt','heartbeatAt','cleanupUncertain'].includes(key))||
    !uuid(value.operationId)||!uuid(value.attemptId)||value.generation!==generation||
    !int(value.startedAt,1)||!int(value.heartbeatAt,1)||value.startedAt>value.heartbeatAt||
    value.heartbeatAt>now||now-value.heartbeatAt>120000||
    value.cleanupUncertain!==undefined&&typeof value.cleanupUncertain!=='boolean')bad();
  if(value.stage==='IO_UNCERTAIN'||value.cleanupUncertain===true)bad();
  if(value.kind==='PUBLISH'&&['RESERVED','RENDERED','IO_INTENT','OBJECT_STORED','CANCEL_PENDING'].includes(value.stage))return 'WAIT';
  if(value.kind==='DOWNLOAD'&&['DOWNLOAD_BUFFERING','DOWNLOAD_ADMITTED'].includes(value.stage)&&value.cleanupUncertain===undefined)return 'WAIT';
  return bad();
}
export async function inspectPdfResetOperation(tx:ResetTransaction,lease:ResetLease,now:number,clock:()=>number=()=>now):Promise<'CLEAR'|'WAIT'>{
  await assertResetLease(tx,lease,now);
  const control=await tx.get(`demoPdfControls/${lease.tenant}`);
  // The control may advance while asynchronous reads/transaction retries run.
  // Keep strict future-date rejection, but compare with time after the read.
  const observedAt=clock();if(!int(observedAt,1))bad();
  const classification=classifyPdfResetControl(control,lease.baseGeneration,observedAt);
  if(classification==='CLEAR')return classification;
  if(lease.phase!=='PRECHECK')bad();
  if(control!.kind==='PUBLISH'){
    const raw=await tx.get(`demoPdfRequests/${lease.tenant}/intents/${control!.operationId}`);
    const intent=retainedRecord(raw,control!.operationId,lease.tenant,lease.baseGeneration,clock()).data;
    if(intent.state!==control!.stage||intent.attemptId!==control!.attemptId||intent.state==='INVALIDATED')bad();
    const reservation=await tx.get(`tenants/${lease.tenant}/schedulePublicationReservations/${intent.publicationId}`);
    if(!reservation||reservation.transportVersion!==1||reservation.tenantId!==lease.tenant||
      reservation.generation!==lease.baseGeneration||reservation.publishedByUid!==intent.uid||
      reservation.intentId!==control!.operationId||reservation.attemptId!==control!.attemptId||
      reservation.state!==intent.state||reservation.version!==intent.version||reservation.snapshotHash!==intent.snapshotHash)bad();
  }
  return classification;
}
export async function inspectRetainedIntents(tx:ResetTransaction,lease:ResetLease,now:number,clock:()=>number=()=>now){
  const owned=await assertResetLease(tx,lease,now);
  if(await inspectPdfResetOperation(tx,lease,now,clock)==='WAIT')resetFail('RESET_PDF_BUSY');
  const [rawLimit,rows]=await Promise.all([tx.get(`demoPdfLimits/${lease.tenant}`),
    tx.list(`demoPdfRequests/${lease.tenant}/intents`,ADMISSION_LIMITS.retainedIntents+1)]);
  const observedAt=clock();if(!int(observedAt,1))bad();
  if(rows.length>ADMISSION_LIMITS.retainedIntents)resetFail('RESET_INTENT_CAPACITY');
  if(lease.initial&&rows.length>0)bad();
  // Missing zero counter is permitted only for explicit, empty bootstrap.
  if(lease.initial&&rawLimit===undefined&&rows.length===0)return {actual:0,limit:undefined,records:[],control:owned.control,observedAt};
  let limit;try{limit=validatePdfLimitState(rawLimit,lease.tenant);}catch{resetFail('RESET_RECOVERY_REQUIRED');}
  if(limit.retainedIntentCount!==rows.length)resetFail('RESET_INTENT_MISMATCH');
  assertRetainedIntentCount(limit,lease.tenant,rows.length);
  const records=rows.map(row=>retainedRecord(row.data,row.id,lease.tenant,lease.baseGeneration,observedAt));
  if(records.some(record=>!['FINALIZED','CANCELLED','INVALIDATED'].includes(record.data.state)))bad();
  return {actual:rows.length,limit,records,control:owned.control,observedAt};
}
export async function reconcileRetainedIntents(tx:ResetTransaction,lease:ResetLease,now:number,clock:()=>number=()=>now){
  if(lease.phase!=='PRECHECK')resetFail('RESET_LEASE_LOST');
  const inspection=await inspectRetainedIntents(tx,lease,now,clock);
  const selected=inspection.records.filter(record=>record.expired).slice(0,200);
  const removed=selected.length?await settleRetainedDemoIntents(tx,lease.tenant,
    selected.map(record=>`demoPdfRequests/${lease.tenant}/intents/${record.id}`),inspection.observedAt,lease.lease):0;
  if(removed!==selected.length)bad();
  tx.set(`demoControl/${lease.tenant}`,{...inspection.control,leaseUntil:now+RESET_LEASE_MS});
  return {actual:inspection.actual-removed,deleted:removed};
}
export async function invalidateRetainedIntents(tx:ResetTransaction,lease:ResetLease,now:number,clock:()=>number=()=>now){
  if(lease.phase!=='DESTRUCTIVE')resetFail('RESET_LEASE_LOST');
  const inspection=await inspectRetainedIntents(tx,lease,now,clock);
  const selected=inspection.records.filter(record=>record.expired||record.data.state!=='INVALIDATED').slice(0,200);
  const invalidated=selected.filter(record=>!record.expired).length;
  const removed=selected.length?await settleRetainedDemoIntents(tx,lease.tenant,
    selected.map(record=>`demoPdfRequests/${lease.tenant}/intents/${record.id}`),inspection.observedAt,lease.lease):0;
  if(removed!==selected.filter(record=>record.expired).length)bad();
  tx.set(`demoControl/${lease.tenant}`,{...inspection.control,leaseUntil:now+RESET_LEASE_MS});
  return {actual:inspection.actual-removed,deleted:removed,invalidated};
}
