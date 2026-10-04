// Phase 2A local core. No Firebase initialization, deployed handler, reset or browser wiring.
import {createHash,randomUUID} from 'node:crypto';
import {canonicalJson,normalizePreviewV3,onlyKeys,serializePreviewV3} from '../../../src/services/publicationIntentV3.ts';
import {analyzeDraftV3,refreshDraftPeopleV3,type DraftV3} from '../../../src/services/schedulerV3Service.ts';
import {buildPublicationV3} from '../../../src/services/schedulePublicationService.ts';
import {projectionTargetsV3,projectionPayloadV3} from '../../../src/services/publicationProjectionsV3.ts';
import {isIsoDateV3,validateSchedulerConfigV3} from '../../../src/scheduler-engine-v3/config.ts';
import {validateEmployeeProfileV3} from '../../../src/scheduler-engine-v3/employeeProfile.ts';
import type {SchedulePublicationV3} from '../../../src/scheduler-engine-v3/types.ts';
import {authorizePdfTransaction,parsePublishRequest,PdfError,fail,UUID_V4,type DocumentReader,type PdfIdentity,type PdfRequest,type PublishRequest} from './pdf-authorization.ts';
import {newPublicationId,publicationObjectPath,renderServerPublication,rendererDigest,validatePdfBytes,type PdfMetadata} from './pdf-transport.ts';
import {ADMISSION_LIMITS,validateAdmissionState,validatePdfLimitState} from './admission.ts';

