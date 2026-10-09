// Future hosted qualification only; imported safely by local tests. No privileged SDK calls.
import {randomUUID} from 'node:crypto';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,doc,collection,getDocFromServer,getDocsFromServer,setDoc,updateDoc,deleteDoc,setLogLevel} from 'firebase/firestore';
import {getStorage,ref,getBytes,uploadBytes,deleteObject} from 'firebase/storage';
import {createDemoMutationTransport} from '../../src/demo/mutationTransport.ts';
import {createDraftV3,mapAbsencesV3} from '../../src/services/schedulerV3Service.ts';
import {canonicalJson,hashPreviewV3} from '../../src/services/publicationIntentV3.ts';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {demoPublicEmployeeProjection} from '../../functions/src/public-demo/mutations-core.ts';
import {PROJECT,BUCKET,TENANTS,FUNCTION_ORIGIN,ensure,assertHostedGeneration,requireSdkDenied,requireHttpDenied,
  assertPositiveCoverage,assertCleanupMechanism,assertResetAdvance,assertQualifiedReceipt,type Qualification} from './hosted-qualification.ts';
type Row={id:string;data:Record<string,any>};
export type Client={tenant:string;uid:string;generation?:number;fixture?:ReturnType<typeof publicDemoFixture>;publicationId?:string;
  app?:any;auth?:any;db?:any;storage?:any;transport?:ReturnType<typeof createDemoMutationTransport>;changed?:boolean};
export type Adapter={read:(c:Client,path:string)=>Promise<any>;list:(c:Client,path:string)=>Promise<Row[]>;
  typed:(c:Client,operation:string,payload:any)=>Promise<any>;http:(c:Client,name:string,body:any,options?:{token?:string;origin?:string;anonymous?:boolean})=>Promise<Response>;
  sdkRead:(c:Client,path:string,list?:boolean)=>Promise<any>;sdkWrite:(c:Client,op:string,path:string,data?:any)=>Promise<any>;
  storage:(c:Client,op:string,path:string)=>Promise<any>};
const same=(a:unknown,b:unknown)=>canonicalJson(a)===canonicalJson(b);
const rowsEqual=(a:Row[],b:Row[])=>a.length===b.length&&b.every(r=>a.some(x=>x.id===r.id&&same(x.data,r.data)));
export const EMPTY_OWNER_COLLECTIONS=['schedulePublicationCounters','schedulePublicationReservations','schedulePublicationPeriods','weekHistory','weekLocks','weekTemplates',
  'attendanceHistory','shiftTemplates','announcements','publicAnnouncements','publicSchedules','publicMonths','shifts','auditLogs'];
