import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {dbAdmin,login,close,project,tenants} from './test-support.mjs';
import {createDraftV3,mapAbsencesV3} from '../../src/services/schedulerV3Service.ts';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';

const clients=new Map();for(const tenant of tenants)clients.set(tenant,await login(tenant));
const endpoint=`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`;
const drafts=new Map(tenants.map(tenant=>{const fixture=publicDemoFixture(tenant,new Date());
  return [tenant,createDraftV3({config:fixture.config,employees:fixture.employees,
    absences:mapAbsencesV3(fixture.absences,fixture.weekStart,fixture.weekEnd),periodType:'WEEK',
    periodStart:fixture.weekStart,periodEnd:fixture.weekEnd,
    options:{balanceWeeklyTargets:fixture.config.generationDefaults.balanceWeeklyTargetsForMonth}},`foreign_${tenant}`)];}));
async function invoke(client,operation,payload,origin){const token=await client.auth.currentUser.getIdToken();
  const response=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,
    Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({operation,
    commandId:`${operation.split('.')[0]}_${randomUUID()}`,payload}),signal:AbortSignal.timeout(120000)});
  return {status:response.status,body:await response.json()};}
const before=new Map();for(const tenant of tenants)before.set(tenant,
  (await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations);
try{
  let pairs=0;
  for(const from of tenants)for(const to of tenants){if(from===to)continue;pairs++;
    const client=clients.get(from),otherOrigin=`https://${to}.shiftoryx.gr`;
    let result=await invoke(client,'emp.create',{fullName:`Foreign ${from} to ${to}`},otherOrigin);
    assert.equal(result.status,403,`${from}->${to} origin: ${JSON.stringify(result.body)}`);
    result=await invoke(client,'emp.create',{fullName:'Ξένο',tenantId:to},`https://${from}.shiftoryx.gr`);
    assert.equal(result.status,400,`${from}->${to} tenantId injection`);
    result=await invoke(client,'set.save',{config:publicDemoFixture(to,new Date()).config,
      expectedRevision:0,profiles:[]},`https://${from}.shiftoryx.gr`);
    assert.equal(result.status,400,`${from}->${to} settings: ${JSON.stringify(result.body)}`);
    result=await invoke(client,'drf.save',{draft:drafts.get(to)},`https://${from}.shiftoryx.gr`);
    assert.equal(result.status,400,`${from}->${to} draft: ${JSON.stringify(result.body)}`);
  }
  assert.equal(pairs,12);
  for(const tenant of tenants){
    assert.equal((await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations,before.get(tenant),
      `${tenant} no foreign attempt may mutate admission`);
  }
  console.log('PUBLIC_DEMO_TYPED_ALL_12_PAIRS_PASS attempts=48 mutations=0');
}finally{await close();}
