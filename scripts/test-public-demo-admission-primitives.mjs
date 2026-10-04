import assert from 'node:assert/strict';

// Each assertion exercises a server primitive, not a browser-side guard.
const admission=await import('../functions/src/public-demo/admission.ts');
const need=name=>{assert.equal(typeof admission[name],'function',`${name} missing`);return admission[name];};
const uuid='12345678-1234-4123-8123-123456789abc';
const identity={tenant:'demo-fuel',uid:'demo-fuel-owner-g7',generation:7};

assert.equal(need('assertCommandId')('emp_'+uuid,'emp'),'emp_'+uuid);
for(const id of [uuid,'emp_'+uuid.toUpperCase(),'emp_../x','abs_'+uuid,'emp_123']){
  assert.throws(()=>admission.assertCommandId(id,'emp'),{code:'ADMISSION_INVALID_COMMAND'});
}
assert.match(need('commandDigest')(identity,'emp.create',{fullName:'Δοκιμή'}),/^[0-9a-f]{64}$/);
assert.notEqual(admission.commandDigest(identity,'emp.create',{fullName:'Δοκιμή'}),admission.commandDigest({...identity,tenant:'demo-cafe',uid:'demo-cafe-owner-g7'},'emp.create',{fullName:'Δοκιμή'}));
assert.notEqual(admission.commandDigest(identity,'emp.create',{fullName:'Δοκιμή'}),admission.commandDigest({...identity,generation:8,uid:'demo-fuel-owner-g8'},'emp.create',{fullName:'Δοκιμή'}));
assert.notEqual(admission.commandDigest(identity,'emp.create',{fullName:'Δοκιμή'}),admission.commandDigest(identity,'emp.delete',{fullName:'Δοκιμή'}));
console.log('PUBLIC_DEMO_ADMISSION_COMMANDS_PASS');

