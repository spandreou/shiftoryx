import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateRecoveryBaseline} from './lib/demoMaintenance.ts';
const api=await import('./lib/demoObservation.ts').catch(()=>({}));
test.beforeEach(()=>assert.equal(typeof api.parseObservationDossier,'function','observation implementation is required before negative checks'));
const at='2026-10-06T10:00:00.000Z',now=Date.parse('2026-10-06T10:05:00Z');
const project='shiftoryx-public-demo',bucket=project+'.firebasestorage.app';
const present={resourceType:'CONTROL',resource:'controls/demo-fuel',state:'OBSERVED_PRESENT',observedAt:at,
  source:{id:'control-read-1',method:'GET',httpStatus:200},value:{tenantId:'demo-fuel',representation:'OBSERVED_LEGACY_IDLE',
    stateObservedAt:at,controlObservedAt:at,raw:{generation:12,resetting:false,weekStart:'2026-10-05',lastResetAt:Date.parse('2026-10-06T01:00:00Z'),lease:null,leaseUntil:0,previousOwner:null}}};
export function dossier(){return {schemaVersion:1,kind:'OBSERVATION_DOSSIER',qualificationSha:'e795677e3896f99ca99346bdd848367dfcd9495e',
  projectId:project,projectNumber:'848554493137',database:'(default)',region:'us-central1',bucket,
  captureStartedAt:'2026-10-06T09:59:00.000Z',captureCompletedAt:at,observations:[structuredClone(present)]};}
function sealed(value,hash){assert.equal(typeof api.parseObservationDossier,'function','missing observation contract');
  const bytes=JSON.stringify(value);return api.parseObservationDossier(bytes,hash??createHash('sha256').update(bytes).digest('hex'),now);}
test('legacy idle remains raw evidence, not rewritten target OPEN',()=>{
  const value=dossier(),before=structuredClone(value);const result=sealed(value);
  assert.deepEqual(result.dossier,before);assert.equal(result.classifications['controls/demo-fuel'],'LEGACY_IDLE_COMPATIBLE');
  assert.equal(Object.hasOwn(result.dossier.observations[0].value.raw,'phase'),false);
  assert.equal(Object.isFrozen(result.dossier.observations[0].value.raw),true);
});
test('explicit target OPEN is distinguished from legacy absence',()=>{
  const value=dossier();const item=value.observations[0];item.value.representation='OBSERVED_TARGET_OPEN';
  Object.assign(item.value.raw,{phase:'OPEN',controlPhase:'OPEN'});
  assert.equal(sealed(value).classifications['controls/demo-fuel'],'TARGET_OPEN_OBSERVED');
});
test('authoritative resource absence carries no fake document/hash',()=>{
  const value=dossier();value.observations=[{resourceType:'RETENTION',resource:'demoAdmission/demo-fuel',state:'AUTHORITATIVELY_ABSENT',
    observedAt:at,source:{id:'read-404',method:'GET',httpStatus:404}}];
  assert.equal(sealed(value).dossier.observations[0].state,'AUTHORITATIVELY_ABSENT');
});
test('unreadable and not-observed states do not pretend confirmed absence',()=>{
  for(const [state,method,httpStatus] of [['UNREADABLE','GET',403],['NOT_OBSERVED','NONE',null]]){
    const value=dossier();value.observations=[{resourceType:'RETENTION',resource:'demoAdmission/demo-fuel',state,observedAt:at,source:{id:'unproven-1',method,httpStatus}}];
    assert.equal(sealed(value).dossier.observations[0].state,state);
  }
});
const changes={
  'unknown evidence state':v=>v.observations[0].state='UNKNOWN',
  'missing timestamp':v=>delete v.observations[0].observedAt,
  'wrong project':v=>v.projectId='unknown',
  'production contamination':v=>v.projectId='gasstationproject-9dd89',
  'mixed bucket':v=>v.bucket='other.firebasestorage.app',
  'wrong project number':v=>v.projectNumber='1',
  'stale window':v=>{v.captureStartedAt='2026-10-06T08:00:00.000Z';v.captureCompletedAt='2026-10-06T08:01:00.000Z';v.observations[0].observedAt=v.captureCompletedAt;},
  'excessive mixed capture window':v=>v.captureStartedAt='2026-10-06T08:58:00.000Z',
  'malformed date':v=>v.captureCompletedAt='2026-02-30T10:00:00.000Z',
  'observation outside capture':v=>v.observations[0].observedAt='2026-10-06T09:58:00.000Z',
  'malformed legacy lease':v=>v.observations[0].value.raw.lease='active-lease',
  'legacy still resetting':v=>v.observations[0].value.raw.resetting=true,
  'legacy phase silently normalized':v=>v.observations[0].value.raw.phase='OPEN',
  'foreign tenant':v=>v.observations[0].value.tenantId='demo-cafe',
  'unproven extra payload':v=>v.observations[0].value.raw.notes='private',
  'duplicate resource':v=>v.observations.push(structuredClone(v.observations[0])),
  'unreviewed top-level field':v=>v.restorationApproved=true,
  'absence with fake document':v=>v.observations=[{resourceType:'RETENTION',resource:'demoAdmission/demo-fuel',state:'AUTHORITATIVELY_ABSENT',observedAt:at,source:{id:'read-404',method:'GET',httpStatus:404},value:{sha256:'0'.repeat(64)}}],
  '403 cannot prove absence':v=>v.observations=[{resourceType:'RETENTION',resource:'demoAdmission/demo-fuel',state:'AUTHORITATIVELY_ABSENT',observedAt:at,source:{id:'read-denied',method:'GET',httpStatus:403}}],
  'empty digest masquerading as evidence':v=>v.observations=[{resourceType:'FIRESTORE_RULES',resource:'projects/shiftoryx-public-demo/releases/cloud.firestore',state:'OBSERVED_PRESENT',observedAt:at,source:{id:'rules-1',method:'GET',httpStatus:200},value:{release:'projects/shiftoryx-public-demo/releases/cloud.firestore',rulesetId:'projects/shiftoryx-public-demo/rulesets/example',sha256:'',updateTime:at}}],
};
for(const [name,change]of Object.entries(changes))test('reject '+name,()=>{const value=dossier();change(value);assert.throws(()=>sealed(value));});
test('wrong external seal fails even for valid fields',()=>assert.throws(()=>sealed(dossier(),'f'.repeat(64))));
test('strict parsing rejects duplicates and dangerous keys',()=>{
  assert.equal(typeof api.parseObservationDossier,'function');
  for(const text of ['{"schemaVersion":1,"schemaVersion":1}','{"__proto__":{}}','{"constructor":{}}','{"prototype":{}}','{'])
    assert.throws(()=>api.parseObservationDossier(text,createHash('sha256').update(text).digest('hex'),now));
});
test('observation-only metadata cannot satisfy strict recovery baseline',()=>{
  assert.throws(()=>validateRecoveryBaseline(dossier()));
  const result=sealed(dossier());assert.throws(()=>validateRecoveryBaseline(result.dossier));
});
test('sealed parsing owns bytes rather than caller mutable input',()=>{
  assert.equal(typeof api.parseObservationDossier,'function');const bytes=Buffer.from(JSON.stringify(dossier()));
  const result=api.parseObservationDossier(bytes,createHash('sha256').update(bytes).digest('hex'),now);
  bytes.fill(0);assert.equal(result.dossier.projectId,project);
});
