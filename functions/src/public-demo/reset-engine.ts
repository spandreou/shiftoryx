import {randomUUID} from 'node:crypto';
import {canonicalJson} from '../../../src/services/publicationIntentV3.ts';
import {demoOwnerUid,requireDemoTenant,assertEntryOrigin,type DemoTenant} from './policy.ts';
import {publicDemoFixture} from './fixtures.ts';
import {demoPublicEmployeeProjection} from './mutations-core.ts';
import {initialAdmissionState,initialAuditReceiptState} from './admission.ts';
import {RESET_COLLECTIONS,RESET_LIMITS} from './reset-inventory.ts';
import {acquireResetLease,assertResetLease,heartbeatResetLease,rollbackPrecheck,advanceResetBoundary,advanceResetFinalize,
  resetFail,RESET_LEASE_MS,type ResetDatabase,type ResetLease,type ResetRequest,type ResetTransaction} from './reset-state.ts';
import {inspectPdfResetOperation,inspectRetainedIntents,reconcileRetainedIntents,invalidateRetainedIntents} from './reset-retention.ts';
import type {PdfIdentity} from './pdf-authorization.ts';
import type {ResetAuth,ResetStorage,ResetObject} from './reset-adapters.ts';

export type ResetOptions={uid?:string;claims?:Record<string,unknown>;origin?:string;scheduled?:boolean;initial?:boolean;
  reverify?:()=>Promise<void>};
