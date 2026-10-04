import {createHash} from 'node:crypto';
import {canonicalJson} from '../../../src/services/publicationIntentV3.ts';
import {demoOwnerUid,requireDemoTenant,type DemoTenant} from './policy.ts';
import {UUID_V4,authenticatePdfRequest,authorizePdfTransaction,createDemoPdfAuthenticator,
  type PdfIdentity,type PdfRequest,type TokenVerifier,type DocumentReader} from './pdf-authorization.ts';
import type {App} from 'firebase-admin/app';

export type AdmissionIdentity={tenant:DemoTenant;uid:string;generation:number};
export type CommandPrefix='emp'|'abs'|'ann'|'set'|'drf'|'aud';
export type CommandOperation='emp.create'|'emp.update'|'emp.active'|'emp.delete'|'abs.create'|'abs.update'|'abs.delete'|
  'ann.create'|'ann.delete'|'set.save'|'drf.save'|'aud.export';
export const ADMISSION_LIMITS=Object.freeze({successfulMutations:256,draftSaveCount:64,shiftWriteOps:5000,
  employeeCreates:32,absenceCreates:64,announcementCreates:32,draftCreates:32,shiftCreates:3000,
  pdfIntentCreates:32,auditOnlyCount:768,nextAuditSequence:1024,primaryReceipts:256,auditReceipts:768,
  dailyMutations:512,dailyShiftWrites:10000,dailyAuditOnly:1000,minuteAttempts:60,retainedIntents:800});
export class AdmissionError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.name='AdmissionError';this.code=code;}
}
const invalid=(code:string):never=>{throw new AdmissionError(code);};
const prefixes:readonly CommandPrefix[]=['emp','abs','ann','set','drf','aud'];
const operations:readonly CommandOperation[]=['emp.create','emp.update','emp.active','emp.delete','abs.create','abs.update','abs.delete',
  'ann.create','ann.delete','set.save','drf.save','aud.export'];
const stateKeys=['tenantId','generation','successfulMutations','draftSaveCount','shiftWriteOps','employeeCreates','absenceCreates',
  'announcementCreates','draftCreates','shiftCreates','pdfIntentCreates','auditOnlyCount','nextAuditSequence','receipts'];
const dailyKeys=['tenantId','utcDay','successfulMutations','shiftWriteOps','auditOnlyEvents'];
const rateKeys=['tenantId','minute','attempts'];
const pdfLimitKeys=['retainedIntentCount','hour','count','publishMinute','publishRequestCount','downloadMinute','downloadCount','utcDay','dayCount'];
const plain=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const exact=(v:unknown,keys:readonly string[])=>plain(v)&&Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k));
const boundedInt=(v:unknown,max:number)=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const byteSize=(v:unknown)=>{try{return Buffer.byteLength(canonicalJson(v),'utf8');}catch{return Infinity;}};
const stateInvalid=():never=>invalid('ADMISSION_STATE_INVALID');

export type PrimaryReceipt={generation:number;operation:CommandOperation;hash:string;result:Record<string,unknown>};
export type AdmissionState={tenantId:DemoTenant;generation:number;successfulMutations:number;draftSaveCount:number;shiftWriteOps:number;
  employeeCreates:number;absenceCreates:number;announcementCreates:number;draftCreates:number;shiftCreates:number;
  pdfIntentCreates:number;auditOnlyCount:number;nextAuditSequence:number;receipts:Record<string,PrimaryReceipt>};
export type AuditReceiptState={tenantId:DemoTenant;generation:number;receipts:Record<string,PrimaryReceipt>};
export type DailyState={tenantId:DemoTenant;utcDay:string;successfulMutations:number;shiftWriteOps:number;auditOnlyEvents:number};
export type RateState={tenantId:DemoTenant;minute:number;attempts:number};