export type PublicationState='RESERVED'|'RENDERED'|'IO_INTENT'|'OBJECT_STORED'|'FINALIZED'|'CANCEL_PENDING'|'CANCELLED'|'IO_UNCERTAIN';
export interface PdfTransaction extends DocumentReader {
  list(collectionPath:string,limit:number):Promise<Array<{id:string;data:Record<string,any>}>>;
  set(path:string,value:Record<string,any>):void;
  create(path:string,value:Record<string,any>):void;
  delete(path:string):void;
}
export interface PdfDatabase {transaction<T>(run:(tx:PdfTransaction)=>Promise<T>):Promise<T>}
export interface ImmutablePdfStorage {
  create(path:string,bytes:Uint8Array,options:{ifGenerationMatch:0;contentType:'application/pdf'}):Promise<{generation:string}>;
  /** Adapter must bound reads to <2 MiB and pin the exact generation when provided. */
  read(path:string,generation?:string):Promise<{bytes:Uint8Array;generation:string;contentType:string}>;
  remove(path:string,generation:string):Promise<void>;
}
export class StorageCreateError extends Error {
  readonly outcome:'REJECTED'|'CONFLICT';
  constructor(outcome:'REJECTED'|'CONFLICT'){super(outcome);this.outcome=outcome;}
}
type Dependencies={database:PdfDatabase;storage:ImmutablePdfStorage;authenticate:(request:PdfRequest)=>Promise<PdfIdentity>;
  render?:(snapshot:SchedulePublicationV3)=>Promise<Uint8Array>;rendererDigest?:string;now?:()=>number};
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const safeId=(v:unknown,max=100)=>typeof v==='string'&&new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(v);
const safeText=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=200&&!/[\u0000-\u001f\u007f]/.test(v);
function integrity(condition:unknown):asserts condition {if(!condition)fail('PDF_INTEGRITY_FAILURE');}
function validPeriod(d:Record<string,any>){
  integrity(isIsoDateV3(d.periodStart)&&isIsoDateV3(d.periodEnd));
  const start=new Date(d.periodStart+'T00:00:00Z'),end=new Date(d.periodEnd+'T00:00:00Z');
  if(d.periodType==='WEEK')integrity(start.getUTCDay()===1&&end.getTime()-start.getTime()===6*86400000);
  else if(d.periodType==='MONTH'){const next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);next.setUTCDate(0);integrity(start.getUTCDate()===1&&end.getTime()===next.getTime());}
  else fail('PDF_INTEGRITY_FAILURE');
}
async function reconstruct(tx:PdfTransaction,identity:PdfIdentity,input:PublishRequest):Promise<DraftV3>{
  const root=`tenants/${identity.tenant}`,d=await tx.get(`${root}/scheduleDrafts/${input.draftId}`);
  if(!d||d.revision!==input.draftRevision)fail('PREVIEW_CHANGED');
  integrity(d.id===input.draftId&&d.tenantId===identity.tenant&&d.schemaVersion===3&&d.config?.tenantId===identity.tenant);
  validPeriod(d);
  try{onlyKeys(d,['id','tenantId','schemaVersion','periodType','periodStart','periodEnd','config','employees','absences','options','updatedBy','revision','shiftDocumentIds','sourcePublicationId']);}catch{fail('PDF_INTEGRITY_FAILURE');}
  integrity(Array.isArray(d.shiftDocumentIds)&&d.shiftDocumentIds.length<=449&&new Set(d.shiftDocumentIds).size===d.shiftDocumentIds.length&&d.shiftDocumentIds.every((id:unknown)=>safeId(id,120)));
  const [shifts,people,absences,settings]=await Promise.all([
    Promise.all(d.shiftDocumentIds.map((id:string)=>tx.get(`${root}/shifts/${id}`))),tx.list(`${root}/employees`,101),tx.list(`${root}/absences`,1001),tx.get(`${root}/settings/scheduler`),
  ]);
  integrity(people.length<=100&&absences.length<=1000&&settings?.schedulerConfigV3?.tenantId===identity.tenant&&validateSchedulerConfigV3(settings.schedulerConfigV3).valid);
  for(const s of shifts)integrity(s&&s.draftId===d.id&&s.schedulerSchemaVersion===3);
  const currentPeople=people.map(({id,data})=>{
    integrity(safeId(id)&&safeText(data.fullName)&&(data.isActive===undefined||typeof data.isActive==='boolean'));
    integrity(data.schedulerV3===undefined||(data.schedulerV3&&validateEmployeeProfileV3(data.schedulerV3).valid));
    for(const value of [data.activeFrom,data.activeTo])integrity(value===undefined||value===null||(typeof value==='string'&&isIsoDateV3(value)));
    return {id,fullName:data.fullName,isActive:data.isActive!==false,schedulerV3:data.schedulerV3,activeFrom:data.activeFrom??null,activeTo:data.activeTo??null,...(data.color!==undefined?{color:data.color}:{})};
  });
  const currentAbsences=absences.map(({id,data})=>{
    integrity(safeId(id)&&safeId(data.employeeId)&&isIsoDateV3(data.startDate)&&isIsoDateV3(data.endDate)&&data.startDate<=data.endDate&&
      ['LEAVE','SICK','OTHER'].includes(data.type)&&['FULL_DAY','PARTIAL_DAY'].includes(data.scope)&&['APPROVED','PENDING','CANCELLED'].includes(data.status));
    return {id,employeeId:data.employeeId,type:data.type,startDate:data.startDate,endDate:data.endDate,scope:data.scope,status:data.status};
  });
  if(d.sourcePublicationId!==undefined){integrity(typeof d.sourcePublicationId==='string'&&UUID_V4.test(d.sourcePublicationId));const source=await tx.get(`${root}/schedulePublications/${d.sourcePublicationId}`);integrity(source?.tenantId===identity.tenant);}
  let candidate:DraftV3;
  try{
    const saved=normalizePreviewV3({...d,shifts} as DraftV3);
    candidate=normalizePreviewV3(refreshDraftPeopleV3(saved,currentPeople,currentAbsences,settings.schedulerConfigV3));
  }catch{fail('PDF_INTEGRITY_FAILURE');}
  if(sha(serializePreviewV3(candidate))!==input.previewHash)fail('PREVIEW_CHANGED');
  if(analyzeDraftV3(candidate).warnings.length&&!input.acceptWarnings)fail('WARNINGS_NOT_ACKNOWLEDGED');
  return candidate;
}
function frozen<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;}
type Receipt=PdfMetadata&{generation:string};
type Operation={identity:PdfIdentity;input:PublishRequest;inputHash:string;publicationId:string;attemptId:string;snapshot:SchedulePublicationV3;snapshotHash:string;rendererDigest:string;receipt?:Receipt};
function paths(op:Pick<Operation,'identity'|'input'|'publicationId'>){
  const tenant=op.identity.tenant,root=`tenants/${tenant}`;
  return {root,intent:`demoPdfRequests/${tenant}/intents/${op.input.intentId}`,control:`demoPdfControls/${tenant}`,
    reservation:`${root}/schedulePublicationReservations/${op.publicationId}`,publication:`${root}/schedulePublications/${op.publicationId}`,artifact:`${root}/demoPublicationArtifacts/${op.publicationId}`};
}
function result(op:Operation,replayed:boolean){return {publicationId:op.publicationId,version:op.snapshot.version,periodKey:op.snapshot.periodKey,publishedAt:op.snapshot.publishedAt,replayed};}

