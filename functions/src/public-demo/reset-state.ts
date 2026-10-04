import {demoOwnerUid,requireDemoTenant,type DemoTenant} from './policy.ts';
import {authorizePdfTransaction,PdfError,UUID_V4,type PdfIdentity} from './pdf-authorization.ts';

export type ResetPhase='OPEN'|'PRECHECK'|'DESTRUCTIVE'|'FINALIZE';
export type ResetErrorCode='RESET_ACCESS_DENIED'|'RESET_NOT_INITIALIZED'|'RESET_ALREADY_EXISTS'|
  'RESET_IN_PROGRESS'|'RESET_COOLDOWN'|'RESET_GENERATION_CHANGED'|'RESET_LEASE_LOST'|
  'RESET_RECOVERY_REQUIRED'|'RESET_STATE_CORRUPT'|'RESET_INTENT_MISMATCH'|'RESET_INTENT_CAPACITY'|
  'RESET_PDF_RECOVERY_REQUIRED'|'RESET_PDF_BUSY'|'RESET_CAPACITY_EXCEEDED'|'RESET_FINALIZE_INVALID'|
  'RESET_TRANSIENT';
export class ResetError extends Error{
  readonly code:ResetErrorCode;
  constructor(code:ResetErrorCode){super(code);this.name='ResetError';this.code=code;}
}
export const resetFail=(code:ResetErrorCode):never=>{throw new ResetError(code);};
export const RESET_LEASE_MS=8*60*1000,RESET_COOLDOWN_MS=10*60*1000;
export type ResetState={generation:number;resetting:boolean;phase:ResetPhase;weekStart:string;lastResetAt:number};
export type ResetKind='PUBLIC'|'SCHEDULED'|'INITIAL';
export type ResetControl={phase:Exclude<ResetPhase,'OPEN'>;lease:string;leaseUntil:number;
  baseGeneration:number;generation:number;fixtureAt:number;initial:boolean;previousOwner:string|null;
  requestKind:ResetKind;authRevoked:boolean;oldAuthDeleted:boolean};
export type ResetLease={tenant:DemoTenant;phase:Exclude<ResetPhase,'OPEN'>;lease:string;
  baseGeneration:number;generation:number;fixtureAt:number;initial:boolean;kind:ResetKind};
export type ResetFilter={tenantId:DemoTenant};
export interface ResetTransaction{
  get(path:string):Promise<Record<string,any>|undefined>;
  list(path:string,limit:number,filter?:ResetFilter):Promise<Array<{id:string;data:Record<string,any>}>>;
  count(path:string,limit:number,filter?:ResetFilter):Promise<number>;
  set(path:string,value:Record<string,any>):void;
  delete(path:string):void;
}
export interface ResetDatabase{transaction<T>(run:(tx:ResetTransaction)=>Promise<T>):Promise<T>}
export type ResetRequest={kind:ResetKind;identity?:PdfIdentity};
const plain=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
const int=(v:unknown,min=0)=>Number.isSafeInteger(v)&&Number(v)>=min;
const keys=(v:Record<string,any>,allowed:readonly string[])=>Object.keys(v).every(key=>allowed.includes(key));
const stateKeys=['generation','resetting','phase','weekStart','lastResetAt'];
const controlKeys=['phase','lease','leaseUntil','baseGeneration','generation','fixtureAt','initial',
  'previousOwner','requestKind','authRevoked','oldAuthDeleted'];
