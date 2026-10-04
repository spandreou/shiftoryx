import assert from 'node:assert/strict';
import {getApps} from '../../functions/node_modules/firebase-admin/lib/app/index.js';
import {dbAdmin,bucket,close} from './test-support.mjs';
const adapter=await import('../../functions/src/public-demo/reset-adapters.ts').catch(error=>{
  if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error;
});
assert.equal(typeof adapter.createDemoResetAdapters,'function','B3 bounded native reset adapter missing');
const {database,storage}=adapter.createDemoResetAdapters(getApps()[0]);
try{
  for(let n=0;n<3;n++)await dbAdmin.doc(`tenants/demo-fuel/auditLogs/adapter-count-${n}`).set({fictional:true});
  for(const tenant of ['demo-fuel','demo-cafe'])for(let n=0;n<2;n++)
    await dbAdmin.doc(`monthly_schedule_exports/adapter-${tenant}-${n}`).set({tenantId:tenant,fictional:true});
  assert.equal(await database.transaction(tx=>tx.count('tenants/demo-fuel/auditLogs',2)),2,
    'aggregate must respect the explicit query limit');
  assert.equal(await database.transaction(tx=>tx.count('tenants/demo-fuel/auditLogs',4)),3);
  assert.equal(await database.transaction(tx=>tx.count('monthly_schedule_exports',3,{tenantId:'demo-fuel'})),2,
    'root count must select stored exact tenantId');
  await assert.rejects(()=>database.transaction(tx=>tx.count('monthly_schedule_exports',3)),{code:'RESET_ACCESS_DENIED'});
  await assert.rejects(()=>database.transaction(tx=>tx.count('tenants/bp-kallis/employees',3)),{code:'RESET_ACCESS_DENIED'});
  const own='tenants/demo-fuel/schedule-publications/adapter-probe/schedule.pdf',foreign='tenants/demo-cafe/schedule-publications/adapter-probe/schedule.pdf';
  await bucket.file(own).save('%PDF-fictional-adapter',{contentType:'application/pdf'});
  await bucket.file(foreign).save('%PDF-fictional-adapter',{contentType:'application/pdf'});
  const objects=await storage.list('demo-fuel',33),object=objects.find(row=>row.name===own);
  assert.ok(object&&/^\d+$/.test(object.generation));
  await assert.rejects(()=>storage.remove('demo-fuel',{name:foreign,generation:object.generation}),{code:'RESET_ACCESS_DENIED'});
  assert.equal((await bucket.file(foreign).exists())[0],true);
  await storage.remove('demo-fuel',object);assert.equal((await bucket.file(own).exists())[0],false);
  console.log('B3_NATIVE_RESET_ADAPTER_PASS boundedAggregates exactRootTenant exactStoragePathGeneration');
}finally{await close();}
