import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRecoveryBaseline,validateMaintenanceSource} from './lib/demoMaintenance.ts';
import {fileURLToPath} from 'node:url';
import {completeCutoverFixture,seal} from './test-fixtures/cutover-security-fixture.mjs';
const api=await import('./lib/demoCutover.ts').catch(()=>({}));
test.beforeEach(()=>assert.equal(typeof api.validateCutoverPreconditions,'function','missing cutover validator'));
const maintenance=validateMaintenanceSource(fileURLToPath(new URL('../maintenance/public-demo/',import.meta.url)));
test('synthetic fixture instances do not share mutable identity arrays',()=>{
  const first=completeCutoverFixture();first.expected.aliases[0]='invalid.fixture';
  assert.equal(completeCutoverFixture().expected.aliases[0],'demo.shiftoryx.gr');
});
function run(fixture){return api.validateCutoverPreconditions({qualificationSha:fixture.qualificationSha,expected:fixture.expected,
  observation:seal(fixture.observation),currentObservation:seal(fixture.currentObservation),recovery:seal(fixture.recovery),target:seal(fixture.target),capabilities:seal(fixture.capabilities),
  maintenance:{files:maintenance.bytes,sha256:api.maintenancePackageDigest(maintenance.bytes)},targetArtifact:path=>fixture.targetArtifacts.get(path),
  reviewedRuleDigests:fixture.reviewedRuleDigests,contextSha256:fixture.contextSha256,now:fixture.now});}
test('complete independent synthetic evidence validates locally but grants no deployment permission',()=>{
  const fixture=completeCutoverFixture();assert.equal(validateRecoveryBaseline(fixture.recovery),'VERIFIED');
  assert.deepEqual(run(fixture),{status:'LOCAL_PRECONDITIONS_VALID',deploymentAuthorized:false});
});
test('fresh unchanged control facts validate despite genuinely newer read provenance',()=>{
  const fixture=completeCutoverFixture();
  fixture.currentObservation.captureStartedAt='2026-10-06T10:00:01.000Z';
  fixture.currentObservation.captureCompletedAt='2026-10-06T10:01:00.000Z';
  for(const row of fixture.currentObservation.observations){row.observedAt=fixture.currentObservation.captureCompletedAt;row.source.id+='-fresh';
    if(row.resourceType==='CONTROL'){row.value.stateObservedAt=row.observedAt;row.value.controlObservedAt=row.observedAt;}}
  assert.deepEqual(run(fixture),{status:'LOCAL_PRECONDITIONS_VALID',deploymentAuthorized:false});
});
test('prepared dossier cannot be reused as independent current observation',()=>{
  const fixture=completeCutoverFixture();fixture.currentObservation=structuredClone(fixture.observation);
  assert.throws(()=>run(fixture),error=>error.code==='CUTOVER_OBSERVATION_REUSED');
});
const changes={
  'unverified recovery remains explicit blocker':f=>f.recovery.status='CAPTURED_UNVERIFIED',
  'observation cannot replace recovery':f=>f.recovery=structuredClone(f.observation),
  'missing backup':f=>f.recovery.backup=null,
  'wrong project':f=>f.expected.projectId='production',
  'wrong project number':f=>f.expected.projectNumber='0',
  'wrong bucket':f=>f.expected.bucket='production.appspot.com',
  'unknown alias':f=>f.expected.aliases[0]='unknown.shiftoryx.gr',
  'qualification mismatch':f=>f.target.qualificationSha='f'.repeat(40),
  'source context mismatch':f=>f.target.contextSha256='f'.repeat(64),
  'missing ninth function':f=>f.target.functions.pop(),
  'unapproved extra function':f=>f.target.functions.push({...f.target.functions[0],name:'adminEndpoint'}),
  'artifact bytes differ':f=>f.targetArtifacts.set('backend/generated.js',Buffer.from('different')),
  'artifact traversal':f=>f.target.frontend.path='../private-file',
  'target Rules are not the reviewed bytes':f=>f.reviewedRuleDigests.firestore='f'.repeat(64),
  'broker not tested':f=>f.capabilities.broker='DOCUMENTED_ONLY',
  'global entry not tested':f=>f.capabilities.globalEntry='NOT_AVAILABLE',
  'deployed capability cannot be faked locally':f=>f.capabilities.broker='DEPLOYED_AND_PROVEN',
  'stale dossier':f=>f.now+=2*60*60*1000,
  'generation drift':f=>f.currentObservation.observations.find(x=>x.resourceType==='CONTROL').value.raw.generation++,
  'rules release drift':f=>f.currentObservation.observations.find(x=>x.resourceType==='FIRESTORE_RULES').value.rulesetId='projects/shiftoryx-public-demo/rulesets/changed',
  'function revision drift':f=>f.currentObservation.observations.find(x=>x.resourceType==='FUNCTION').value.revision='createauthticket-changed',
  'schedule drift':f=>f.currentObservation.observations.find(x=>x.resourceType==='SCHEDULE').value.state='PAUSED',
  'alias assignment drift':f=>f.currentObservation.observations.find(x=>x.resourceType==='HOST_ASSIGNMENT').value.deploymentId='dpl_changed',
  'required category missing':f=>f.currentObservation.observations=f.currentObservation.observations.filter(x=>x.resourceType!=='AUTH'),
  'authoritative absence not substituted for restore document':f=>{const r=f.currentObservation.observations.find(x=>x.resourceType==='RETENTION');r.state='AUTHORITATIVELY_ABSENT';r.source.httpStatus=404;delete r.value;},
};
for(const [name,change]of Object.entries(changes))test('cutover rejects '+name,()=>{const fixture=completeCutoverFixture();change(fixture);assert.throws(()=>run(fixture));});
test('independent external seal mismatch fails closed',()=>{
  const fixture=completeCutoverFixture(),input={...seal(fixture.recovery),sha256:'f'.repeat(64)};
  assert.throws(()=>api.validateCutoverPreconditions({recovery:input,qualificationSha:fixture.qualificationSha,expected:fixture.expected}));
});
test('current CAPTURED_UNVERIFIED is rejected for precise missing-recovery reason',()=>{
  const fixture=completeCutoverFixture();fixture.recovery.status='CAPTURED_UNVERIFIED';
  assert.throws(()=>run(fixture),error=>error.code==='CUTOVER_RECOVERY_NOT_VERIFIED');
});