export function initialAdmissionState(tenantValue:unknown,generation:number,fixtureEmployees:number,fixtureAbsences:number):AdmissionState {
  const tenantId=requireDemoTenant(tenantValue);
  if(!Number.isSafeInteger(generation)||generation<1||!boundedInt(fixtureEmployees,32)||!boundedInt(fixtureAbsences,64))stateInvalid();
  return {tenantId,generation,successfulMutations:0,draftSaveCount:0,shiftWriteOps:0,employeeCreates:fixtureEmployees,
    absenceCreates:fixtureAbsences,announcementCreates:0,draftCreates:0,shiftCreates:0,pdfIntentCreates:0,
    auditOnlyCount:0,nextAuditSequence:0,receipts:{}};
}
export function initialAuditReceiptState(tenantValue:unknown,generation:number):AuditReceiptState {
  const tenantId=requireDemoTenant(tenantValue);
  if(!Number.isSafeInteger(generation)||generation<1)stateInvalid();
  return {tenantId,generation,receipts:{}};
}
function validateReceiptMap(value:unknown,tenant:DemoTenant,generation:number,kind:'primary'|'audit'){
  if(!plain(value))stateInvalid();
  const entries=Object.entries(value),max=kind==='primary'?ADMISSION_LIMITS.primaryReceipts:ADMISSION_LIMITS.auditReceipts;
  if(entries.length>max)stateInvalid();
  for(const [id,receipt] of entries){
    const prefix=id.slice(0,id.indexOf('_')) as CommandPrefix;
    try{assertCommandId(id,prefix);}catch{stateInvalid();}
    if(kind==='primary'&&prefix==='aud'||kind==='audit'&&prefix!=='aud'||!exact(receipt,['generation','operation','hash','result']))stateInvalid();
    const row=receipt as PrimaryReceipt;
    if(row.generation!==generation||!operations.includes(row.operation)||!row.operation.startsWith(prefix+'.')||
      typeof row.hash!=='string'||!/^[0-9a-f]{64}$/.test(row.hash)||!plain(row.result)||
      Object.keys(row.result).length>4||byteSize(row)>256)stateInvalid();
    for(const [key,item] of Object.entries(row.result))if(!['id','revision','status','sequence'].includes(key)||
      !(item===null||typeof item==='boolean'||typeof item==='string'&&Buffer.byteLength(item,'utf8')<=100||boundedInt(item,Number.MAX_SAFE_INTEGER)))stateInvalid();
  }
  void tenant;
  return value;
}
export function validateAdmissionState(value:unknown,tenantValue:unknown,generation:number):AdmissionState {
  const tenant=requireDemoTenant(tenantValue);
  if(!exact(value,stateKeys))stateInvalid();
  const row=value as AdmissionState;
  if(row.tenantId!==tenant||row.generation!==generation||!Number.isSafeInteger(generation)||generation<1)stateInvalid();
  for(const key of ['successfulMutations','draftSaveCount','shiftWriteOps','employeeCreates','absenceCreates','announcementCreates',
    'draftCreates','shiftCreates','pdfIntentCreates','auditOnlyCount','nextAuditSequence'] as const){
    if(!boundedInt(row[key],ADMISSION_LIMITS[key]))stateInvalid();
  }
  validateReceiptMap(row.receipts,tenant,generation,'primary');
  if(Object.keys(row.receipts).length!==row.successfulMutations||
    row.nextAuditSequence!==row.successfulMutations+row.auditOnlyCount||byteSize(row)>128*1024)stateInvalid();
  return row;
}
export function validateAuditReceiptState(value:unknown,tenantValue:unknown,generation:number):AuditReceiptState {
  const tenant=requireDemoTenant(tenantValue);
  if(!exact(value,['tenantId','generation','receipts']))stateInvalid();
  const row=value as AuditReceiptState;
  if(row.tenantId!==tenant||row.generation!==generation||!Number.isSafeInteger(generation)||generation<1)stateInvalid();
  validateReceiptMap(row.receipts,tenant,generation,'audit');
  if(byteSize(row)>512*1024)stateInvalid();
  return row;
}
export function validateDailyState(value:unknown,tenantValue:unknown,utcDay:string):DailyState {
  const tenantId=requireDemoTenant(tenantValue);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(utcDay))stateInvalid();
  if(value===undefined)return {tenantId,utcDay,successfulMutations:0,shiftWriteOps:0,auditOnlyEvents:0};
  if(!exact(value,dailyKeys))stateInvalid();const row=value as DailyState;
  if(row.tenantId!==tenantId||typeof row.utcDay!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.utcDay)||
    !boundedInt(row.successfulMutations,ADMISSION_LIMITS.dailyMutations)||
    !boundedInt(row.shiftWriteOps,ADMISSION_LIMITS.dailyShiftWrites)||
    !boundedInt(row.auditOnlyEvents,ADMISSION_LIMITS.dailyAuditOnly))stateInvalid();
  if(row.utcDay>utcDay)stateInvalid();
  return row.utcDay===utcDay?row:{tenantId,utcDay,successfulMutations:0,shiftWriteOps:0,auditOnlyEvents:0};
}
export function validateRateState(value:unknown,tenantValue:unknown,minute:number):RateState {
  const tenantId=requireDemoTenant(tenantValue);
  if(!boundedInt(minute,Number.MAX_SAFE_INTEGER))stateInvalid();
  if(value===undefined)return {tenantId,minute,attempts:0};
  if(!exact(value,rateKeys))stateInvalid();const row=value as RateState;
  if(row.tenantId!==tenantId||!boundedInt(row.minute,Number.MAX_SAFE_INTEGER)||!boundedInt(row.attempts,ADMISSION_LIMITS.minuteAttempts))stateInvalid();
  if(row.minute>minute)stateInvalid();
  return row.minute===minute?row:{tenantId,minute,attempts:0};
}
export function validatePdfLimitState(value:unknown,tenantValue:unknown):Record<string,unknown> {
  requireDemoTenant(tenantValue);
  if(!plain(value)||Object.keys(value).some(k=>!pdfLimitKeys.includes(k))||!boundedInt(value.retainedIntentCount,ADMISSION_LIMITS.retainedIntents))stateInvalid();
  for(const [window,count,max]of [['hour','count',30],['publishMinute','publishRequestCount',60],
    ['downloadMinute','downloadCount',60],['utcDay','dayCount',100]] as const){
    if(Object.hasOwn(value,window)!==Object.hasOwn(value,count))stateInvalid();
    if(Object.hasOwn(value,count)&&!boundedInt(value[count],max))stateInvalid();
  }
  for(const [key,item]of Object.entries(value)){
    if(key==='retainedIntentCount')continue;
    if(key==='utcDay'){if(typeof item!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item))stateInvalid();}
    else if(!boundedInt(item,Number.MAX_SAFE_INTEGER))stateInvalid();
  }
  return value;
}
export function assertRetainedIntentCount(value:unknown,tenantValue:unknown,actualCount:number):number {
  const state=validatePdfLimitState(value,tenantValue);
  if(!boundedInt(actualCount,ADMISSION_LIMITS.retainedIntents)||state.retainedIntentCount!==actualCount)stateInvalid();
  return actualCount;
}

