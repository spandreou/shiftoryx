import {buildV3EmployeePayload,mapAbsencesV3,type DraftV3} from '../../../src/services/schedulerV3Service.ts';
import {isIsoDateV3,validateSchedulerConfigV3} from '../../../src/scheduler-engine-v3/config.ts';
import {requireEmployeeProfileV3} from '../../../src/scheduler-engine-v3/profileCompatibility.ts';
import type {SchedulerConfigV3} from '../../../src/scheduler-engine-v3/types.ts';
import {assertV3Input} from '../../../src/scheduler-engine-v3/validation.ts';
import {assertCommandId,chargeMutationAttempt,runAuditOnlyAdmission,runPrimaryAdmission,type AdmissionDatabase,type CommandOperation} from './admission.ts';
import type {PdfIdentity} from './pdf-authorization.ts';

export class MutationError extends Error {
  readonly code:string;
  constructor(code:string){super(code);this.name='MutationError';this.code=code;}
}
export const MUTATION_LIMITS=Object.freeze({persistedShiftBytes:768,draftMetadataBytes:128*1024});
const invalid=():never=>{throw new MutationError('MUTATION_INVALID_REQUEST');};
const record=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const exact=(value:unknown,keys:readonly string[])=>record(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const only=(value:unknown,keys:readonly string[])=>record(value)&&Object.keys(value).every(key=>keys.includes(key));
const safeId=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
const validName=(value:unknown):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.trim().length<=200&&
  Buffer.byteLength(value.trim(),'utf8')<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const validStoredText=(value:unknown):value is string=>typeof value==='string'&&Boolean(value.trim())&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const validRevision=(value:unknown):value is number=>Number.isSafeInteger(value)&&Number(value)>=0;
const enumString=(value:unknown,allowed:readonly string[])=>typeof value==='string'&&allowed.includes(value);
const employeeRevision=(value:Record<string,unknown>)=>value.demoRevision===undefined?0:value.demoRevision;
export function demoPublicEmployeeProjection(tenant:string,value:Record<string,unknown>){
  return {tenantId:tenant,fullName:String(value.fullName),role:typeof value.role==='string'?value.role:'',
    color:typeof value.color==='string'?value.color:'',isActive:value.isActive!==false};
}

export type TypedMutationRequest={
  [Operation in CommandOperation]:{operation:Operation;commandId:string;payload:unknown}
}[CommandOperation];
const absenceFields=['employeeId','type','startDate','endDate','scope','replacementMode','manualReplacementEmployeeId','note','status'];
function normalizedAbsence(payload:Record<string,unknown>){
  if(!safeId(payload.employeeId)||!enumString(payload.type,['LEAVE','SICK','OTHER'])||
    !isIsoDateV3(payload.startDate)||!isIsoDateV3(payload.endDate)||String(payload.startDate)>String(payload.endDate)||
    !enumString(payload.scope,['FULL_DAY','PARTIAL_DAY','MORNING_ONLY','INTERMEDIATE_ONLY','AFTERNOON_ONLY','SUNDAY_12H_ONLY'])||
    !enumString(payload.replacementMode,['AUTO','MANUAL','NO_REPLACEMENT'])||
    !enumString(payload.status,['ACTIVE','APPROVED','PENDING','CANCELLED'])||
    typeof payload.note!=='string'||Buffer.byteLength(payload.note,'utf8')>500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(payload.note)||
    typeof payload.manualReplacementEmployeeId!=='string')invalid();
  if(payload.replacementMode==='MANUAL'){
    if(!safeId(payload.manualReplacementEmployeeId)||payload.manualReplacementEmployeeId===payload.employeeId)invalid();
  }else if(payload.manualReplacementEmployeeId!=='')invalid();
  return {employeeId:payload.employeeId,type:payload.type,startDate:payload.startDate,endDate:payload.endDate,
    scope:payload.scope==='FULL_DAY'?'FULL_DAY':'PARTIAL_DAY',replacementMode:payload.replacementMode,
    manualReplacementEmployeeId:payload.manualReplacementEmployeeId,
    status:payload.status==='ACTIVE'?'APPROVED':payload.status,note:payload.note.trim()};
}
async function executeAbsence(deps:{database:AdmissionDatabase},identity:PdfIdentity,request:TypedMutationRequest,now:number){
  const operation=request.operation as 'abs.create'|'abs.update'|'abs.delete',payload=request.payload;
  assertCommandId(request.commandId,'abs');
  if(operation==='abs.create'&&!exact(payload,absenceFields)||
    operation==='abs.update'&&!exact(payload,['id',...absenceFields,'expectedRevision'])||
    operation==='abs.delete'&&!exact(payload,['id','expectedRevision']))invalid();
  if(operation!=='abs.create'&&(!safeId((payload as Record<string,unknown>).id)||!validRevision((payload as Record<string,unknown>).expectedRevision)))invalid();
  const clean=operation==='abs.delete'?payload:normalizedAbsence(payload as Record<string,unknown>);
  const input=operation==='abs.update'?{...clean,id:(payload as Record<string,unknown>).id,expectedRevision:(payload as Record<string,unknown>).expectedRevision}:clean;
  await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation,input,now});
  const id=operation==='abs.create'?'da_'+request.commandId.slice(4):(payload as Record<string,unknown>).id as string;
  return runPrimaryAdmission(deps.database,identity,{commandId:request.commandId,operation,input,now,
    write:async tx=>{
      const root=`tenants/${identity.tenant}`,path=`${root}/absences/${id}`;
      const current=operation==='abs.create'?undefined:await tx.get(path);
      if(operation!=='abs.create'&&!record(current))throw new MutationError('MUTATION_NOT_FOUND');
      if(operation!=='abs.create'&&!validRevision(current!.demoRevision??0))throw new MutationError('MUTATION_INTEGRITY');
      if(operation!=='abs.create'&&Number(current!.demoRevision??0)!==Number((payload as Record<string,unknown>).expectedRevision))throw new MutationError('MUTATION_REVISION_CONFLICT');
      if(operation==='abs.delete'){
        tx.delete(path);return {result:{id,status:'deleted'},delta:{}};
      }
      const fields=clean as Record<string,unknown>;
      const employee=await tx.get(`${root}/employees/${fields.employeeId}`);
      if(!record(employee)||!validName(employee.fullName)||employee.isActive===false)throw new MutationError('MUTATION_FOREIGN_REFERENCE');
      if(fields.replacementMode==='MANUAL'){
        const replacement=await tx.get(`${root}/employees/${fields.manualReplacementEmployeeId}`);
        if(!record(replacement)||replacement.isActive===false)throw new MutationError('MUTATION_FOREIGN_REFERENCE');
      }
      const next={...(record(current)?current:{}),...fields,employeeName:String(employee.fullName),
        ...(operation==='abs.create'?{createdAt:now,createdBy:identity.uid}:{}),
        updatedAt:now,updatedBy:identity.uid,demoRevision:operation==='abs.create'?0:Number(current!.demoRevision??0)+1};
      if(operation==='abs.create')tx.create(path,next);else tx.set(path,next);
      return {result:{id,status:operation==='abs.create'?'created':'updated',...(operation==='abs.update'?{revision:next.demoRevision}:{})},
        delta:operation==='abs.create'?{absenceCreates:1}:{}};
    }});
}
async function executeAnnouncement(deps:{database:AdmissionDatabase},identity:PdfIdentity,request:TypedMutationRequest,now:number){
  const operation=request.operation as 'ann.create'|'ann.delete',payload=request.payload;
  assertCommandId(request.commandId,'ann');
  if(operation==='ann.create'&&!exact(payload,['title','body'])||
    operation==='ann.delete'&&!exact(payload,['id','expectedRevision']))invalid();
  if(operation==='ann.create'){
    const value=payload as Record<string,unknown>;
    if(typeof value.title!=='string'||!value.title.trim()||Buffer.byteLength(value.title.trim(),'utf8')>240||
      typeof value.body!=='string'||!value.body.trim()||Buffer.byteLength(value.body.trim(),'utf8')>4000||
      /[\u0000-\u001f\u007f]/.test(value.title)||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.body))invalid();
  }else if(!safeId((payload as Record<string,unknown>).id)||
    !validRevision((payload as Record<string,unknown>).expectedRevision))invalid();
  const input=operation==='ann.create'?{title:String((payload as Record<string,unknown>).title).trim(),
    body:String((payload as Record<string,unknown>).body).trim()}:payload;
  await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation,input,now});
  const id=operation==='ann.create'?'dn_'+request.commandId.slice(4):(payload as Record<string,unknown>).id as string;
  return runPrimaryAdmission(deps.database,identity,{commandId:request.commandId,operation,input,now,
    write:async tx=>{
      const root=`tenants/${identity.tenant}`,privatePath=`${root}/announcements/${id}`,
        publicPath=`${root}/publicAnnouncements/${id}`;
      if(operation==='ann.create'){
        const next={...input,createdAt:now,updatedAt:now,createdBy:identity.uid,demoRevision:0};
        tx.create(privatePath,next);
        tx.create(publicPath,{tenantId:identity.tenant,title:next.title,body:next.body,
          createdAt:now,updatedAt:now});
        return {result:{id,status:'created'},delta:{announcementCreates:1}};
      }
      const [current,projection]=await Promise.all([tx.get(privatePath),tx.get(publicPath)]);
      if(!record(current))throw new MutationError('MUTATION_NOT_FOUND');
      if(!record(projection)||projection.tenantId!==identity.tenant||
        projection.title!==current.title||projection.body!==current.body||
        !validRevision(current.demoRevision??0))throw new MutationError('MUTATION_INTEGRITY');
      if(Number(current.demoRevision??0)!==Number((payload as Record<string,unknown>).expectedRevision))
        throw new MutationError('MUTATION_REVISION_CONFLICT');
      tx.delete(privatePath);tx.delete(publicPath);
      return {result:{id,status:'deleted'},delta:{}};
    }});
}
function canonicalConfig(value:unknown,tenant:string){
  const keys=['schemaVersion','tenantId','timezone','weekStartDay','operatingDays','shiftTemplates',
    'coverageRequirements','generationDefaults','warningPolicies','templateId','templateVersion'];
  if(!only(value,keys)||value.tenantId!==tenant||
    !validStoredText(value.timezone)||!validStoredText(value.templateId)||
    !Array.isArray(value.operatingDays)||!Array.isArray(value.shiftTemplates)||!Array.isArray(value.coverageRequirements)||
    !value.operatingDays.every(day=>only(day,['weekday','isOpen','windows'])&&Array.isArray(day.windows)&&
      day.windows.every((window:unknown)=>only(window,['openTime','closeTime','crossMidnight'])&&
        (window.crossMidnight===undefined||typeof window.crossMidnight==='boolean')))||
    !value.shiftTemplates.every(template=>only(template,['id','label','shortCode','shiftType','startTime','endTime',
      'durationHours','crossMidnight','isActive'])&&safeId(template.id)&&validStoredText(template.label)&&validStoredText(template.shortCode))||
    !value.coverageRequirements.every(day=>only(day,['weekday','slots'])&&Array.isArray(day.slots)&&
      day.slots.every((slot:unknown)=>only(slot,['shiftTemplateId','headcount'])))||
    !exact(value.generationDefaults,['balanceWeeklyTargetsForMonth'])||
    value.warningPolicies!==undefined&&!only(value.warningPolicies,['minRestIntervalHours','maxDailyHours',
      'maxWeeklyHours','maxConsecutiveWorkingDays']))invalid();
  let bytes:number;try{bytes=Buffer.byteLength(JSON.stringify(value),'utf8');}catch{invalid();}
  if(bytes>64*1024||!validateSchedulerConfigV3(value).valid)invalid();
  return structuredClone(value) as SchedulerConfigV3;
}
async function executeSettings(deps:{database:AdmissionDatabase},identity:PdfIdentity,request:TypedMutationRequest,now:number){
  assertCommandId(request.commandId,'set');
  if(!exact(request.payload,['config','profiles','expectedRevision']))invalid();
  const payload=request.payload as Record<string,unknown>;
  if(!validRevision(payload.expectedRevision)||!Array.isArray(payload.profiles)||payload.profiles.length>32)invalid();
  const config=canonicalConfig(payload.config,identity.tenant);
  const ids=new Set<string>(),profiles:Array<{id:string;profile:Record<string,unknown>}>=[];
  for(const item of payload.profiles){
    if(!exact(item,['id','profile'])||!safeId(item.id)||ids.has(item.id)||
      !record(item.profile)||item.profile.profileVersion!==2)invalid();
    ids.add(item.id);
    let profile:Record<string,unknown>;
    try{profile=requireEmployeeProfileV3(item.profile,config.shiftTemplates) as unknown as Record<string,unknown>;}catch{invalid();}
    profiles.push({id:item.id,profile});
  }
  const input={config,profiles,expectedRevision:payload.expectedRevision};
  await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation:'set.save',input,now});
  return runPrimaryAdmission(deps.database,identity,{commandId:request.commandId,operation:'set.save',input,now,
    write:async tx=>{
      const root=`tenants/${identity.tenant}`,path=`${root}/settings/scheduler`;
      const [prior,...employees]=await Promise.all([tx.get(path),...profiles.map(item=>tx.get(`${root}/employees/${item.id}`))]);
      if(!record(prior)||!validRevision(prior.demoRevision??0))throw new MutationError('MUTATION_INTEGRITY');
      if(Number(prior.demoRevision??0)!==Number(payload.expectedRevision))throw new MutationError('MUTATION_REVISION_CONFLICT');
      if(employees.some(employee=>!record(employee)||!validName(employee.fullName)))throw new MutationError('MUTATION_FOREIGN_REFERENCE');
      for(let n=0;n<profiles.length;n++){
        const employee=employees[n] as Record<string,unknown>;
        if(!validRevision(employee.demoRevision??0))throw new MutationError('MUTATION_INTEGRITY');
        tx.set(`${root}/employees/${profiles[n].id}`,{...employee,schedulerV3:profiles[n].profile,
          demoRevision:Number(employee.demoRevision??0)+1,updatedAt:now});
      }
      const revision=Number(prior.demoRevision??0)+1;
      tx.set(path,{...prior,schedulerConfigV3:config,demoRevision:revision,updatedAt:now});
      return {result:{status:'updated',revision},delta:{}};
    }});
}
const draftKeys=['id','revision','sourcePublicationId','config','employees','absences','periodType','periodStart',
  'periodEnd','options','shifts'];