type Dependencies={database:ResetDatabase;auth:ResetAuth;storage:ResetStorage;now?:()=>number;sleep?:(ms:number)=>Promise<void>};
const equal=(left:unknown,right:unknown)=>{try{return canonicalJson(left)===canonicalJson(right);}catch{return false;}};
const plain=(value:unknown):value is Record<string,any>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function requestFor(tenant:DemoTenant,options:ResetOptions):ResetRequest{
  if(!plain(options)||Object.keys(options).some(key=>!['uid','claims','origin','scheduled','initial','reverify'].includes(key))||
    options.scheduled!==undefined&&typeof options.scheduled!=='boolean'||
    options.initial!==undefined&&typeof options.initial!=='boolean'||options.scheduled===true&&options.initial===true||
    options.reverify!==undefined&&typeof options.reverify!=='function')resetFail('RESET_ACCESS_DENIED');
  if(options.initial===true)return {kind:'INITIAL'};
  if(options.scheduled===true)return {kind:'SCHEDULED'};
  try{assertEntryOrigin(tenant,options.origin);}catch{resetFail('RESET_ACCESS_DENIED');}
  const claims=options.claims,generation=claims?.demoGeneration;
  if(!plain(claims)||claims.publicDemo!==true||claims.demoTenant!==tenant||!Number.isSafeInteger(generation)||
    Number(generation)<1||options.uid!==demoOwnerUid(tenant,Number(generation)))resetFail('RESET_ACCESS_DENIED');
  return {kind:'PUBLIC',identity:{tenant,uid:options.uid!,generation:Number(generation),reverify:options.reverify??(async()=>{})}};
}
function checkObjects(objects:ResetObject[],tenant:DemoTenant){
  if(!Array.isArray(objects)||objects.length>RESET_LIMITS.storageObjects)resetFail('RESET_CAPACITY_EXCEEDED');
  const names=new Set<string>();
  for(const object of objects){if(!plain(object)||typeof object.name!=='string'||!object.name.startsWith(`tenants/${tenant}/`)||
    typeof object.generation!=='string'||!/^\d+$/.test(object.generation)||names.has(object.name))resetFail('RESET_RECOVERY_REQUIRED');
    names.add(object.name);}
}
export function createDemoResetEngine(deps:Dependencies){
  const clock=deps.now??Date.now,sleep=deps.sleep??(ms=>new Promise<void>(resolve=>setTimeout(resolve,ms)));
  const {database,auth,storage}=deps;
  async function renew(lease:ResetLease){await database.transaction(tx=>heartbeatResetLease(tx,lease,clock()));}
  async function capacity(tx:ResetTransaction,lease:ResetLease){
    await assertResetLease(tx,lease,clock());
    const counts=await Promise.all(RESET_COLLECTIONS.map(collection=>tx.count(`tenants/${lease.tenant}/${collection}`,RESET_LIMITS.tenantCollectionCeiling)));
    const exports=await tx.count('monthly_schedule_exports',RESET_LIMITS.monthlyExportCeiling,{tenantId:lease.tenant});
    if(counts.some(count=>!Number.isSafeInteger(count)||count<0||count>=RESET_LIMITS.tenantCollectionCeiling)||
      !Number.isSafeInteger(exports)||exports<0||exports>=RESET_LIMITS.monthlyExportCeiling)resetFail('RESET_CAPACITY_EXCEEDED');
  }
  async function objects(lease:ResetLease){
    await renew(lease);const listed=await storage.list(lease.tenant,RESET_LIMITS.storageObjects+1);
    await renew(lease);checkObjects(listed,lease.tenant);return listed;
  }
  async function drain(lease:ResetLease){
    const deadline=clock()+RESET_LIMITS.pdfDrainMs;
    while(true){
      const classification=await database.transaction(async tx=>{
        const value=await inspectPdfResetOperation(tx,lease,clock(),clock);await heartbeatResetLease(tx,lease,clock());return value;
      });
      if(classification==='CLEAR')return;
      if(clock()>=deadline)resetFail('RESET_PDF_BUSY');
      await sleep(100);
    }
  }
  async function prune(lease:ResetLease){
    for(let page=0;page<5;page++){
      const result=await database.transaction(tx=>reconcileRetainedIntents(tx,lease,clock(),clock));
      if(result.deleted===0)return;
    }
    resetFail('RESET_RECOVERY_REQUIRED');
  }
  async function invalidate(lease:ResetLease){
    for(let page=0;page<5;page++){
      const result=await database.transaction(tx=>invalidateRetainedIntents(tx,lease,clock(),clock));
      if(result.deleted+result.invalidated===0)return;
    }
    resetFail('RESET_RECOVERY_REQUIRED');
  }
  async function clear(lease:ResetLease,path:string,rootExport=false){
    const ceiling=rootExport?RESET_LIMITS.monthlyExportCeiling:RESET_LIMITS.tenantCollectionCeiling;
    const pages=Math.ceil((ceiling-1)/RESET_LIMITS.cleanupPage)+1;
    for(let page=0;page<pages;page++){
      const removed=await database.transaction(async tx=>{
        const current=await assertResetLease(tx,lease,clock());
        const rows=await tx.list(path,RESET_LIMITS.cleanupPage,rootExport?{tenantId:lease.tenant}:undefined);
        if(page===pages-1&&rows.length)resetFail('RESET_CAPACITY_EXCEEDED');
        if(rootExport&&rows.some(row=>row.data.tenantId!==lease.tenant))resetFail('RESET_ACCESS_DENIED');
        for(const row of rows)tx.delete(`${path}/${row.id}`);
        tx.set(`demoControl/${lease.tenant}`,{...current.control,leaseUntil:clock()+RESET_LEASE_MS});return rows.length;
      });
      if(removed===0)return;
    }
    resetFail('RESET_CAPACITY_EXCEEDED');
  }
  function fixtureData(lease:ResetLease){
    const fixture=publicDemoFixture(lease.tenant,new Date(lease.fixtureAt)),uid=demoOwnerUid(lease.tenant,lease.generation);
    const tenant={id:lease.tenant,slug:lease.tenant,domain:fixture.domain,displayName:fixture.name,businessCategory:fixture.category,status:'ACTIVE',isDemo:true};
    const member={uid,tenantId:lease.tenant,role:'OWNER',status:'ACTIVE',isDemo:true};
    return {fixture,uid,tenant,member,settings:{schedulerSchemaVersion:3,schedulerConfigV3:fixture.config}};
  }
  async function seed(lease:ResetLease){
    const data=fixtureData(lease);
    const uid=await auth.ensure(lease.tenant,lease.generation);
    if(uid!==data.uid)resetFail('RESET_FINALIZE_INVALID');
    await database.transaction(async tx=>{
      await assertResetLease(tx,lease,clock());
      const admin=await tx.get(`platformAdmins/${uid}`);
      if(admin!==undefined&&!['INACTIVE','REVOKED','DISABLED'].includes(admin?.status))resetFail('RESET_ACCESS_DENIED');
      const root=`tenants/${lease.tenant}`;
      tx.set(root,data.tenant);tx.set(`tenantMemberships/${uid}_${lease.tenant}`,data.member);
      tx.set(`${root}/settings/scheduler`,data.settings);
      tx.set(`demoAdmission/${lease.tenant}`,initialAdmissionState(lease.tenant,lease.generation,data.fixture.employees.length,data.fixture.absences.length));
      tx.set(`demoAuditReceipts/${lease.tenant}`,initialAuditReceiptState(lease.tenant,lease.generation));
      for(const {id,...employee}of data.fixture.employees){tx.set(`${root}/employees/${id}`,employee);
        tx.set(`${root}/publicEmployees/${id}`,demoPublicEmployeeProjection(lease.tenant,employee));}
      for(const absence of data.fixture.absences)tx.set(`${root}/absences/${absence.id}`,absence);
    });
    return data;
  }
  async function finish(lease:ResetLease){
    await auth.verify(lease.tenant,lease.generation);
    if((await objects(lease)).length!==0)resetFail('RESET_FINALIZE_INVALID');
    const data=fixtureData(lease),root=`tenants/${lease.tenant}`;
    await database.transaction(async tx=>{
      const current=await assertResetLease(tx,lease,clock());
      if(lease.phase!=='FINALIZE'||!current.control.authRevoked||!current.control.oldAuthDeleted)resetFail('RESET_FINALIZE_INVALID');
      const retained=await inspectRetainedIntents(tx,lease,clock(),clock);
      if(retained.records.some(record=>record.data.state!=='INVALIDATED'))resetFail('RESET_FINALIZE_INVALID');
      const [tenant,member,admin,oldMember,admission,audit,employees,publicEmployees,absences,settings]=await Promise.all([
        tx.get(root),tx.get(`tenantMemberships/${data.uid}_${lease.tenant}`),tx.get(`platformAdmins/${data.uid}`),
        current.control.previousOwner?tx.get(`tenantMemberships/${current.control.previousOwner}_${lease.tenant}`):Promise.resolve(undefined),
        tx.get(`demoAdmission/${lease.tenant}`),tx.get(`demoAuditReceipts/${lease.tenant}`),
        tx.list(`${root}/employees`,33),tx.list(`${root}/publicEmployees`,33),tx.list(`${root}/absences`,65),tx.list(`${root}/settings`,2),
      ]);
      const matchRows=(rows:Array<{id:string;data:Record<string,any>}>,expected:Array<{id:string;data:Record<string,any>}>)=>
        rows.length===expected.length&&expected.every(item=>rows.some(row=>row.id===item.id&&equal(row.data,item.data)));
      if(!equal(tenant,data.tenant)||!equal(member,data.member)||oldMember!==undefined||
        admin!==undefined&&!['INACTIVE','REVOKED','DISABLED'].includes(admin?.status)||
        !equal(admission,initialAdmissionState(lease.tenant,lease.generation,data.fixture.employees.length,data.fixture.absences.length))||
        !equal(audit,initialAuditReceiptState(lease.tenant,lease.generation))||
        !matchRows(employees,data.fixture.employees.map(({id,...employee})=>({id,data:employee})))||
        !matchRows(publicEmployees,data.fixture.employees.map(({id,...employee})=>({id,data:demoPublicEmployeeProjection(lease.tenant,employee)})))||
        !matchRows(absences,data.fixture.absences.map(absence=>({id:absence.id,data:absence})))||
        !matchRows(settings,[{id:'scheduler',data:data.settings}]))resetFail('RESET_FINALIZE_INVALID');
      const other=RESET_COLLECTIONS.filter(collection=>!['employees','publicEmployees','absences','settings'].includes(collection));
      const counts=await Promise.all(other.map(collection=>tx.count(`${root}/${collection}`,1)));
      const exports=await tx.count('monthly_schedule_exports',1,{tenantId:lease.tenant});
      if(counts.some(count=>count!==0)||exports!==0)resetFail('RESET_FINALIZE_INVALID');
      tx.set(`demoState/${lease.tenant}`,{generation:lease.generation,phase:'OPEN',resetting:false,weekStart:data.fixture.weekStart,
        lastResetAt:lease.initial?0:clock()});
      tx.set(`demoControl/${lease.tenant}`,{phase:'OPEN',lease:null,leaseUntil:0,previousOwner:null});
    });
    return {tenantId:lease.tenant,generation:lease.generation,weekStart:data.fixture.weekStart};
  }
  return {async run(tenantValue:unknown,options:ResetOptions={}){
    const tenant=requireDemoTenant(tenantValue),request=requestFor(tenant,options);
    if(request.identity)await request.identity.reverify();
    let lease:ResetLease|undefined;
    try{
      lease=await acquireResetLease(database,tenant,request,clock(),randomUUID(),clock);
      if(lease.phase==='PRECHECK'){
        await drain(lease);await prune(lease);
        await database.transaction(async tx=>{await capacity(tx,lease!);await inspectRetainedIntents(tx,lease!,clock(),clock);
          await heartbeatResetLease(tx,lease!,clock());});
        await objects(lease);
        if(request.identity)await request.identity.reverify();
        lease=await database.transaction(async tx=>{
          await capacity(tx,lease!);const retained=await inspectRetainedIntents(tx,lease!,clock(),clock);
          const next=await advanceResetBoundary(tx,lease!,clock(),request.identity);
          if(lease!.initial&&retained.limit===undefined)tx.set(`demoPdfLimits/${tenant}`,{retainedIntentCount:0});
          return next;
        });
      }
      if(lease.phase!=='DESTRUCTIVE')resetFail('RESET_RECOVERY_REQUIRED');
      const owned=await database.transaction(tx=>assertResetLease(tx,lease!,clock())),oldUid=owned.control.previousOwner;
      if(oldUid){await renew(lease);await auth.revoke(oldUid);}
      await database.transaction(tx=>heartbeatResetLease(tx,lease!,clock(),{authRevoked:true}));
      await database.transaction(async tx=>{await capacity(tx,lease!);await inspectRetainedIntents(tx,lease!,clock(),clock);});
      for(const collection of RESET_COLLECTIONS)await clear(lease,`tenants/${tenant}/${collection}`);
      await clear(lease,'monthly_schedule_exports',true);await invalidate(lease);
      for(const object of await objects(lease)){await renew(lease);await storage.remove(tenant,object);}
      if((await objects(lease)).length)resetFail('RESET_RECOVERY_REQUIRED');
      await seed(lease);
      if(oldUid){await renew(lease);await auth.remove(oldUid);
        await database.transaction(async tx=>{await assertResetLease(tx,lease!,clock());tx.delete(`tenantMemberships/${oldUid}_${tenant}`);});}
      await database.transaction(tx=>heartbeatResetLease(tx,lease!,clock(),{oldAuthDeleted:true}));
      lease=await database.transaction(tx=>advanceResetFinalize(tx,lease!,clock()));
      return await finish(lease);
    }catch(error){
      // This CAS can never cross DESTRUCTIVE or unlock a different lease.
      if(lease?.phase==='PRECHECK')await rollbackPrecheck(database,lease,clock()).catch(()=>false);
      throw error;
    }
  }};
}