const openControl=()=>({phase:'OPEN',lease:null,leaseUntil:0,previousOwner:null});
function checkedNow(now:number){if(!int(now,1)||!Number.isFinite(new Date(now).getTime()))resetFail('RESET_STATE_CORRUPT');return now;}
function validTenant(record:Record<string,any>|undefined,tenant:DemoTenant){
  if(!record||record.id!==tenant||record.slug!==tenant||record.status!=='ACTIVE'||record.isDemo!==true)
    resetFail('RESET_ACCESS_DENIED');
}
function openState(raw:unknown,control:unknown,now:number):ResetState{
  if(!plain(raw)||!keys(raw,stateKeys)||!int(raw.generation,1)||raw.resetting!==false||
    ![undefined,'OPEN'].includes(raw.phase)||typeof raw.weekStart!=='string'||raw.weekStart.length>10||
    !int(raw.lastResetAt)||raw.lastResetAt>now)resetFail('RESET_STATE_CORRUPT');
  if(control!==undefined&&(!plain(control)||!keys(control,['phase','lease','leaseUntil','previousOwner'])||
    ![undefined,'OPEN'].includes(control.phase)||control.lease!==null||control.leaseUntil!==0||control.previousOwner!==null))
    resetFail('RESET_RECOVERY_REQUIRED');
  return {...raw,phase:'OPEN'} as ResetState;
}
function busyState(raw:unknown,control:unknown,tenant:DemoTenant,now:number){
  // A pre-B3 interrupted reset has no reliable irreversible-boundary marker.
  if(!plain(raw)||!plain(control)||!['PRECHECK','DESTRUCTIVE','FINALIZE'].includes(raw.phase)||
    control.phase!==raw.phase)resetFail('RESET_RECOVERY_REQUIRED');
  if(!keys(raw,stateKeys)||!keys(control,controlKeys)||Object.keys(control).length!==controlKeys.length||
    raw.resetting!==true||!int(raw.generation)||typeof raw.weekStart!=='string'||raw.weekStart.length>10||
    !int(raw.lastResetAt)||raw.lastResetAt>now||typeof control.lease!=='string'||!UUID_V4.test(control.lease)||
    !int(control.leaseUntil,1)||!int(control.baseGeneration)||!int(control.generation)||
    !int(control.fixtureAt,1)||control.fixtureAt>now||typeof control.initial!=='boolean'||
    typeof control.authRevoked!=='boolean'||typeof control.oldAuthDeleted!=='boolean'||
    !['PUBLIC','SCHEDULED','INITIAL'].includes(control.requestKind))resetFail('RESET_STATE_CORRUPT');
  const expected=control.phase==='PRECHECK'?control.baseGeneration:control.baseGeneration+1;
  if(!int(expected)||raw.generation!==expected||control.generation!==expected||
    control.initial!==(control.baseGeneration===0)||
    control.previousOwner!==(control.initial?null:demoOwnerUid(tenant,control.baseGeneration))||
    control.initial&&control.requestKind==='PUBLIC'||
    control.phase==='PRECHECK'&&(control.authRevoked!==control.initial||control.oldAuthDeleted!==control.initial)||
    control.oldAuthDeleted&&!control.authRevoked)resetFail('RESET_STATE_CORRUPT');
  return {state:raw as ResetState,control:control as ResetControl};
}
function context(tenant:DemoTenant,control:ResetControl):ResetLease{
  return {tenant,phase:control.phase,lease:control.lease,baseGeneration:control.baseGeneration,
    generation:control.generation,fixtureAt:control.fixtureAt,initial:control.initial,kind:control.requestKind};
}
function identityFor(tenant:DemoTenant,request:ResetRequest){
  const identity=request.identity;
  if(!identity||identity.tenant!==tenant||!int(identity.generation,1)||
    identity.uid!==demoOwnerUid(tenant,identity.generation))resetFail('RESET_ACCESS_DENIED');
  return identity;
}
export async function acquireResetLease(db:ResetDatabase,tenantValue:unknown,request:ResetRequest,startedAt:number,lease:string,clock:()=>number=()=>startedAt):Promise<ResetLease>{
  let now=startedAt;
  const tenant=requireDemoTenant(tenantValue);checkedNow(now);
  if(!UUID_V4.test(lease)||!['PUBLIC','SCHEDULED','INITIAL'].includes(request.kind))resetFail('RESET_STATE_CORRUPT');
  const identity=request.kind==='PUBLIC'?identityFor(tenant,request):undefined;
  return db.transaction(async tx=>{
    const [raw,control,record]=await Promise.all([tx.get(`demoState/${tenant}`),tx.get(`demoControl/${tenant}`),tx.get(`tenants/${tenant}`)]);
    // Native transactions may retry after another reset has acquired/finalized.
    // Classify the authoritative snapshot at a fresh server time, not request start.
    now=checkedNow(clock());
    if(raw===undefined){
      if(request.kind!=='INITIAL')resetFail('RESET_NOT_INITIALIZED');
      if(control!==undefined||record!==undefined)resetFail('RESET_ALREADY_EXISTS');
      const next:ResetControl={phase:'PRECHECK',lease,leaseUntil:now+RESET_LEASE_MS,baseGeneration:0,generation:0,
        fixtureAt:now,initial:true,previousOwner:null,requestKind:'INITIAL',authRevoked:true,oldAuthDeleted:true};
      tx.set(`demoState/${tenant}`,{generation:0,phase:'PRECHECK',resetting:true,weekStart:'',lastResetAt:0});
      tx.set(`demoControl/${tenant}`,next);return context(tenant,next);
    }
    if(request.kind==='INITIAL')resetFail('RESET_ALREADY_EXISTS');
    if(raw.resetting===true){
      const current=busyState(raw,control,tenant,now);
      if(!current.control.initial)validTenant(record,tenant);
      if(identity){if(identity.generation!==current.state.generation)resetFail('RESET_GENERATION_CHANGED');resetFail('RESET_IN_PROGRESS');}
      if(current.control.leaseUntil>now)resetFail('RESET_IN_PROGRESS');
      const phase=current.control.phase==='FINALIZE'?'DESTRUCTIVE':current.control.phase;
      const next={...current.control,phase,lease,leaseUntil:now+RESET_LEASE_MS,requestKind:'SCHEDULED' as const};
      tx.set(`demoState/${tenant}`,{...current.state,phase});tx.set(`demoControl/${tenant}`,next);
      return context(tenant,next);
    }
    const current=openState(raw,control,now);validTenant(record,tenant);
    if(!int(current.generation+1,1))resetFail('RESET_STATE_CORRUPT');
    if(identity){
      if(identity.generation!==current.generation)resetFail('RESET_GENERATION_CHANGED');
      try{await authorizePdfTransaction(tx,identity);}catch(error){if(error instanceof PdfError)resetFail('RESET_ACCESS_DENIED');throw error;}
      if(current.lastResetAt+RESET_COOLDOWN_MS>now)resetFail('RESET_COOLDOWN');
    }
    const next:ResetControl={phase:'PRECHECK',lease,leaseUntil:now+RESET_LEASE_MS,baseGeneration:current.generation,
      generation:current.generation,fixtureAt:now,initial:false,previousOwner:demoOwnerUid(tenant,current.generation),
      requestKind:request.kind,authRevoked:false,oldAuthDeleted:false};
    tx.set(`demoState/${tenant}`,{...current,phase:'PRECHECK',resetting:true});tx.set(`demoControl/${tenant}`,next);
    return context(tenant,next);
  });
}
export async function assertResetLease(tx:Pick<ResetTransaction,'get'>,lease:ResetLease,now:number){
  const tenant=requireDemoTenant(lease.tenant);checkedNow(now);
  const [raw,control]=await Promise.all([tx.get(`demoState/${tenant}`),tx.get(`demoControl/${tenant}`)]);
  const current=busyState(raw,control,tenant,now);
  if(current.control.lease!==lease.lease||current.control.phase!==lease.phase||
    current.control.generation!==lease.generation||current.control.baseGeneration!==lease.baseGeneration||
    current.control.fixtureAt!==lease.fixtureAt||current.control.initial!==lease.initial||
    current.control.requestKind!==lease.kind||current.control.leaseUntil<=now)resetFail('RESET_LEASE_LOST');
  return current;
}
export async function heartbeatResetLease(tx:Pick<ResetTransaction,'get'|'set'>,lease:ResetLease,now:number,
  effects:Partial<Pick<ResetControl,'authRevoked'|'oldAuthDeleted'>>={}){
  const current=await assertResetLease(tx,lease,now);
  if(!plain(effects)||Object.keys(effects).some(key=>!['authRevoked','oldAuthDeleted'].includes(key)||typeof effects[key]!=='boolean')||
    lease.phase==='PRECHECK'&&Object.keys(effects).length||
    effects.authRevoked===false&&current.control.authRevoked||effects.oldAuthDeleted===false&&current.control.oldAuthDeleted)
    resetFail('RESET_STATE_CORRUPT');
  const next={...current.control,...effects,leaseUntil:now+RESET_LEASE_MS};
  if(next.oldAuthDeleted&&!next.authRevoked)resetFail('RESET_STATE_CORRUPT');
  tx.set(`demoControl/${lease.tenant}`,next);
}
export async function rollbackPrecheck(db:ResetDatabase,lease:ResetLease,now:number):Promise<boolean>{
  if(lease.phase!=='PRECHECK')return false;
  return db.transaction(async tx=>{
    let current;try{current=await assertResetLease(tx,lease,now);}catch(error){if(error instanceof ResetError)return false;throw error;}
    if(lease.initial){tx.delete(`demoState/${lease.tenant}`);tx.delete(`demoControl/${lease.tenant}`);return true;}
    tx.set(`demoState/${lease.tenant}`,{...current.state,phase:'OPEN',resetting:false});
    tx.set(`demoControl/${lease.tenant}`,openControl());return true;
  });
}
export async function advanceResetBoundary(tx:ResetTransaction,lease:ResetLease,now:number,identity?:PdfIdentity):Promise<ResetLease>{
  const current=await assertResetLease(tx,lease,now);
  if(lease.phase!=='PRECHECK')resetFail('RESET_LEASE_LOST');
  const uid=current.control.previousOwner;
  const [member,admin,record]=await Promise.all([uid?tx.get(`tenantMemberships/${uid}_${lease.tenant}`):Promise.resolve(undefined),
    uid?tx.get(`platformAdmins/${uid}`):Promise.resolve(undefined),tx.get(`tenants/${lease.tenant}`)]);
  if(lease.initial&&record!==undefined)resetFail('RESET_ALREADY_EXISTS');
  if(!lease.initial){
    validTenant(record,lease.tenant);
    if(!member||member.uid!==uid||member.tenantId!==lease.tenant||member.role!=='OWNER'||!['ACTIVE','REVOKED'].includes(member.status))
      resetFail('RESET_RECOVERY_REQUIRED');
  }
  if(lease.kind==='PUBLIC'&&(!identity||identity.uid!==uid||identity.tenant!==lease.tenant||identity.generation!==lease.baseGeneration||
    member?.status!=='ACTIVE'||admin!==undefined&&!['INACTIVE','REVOKED','DISABLED'].includes(admin?.status)))
    resetFail('RESET_ACCESS_DENIED');
  const generation=lease.baseGeneration+1;
  if(!int(generation,1))resetFail('RESET_STATE_CORRUPT');
  const next={...current.control,phase:'DESTRUCTIVE' as const,generation,leaseUntil:now+RESET_LEASE_MS};
  if(uid)tx.set(`tenantMemberships/${uid}_${lease.tenant}`,{...member!,status:'REVOKED'});
  tx.set(`demoState/${lease.tenant}`,{...current.state,generation,phase:'DESTRUCTIVE',resetting:true});
  tx.set(`demoControl/${lease.tenant}`,next);return context(lease.tenant,next);
}
export async function advanceResetFinalize(tx:ResetTransaction,lease:ResetLease,now:number):Promise<ResetLease>{
  const current=await assertResetLease(tx,lease,now);
  if(lease.phase!=='DESTRUCTIVE'||!current.control.authRevoked||!current.control.oldAuthDeleted)
    resetFail('RESET_FINALIZE_INVALID');
  const member=await tx.get(`tenantMemberships/${demoOwnerUid(lease.tenant,lease.generation)}_${lease.tenant}`);
  if(!member||member.uid!==demoOwnerUid(lease.tenant,lease.generation)||member.tenantId!==lease.tenant||member.role!=='OWNER'||member.status!=='ACTIVE')
    resetFail('RESET_FINALIZE_INVALID');
  const next={...current.control,phase:'FINALIZE' as const,leaseUntil:now+RESET_LEASE_MS};
  tx.set(`demoState/${lease.tenant}`,{...current.state,phase:'FINALIZE'});tx.set(`demoControl/${lease.tenant}`,next);
  return context(lease.tenant,next);
}