function canonicalDraft(value:unknown,tenant:string):DraftV3{
  if(!only(value,draftKeys)||!safeId(value.id)||!validRevision(value.revision??0)||
    value.sourcePublicationId!==undefined&&!safeId(value.sourcePublicationId)||
    !enumString(value.periodType,['WEEK','MONTH'])||!isIsoDateV3(value.periodStart)||
    !isIsoDateV3(value.periodEnd)||!exact(value.options,['balanceWeeklyTargets'])||
    typeof value.options.balanceWeeklyTargets!=='boolean'||!Array.isArray(value.employees)||
    value.employees.length>32||!Array.isArray(value.absences)||value.absences.length>64||
    !Array.isArray(value.shifts)||value.shifts.length>449)invalid();
  const config=canonicalConfig(value.config,tenant),periodStart=value.periodStart as string,periodEnd=value.periodEnd as string;
  const first=Date.parse(periodStart+'T00:00:00Z'),last=Date.parse(periodEnd+'T00:00:00Z');
  if(value.periodType==='WEEK'&&(new Date(first).getUTCDay()!==1||last-first!==6*86400000)||
    value.periodType==='MONTH'&&(periodStart.slice(8)!=='01'||
      periodEnd.slice(0,7)!==periodStart.slice(0,7)||
      new Date(last+86400000).getUTCDate()!==1||
      new Date(last+86400000).toISOString().slice(0,7)===periodStart.slice(0,7)))invalid();
  const employees=[],employeeIds=new Set<string>();
  for(const raw of value.employees){
    if(!only(raw,['id','fullName','isActive','schedulerV3','activeFrom','activeTo','color'])||
      !safeId(raw.id)||employeeIds.has(raw.id)||!validName(raw.fullName)||typeof raw.isActive!=='boolean'||
      !record(raw.schedulerV3)||raw.schedulerV3.profileVersion!==2||
      raw.color!==undefined&&(typeof raw.color!=='string'||!/^#[0-9A-Fa-f]{6}$/.test(raw.color))||
      raw.activeFrom!==undefined&&raw.activeFrom!==null&&!isIsoDateV3(raw.activeFrom)||
      raw.activeTo!==undefined&&raw.activeTo!==null&&!isIsoDateV3(raw.activeTo))invalid();
    employeeIds.add(raw.id);
    let profile;try{profile=requireEmployeeProfileV3(raw.schedulerV3,config.shiftTemplates);}catch{invalid();}
    employees.push({id:raw.id,fullName:raw.fullName.trim(),isActive:raw.isActive,schedulerV3:profile,
      activeFrom:raw.activeFrom??null,activeTo:raw.activeTo??null,...(raw.color!==undefined?{color:raw.color}:{})});
  }
  const absences=[],absenceIds=new Set<string>();
  for(const raw of value.absences){
    if(!only(raw,['id','employeeId','type','startDate','endDate','scope','note'])||!safeId(raw.id)||
      absenceIds.has(raw.id)||!employeeIds.has(raw.employeeId)||!enumString(raw.type,['LEAVE','SICK','OTHER'])||
      !isIsoDateV3(raw.startDate)||!isIsoDateV3(raw.endDate)||raw.startDate>raw.endDate||
      !enumString(raw.scope,['FULL_DAY','PARTIAL_DAY'])||
      raw.note!==undefined&&(typeof raw.note!=='string'||Buffer.byteLength(raw.note,'utf8')>500))invalid();
    absenceIds.add(raw.id);
    absences.push({id:raw.id,employeeId:raw.employeeId,type:raw.type,startDate:raw.startDate,
      endDate:raw.endDate,scope:raw.scope,...(raw.note!==undefined?{note:raw.note}:{})});
  }
  const shifts=[],shiftIds=new Set<string>();
  for(const raw of value.shifts){
    if(!only(raw,['id','date','employeeId','employeeName','shiftTemplateId','startTime','endTime',
      'durationHours','crossMidnight','source','isManualOverride','schedulerSchemaVersion','draftId','type'])||
      !safeId(raw.id)||shiftIds.has(raw.id)||!employeeIds.has(raw.employeeId)||
      typeof raw.employeeName!=='string'||Buffer.byteLength(raw.employeeName,'utf8')>400||
      raw.shiftTemplateId!==null&&!safeId(raw.shiftTemplateId)||
      raw.type!==undefined&&raw.type!=='work'||
      raw.crossMidnight!==undefined&&typeof raw.crossMidnight!=='boolean'||
      raw.draftId!==undefined&&raw.draftId!==value.id)invalid();
    shiftIds.add(raw.id);
    const person=employees.find(employee=>employee.id===raw.employeeId)!;
    const shift={id:raw.id,date:raw.date,employeeId:raw.employeeId,employeeName:person.fullName,
      shiftTemplateId:raw.shiftTemplateId,startTime:raw.startTime,endTime:raw.endTime,
      durationHours:raw.durationHours,crossMidnight:raw.crossMidnight===true,
      source:raw.source,isManualOverride:raw.isManualOverride,schedulerSchemaVersion:raw.schedulerSchemaVersion,draftId:value.id};
    if(Buffer.byteLength(JSON.stringify({...shift,type:'work'}),'utf8')>MUTATION_LIMITS.persistedShiftBytes)invalid();
    shifts.push(shift);
  }
  const draft={id:value.id,revision:value.revision??0,
    ...(value.sourcePublicationId?{sourcePublicationId:value.sourcePublicationId}:{}),
    config,employees,absences,periodType:value.periodType,periodStart,periodEnd,
    options:{balanceWeeklyTargets:value.options.balanceWeeklyTargets},shifts} as DraftV3;
  let bytes:number;try{bytes=Buffer.byteLength(JSON.stringify(draft),'utf8');}catch{invalid();}
  if(bytes>500*1024)invalid();
  // Saving validates technical invariants. Warning/coverage expansion belongs
  // to Preview/publication, not the pre-admission HTTP request path.
  try{assertV3Input(draft,draft.shifts);}catch{invalid();}
  return draft;
}
async function executeDraft(deps:{database:AdmissionDatabase},identity:PdfIdentity,request:TypedMutationRequest,now:number){
  assertCommandId(request.commandId,'drf');
  if(!exact(request.payload,['draft']))invalid();
  const draft=canonicalDraft((request.payload as Record<string,unknown>).draft,identity.tenant);
  const input={draft};
  await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation:'drf.save',input,now});
  return runPrimaryAdmission(deps.database,identity,{commandId:request.commandId,operation:'drf.save',input,now,
    write:async tx=>{
      const root=`tenants/${identity.tenant}`,metadataPath=`${root}/scheduleDrafts/${draft.id}`;
      const [prior,settings,liveEmployees,liveAbsences,source]=await Promise.all([
        tx.get(metadataPath),tx.get(`${root}/settings/scheduler`),tx.list(`${root}/employees`,33),
        tx.list(`${root}/absences`,65),draft.sourcePublicationId?
          tx.get(`${root}/schedulePublications/${draft.sourcePublicationId}`):Promise.resolve(undefined),
      ]);
      if(!record(settings)||!record(settings.schedulerConfigV3))throw new MutationError('MUTATION_INTEGRITY');
      canonicalConfig(settings.schedulerConfigV3,identity.tenant);
      if(liveEmployees.length>32||liveAbsences.length>64||
        draft.sourcePublicationId&&(!record(source)||source.tenantId!==identity.tenant))
        throw new MutationError('MUTATION_FOREIGN_REFERENCE');
      const employeeMap=new Map(liveEmployees.map(row=>[row.id,row.data]));
      if(employeeMap.size!==draft.employees.length)throw new MutationError('MUTATION_STALE_SNAPSHOT');
      for(const employee of draft.employees){
        const live=employeeMap.get(employee.id);
        if(!record(live)||live.fullName!==employee.fullName||
          (live.isActive!==false)!==employee.isActive)throw new MutationError('MUTATION_STALE_SNAPSHOT');
      }
      const currentAbsences=mapAbsencesV3(liveAbsences.map(row=>({id:row.id,...row.data})),
        draft.periodStart,draft.periodEnd).sort((a,b)=>a.id.localeCompare(b.id));
      const draftAbsences=[...draft.absences].sort((a,b)=>a.id.localeCompare(b.id));
      if(JSON.stringify(currentAbsences)!==JSON.stringify(draftAbsences))throw new MutationError('MUTATION_STALE_SNAPSHOT');
      if(prior!==undefined&&(!record(prior)||prior.id!==draft.id||prior.tenantId!==identity.tenant||
        prior.schemaVersion!==3||!validRevision(prior.revision)||!Array.isArray(prior.shiftDocumentIds)))
        throw new MutationError('MUTATION_INTEGRITY');
      if(Number(prior?.revision??0)!==Number(draft.revision??0))throw new MutationError('MUTATION_REVISION_CONFLICT');
      const priorIds=prior?.shiftDocumentIds??[];
      if(!Array.isArray(priorIds)||priorIds.length>449||
        priorIds.some((id,n)=>id!==`${draft.id}_${n}`))throw new MutationError('MUTATION_INTEGRITY');
      const targetIds=draft.shifts.map((_,n)=>`${draft.id}_${n}`),targetSet=new Set(targetIds);
      const removed=priorIds.filter(id=>!targetSet.has(id));
      if(removed.length+targetIds.length+1>450)throw new MutationError('MUTATION_TRANSACTION_LIMIT');
      const allIds=[...new Set([...priorIds,...targetIds])];
      const rows=await Promise.all(allIds.map(id=>tx.get(`${root}/shifts/${id}`)));
      const rowMap=new Map(allIds.map((id,n)=>[id,rows[n]]));
      for(const id of priorIds){const row=rowMap.get(id);
        if(!record(row)||row.draftId!==draft.id||row.type!=='work'||row.schedulerSchemaVersion!==3)
          throw new MutationError('MUTATION_INTEGRITY');
      }
      for(const id of targetIds)if(!priorIds.includes(id)&&rowMap.get(id)!==undefined)
        throw new MutationError('MUTATION_INTEGRITY');
      const revision=Number(draft.revision??0)+1;
      const metadata={id:draft.id,tenantId:identity.tenant,schemaVersion:3,
        periodType:draft.periodType,periodStart:draft.periodStart,periodEnd:draft.periodEnd,
        config:draft.config,employees:draft.employees,absences:draft.absences,options:draft.options,
        updatedBy:identity.uid,revision,shiftDocumentIds:targetIds,
        ...(draft.sourcePublicationId?{sourcePublicationId:draft.sourcePublicationId}:{})};
      if(Buffer.byteLength(JSON.stringify(metadata),'utf8')>MUTATION_LIMITS.draftMetadataBytes)
        throw new MutationError('MUTATION_TRANSACTION_LIMIT');
      for(const id of removed)tx.delete(`${root}/shifts/${id}`);
      for(let n=0;n<draft.shifts.length;n++)tx.set(`${root}/shifts/${targetIds[n]}`,{
        ...draft.shifts[n],type:'work',schedulerSchemaVersion:3,draftId:draft.id});
      tx.set(metadataPath,metadata);
      return {result:{status:'saved',revision},auditTargetId:draft.id,delta:{draftSaveCount:1,
        draftCreates:prior===undefined?1:0,shiftCreates:targetIds.filter(id=>!priorIds.includes(id)).length,
        shiftWriteOps:removed.length+targetIds.length}};
    }});
}
export function createTypedMutationCore(deps:{database:AdmissionDatabase;now?:()=>number}){
  const clock=deps.now??Date.now;
  return {async execute(identity:PdfIdentity,request:TypedMutationRequest):Promise<Record<string,unknown>>{
    if(exact(request,['operation','commandId','payload'])&&['abs.create','abs.update','abs.delete'].includes(request.operation)){
      const now=clock();if(!Number.isSafeInteger(now)||now<=0)invalid();
      return executeAbsence(deps,identity,request,now);
    }
    if(exact(request,['operation','commandId','payload'])&&['ann.create','ann.delete'].includes(request.operation)){
      const now=clock();if(!Number.isSafeInteger(now)||now<=0)invalid();
      return executeAnnouncement(deps,identity,request,now);
    }
    if(exact(request,['operation','commandId','payload'])&&request.operation==='set.save'){
      const now=clock();if(!Number.isSafeInteger(now)||now<=0)invalid();
      return executeSettings(deps,identity,request,now);
    }
    if(exact(request,['operation','commandId','payload'])&&request.operation==='aud.export'){
      assertCommandId(request.commandId,'aud');
      if(!exact(request.payload,['exportType','exportScope','status']))invalid();
      const payload=request.payload as Record<string,unknown>;
      if(!enumString(payload.exportType,['PDF','EXCEL','WORD','WHATSAPP','SCHEDULE'])||
        !enumString(payload.exportScope,['WEEK','MONTH','SCHEDULE'])||
        !enumString(payload.status,['SUCCESS','FAILED']))invalid();
      const now=clock();if(!Number.isSafeInteger(now)||now<=0)invalid();
      await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation:'aud.export',input:payload,now});
      return runAuditOnlyAdmission(deps.database,identity,{commandId:request.commandId,operation:'aud.export',input:payload,now});
    }
    if(exact(request,['operation','commandId','payload'])&&request.operation==='drf.save'){
      const now=clock();if(!Number.isSafeInteger(now)||now<=0)invalid();
      return executeDraft(deps,identity,request,now);
    }
    if(!exact(request,['operation','commandId','payload'])||
      !['emp.create','emp.update','emp.active','emp.delete'].includes(request.operation)||!record(request.payload))invalid();
    assertCommandId(request.commandId,'emp');
    const payload=request.payload;
    if(request.operation==='emp.create'&&!exact(payload,['fullName'])||
      request.operation==='emp.update'&&!exact(payload,['id','fullName','color','expectedRevision'])||
      request.operation==='emp.active'&&!exact(payload,['id','isActive','expectedRevision'])||
      request.operation==='emp.delete'&&!exact(payload,['id','expectedRevision']))invalid();
    if(request.operation==='emp.create'||request.operation==='emp.update')if(!validName(payload.fullName))invalid();
    if(request.operation!=='emp.create'&&(!safeId(payload.id)||!validRevision(payload.expectedRevision)))invalid();
    if(request.operation==='emp.update'&&(typeof payload.color!=='string'||!/^#[0-9A-Fa-f]{6}$/.test(payload.color)))invalid();
    if(request.operation==='emp.active'&&typeof payload.isActive!=='boolean')invalid();
    let employee:ReturnType<typeof buildV3EmployeePayload>|undefined;
    if(request.operation==='emp.create')try{employee=buildV3EmployeePayload({fullName:payload.fullName as string});}catch{invalid();}
    const now=clock(),input=request.operation==='emp.create'?{fullName:employee!.fullName}:payload;
    if(!Number.isSafeInteger(now)||now<=0)invalid();
    const operation=request.operation as 'emp.create'|'emp.update'|'emp.active'|'emp.delete';
    await chargeMutationAttempt(deps.database,identity,{commandId:request.commandId,operation,input,now});
    const id=operation==='emp.create'?'de_'+request.commandId.slice(4):payload.id as string;
    if(!safeId(id))invalid();
    return runPrimaryAdmission(deps.database,identity,{commandId:request.commandId,operation,input,now,
      write:async tx=>{
        const root=`tenants/${identity.tenant}`,privatePath=`${root}/employees/${id}`,publicPath=`${root}/publicEmployees/${id}`;
        if(operation==='emp.create'){
          const next={...employee!,demoRevision:0,createdAt:now,updatedAt:now};
          tx.create(privatePath,next);tx.create(publicPath,demoPublicEmployeeProjection(identity.tenant,next));
          return {result:{id,status:'created'},delta:{employeeCreates:1}};
        }
        const [current,projection]=await Promise.all([tx.get(privatePath),tx.get(publicPath)]);
        if(!record(current))throw new MutationError('MUTATION_NOT_FOUND');
        if(!record(projection)||projection.tenantId!==identity.tenant)throw new MutationError('MUTATION_INTEGRITY');
        if(!validRevision(employeeRevision(current)))throw new MutationError('MUTATION_INTEGRITY');
        if(employeeRevision(current)!==payload.expectedRevision)throw new MutationError('MUTATION_REVISION_CONFLICT');
        if(operation==='emp.delete'){
          const absences=await tx.list(`${root}/absences`,65);
          if(absences.length>64)throw new MutationError('MUTATION_INTEGRITY');
          if(absences.some(row=>row.data?.employeeId===id||row.data?.manualReplacementEmployeeId===id))
            throw new MutationError('MUTATION_REFERENCED');
          tx.delete(privatePath);tx.delete(publicPath);
          return {result:{id,status:'deleted'},delta:{}};
        }
        const next={...current,...(operation==='emp.update'?{fullName:(payload.fullName as string).trim(),color:payload.color}:{isActive:payload.isActive}),
          demoRevision:Number(employeeRevision(current))+1,updatedAt:now};
        tx.set(privatePath,next);tx.set(publicPath,demoPublicEmployeeProjection(identity.tenant,next));
        return {result:{id,status:'updated',revision:next.demoRevision},delta:{}};
      }});
  }};
}