export function assertCommandId(value:unknown,prefix:CommandPrefix):string {
  if(!prefixes.includes(prefix)||typeof value!=='string'||!value.startsWith(prefix+'_')||!UUID_V4.test(value.slice(prefix.length+1)))invalid('ADMISSION_INVALID_COMMAND');
  return value;
}

export function commandDigest(identity:AdmissionIdentity,operation:CommandOperation,input:unknown):string {
  const tenant=requireDemoTenant(identity.tenant);
  if(!Number.isSafeInteger(identity.generation)||identity.generation<1||identity.uid!==demoOwnerUid(tenant,identity.generation)||!operations.includes(operation))invalid('ADMISSION_INVALID_COMMAND');
  let canonical:string;
  try{canonical=canonicalJson({tenant,generation:identity.generation,operation,input});}catch{invalid('ADMISSION_INVALID_COMMAND');}
  if(Buffer.byteLength(canonical,'utf8')>(operation==='aud.export'?4*1024:512*1024))invalid('ADMISSION_INPUT_TOO_LARGE');
  return createHash('sha256').update(canonical,'utf8').digest('hex');
}

// Mutation handlers share the already reviewed PDF identity boundary. No
// caller-supplied tenant/path participates in authorization.
export function authenticateMutationRequest(request:PdfRequest,verifier:TokenVerifier,env:Record<string,string|undefined>):Promise<PdfIdentity>{
  return authenticatePdfRequest(request,verifier,env);
}
export function createMutationAuthenticator(app:App,env:Record<string,string|undefined>=process.env){
  return createDemoPdfAuthenticator(app,env);
}
export async function authorizeMutationTransaction(reader:DocumentReader,identity:PdfIdentity):Promise<PdfIdentity>{
  await authorizePdfTransaction(reader,identity);
  return identity;
}

