import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dbAdmin,bucket,login,rpc,close} from './test-support.mjs';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {RESET_COLLECTIONS} from '../../functions/src/public-demo/reset-inventory.ts';
const businessCollections=['employees','shifts','shiftTemplates','absences','attendanceHistory','weekLocks','weekHistory','weekTemplates','settings','announcements','subscription','tokenRequests','auditLogs','publicSchedules','publicMonths','publicEmployees','publicAnnouncements','scheduleDrafts','schedulePublications','schedulePublicationCounters','schedulePublicationReservations','schedulePublicationPeriods','demoPublicationArtifacts'];
// Inventory bound to actual nested Rules surfaces, not a demo-name heuristic.
const rules=readFileSync(new URL('../../firestore.demo.rules',import.meta.url),'utf8');
const nested=[...rules.slice(rules.indexOf('    match /tenants/{tenantId} {')).matchAll(/^      match \/([^/{]+)\//gm)].map(m=>m[1]);
assert.deepEqual([...businessCollections].sort(),nested.sort(),'Review reset inventory when a tenant Rules surface changes');
const reservedCollections=['exportAuditLogs','monthlyScheduleArchives'];
const cleanupCollections=[...businessCollections,...reservedCollections];
assert.deepEqual([...RESET_COLLECTIONS].sort(),[...cleanupCollections].sort(),'Locked inventory includes both reserved auxiliary collections');
try{
  const client=await login('demo-fuel'),token=await client.auth.currentUser.getIdToken();
  for(const tenant of ['demo-fuel','demo-cafe','bp-kallis']){
    for(const collection of cleanupCollections)await dbAdmin.doc(`tenants/${tenant}/${collection}/reset-coverage-probe`).set({tenantId:tenant,probe:true});
    await dbAdmin.doc(`monthly_schedule_exports/${tenant}_2026-09`).set({tenantId:tenant,yearMonth:'2026-09',fileName:'program_month_2026-09.pdf',storagePath:`tenants/${tenant}/monthly_schedule_pdfs/2026-09/program_month_2026-09.pdf`,createdBy:'fictional',shiftCount:1,status:'READY',createdAt:'test',updatedAt:'test'});
    for(const path of [`tenants/${tenant}/monthly_schedule_pdfs/2026-09/program_month_2026-09.pdf`,`tenants/${tenant}/schedule-publications/reset-coverage-probe/schedule.pdf`])await bucket.file(path).save('%PDF-fictional',{contentType:'application/pdf'});
  }
  for(const tenantId of ['bp-kallis','demo-unknown','../bp-kallis','demo-cafe'])assert.equal((await rpc('resetPublicDemo',{tenantId},token)).status,403);
  const response=await rpc('resetPublicDemo',{tenantId:'demo-fuel'},token);assert.equal(response.status,200);
  for(const collection of cleanupCollections)assert.equal((await dbAdmin.doc(`tenants/demo-fuel/${collection}/reset-coverage-probe`).get()).exists,false,'reset clears '+collection);
  assert.equal((await dbAdmin.doc('monthly_schedule_exports/demo-fuel_2026-09').get()).exists,false,'reset removes root monthly export metadata');
  assert.equal((await bucket.getFiles({prefix:'tenants/demo-fuel/'}))[0].length,0,'no orphaned monthly or publication PDFs');
  for(const tenant of ['demo-cafe','bp-kallis']){for(const collection of cleanupCollections)assert.equal((await dbAdmin.doc(`tenants/${tenant}/${collection}/reset-coverage-probe`).get()).exists,true,'foreign artifact unchanged');assert.equal((await dbAdmin.doc(`monthly_schedule_exports/${tenant}_2026-09`).get()).exists,true);assert.equal((await bucket.getFiles({prefix:`tenants/${tenant}/`}))[0].length,2);}
  const fixture=publicDemoFixture('demo-fuel',new Date());
  for(const {id,...employee} of fixture.employees)assert.deepEqual((await dbAdmin.doc(`tenants/demo-fuel/employees/${id}`).get()).data(),employee);
  for(const absence of fixture.absences)assert.deepEqual((await dbAdmin.doc(`tenants/demo-fuel/absences/${absence.id}`).get()).data(),absence);
  assert.deepEqual((await dbAdmin.doc('tenants/demo-fuel/settings/scheduler').get()).data().schedulerConfigV3,fixture.config);
  console.log('RESET_COVERAGE_PASS tenantCollections=25 rulesSurfaces=23 reservedAuxiliary=2 rootCollections=1 storageFamilies=2 foreignSentinels=2 generationFidelity=UNSUPPORTED');
}finally{await close();}