const runtime={PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',GCLOUD_PROJECT:'shiftoryx-public-demo'};
const claims={uid:'demo-fuel-owner-g7',sub:'demo-fuel-owner-g7',aud:'shiftoryx-public-demo',iss:'https://securetoken.google.com/shiftoryx-public-demo',publicDemo:true,demoTenant:'demo-fuel',demoGeneration:7};
const request=(origin='https://demo-fuel.shiftoryx.gr')=>({method:'POST',query:{},body:new TextEncoder().encode('{}'),headers:{authorization:'Bearer synthetic-test-token',origin,'content-type':'application/json'}});
const verifier=(value=claims)=>({projectId:'shiftoryx-public-demo',verifyIdToken:async(_token,checkRevoked)=>{assert.equal(checkRevoked,true);return value;}});
const docs=()=>new Map([
  ['demoState/demo-fuel',{generation:7,resetting:false}],
  ['tenantMemberships/demo-fuel-owner-g7_demo-fuel',{uid:claims.uid,tenantId:'demo-fuel',role:'OWNER',status:'ACTIVE'}],
  ['tenants/demo-fuel',{id:'demo-fuel',slug:'demo-fuel',isDemo:true,status:'ACTIVE'}],
]);
const reader=rows=>({get:async path=>structuredClone(rows.get(path))});
const authenticate=()=>need('authenticateMutationRequest')(request(),verifier(),runtime);
const authorize=async rows=>need('authorizeMutationTransaction')(reader(rows),await authenticate());
assert.equal((await authorize(docs())).tenant,'demo-fuel');
await assert.rejects(()=>need('authenticateMutationRequest')(request('https://demo-cafe.shiftoryx.gr'),verifier(),runtime),{code:'ACCESS_DENIED'});
await assert.rejects(()=>need('authenticateMutationRequest')(request(),verifier({...claims,demoTenant:'demo-cafe'}),runtime),{code:'ACCESS_DENIED'});
await assert.rejects(()=>need('authenticateMutationRequest')(request(),{projectId:'shiftoryx-public-demo',verifyIdToken:async()=>{throw Error('revoked');}},runtime),{code:'UNAUTHENTICATED'});
await assert.rejects(()=>need('authenticateMutationRequest')(request(),verifier(),{...runtime,GCLOUD_PROJECT:'gasstationproject-9dd89'}),{code:'ACCESS_DENIED'});
for(const [path,value,code] of [
  ['demoState/demo-fuel',{generation:8,resetting:false},'DEMO_GENERATION_CHANGED'],
  ['demoState/demo-fuel',{generation:7,resetting:true},'DEMO_RESETTING'],
  ['platformAdmins/demo-fuel-owner-g7',{status:'ACTIVE'},'ACCESS_DENIED'],
  ['tenantMemberships/demo-fuel-owner-g7_demo-fuel',{uid:claims.uid,tenantId:'demo-fuel',role:'OWNER',status:'REVOKED'},'ACCESS_DENIED'],
]){
  const rows=docs();rows.set(path,value);
  await assert.rejects(()=>authorize(rows),{code});
}
console.log('PUBLIC_DEMO_ADMISSION_AUTH_PASS');

const seed=need('initialAdmissionState')('demo-fuel',7,6,1);
assert.deepEqual(seed,{
  tenantId:'demo-fuel',generation:7,successfulMutations:0,draftSaveCount:0,shiftWriteOps:0,
  employeeCreates:6,absenceCreates:1,announcementCreates:0,draftCreates:0,shiftCreates:0,
  pdfIntentCreates:0,auditOnlyCount:0,nextAuditSequence:0,receipts:{},
});
assert.deepEqual(need('validateAdmissionState')(seed,'demo-fuel',7),seed);
for(const value of [{...seed,employeeCreates:33},{...seed,generation:8},{...seed,receipts:{['emp_'+uuid]:{token:'forbidden'}}},{...seed,unexpected:true}]){
  assert.throws(()=>admission.validateAdmissionState(value,'demo-fuel',7),{code:'ADMISSION_STATE_INVALID'});
}
const auditSeed=need('initialAuditReceiptState')('demo-fuel',7);
assert.deepEqual(auditSeed,{tenantId:'demo-fuel',generation:7,receipts:{}});
assert.deepEqual(need('validateAuditReceiptState')(auditSeed,'demo-fuel',7),auditSeed);
assert.throws(()=>admission.validateAuditReceiptState({...auditSeed,receipts:{['aud_'+uuid]:{rawBody:'x'.repeat(300)}}},'demo-fuel',7),{code:'ADMISSION_STATE_INVALID'});
assert.deepEqual(need('validateDailyState')(undefined,'demo-fuel','2026-09-30'),{tenantId:'demo-fuel',utcDay:'2026-09-30',successfulMutations:0,shiftWriteOps:0,auditOnlyEvents:0});
assert.deepEqual(need('validateRateState')(undefined,'demo-fuel',123),{tenantId:'demo-fuel',minute:123,attempts:0});
assert.throws(()=>admission.validateDailyState({tenantId:'demo-fuel',utcDay:'2026-10-01',successfulMutations:512,shiftWriteOps:10000,auditOnlyEvents:1000},'demo-fuel','2026-09-30'),{code:'ADMISSION_STATE_INVALID'});
assert.throws(()=>admission.validateRateState({tenantId:'demo-fuel',minute:124,attempts:60},'demo-fuel',123),{code:'ADMISSION_STATE_INVALID'});
assert.deepEqual(need('validatePdfLimitState')({retainedIntentCount:0,hour:1,count:7,downloadMinute:1,downloadCount:4},'demo-fuel').retainedIntentCount,0);
assert.throws(()=>admission.validatePdfLimitState({retainedIntentCount:801},'demo-fuel'),{code:'ADMISSION_STATE_INVALID'});
assert.throws(()=>admission.validatePdfLimitState({retainedIntentCount:0,hour:1},'demo-fuel'),{code:'ADMISSION_STATE_INVALID'});
assert.throws(()=>admission.validatePdfLimitState({retainedIntentCount:0,hour:1,count:31},'demo-fuel'),{code:'ADMISSION_STATE_INVALID'});
assert.throws(()=>admission.validatePdfLimitState({retainedIntentCount:0,publishMinute:1,publishRequestCount:61},'demo-fuel'),{code:'ADMISSION_STATE_INVALID'});
assert.equal(need('assertRetainedIntentCount')({retainedIntentCount:2},'demo-fuel',2),2);
assert.throws(()=>admission.assertRetainedIntentCount({retainedIntentCount:2},'demo-fuel',1),{code:'ADMISSION_STATE_INVALID'});
console.log('PUBLIC_DEMO_ADMISSION_SCHEMAS_PASS');

class LocalDatabase {
  constructor(){this.rows=docs();this.rows.set('demoAdmission/demo-fuel',structuredClone(seed));this.tail=Promise.resolve();}
  async transaction(run){
    const previous=this.tail;let release;this.tail=new Promise(resolve=>release=resolve);await previous;
    const next=structuredClone(this.rows);
    const tx={get:async path=>structuredClone(next.get(path)),set:(path,value)=>next.set(path,structuredClone(value)),
      create:(path,value)=>{assert.equal(next.has(path),false,'create precondition');next.set(path,structuredClone(value));},
      delete:path=>next.delete(path)};
    try{const result=await run(tx);this.rows=next;return result;}finally{release();}
  }
}
const input={fullName:'Φανταστικός εργαζόμενος'};
const commandId='emp_'+uuid;
const now=Date.parse('2026-09-30T12:00:00Z');
const db=new LocalDatabase();
const attempt=need('chargeMutationAttempt');
assert.equal(await attempt(db,await authenticate(),{commandId,operation:'emp.create',input,now}),true);
assert.deepEqual(db.rows.get('demoAdmissionRate/demo-fuel'),{tenantId:'demo-fuel',minute:Math.floor(now/60000),attempts:1});
const runPrimary=need('runPrimaryAdmission');
const action={commandId,operation:'emp.create',input,now,
  write:async tx=>{tx.create('tenants/demo-fuel/employees/visitor-one',{fullName:input.fullName});return {result:{id:'visitor-one',status:'created'},delta:{employeeCreates:1}};}};
const result=await runPrimary(db,await authenticate(),action);
assert.deepEqual(result,{id:'visitor-one',status:'created'});
assert.equal(db.rows.get('demoAdmission/demo-fuel').employeeCreates,7);
assert.equal(db.rows.get('demoAdmission/demo-fuel').successfulMutations,1);
assert.equal(db.rows.get('demoAdmissionDaily/demo-fuel').successfulMutations,1);
assert.equal(db.rows.get('tenants/demo-fuel/auditLogs/log_000').actorUid,claims.uid);
assert.equal(db.rows.get('tenants/demo-fuel/auditLogs/log_000').action,'emp.create');
const beforeReplay=structuredClone(db.rows);
assert.deepEqual(await runPrimary(db,await authenticate(),{...action,write:async()=>assert.fail('replay must not execute writer')}),result);
assert.deepEqual(db.rows,beforeReplay,'replay does not charge or write');
await assert.rejects(async()=>runPrimary(db,await authenticate(),{...action,input:{fullName:'different'}}),{code:'ADMISSION_COMMAND_CONFLICT'});
assert.deepEqual(db.rows,beforeReplay,'mismatch changes nothing');
const failedId='emp_12345678-1234-4123-8123-123456789abd';
await assert.rejects(async()=>runPrimary(db,await authenticate(),{...action,commandId:failedId,write:async tx=>{tx.create('tenants/demo-fuel/employees/rolled-back',{fullName:'x'});throw Error('storage failed');}}));
assert.equal(db.rows.has('tenants/demo-fuel/employees/rolled-back'),false);
assert.equal(db.rows.get('demoAdmission/demo-fuel').successfulMutations,1);
console.log('PUBLIC_DEMO_ADMISSION_PRIMARY_PASS');

const atCap=new LocalDatabase();atCap.rows.get('demoAdmission/demo-fuel').employeeCreates=31;
await runPrimary(atCap,await authenticate(),{...action,write:async tx=>{tx.create('tenants/demo-fuel/employees/last',{fullName:'Τελευταίος'});return {result:{id:'last'},delta:{employeeCreates:1}};}});
assert.equal(atCap.rows.get('demoAdmission/demo-fuel').employeeCreates,32);
await assert.rejects(async()=>runPrimary(atCap,await authenticate(),{...action,commandId:failedId,write:async tx=>{tx.create('tenants/demo-fuel/employees/over-cap',{fullName:'x'});return {result:{id:'over-cap'},delta:{employeeCreates:1}};}}),{code:'ADMISSION_LIMIT_REACHED'});
assert.equal(atCap.rows.has('tenants/demo-fuel/employees/over-cap'),false,'failed quota transaction rolls back staged document');
assert.equal(atCap.rows.has('tenants/demo-fuel/employees/rolled-back'),false);
const fullRate=new LocalDatabase();fullRate.rows.set('demoAdmissionRate/demo-fuel',{tenantId:'demo-fuel',minute:Math.floor(now/60000),attempts:59});
assert.equal(await attempt(fullRate,await authenticate(),{commandId,operation:'emp.create',input,now}),true);
assert.equal(fullRate.rows.get('demoAdmissionRate/demo-fuel').attempts,60);
await assert.rejects(async()=>attempt(fullRate,await authenticate(),{commandId,operation:'emp.create',input,now}),{code:'ADMISSION_LIMIT_REACHED'});
assert.equal(await attempt(fullRate,await authenticate(),{commandId,operation:'emp.create',input,now:now+60000}),true);
assert.equal(fullRate.rows.get('demoAdmissionRate/demo-fuel').attempts,1);
const rollover=new LocalDatabase();rollover.rows.set('demoAdmissionDaily/demo-fuel',{tenantId:'demo-fuel',utcDay:'2026-09-29',successfulMutations:512,shiftWriteOps:10000,auditOnlyEvents:1000});
await runPrimary(rollover,await authenticate(),{...action,write:async()=>({result:{id:'new-day'},delta:{employeeCreates:1}})});
assert.equal(rollover.rows.get('demoAdmissionDaily/demo-fuel').successfulMutations,1);
assert.equal(rollover.rows.get('demoAdmissionDaily/demo-fuel').utcDay,'2026-09-30');
const staleDb=new LocalDatabase();staleDb.rows.get('demoState/demo-fuel').generation=8;
await assert.rejects(async()=>runPrimary(staleDb,await authenticate(),action),{code:'DEMO_GENERATION_CHANGED'});
assert.equal(staleDb.rows.get('demoAdmission/demo-fuel').successfulMutations,0);
const parallel=new LocalDatabase();parallel.rows.get('demoAdmission/demo-fuel').employeeCreates=31;
const candidates=Array.from({length:12},(_,n)=>{
  const id=`emp_12345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`;
  return runPrimary(parallel,{...identity,reverify:async()=>{}},{...action,commandId:id,write:async tx=>{tx.create(`tenants/demo-fuel/employees/parallel-${n}`,{fullName:'x'});return {result:{id:`parallel-${n}`},delta:{employeeCreates:1}};}});
});
const settled=await Promise.allSettled(candidates);
assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
assert.equal(settled.filter(x=>x.status==='rejected'&&x.reason?.code==='ADMISSION_LIMIT_REACHED').length,11);
assert.equal(parallel.rows.get('demoAdmission/demo-fuel').employeeCreates,32);
console.log('PUBLIC_DEMO_ADMISSION_QUOTAS_PASS');

const auditDb=new LocalDatabase();auditDb.rows.set('demoAuditReceipts/demo-fuel',structuredClone(auditSeed));
const auditCommand={commandId:'aud_'+uuid,operation:'aud.export',input:{format:'PDF',scope:'WEEK'},now};
const auditOnly=need('runAuditOnlyAdmission');
const auditResult=await auditOnly(auditDb,await authenticate(),auditCommand);
assert.deepEqual(auditResult,{status:'recorded',sequence:0});
assert.equal(auditDb.rows.get('demoAdmission/demo-fuel').nextAuditSequence,1);
assert.equal(auditDb.rows.get('demoAdmission/demo-fuel').auditOnlyCount,1);
assert.equal(auditDb.rows.get('demoAdmissionDaily/demo-fuel').auditOnlyEvents,1);
assert.equal(auditDb.rows.get('tenants/demo-fuel/auditLogs/log_000').actorUid,claims.uid);
const beforeAuditReplay=structuredClone(auditDb.rows);
assert.deepEqual(await auditOnly(auditDb,await authenticate(),auditCommand),auditResult);
assert.deepEqual(auditDb.rows,beforeAuditReplay);
await assert.rejects(async()=>auditOnly(auditDb,await authenticate(),{...auditCommand,input:{format:'WORD'}}),{code:'ADMISSION_COMMAND_CONFLICT'});

const wrapped=new LocalDatabase();
const priorAuditReceipts={};for(let n=0;n<512;n++)priorAuditReceipts[`aud_12345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`]={generation:7,operation:'aud.export',hash:'a'.repeat(64),result:{status:'recorded',sequence:n}};
wrapped.rows.set('demoAuditReceipts/demo-fuel',{tenantId:'demo-fuel',generation:7,receipts:priorAuditReceipts});
wrapped.rows.get('demoAdmission/demo-fuel').auditOnlyCount=512;
wrapped.rows.get('demoAdmission/demo-fuel').nextAuditSequence=512;
wrapped.rows.set('tenants/demo-fuel/auditLogs/log_000',{sequence:0,action:'aud.export'});
const wrapResult=await auditOnly(wrapped,await authenticate(),{...auditCommand,commandId:'aud_87654321-1234-4123-8123-123456789abc'});
assert.equal(wrapResult.sequence,512);
assert.equal(wrapped.rows.get('tenants/demo-fuel/auditLogs/log_000').sequence,512);
assert.equal(wrapped.rows.get('demoAuditReceipts/demo-fuel').receipts['aud_12345678-1234-4123-8123-000000000001'].result.sequence,0,'old receipt survives ring overwrite');
const concurrentAudit=new LocalDatabase();concurrentAudit.rows.set('demoAuditReceipts/demo-fuel',structuredClone(auditSeed));
const concurrent=await Promise.all(Array.from({length:20},(_,n)=>auditOnly(concurrentAudit,{...identity,reverify:async()=>{}},{...auditCommand,commandId:`aud_12345678-1234-4123-8123-${String(n+1).padStart(12,'0')}`})));
assert.deepEqual(concurrent.map(x=>x.sequence).sort((a,b)=>a-b),Array.from({length:20},(_,n)=>n));
assert.equal(concurrentAudit.rows.get('demoAdmission/demo-fuel').nextAuditSequence,20);
assert.equal(Object.keys(concurrentAudit.rows.get('demoAuditReceipts/demo-fuel').receipts).length,20);
console.log('PUBLIC_DEMO_ADMISSION_AUDIT_PASS');

// The quota delta for a draft is discovered from authoritative target existence
// inside the same transaction, never supplied before that read.
const discovered=new LocalDatabase();
const draftResult=await runPrimary(discovered,await authenticate(),{
  commandId:'drf_87654321-1234-4123-8123-123456789abc',operation:'drf.save',input:{id:'draft-one'},now,
  write:async tx=>{
    tx.create('tenants/demo-fuel/shifts/draft-one_0',{draftId:'draft-one'});
    tx.create('tenants/demo-fuel/shifts/draft-one_1',{draftId:'draft-one'});
    tx.create('tenants/demo-fuel/scheduleDrafts/draft-one',{id:'draft-one',revision:1});
    return {result:{id:'draft-one',revision:1,status:'saved'},delta:{draftSaveCount:1,draftCreates:1,shiftCreates:2,shiftWriteOps:2}};
  },
});
assert.deepEqual(draftResult,{id:'draft-one',revision:1,status:'saved'});
assert.equal(discovered.rows.get('demoAdmission/demo-fuel').shiftCreates,2);
assert.equal(discovered.rows.get('demoAdmission/demo-fuel').shiftWriteOps,2);
assert.equal(discovered.rows.get('demoAdmission/demo-fuel').draftCreates,1);
assert.equal(discovered.rows.get('demoAdmission/demo-fuel').draftSaveCount,1);
console.log('PUBLIC_DEMO_ADMISSION_DERIVED_DELTA_PASS');