export interface AdmissionTransaction extends DocumentReader {
  list(path:string,limit:number):Promise<Array<{id:string;data:Record<string,unknown>}>>;
  set(path:string,value:Record<string,unknown>):void;
  create(path:string,value:Record<string,unknown>):void;
  delete(path:string):void;
}
export interface AdmissionDatabase {transaction<T>(run:(tx:AdmissionTransaction)=>Promise<T>):Promise<T>}
export type PrimaryDelta=Partial<Pick<AdmissionState,'employeeCreates'|'absenceCreates'|'announcementCreates'|'draftCreates'|'shiftCreates'|'draftSaveCount'|'shiftWriteOps'>>;
export type PrimaryCommand={commandId:string;operation:Exclude<CommandOperation,'aud.export'>;input:unknown;now:number;
  write:(tx:AdmissionTransaction)=>Promise<{result:Record<string,unknown>;delta:PrimaryDelta;auditTargetId?:string}>};

function commandPrefix(operation:CommandOperation):CommandPrefix{return operation.split('.')[0] as CommandPrefix;}
function checkCommand(identity:AdmissionIdentity,commandId:string,operation:CommandOperation,input:unknown){
  assertCommandId(commandId,commandPrefix(operation));return commandDigest(identity,operation,input);
}
function checkedNow(now:number){if(!Number.isSafeInteger(now)||now<=0)invalid('ADMISSION_INVALID_COMMAND');return now;}
function compareReceipt(receipt:PrimaryReceipt|undefined,identity:AdmissionIdentity,operation:CommandOperation,hash:string){
  if(!receipt)return undefined;
  if(receipt.generation!==identity.generation||receipt.operation!==operation||receipt.hash!==hash)invalid('ADMISSION_COMMAND_CONFLICT');
  return structuredClone(receipt.result);
}
function validatePrimaryDelta(operation:PrimaryCommand['operation'],value:PrimaryDelta){
  if(!plain(value))invalid('ADMISSION_INVALID_COMMAND');
  const keys=Object.keys(value),allowed=['employeeCreates','absenceCreates','announcementCreates','draftCreates','shiftCreates','draftSaveCount','shiftWriteOps'];
  if(keys.some(k=>!allowed.includes(k)||!boundedInt(value[k as keyof PrimaryDelta],449)))invalid('ADMISSION_INVALID_COMMAND');
  const createField=operation==='emp.create'?'employeeCreates':operation==='abs.create'?'absenceCreates':operation==='ann.create'?'announcementCreates':null;
  if(createField){if(keys.length!==1||value[createField]!==1)invalid('ADMISSION_INVALID_COMMAND');return;}
  if(operation==='drf.save'){
    if(value.draftSaveCount!==1||!boundedInt(value.draftCreates??0,1)||!boundedInt(value.shiftCreates??0,449)||
      !boundedInt(value.shiftWriteOps??0,449)||Number(value.shiftCreates??0)>Number(value.shiftWriteOps??0)||
      keys.some(k=>!['draftSaveCount','draftCreates','shiftCreates','shiftWriteOps'].includes(k)))invalid('ADMISSION_INVALID_COMMAND');
    return;
  }
  if(keys.length)invalid('ADMISSION_INVALID_COMMAND');
}
function validateResult(value:unknown):asserts value is Record<string,unknown>{
  if(!plain(value)||Object.keys(value).length>4||byteSize(value)>128)invalid('ADMISSION_INVALID_RESULT');
  for(const [key,item]of Object.entries(value))if(!['id','revision','status','sequence'].includes(key)||
    !(item===null||typeof item==='boolean'||typeof item==='string'&&Buffer.byteLength(item,'utf8')<=100||boundedInt(item,Number.MAX_SAFE_INTEGER)))invalid('ADMISSION_INVALID_RESULT');
}
function identityPaths(tenant:DemoTenant){return {admission:`demoAdmission/${tenant}`,auditReceipts:`demoAuditReceipts/${tenant}`,
  daily:`demoAdmissionDaily/${tenant}`,rate:`demoAdmissionRate/${tenant}`};}