export function assertCanonicalRows(f:ReturnType<typeof publicDemoFixture>,s:{employees:Row[];absences:Row[];settings:any;drafts:Row[];publications:Row[];publicEmployees:Row[];emptyCollections:Record<string,Row[]>}){
  ensure(rowsEqual(s.employees,f.employees.map(({id,...data})=>({id,data})))&&
    rowsEqual(s.absences,f.absences.map(a=>({id:a.id,data:a})))&&same(s.settings,{schedulerSchemaVersion:3,schedulerConfigV3:f.config})&&
    s.drafts.length===0&&s.publications.length===0&&Array.isArray(s.publicEmployees)&&
    rowsEqual(s.publicEmployees,f.employees.map(({id,...data})=>({id,data:demoPublicEmployeeProjection(f.slug,data)})))&&
    s.emptyCollections&&Object.keys(s.emptyCollections).length===EMPTY_OWNER_COLLECTIONS.length&&
    EMPTY_OWNER_COLLECTIONS.every(col=>Array.isArray(s.emptyCollections[col])&&s.emptyCollections[col].length===0),'NONCANONICAL_BASELINE');
}
export function createSdkAdapter(p:Qualification):Adapter&{login:(tenant:string,afterReset?:{tenantId:string;generation:number;weekStart:string})=>Promise<Client>;close:(c:Client)=>Promise<void>}{
  assertQualifiedReceipt(p);
  ensure(p.projectId===PROJECT&&p.bucket===BUCKET,'RESOURCE_IDENTITY');setLogLevel('silent');
  const apps:any[]=[];
  const adapter:any={
    async http(c:Client,name:string,body:any,options:any={}){
      ensure(['enterPublicDemo','resetPublicDemo','mutatePublicDemo','publishPublicDemoPdf','downloadPublicDemoPdf'].includes(name),'ENDPOINT');
      const token=options.anonymous?null:options.token??(c.auth?.currentUser?await c.auth.currentUser.getIdToken():null);
      const origin=options.origin??(name==='enterPublicDemo'?'https://demo.shiftoryx.gr':`https://${c.tenant}.shiftoryx.gr`);
      return fetch(FUNCTION_ORIGIN+'/'+name,{method:'POST',redirect:'error',credentials:'omit',cache:'no-store',
        headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
        body:JSON.stringify(['enterPublicDemo','resetPublicDemo'].includes(name)?{data:body}:body),signal:AbortSignal.timeout(name==='resetPublicDemo'?450000:120000)});
    },
    async login(tenant:string,afterReset?:{tenantId:string;generation:number;weekStart:string}){
      ensure(TENANTS.includes(tenant as any),'TENANT');if(afterReset)assertResetAdvance(p,tenant,afterReset);
      const expected=afterReset?.generation??p.baseline.tenants[tenant].generation;
      const fixture=publicDemoFixture(tenant,new Date(afterReset?afterReset.weekStart+'T00:00:00Z':p.baseline.tenants[tenant].fixtureAt));
      const response=await adapter.http({tenant,uid:''},'enterPublicDemo',{tenantId:tenant},{anonymous:true});ensure(response.status===200,'ENTRY');
      const entered=(await response.json()).result;ensure(entered?.tenantId===tenant&&entered.returnTo===`https://${tenant}.shiftoryx.gr`&&typeof entered.customToken==='string','ENTRY_IDENTITY');
      const app=initializeApp(p.config as any,'hosted-qualification-'+randomUUID());apps.push(app);
      const c:Client={tenant,uid:'',app,auth:getAuth(app),db:getFirestore(app),storage:getStorage(app),fixture};
      try{
        await signInWithCustomToken(c.auth,entered.customToken);delete entered.customToken;
        const current=c.auth.currentUser,{claims}=await current.getIdTokenResult();c.uid=current.uid;c.generation=Number(claims.demoGeneration);
        ensure(claims.publicDemo===true&&claims.demoTenant===tenant&&c.generation===expected&&
          c.uid===`${tenant}-owner-g${c.generation}`&&claims.aud===PROJECT,'CLAIMS');
        const state=await adapter.read(c,'demoState/'+tenant);
        if(afterReset)ensure(state?.generation===expected&&state.resetting===false&&state.weekStart===afterReset.weekStart&&state.phase==='OPEN'&&
          Number.isSafeInteger(state.lastResetAt)&&state.lastResetAt>p.baseline.tenants[tenant].lastResetAt&&state.lastResetAt<=Date.now(),'GENERATION_DRIFT');
        else assertHostedGeneration(p,tenant,state);
        const pending=new Map<string,string>();
        c.transport=createDemoMutationTransport({tenant,projectId:PROJECT,demoEnabled:true,local:false,
          storage:{getItem:k=>pending.get(k)??null,setItem:(k,v)=>{pending.set(k,v);},removeItem:k=>{pending.delete(k);}},
          identity:async()=>{const u=c.auth.currentUser;ensure(u,'SESSION');const {claims:fresh}=await u.getIdTokenResult();
            ensure(fresh.publicDemo===true&&fresh.demoTenant===tenant,'CLAIMS');
            return {tenant,uid:u.uid,generation:Number(fresh.demoGeneration),getToken:force=>u.getIdToken(force)};},
          fetch:async(url,options)=>{ensure(String(url)===FUNCTION_ORIGIN+'/mutatePublicDemo','ENDPOINT');
            return fetch(url,{...options,headers:{...options?.headers,Origin:`https://${tenant}.shiftoryx.gr`},signal:AbortSignal.timeout(120000)});}});
        return c;
      }catch(error){await deleteApp(app);throw error;}
    },
    async read(c:Client,path:string){const s=await getDocFromServer(doc(c.db,path));return s.exists()?s.data():undefined;},
    async list(c:Client,path:string){const s=await getDocsFromServer(collection(c.db,path));return s.docs.map(d=>({id:d.id,data:d.data()}));},
    async typed(c:Client,op:string,payload:any){ensure(c.transport,'TRANSPORT');c.changed=true;return c.transport!.run(op,payload);},
    async sdkRead(c:Client,path:string,list=false){return list?getDocsFromServer(collection(c.db,path)):getDocFromServer(doc(c.db,path));},
    async sdkWrite(c:Client,op:string,path:string,data:any){const target=doc(c.db,path);if(op==='set')return setDoc(target,data);
      if(op==='update')return updateDoc(target,data);ensure(op==='delete','SDK_OPERATION');return deleteDoc(target);},
    async storage(c:Client,op:string,path:string){const target=ref(c.storage,path);if(op==='read')return getBytes(target);
      if(op==='write')return uploadBytes(target,new TextEncoder().encode('%PDF-qualification-denial\n%%EOF\n'),{contentType:'application/pdf'});
      ensure(op==='delete','SDK_OPERATION');return deleteObject(target);},
    async close(c:Client){if(c.app)await deleteApp(c.app);},
  };
  return adapter;
}
export async function verifyCanonicalBaseline(a:Adapter,c:Client,p:Qualification){
  assertHostedGeneration(p,c.tenant,await a.read(c,'demoState/'+c.tenant));
  assertCanonicalRows(c.fixture!,await readCanonicalSnapshot(a,c));
  const member=await a.read(c,`tenantMemberships/${c.uid}_${c.tenant}`);ensure(member?.uid===c.uid&&member.tenantId===c.tenant&&member.role==='OWNER'&&member.status==='ACTIVE','MEMBERSHIP');
}
export async function readCanonicalSnapshot(a:Adapter,c:Client){
  const root='tenants/'+c.tenant;
  const [employees,absences,settings,drafts,publications,publicEmployees,empty]=await Promise.all([a.list(c,root+'/employees'),a.list(c,root+'/absences'),
    a.read(c,root+'/settings/scheduler'),a.list(c,root+'/scheduleDrafts'),a.list(c,root+'/schedulePublications'),a.list(c,root+'/publicEmployees'),
    Promise.all(EMPTY_OWNER_COLLECTIONS.map(col=>a.list(c,root+'/'+col)))]);
  return {employees,absences,settings,drafts,publications,publicEmployees,emptyCollections:Object.fromEntries(EMPTY_OWNER_COLLECTIONS.map((col,i)=>[col,empty[i]]))};
}
export async function preflightHostedClients(a:Adapter&{login:(tenant:string)=>Promise<Client>},p:Qualification,clients:Client[]=[]){
  for(const tenant of TENANTS){const c=await a.login(tenant);clients.push(c);await verifyCanonicalBaseline(a,c,p);}return clients;
}
export async function runTypedPositiveWorkflow(a:Adapter,c:Client,p:Qualification){
  await verifyCanonicalBaseline(a,c,p);const root='tenants/'+c.tenant,done=new Set<string>();
  const typed=async(op:string,payload:any)=>{const r=await a.typed(c,op,payload);done.add(op);return r;};
  const employee=await typed('emp.create',{fullName:'Φανταστικός εργαζόμενος qualification'});ensure(typeof employee.id==='string','TYPED_RESULT');
  ensure((await a.read(c,root+'/employees/'+employee.id))?.fullName==='Φανταστικός εργαζόμενος qualification','EMPLOYEE_PERSISTENCE');
  await typed('emp.update',{id:employee.id,fullName:'Φανταστικός εργαζόμενος ενημερωμένος',color:'#112233',expectedRevision:0});
  ensure((await a.read(c,root+'/employees/'+employee.id))?.fullName==='Φανταστικός εργαζόμενος ενημερωμένος','EMPLOYEE_PERSISTENCE');
  await typed('emp.active',{id:employee.id,isActive:false,expectedRevision:1});
  ensure((await a.read(c,root+'/employees/'+employee.id))?.isActive===false,'EMPLOYEE_PERSISTENCE');
  await typed('emp.active',{id:employee.id,isActive:true,expectedRevision:2});
  ensure((await a.read(c,root+'/employees/'+employee.id))?.isActive===true,'EMPLOYEE_PERSISTENCE');
  const current=await a.read(c,root+'/employees/'+employee.id),settings=await a.read(c,root+'/settings/scheduler');
  await typed('set.save',{config:settings.schedulerConfigV3,expectedRevision:settings.demoRevision??0,
    profiles:[{id:employee.id,profile:{...current.schedulerV3,targetWeeklyHours:32}}]});
  ensure((await a.read(c,root+'/employees/'+employee.id)).schedulerV3.targetWeeklyHours===32,'PROFILE_PERSISTENCE');
  const absencePayload={employeeId:employee.id,type:'OTHER',startDate:c.fixture!.weekStart,endDate:c.fixture!.weekStart,
    scope:'FULL_DAY',replacementMode:'AUTO',manualReplacementEmployeeId:'',note:'Φανταστική απουσία qualification',status:'ACTIVE'};
  const absence=await typed('abs.create',absencePayload);
  ensure((await a.read(c,root+'/absences/'+absence.id))?.employeeId===employee.id,'ABSENCE_PERSISTENCE');
  await typed('abs.update',{...absencePayload,id:absence.id,note:'Ενημερωμένη φανταστική απουσία',expectedRevision:0});
  ensure((await a.read(c,root+'/absences/'+absence.id))?.note==='Ενημερωμένη φανταστική απουσία','ABSENCE_PERSISTENCE');
  const announcement=await typed('ann.create',{title:'Φανταστική ανακοίνωση qualification',body:'Αποκλειστικά δοκιμαστικά δεδομένα.'});
  ensure((await a.read(c,root+'/announcements/'+announcement.id))?.title==='Φανταστική ανακοίνωση qualification'&&
    (await a.read(c,root+'/publicAnnouncements/'+announcement.id))?.title==='Φανταστική ανακοίνωση qualification','ANNOUNCEMENT_PERSISTENCE');
  const audit=await typed('aud.export',{exportType:'PDF',exportScope:'WEEK',status:'SUCCESS'});
  ensure((await a.list(c,root+'/auditLogs')).some(r=>r.data.sequence===audit.sequence&&r.data.action==='aud.export'&&r.data.actorUid===c.uid),'AUDIT_PERSISTENCE');
  for(const [op,id,collection]of [['abs.delete',absence.id,'absences'],['ann.delete',announcement.id,'announcements'],['emp.delete',employee.id,'employees']]){
    assertCleanupMechanism(op);const row=await a.read(c,root+'/'+collection+'/'+id);await typed(op,{id,expectedRevision:row.demoRevision??0});
    ensure(await a.read(c,root+'/'+collection+'/'+id)===undefined,'TYPED_CLEANUP');
    if(op==='ann.delete')ensure(await a.read(c,root+'/publicAnnouncements/'+id)===undefined,'TYPED_CLEANUP');
    if(op==='emp.delete')ensure(await a.read(c,root+'/publicEmployees/'+id)===undefined,'TYPED_CLEANUP');
  }
  const employees=(await a.list(c,root+'/employees')).map(r=>({id:r.id,...r.data})),absences=(await a.list(c,root+'/absences')).map(r=>({id:r.id,...r.data}));
  const draft=createDraftV3({config:settings.schedulerConfigV3,employees,absences:mapAbsencesV3(absences,c.fixture!.weekStart,c.fixture!.weekEnd),
    periodType:'WEEK',periodStart:c.fixture!.weekStart,periodEnd:c.fixture!.weekEnd,options:{balanceWeeklyTargets:true}},'qualification_'+randomUUID());
  const saved=await typed('drf.save',{draft});ensure(saved.revision===1,'DRAFT_REVISION');
  const intent={intentId:randomUUID(),draftId:draft.id,draftRevision:1,previewHash:await hashPreviewV3(draft),acceptWarnings:true};
  const publish=await a.http(c,'publishPublicDemoPdf',intent);ensure(publish.status===200,'PUBLISH');const v1=await publish.json();
  ensure(v1.version===1&&typeof v1.publicationId==='string','PUBLICATION_VERSION');c.publicationId=v1.publicationId;done.add('publishPublicDemoPdf');
  const download=await a.http(c,'downloadPublicDemoPdf',{publicationId:v1.publicationId});ensure(download.status===200&&download.headers.get('content-type')==='application/pdf','PDF');
  const bytes=new Uint8Array(await download.arrayBuffer());ensure(Buffer.from(bytes).subarray(0,5).toString()==='%PDF-','PDF_BYTES');done.add('downloadPublicDemoPdf');
  const second=await a.http(c,'publishPublicDemoPdf',{...intent,intentId:randomUUID()});ensure(second.status===200&&(await second.json()).version===2,'PUBLICATION_VERSION');
  const old=await a.http(c,'downloadPublicDemoPdf',{publicationId:v1.publicationId});ensure(old.status===200&&Buffer.from(await old.arrayBuffer()).equals(Buffer.from(bytes)),'PDF_IMMUTABILITY');
  assertPositiveCoverage([...done]);return {employeeId:c.fixture!.employees[0].id,publicationId:v1.publicationId};
}
export async function runOwnerSdkDenials(a:Pick<Adapter,'sdkWrite'>,c:Client){
  const f=c.fixture!,root='tenants/'+c.tenant,{id,...employee}=f.employees[0];
  for(const [coll,target,payload]of [['employees',id,employee],['settings','scheduler',{schedulerSchemaVersion:3,schedulerConfigV3:f.config}],
    ['absences',f.absences[0]?.id??'fabricated',f.absences[0]??{}],['scheduleDrafts','fabricated',{}],['announcements','fabricated',{title:'Δοκιμή',body:'Φανταστικά δεδομένα'}],
    ['publicEmployees',id,{tenantId:c.tenant,fullName:employee.fullName,role:'',color:'',isActive:true}],
    ['publicAnnouncements','fabricated',{}],['shifts','fabricated',{}],['auditLogs','fabricated',{}]])
    for(const op of ['set','update','delete'])await requireSdkDenied(()=>a.sdkWrite(c,op,root+'/'+coll+'/'+target,payload),'firestore');
}
export async function runOwnerStorageDenials(a:Pick<Adapter,'storage'>,c:Client){
  const root='tenants/'+c.tenant,month=c.fixture!.weekStart.slice(0,7);
  for(const path of [root+'/monthly_schedule_pdfs/'+month+'/program_month_'+month+'.pdf',
    root+'/schedule-publications/'+(c.publicationId??randomUUID())+'/schedule.pdf',root+'/fabricated/guess.pdf','fabricated/guess.pdf'])
    for(const op of ['read','write','delete'])await requireSdkDenied(()=>a.storage(c,op,path),'storage');
}
export async function runForeignDenials(a:Pick<Adapter,'sdkRead'|'sdkWrite'|'storage'|'http'>,c:Client,foreign:Client){
  ensure(c.tenant!==foreign.tenant&&TENANTS.includes(c.tenant as any)&&TENANTS.includes(foreign.tenant as any),'FOREIGN_PAIR');
  const root='tenants/'+foreign.tenant,{id,...employee}=foreign.fixture!.employees[0],probe=randomUUID();
  await requireSdkDenied(()=>a.sdkRead(c,root),'firestore');
  for(const col of ['employees','settings','absences','scheduleDrafts','schedulePublications','schedulePublicationCounters',
    'schedulePublicationReservations','schedulePublicationPeriods','weekHistory','monthlyScheduleArchives']){
    await requireSdkDenied(()=>a.sdkRead(c,root+'/'+col,true),'firestore');
    await requireSdkDenied(()=>a.sdkRead(c,root+'/'+col+'/'+(col==='settings'?'scheduler':col==='employees'?id:probe)),'firestore');
  }
  for(const op of ['set','update','delete'])await requireSdkDenied(()=>a.sdkWrite(c,op,root+'/employees/'+id,employee),'firestore');
  await requireSdkDenied(()=>a.sdkWrite(c,'update',root+'/employees/'+id,{schedulerV3:{...employee.schedulerV3,targetWeeklyHours:20}}),'firestore');
  for(const col of ['settings','absences','scheduleDrafts','schedulePublications'])await requireSdkDenied(()=>a.sdkWrite(c,'set',root+'/'+col+'/'+probe,{tenantId:foreign.tenant}),'firestore');
  await requireSdkDenied(()=>a.sdkRead(c,`tenantMemberships/${foreign.uid}_${foreign.tenant}`),'firestore');
  await requireSdkDenied(()=>a.sdkWrite(c,'set',`tenantMemberships/${c.uid}_${foreign.tenant}`,{uid:c.uid,tenantId:foreign.tenant,role:'OWNER',status:'ACTIVE'}),'firestore');
  for(const path of [root+'/schedule-publications/'+(foreign.publicationId??probe)+'/schedule.pdf',root+'/monthly_schedule_pdfs/2026-10/program_month_2026-10.pdf'])
    for(const op of ['read','write','delete'])await requireSdkDenied(()=>a.storage(c,op,path),'storage');
  await requireHttpDenied(await a.http(c,'downloadPublicDemoPdf',{publicationId:foreign.publicationId??probe}),[404],['PDF_NOT_AVAILABLE']);
  await requireHttpDenied(await a.http(c,'mutatePublicDemo',{operation:'emp.create',commandId:'emp_'+probe,payload:{fullName:'Φανταστική ξένη δοκιμή'}},
    {origin:`https://${foreign.tenant}.shiftoryx.gr`}),[403],['ACCESS_DENIED']);
  await requireHttpDenied(await a.http(c,'mutatePublicDemo',{tenantId:foreign.tenant,operation:'emp.create',commandId:'emp_'+probe,payload:{fullName:'Δοκιμή'}}),[400],['INVALID_REQUEST']);
  await requireHttpDenied(await a.http(c,'resetPublicDemo',{tenantId:foreign.tenant}),[403],['PERMISSION_DENIED']);
}
export async function runSessionDenial(a:Pick<Adapter,'http'>,c:Client,session:{name:string;token?:string}){
  ensure(['anonymous','stale-generation','revoked-session','old-session-after-reset','wrong-demo-tenant-claim','platform-admin-collision'].includes(session.name),'SESSION_CASE');
  ensure(session.name==='anonymous'||typeof session.token==='string'&&session.token.length>0&&session.token.length<8192,'SESSION_REQUIRED');
  const statuses=session.name==='stale-generation'?[409]:['wrong-demo-tenant-claim','platform-admin-collision'].includes(session.name)?[403]:
    session.name==='old-session-after-reset'?[401,409]:[401];
  const codes=session.name==='stale-generation'?['DEMO_GENERATION_CHANGED']:['wrong-demo-tenant-claim','platform-admin-collision'].includes(session.name)?['ACCESS_DENIED']:
    session.name==='old-session-after-reset'?['UNAUTHENTICATED','DEMO_GENERATION_CHANGED']:['UNAUTHENTICATED'];
  await requireHttpDenied(await a.http(c,'mutatePublicDemo',{operation:'emp.create',commandId:'emp_'+randomUUID(),payload:{fullName:'Φανταστική αρνητική δοκιμή'}},
    session.name==='anonymous'?{anonymous:true}:{token:session.token}),statuses,codes);
}
export type PreparedSessionProvider=(request:{tenant:string;name:string;generation:number|undefined;uid:string})=>Promise<{token:string;evidenceHash:string}>;
export async function runPreparedSessionCases(a:Pick<Adapter,'http'>,clients:Client[],provider:PreparedSessionProvider|undefined){
  ensure(typeof provider==='function'&&clients.length===4&&TENANTS.every(t=>clients.filter(c=>c.tenant===t).length===1),'PREPARED_SESSION_CONTROLLER_REQUIRED');
  const evidence:Array<{tenant:string;name:string;evidenceHash:string;result:string}>=[];
  for(const c of clients)for(const name of ['stale-generation','revoked-session','platform-admin-collision']){
    const prepared=await provider!({tenant:c.tenant,name,generation:c.generation,uid:c.uid});
    ensure(prepared&&typeof prepared==='object'&&Object.keys(prepared).sort().join(',')==='evidenceHash,token'&&
      typeof prepared.evidenceHash==='string'&&/^[0-9a-f]{64}$/.test(prepared.evidenceHash),'PREPARED_SESSION_EVIDENCE');
    await runSessionDenial(a,c,{name,token:prepared.token});evidence.push({tenant:c.tenant,name,evidenceHash:prepared.evidenceHash,result:'PASS'});
  }
  return evidence;
}
export async function resetQualificationTenant(a:Adapter,c:Client){
  assertCleanupMechanism('resetPublicDemo');const oldGeneration=(await a.read(c,'demoState/'+c.tenant)).generation;
  const oldToken=await c.auth.currentUser.getIdToken();const response=await a.http(c,'resetPublicDemo',{tenantId:c.tenant});ensure(response.status===200,'RESET');
  const result=(await response.json()).result;ensure(result.tenantId===c.tenant&&result.generation===oldGeneration+1,'RESET_GENERATION');
  await runSessionDenial(a,c,{name:'old-session-after-reset',token:oldToken});
  return result;
}
export async function verifyCanonicalAfterReset(a:Adapter&{login:(tenant:string,afterReset:any)=>Promise<Client>},c:Client,p:Qualification,result:any){
  assertResetAdvance(p,c.tenant,result);const fresh=await a.login(c.tenant,result);
  try{
    const state=await a.read(fresh,'demoState/'+c.tenant),member=await a.read(fresh,`tenantMemberships/${fresh.uid}_${fresh.tenant}`);
    ensure(state?.generation===result.generation&&state.phase==='OPEN'&&state.resetting===false&&Number.isSafeInteger(state.lastResetAt)&&
      state.lastResetAt>p.baseline.tenants[c.tenant].lastResetAt&&state.lastResetAt<=Date.now(),'RESET_CONTROL');
    ensure(member?.uid===fresh.uid&&member.tenantId===fresh.tenant&&member.role==='OWNER'&&member.status==='ACTIVE','MEMBERSHIP');
    assertCanonicalRows(fresh.fixture!,await readCanonicalSnapshot(a,fresh));return fresh;
  }catch(error){if('close' in a&&typeof a.close==='function')await a.close(fresh);throw error;}
}
export type PrivateCleanupProvider=(request:{tenant:string;generation:number;requestedAt:string})=>Promise<any>;
export async function requirePostResetPrivateEvidence(c:Client,result:any,provider:PrivateCleanupProvider|undefined){
  ensure(typeof provider==='function','PRIVATE_CLEANUP_EVIDENCE_REQUIRED');const requestedAt=new Date().toISOString();
  const proof=await provider!({tenant:c.tenant,generation:result.generation,requestedAt});
  ensure(proof&&typeof proof==='object'&&Object.keys(proof).sort().join(',')===
    'bucket,evidenceHash,generation,monthlyExportCount,observedAt,privateCollectionCounts,projectId,resetControlPhase,storageObjectCount,tenantId','PRIVATE_CLEANUP_SCHEMA');
  ensure(proof.projectId===PROJECT&&proof.bucket===BUCKET&&proof.tenantId===c.tenant&&proof.generation===result.generation&&typeof proof.evidenceHash==='string'&&/^[0-9a-f]{64}$/.test(proof.evidenceHash)&&
    typeof proof.observedAt==='string'&&Date.parse(proof.observedAt)>=Date.parse(requestedAt)-1000&&Date.parse(proof.observedAt)<=Date.now()&&
    Date.now()-Date.parse(proof.observedAt)<=60000&&proof.monthlyExportCount===0&&proof.storageObjectCount===0&&proof.resetControlPhase==='OPEN'&&
    proof.privateCollectionCounts&&Object.keys(proof.privateCollectionCounts).sort().join(',')==='demoPublicationArtifacts,exportAuditLogs,monthlyScheduleArchives'&&
    Object.values(proof.privateCollectionCounts).every(count=>count===0),'PRIVATE_CLEANUP_EVIDENCE');
  return {tenant:c.tenant,generation:result.generation,evidenceHash:proof.evidenceHash,observedAt:proof.observedAt};
}