export function createPdfPublicationCore(deps:Dependencies){
  const {database,storage,authenticate}=deps,render=deps.render??renderServerPublication,digest=deps.rendererDigest??rendererDigest(),clock=deps.now??Date.now;
  integrity(/^[0-9a-f]{64}$/.test(digest));
  async function owned(tx:PdfTransaction,op:Operation,states:PublicationState[],authorize=true){
    if(authorize)await authorizePdfTransaction(tx,op.identity);
    const p=paths(op),[intent,reservation,control,publication,artifact]=await Promise.all([tx.get(p.intent),tx.get(p.reservation),tx.get(p.control),tx.get(p.publication),tx.get(p.artifact)]);
    if(control?.attemptId!==op.attemptId||intent?.attemptId!==op.attemptId)fail('PDF_BUSY');
    integrity(!publication&&!artifact&&intent&&reservation&&control?.operationId===op.input.intentId&&control.generation===op.identity.generation);
    integrity(states.includes(intent.state)&&intent.state===reservation.state&&control.stage===intent.state);
    integrity(intent.inputHash===op.inputHash&&canonicalJson(intent.request)===canonicalJson(op.input)&&intent.uid===op.identity.uid&&intent.tenantId===op.identity.tenant&&intent.generation===op.identity.generation&&intent.publicationId===op.publicationId);
    integrity(intent.snapshotHash===op.snapshotHash&&intent.rendererDigest===op.rendererDigest&&intent.version===op.snapshot.version&&intent.periodKey===op.snapshot.periodKey&&intent.publishedAt===op.snapshot.publishedAt);
    integrity(reservation.attemptId===op.attemptId&&reservation.generation===op.identity.generation&&reservation.publishedByUid===op.identity.uid&&reservation.tenantId===op.identity.tenant&&reservation.intentId===op.input.intentId);
    integrity(reservation.snapshotHash===op.snapshotHash&&sha(canonicalJson(reservation.snapshot))===op.snapshotHash&&reservation.rendererDigest===op.rendererDigest&&reservation.version===op.snapshot.version&&reservation.periodKey===op.snapshot.periodKey);
    return {p,intent,reservation,control};
  }
  function writeState(tx:PdfTransaction,row:Awaited<ReturnType<typeof owned>>,state:PublicationState,extra:Record<string,unknown>={}){
    tx.set(row.p.intent,{...row.intent,state});tx.set(row.p.reservation,{...row.reservation,state,...extra});tx.set(row.p.control,{...row.control,stage:state,heartbeatAt:clock()});
  }
  async function transition(op:Operation,from:PublicationState[],to:PublicationState,extra:Record<string,unknown>={},authorize=true){
    await database.transaction(async tx=>{const row=await owned(tx,op,from,authorize);writeState(tx,row,to,extra);});
  }
  async function cancel(op:Operation,receipt?:Receipt){
    // Cleanup is internal to the proven attempt; revocation cannot grant an arbitrary delete target.
    await database.transaction(async tx=>{const row=await owned(tx,op,['RESERVED','RENDERED','IO_INTENT','OBJECT_STORED'],false);writeState(tx,row,receipt?'CANCEL_PENDING':'CANCELLED');if(!receipt)tx.delete(row.p.control);});
    if(!receipt)return;
    try{
      await storage.remove(publicationObjectPath(op.identity.tenant,op.publicationId),receipt.generation);
      await database.transaction(async tx=>{const row=await owned(tx,op,['CANCEL_PENDING'],false);writeState(tx,row,'CANCELLED');tx.delete(row.p.control);});
    }catch(error){
      try{await database.transaction(async tx=>{const row=await owned(tx,op,['CANCEL_PENDING'],false);tx.set(row.p.control,{...row.control,cleanupUncertain:true});});}catch{/* Never steal another attempt or reconstruct a released control. */}
      throw error;
    }
  }
  async function finalize(op:Operation){
    await op.identity.reverify();
    await database.transaction(async tx=>{
      const row=await owned(tx,op,['OBJECT_STORED']);
      integrity(op.receipt&&canonicalJson(row.reservation.receipt)===canonicalJson(op.receipt));
      const indexPath=`${row.p.root}/schedulePublicationPeriods/${op.snapshot.periodKey}`,targets=projectionTargetsV3(op.snapshot);
      const [index,...projections]=await Promise.all([tx.get(indexPath),...targets.map(t=>tx.get(`${row.p.root}/${t.collection}/${t.id}`))]);
      if(index)integrity(index.tenantId===op.identity.tenant&&index.periodKey===op.snapshot.periodKey&&Number.isSafeInteger(index.latestVersion)&&index.latestVersion>0);
      tx.create(row.p.publication,op.snapshot);
      tx.create(row.p.artifact,{status:'FINALIZED',tenantId:op.identity.tenant,generation:op.identity.generation,publicationId:op.publicationId,snapshotHash:op.snapshotHash,
        sha256:op.receipt.sha256,byteLength:op.receipt.byteLength,contentType:'application/pdf',storageObjectGeneration:op.receipt.generation,rendererDigest:op.rendererDigest});
      if((index?.latestVersion??0)<op.snapshot.version){
        tx.set(indexPath,{tenantId:op.identity.tenant,periodKey:op.snapshot.periodKey,latestVersion:op.snapshot.version,latestPublicationId:op.publicationId,updatedAt:op.snapshot.publishedAt});
        targets.forEach((t,n)=>tx.set(`${row.p.root}/${t.collection}/${t.id}`,projectionPayloadV3(op.snapshot,t,projections[n])));
      }
      writeState(tx,row,'FINALIZED');tx.delete(row.p.control);
    });
  }
  return {async publish(request:PdfRequest){
    const input=parsePublishRequest(request),identity=await authenticate(request),inputHash=sha(canonicalJson(input));
    // Randomness/time and renderer/Storage work are outside retryable callbacks.
    const proposedId=newPublicationId(),attemptId=randomUUID(),now=clock();integrity(Number.isSafeInteger(now)&&now>0);
    const initial=await database.transaction(async tx=>{
      await authorizePdfTransaction(tx,identity);
      const p=paths({identity,input,publicationId:proposedId});
      const admissionPath=`demoAdmission/${identity.tenant}`,limitPath=`demoPdfLimits/${identity.tenant}`;
      const [existing,control,rawAdmission,rawLimit]=await Promise.all([tx.get(p.intent),tx.get(p.control),tx.get(admissionPath),tx.get(limitPath)]);
      let admission:ReturnType<typeof validateAdmissionState>,limit:ReturnType<typeof validatePdfLimitState>;
      try{admission=validateAdmissionState(rawAdmission,identity.tenant,identity.generation);limit=validatePdfLimitState(rawLimit,identity.tenant);}catch{fail('PDF_INTEGRITY_FAILURE');}
      if(existing){
        if(existing.state==='INVALIDATED')fail('INTENT_CONFLICT');
        if(existing.inputHash!==inputHash||canonicalJson(existing.request)!==canonicalJson(input)||existing.uid!==identity.uid||existing.generation!==identity.generation||existing.tenantId!==identity.tenant)fail('INTENT_CONFLICT');
        integrity(typeof existing.publicationId==='string'&&UUID_V4.test(existing.publicationId));
        const storedPaths=paths({identity,input,publicationId:existing.publicationId}),reservation=await tx.get(storedPaths.reservation);
        integrity(reservation&&reservation.tenantId===identity.tenant&&reservation.generation===identity.generation&&reservation.publishedByUid===identity.uid&&reservation.intentId===input.intentId&&reservation.state===existing.state);
        integrity(reservation.snapshotHash===sha(canonicalJson(reservation.snapshot))&&reservation.snapshot.id===existing.publicationId&&reservation.snapshot.tenantId===identity.tenant&&reservation.snapshot.pdfStoragePath===publicationObjectPath(identity.tenant,existing.publicationId));
        // The intent is the independent frozen anchor; a rehashed reservation is not a new publication intent.
        integrity(existing.snapshotHash===reservation.snapshotHash&&existing.rendererDigest===reservation.rendererDigest&&
          existing.version===reservation.version&&existing.version===reservation.snapshot.version&&existing.periodKey===reservation.periodKey&&
          existing.periodKey===reservation.snapshot.periodKey&&existing.publishedAt===reservation.snapshot.publishedAt&&
          existing.publishedAt===reservation.snapshot.pdfGeneratedAt&&reservation.snapshot.publishedByUid===identity.uid);
        const op:Operation={identity,input,inputHash,publicationId:existing.publicationId,attemptId,snapshot:reservation.snapshot,snapshotHash:reservation.snapshotHash,rendererDigest:reservation.rendererDigest,receipt:reservation.receipt};
        if(existing.state==='FINALIZED'){
          const [publication,manifest]=await Promise.all([tx.get(storedPaths.publication),tx.get(storedPaths.artifact)]);
          integrity(publication&&sha(canonicalJson(publication))===op.snapshotHash&&manifest?.status==='FINALIZED'&&manifest.snapshotHash===op.snapshotHash&&manifest.generation===identity.generation);
          return {op,replayed:true,resume:false};
        }
        if(['IO_UNCERTAIN','IO_INTENT','CANCEL_PENDING'].includes(existing.state))fail('PDF_RECOVERY_REQUIRED');
        if(existing.state==='CANCELLED')fail('INTENT_CONFLICT');
        if(existing.state!=='OBJECT_STORED')fail('PDF_BUSY');
        integrity(control?.operationId===input.intentId&&control.generation===identity.generation&&control.stage==='OBJECT_STORED'&&op.receipt);
        tx.set(storedPaths.intent,{...existing,attemptId});tx.set(storedPaths.reservation,{...reservation,attemptId});tx.set(storedPaths.control,{...control,attemptId});
        return {op,replayed:false,resume:true};
      }
      if(control)fail(control.stage==='IO_UNCERTAIN'?'PDF_RECOVERY_REQUIRED':'PDF_BUSY');
      const candidate=await reconstruct(tx,identity,input),periodKey=`${candidate.periodType}_${candidate.periodStart}_${candidate.periodEnd}`;
      const counterPath=`${p.root}/schedulePublicationCounters/${periodKey}`;
      const counter=await tx.get(counterPath);
      if(counter)integrity(counter.tenantId===identity.tenant&&Number.isSafeInteger(counter.version)&&counter.version>=1);
      const hour=Math.floor(now/3600000),utcDay=new Date(now).toISOString().slice(0,10);
      if(limit.hour!==undefined&&Number(limit.hour)>hour||limit.utcDay!==undefined&&String(limit.utcDay)>utcDay)fail('PDF_INTEGRITY_FAILURE');
      const count=limit.hour===hour?Number(limit.count):0,dayCount=limit.utcDay===utcDay?Number(limit.dayCount):0;
      if(count>=30||dayCount>=100||limit.retainedIntentCount>=ADMISSION_LIMITS.retainedIntents||
        admission.pdfIntentCreates>=ADMISSION_LIMITS.pdfIntentCreates)fail('RATE_LIMITED');
      const version=(counter?.version??0)+1;integrity(Number.isSafeInteger(version));
      const snapshot=buildPublicationV3(candidate,{tenantId:identity.tenant,uid:identity.uid,id:proposedId,version,timestamp:new Date(now).toISOString()});
      const snapshotText=canonicalJson(snapshot);integrity(Buffer.byteLength(snapshotText,'utf8')<768*1024);
      const snapshotHash=sha(snapshotText),op:Operation={identity,input,inputHash,publicationId:proposedId,attemptId,snapshot,snapshotHash,rendererDigest:digest};
      tx.set(counterPath,{tenantId:identity.tenant,version,lastReservedId:proposedId});
      tx.create(p.intent,{request:input,inputHash,tenantId:identity.tenant,uid:identity.uid,generation:identity.generation,publicationId:proposedId,version,periodKey,publishedAt:snapshot.publishedAt,snapshotHash,rendererDigest:digest,attemptId,state:'RESERVED'});
      tx.create(p.reservation,{tenantId:identity.tenant,periodKey,version,publishedByUid:identity.uid,transportVersion:1,generation:identity.generation,intentId:input.intentId,attemptId,snapshot,snapshotHash,rendererDigest:digest,state:'RESERVED'});
      tx.set(p.control,{operationId:input.intentId,attemptId,kind:'PUBLISH',generation:identity.generation,stage:'RESERVED',startedAt:now,heartbeatAt:now});
      tx.set(admissionPath,{...admission,pdfIntentCreates:admission.pdfIntentCreates+1});
      tx.set(limitPath,{...limit,hour,count:count+1,utcDay,dayCount:dayCount+1,retainedIntentCount:Number(limit.retainedIntentCount)+1});
      return {op,replayed:false,resume:false};
    });
    const {op}=initial;if(initial.replayed)return result(op,true);
    let stage:PublicationState=initial.resume?'OBJECT_STORED':'RESERVED';let receipt=op.receipt;
    try{
      if(!initial.resume){
        const rendered=await render(frozen(structuredClone(op.snapshot))),expected=validatePdfBytes(rendered),bytes=Uint8Array.from(rendered);
        await transition(op,['RESERVED'],'RENDERED',{expected});stage='RENDERED';
        await identity.reverify();await transition(op,['RENDERED'],'IO_INTENT');stage='IO_INTENT';
        const path=publicationObjectPath(identity.tenant,op.publicationId);let generation:string|undefined;
        try{generation=(await storage.create(path,bytes,{ifGenerationMatch:0,contentType:'application/pdf'})).generation;integrity(typeof generation==='string'&&/^\d+$/.test(generation));}
        catch(error){
          if(error instanceof StorageCreateError&&error.outcome==='REJECTED'){await cancel(op);throw new PdfError('SERVICE_UNAVAILABLE');}
          if(!(error instanceof StorageCreateError&&error.outcome==='CONFLICT'))throw error;
        }
        const stored=await storage.read(path,generation),actual=validatePdfBytes(stored.bytes);
        integrity(stored.contentType==='application/pdf'&&typeof stored.generation==='string'&&/^\d+$/.test(stored.generation)&&(!generation||stored.generation===generation)&&canonicalJson(actual)===canonicalJson(expected));
        receipt={...actual,generation:stored.generation};op.receipt=receipt;
        await transition(op,['IO_INTENT'],'OBJECT_STORED',{receipt},false);stage='OBJECT_STORED';
      }else{
        integrity(receipt);const stored=await storage.read(publicationObjectPath(identity.tenant,op.publicationId),receipt.generation);
        integrity(stored.generation===receipt.generation&&stored.contentType==='application/pdf'&&canonicalJson(validatePdfBytes(stored.bytes))===canonicalJson({sha256:receipt.sha256,byteLength:receipt.byteLength,contentType:receipt.contentType}));
      }
      await finalize(op);return result(op,false);
    }catch(error){
      // Do not erase evidence or infer non-existence from a failed/ambiguous call.
      if(stage==='IO_INTENT'){
        try{await transition(op,['IO_INTENT'],'IO_UNCERTAIN',{},false);}catch{/* A completed cancellation/foreign attempt is never overwritten. */}
        if(error instanceof PdfError&&error.code==='PDF_INTEGRITY_FAILURE')throw error;
        if(error instanceof PdfError&&error.code==='SERVICE_UNAVAILABLE')throw error;
        fail('PDF_RECOVERY_REQUIRED');
      }
      const authorityFailure=error instanceof PdfError&&['ACCESS_DENIED','UNAUTHENTICATED','DEMO_GENERATION_CHANGED','DEMO_RESETTING'].includes(error.code);
      if(stage==='RESERVED'||stage==='RENDERED'||authorityFailure){try{await cancel(op,receipt);}catch{fail('PDF_RECOVERY_REQUIRED');}}
      // A transient final transaction failure leaves OBJECT_STORED for same-intent recovery.
      if(error instanceof PdfError)throw error;
      fail('SERVICE_UNAVAILABLE');
    }
  }};
}