/** A separate small transaction rejects floods before expensive typed validation. */
export async function chargeMutationAttempt(database:AdmissionDatabase,identity:PdfIdentity,
  input:{commandId:string;operation:CommandOperation;input:unknown;now:number}):Promise<boolean>{
  const hash=checkCommand(identity,input.commandId,input.operation,input.input),minute=Math.floor(checkedNow(input.now)/60000);
  return database.transaction(async tx=>{
    await authorizeMutationTransaction(tx,identity);
    const paths=identityPaths(identity.tenant),raw=await tx.get(paths.admission),state=validateAdmissionState(raw,identity.tenant,identity.generation);
    if(input.operation==='aud.export'){
      const audit=validateAuditReceiptState(await tx.get(paths.auditReceipts),identity.tenant,identity.generation);
      if(Object.keys(audit.receipts).length!==state.auditOnlyCount)stateInvalid();
      if(compareReceipt(audit.receipts[input.commandId],identity,input.operation,hash))return false;
    }else if(compareReceipt(state.receipts[input.commandId],identity,input.operation,hash))return false;
    const current=validateRateState(await tx.get(paths.rate),identity.tenant,minute);
    if(current.attempts>=ADMISSION_LIMITS.minuteAttempts)invalid('ADMISSION_LIMIT_REACHED');
    tx.set(paths.rate,{...current,attempts:current.attempts+1});return true;
  });
}

/** Only server-owned typed handlers may provide `write`; no HTTP input contains a path or callback. */
export async function runPrimaryAdmission(database:AdmissionDatabase,identity:PdfIdentity,command:PrimaryCommand):Promise<Record<string,unknown>>{
  const hash=checkCommand(identity,command.commandId,command.operation,command.input),now=checkedNow(command.now);
  const utcDay=new Date(now).toISOString().slice(0,10);
  return database.transaction(async tx=>{
    await authorizeMutationTransaction(tx,identity);
    const paths=identityPaths(identity.tenant),raw=await tx.get(paths.admission),state=validateAdmissionState(raw,identity.tenant,identity.generation);
    const replay=compareReceipt(state.receipts[command.commandId],identity,command.operation,hash);if(replay)return replay;
    const daily=validateDailyState(await tx.get(paths.daily),identity.tenant,utcDay);
    if(state.successfulMutations>=ADMISSION_LIMITS.successfulMutations||state.nextAuditSequence>=ADMISSION_LIMITS.nextAuditSequence||
      daily.successfulMutations>=ADMISSION_LIMITS.dailyMutations)invalid('ADMISSION_LIMIT_REACHED');
    // The typed writer reads actual target existence inside this transaction;
    // an earlier client/probe cannot supply its quota delta.
    const mutation=await command.write(tx);
    if(!plain(mutation)||!Object.hasOwn(mutation,'result')||!Object.hasOwn(mutation,'delta'))invalid('ADMISSION_INVALID_RESULT');
    validatePrimaryDelta(command.operation,mutation.delta);
    const result=mutation.result;validateResult(result);
    if(mutation.auditTargetId!==undefined&&
      (typeof mutation.auditTargetId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(mutation.auditTargetId)))
      invalid('ADMISSION_INVALID_RESULT');
    const next={...state,receipts:{...state.receipts},successfulMutations:state.successfulMutations+1,nextAuditSequence:state.nextAuditSequence+1};
    for(const [key,amount]of Object.entries(mutation.delta)){
      const field=key as keyof PrimaryDelta,nextValue=Number(next[field])+Number(amount);
      if(!boundedInt(nextValue,ADMISSION_LIMITS[field]))invalid('ADMISSION_LIMIT_REACHED');
      (next as any)[field]=nextValue;
    }
    const nextDaily={...daily,successfulMutations:daily.successfulMutations+1,
      shiftWriteOps:daily.shiftWriteOps+Number(mutation.delta.shiftWriteOps??0)};
    if(nextDaily.shiftWriteOps>ADMISSION_LIMITS.dailyShiftWrites)invalid('ADMISSION_LIMIT_REACHED');
    const receipt={generation:identity.generation,operation:command.operation,hash,result:structuredClone(result)};
    if(byteSize(receipt)>256)invalid('ADMISSION_INVALID_RESULT');
    next.receipts[command.commandId]=receipt;
    validateAdmissionState(next,identity.tenant,identity.generation);
    const sequence=state.nextAuditSequence,slot=String(sequence%512).padStart(3,'0');
    const event={tenantId:identity.tenant,generation:identity.generation,sequence,action:command.operation,
      actorUid:identity.uid,targetId:mutation.auditTargetId??(typeof result.id==='string'?result.id:''),at:now};
    if(byteSize(event)>1024)invalid('ADMISSION_INVALID_RESULT');
    tx.set(paths.admission,next);tx.set(paths.daily,nextDaily);tx.set(`tenants/${identity.tenant}/auditLogs/log_${slot}`,event);
    return structuredClone(result);
  });
}

/** Recent demo activity only: overwritten ring slots are not an immutable audit log. */
export async function runAuditOnlyAdmission(database:AdmissionDatabase,identity:PdfIdentity,
  command:{commandId:string;operation:'aud.export';input:unknown;now:number}):Promise<{status:'recorded';sequence:number}>{
  const hash=checkCommand(identity,command.commandId,command.operation,command.input),now=checkedNow(command.now);
  const utcDay=new Date(now).toISOString().slice(0,10);
  return database.transaction(async tx=>{
    await authorizeMutationTransaction(tx,identity);
    const paths=identityPaths(identity.tenant);
    const state=validateAdmissionState(await tx.get(paths.admission),identity.tenant,identity.generation);
    const audit=validateAuditReceiptState(await tx.get(paths.auditReceipts),identity.tenant,identity.generation);
    if(Object.keys(audit.receipts).length!==state.auditOnlyCount)stateInvalid();
    const replay=compareReceipt(audit.receipts[command.commandId],identity,command.operation,hash);
    if(replay)return replay as {status:'recorded';sequence:number};
    const daily=validateDailyState(await tx.get(paths.daily),identity.tenant,utcDay);
    if(state.auditOnlyCount>=ADMISSION_LIMITS.auditOnlyCount||state.nextAuditSequence>=ADMISSION_LIMITS.nextAuditSequence||
      daily.auditOnlyEvents>=ADMISSION_LIMITS.dailyAuditOnly)invalid('ADMISSION_LIMIT_REACHED');
    const sequence=state.nextAuditSequence,result={status:'recorded' as const,sequence};
    const receipt={generation:identity.generation,operation:command.operation,hash,result};
    if(byteSize(receipt)>256)invalid('ADMISSION_INVALID_RESULT');
    const nextAudit={...audit,receipts:{...audit.receipts,[command.commandId]:receipt}};
    const nextState={...state,auditOnlyCount:state.auditOnlyCount+1,nextAuditSequence:state.nextAuditSequence+1};
    const nextDaily={...daily,auditOnlyEvents:daily.auditOnlyEvents+1};
    validateAuditReceiptState(nextAudit,identity.tenant,identity.generation);
    validateAdmissionState(nextState,identity.tenant,identity.generation);
    const event={tenantId:identity.tenant,generation:identity.generation,sequence,action:'aud.export',actorUid:identity.uid,at:now};
    if(byteSize(event)>1024)invalid('ADMISSION_INVALID_RESULT');
    const slot=String(sequence%512).padStart(3,'0');
    tx.set(paths.admission,nextState);tx.set(paths.auditReceipts,nextAudit);tx.set(paths.daily,nextDaily);
    tx.set(`tenants/${identity.tenant}/auditLogs/log_${slot}`,event);
    return result;
  });
}

/** Called only by the exact-tenant reset worker; no generation reset or blind counter zero. */
export async function settleRetainedDemoIntents(tx:Pick<AdmissionTransaction,'get'|'set'|'delete'>,
  tenantValue:unknown,paths:readonly string[],now:number,lease:string):Promise<number>{
  const tenant=requireDemoTenant(tenantValue);
  if(!Array.isArray(paths)||paths.length>200||!Number.isSafeInteger(now)||now<=0||typeof lease!=='string'||!lease||lease.length>128)invalid('ADMISSION_INVALID_COMMAND');
  const prefix=`demoPdfRequests/${tenant}/intents/`,seen=new Set<string>();
  for(const path of paths){
    if(typeof path!=='string'||!path.startsWith(prefix)||!UUID_V4.test(path.slice(prefix.length))||seen.has(path))invalid('ADMISSION_INVALID_COMMAND');
    seen.add(path);
  }
  const limitPath=`demoPdfLimits/${tenant}`;
  const [control,rawLimit,...records]=await Promise.all([tx.get(`demoControl/${tenant}`),tx.get(limitPath),...paths.map(path=>tx.get(path))]);
  if(control?.lease!==lease)invalid('ADMISSION_LEASE_LOST');
  const limit=validatePdfLimitState(rawLimit,tenant),cutoff=now-7*86400000;
  const actions: Array<{path:string;kind:'delete'|'invalidate';value?:Record<string,unknown>}> = [];
  for(let index=0;index<paths.length;index++){
    const path=paths[index],value=records[index],id=path.slice(prefix.length);
    if(!plain(value)||value.tenantId!==tenant||typeof value.state!=='string'||
      (value.intentId!==undefined&&value.intentId!==id)||
      (value.request!==undefined&&(!plain(value.request)||value.request.intentId!==id))||
      (value.intentId===undefined&&value.request===undefined))stateInvalid();
    const invalidated=value.state==='INVALIDATED';
    if(invalidated&&(!Number.isSafeInteger(value.invalidatedAt)||Number(value.invalidatedAt)<=0))stateInvalid();
    if(['IO_INTENT','IO_UNCERTAIN','CANCEL_PENDING'].includes(value.state))stateInvalid();
    if(invalidated&&Number(value.invalidatedAt)<cutoff){actions.push({path,kind:'delete'});continue;}
    actions.push({path,kind:'invalidate',value:{intentId:id,tenantId:tenant,uid:value.uid??'',generation:value.generation??0,
      publicationId:value.publicationId??'',inputHash:value.inputHash??'',state:'INVALIDATED',invalidatedAt:invalidated?value.invalidatedAt:now}});
  }
  const removed=actions.filter(action=>action.kind==='delete').length;
  if(Number(limit.retainedIntentCount)<removed)stateInvalid();
  for(const action of actions){if(action.kind==='delete')tx.delete(action.path);else tx.set(action.path,action.value!);}
  if(removed)tx.set(limitPath,{...limit,retainedIntentCount:Number(limit.retainedIntentCount)-removed});
  return removed;
}
