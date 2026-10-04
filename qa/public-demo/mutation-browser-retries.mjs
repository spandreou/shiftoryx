import assert from 'node:assert/strict';
import {dbAdmin,close} from './test-support.mjs';

export async function mutationBrowserRetries(page,tenant,record){
  let loseNext=null;const requests=[];
  const handler=async route=>{
    const command=route.request().postDataJSON();requests.push({operation:command.operation,commandId:command.commandId});
    if(command.operation===loseNext){loseNext=null;const response=await route.fetch();
      assert.equal(response.status(),200,'lost-response case requires a committed server operation');
      await route.abort('failed');return;
    }
    await route.continue();
  };
  await page.route('**/us-central1/mutatePublicDemo',handler);
  async function adapter(action,input){return page.evaluate(async({tenant,action,input})=>{
    try{
      const employee=await import('/src/firebase/employeeService.js');
      const absence=await import('/src/firebase/absenceService.js');
      const announcement=await import('/src/firebase/announcementService.js');
      const audit=await import('/src/firebase/exportAuditService.js');
      let result;
      switch(action){
        case 'employee.create':result=await employee.createEmployee({tenantId:tenant,...input});break;
        case 'employee.delete':result=await employee.removeEmployee(input.id,{tenantId:tenant});break;
        case 'absence.create':result=await absence.createEmployeeAbsence({tenantId:tenant,...input});break;
        case 'absence.update':result=await absence.updateEmployeeAbsence(input.id,input.patch,{tenantId:tenant});break;
        case 'absence.delete':result=await absence.removeEmployeeAbsence(input.id,{tenantId:tenant});break;
        case 'announcement.create':result=await announcement.createAnnouncement({tenantId:tenant,...input});break;
        case 'announcement.delete':result=await announcement.removeAnnouncement(input.id,{tenantId:tenant});break;
        case 'audit':result=await audit.writeExportAuditLog({tenantId:tenant,exportType:'PDF',exportScope:'WEEK',status:'SUCCESS'});break;
        default:throw new Error('Unknown bounded QA action');
      }
      return {ok:true,result:result??null};
    }catch(error){return {ok:false,code:error.code??error.name};}
  },{tenant,action,input});}
  async function reload(){await page.reload();await page.getByTestId('scheduler-v3-workspace').waitFor({timeout:90000});}
  async function loseAndReplay(operation,action,input,collection,id){
    loseNext=operation;const lost=await adapter(action,input);assert.equal(lost.code,'NETWORK');
    const command=requests.at(-1).commandId;
    assert.equal((await dbAdmin.doc(`tenants/${tenant}/${collection}/${id}`).get()).exists,false);
    const before=(await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations;
    assert.equal((await adapter('audit',{})).ok,true);await reload();
    assert.equal((await adapter(action,input)).ok,true,'missing target must replay original delete receipt');
    assert.equal(requests.filter(request=>request.commandId===command).length,2);
    assert.equal((await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations,before);
    record(tenant,`${operation}: committed delete + lost response + independent action + reload + same receipt replay`);
  }
  try{
    const name='Φανταστικός retry '+Date.now().toString(36);
    loseNext='emp.create';assert.equal((await adapter('employee.create',{fullName:name})).code,'NETWORK');
    const firstCommand=requests.at(-1).commandId;
    assert.equal((await adapter('audit',{})).ok,true);await reload();
    const created=await adapter('employee.create',{fullName:name});assert.equal(created.ok,true);
    assert.equal(requests.filter(request=>request.commandId===firstCommand).length,2);
    assert.equal((await dbAdmin.collection(`tenants/${tenant}/employees`).where('fullName','==',name).get()).size,1);
    record(tenant,'emp.create: independent action and reload preserve ambiguous command without duplicate employee');
    await loseAndReplay('emp.delete','employee.delete',{id:created.result.id},'employees',created.result.id);
    const person=await adapter('employee.create',{fullName:'Φανταστικός absence retry'});assert.equal(person.ok,true);
    const first=new Date().toISOString().slice(0,10);
    const absence=await adapter('absence.create',{employeeId:person.result.id,type:'OTHER',startDate:first,endDate:first,
      scope:'FULL_DAY',replacementMode:'AUTO',manualReplacementEmployeeId:'',note:'Δοκιμή replay',status:'ACTIVE'});
    assert.equal(absence.ok,true);
    loseNext='abs.update';
    assert.equal((await adapter('absence.update',{id:absence.result.id,patch:{note:'  Ενημερωμένη άδεια  ',status:'ACTIVE'}})).code,'NETWORK');
    const updateCommand=requests.at(-1).commandId,
      afterUpdate=(await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations;
    assert.equal((await adapter('audit',{})).ok,true);await reload();
    assert.equal((await adapter('absence.update',{id:absence.result.id,patch:{note:'Ενημερωμένη άδεια'}})).ok,true);
    assert.equal(requests.filter(request=>request.commandId===updateCommand).length,2,
      'canonical ACTIVE/APPROVED status and trimmed note must identify the same logical retry');
    assert.equal((await dbAdmin.doc(`demoAdmission/${tenant}`).get()).data().successfulMutations,afterUpdate);
    record(tenant,'abs.update: canonical status/note + reload replay does not charge the update twice');
    await loseAndReplay('abs.delete','absence.delete',{id:absence.result.id},'absences',absence.result.id);
    const announcement=await adapter('announcement.create',{title:'Φανταστικό retry',body:'Δοκιμαστικά στοιχεία.'});
    assert.equal(announcement.ok,true);
    await loseAndReplay('ann.delete','announcement.delete',{id:announcement.result.id},'announcements',announcement.result.id);
    assert.equal((await adapter('employee.delete',{id:person.result.id})).ok,true);await reload();
    const roundtrip=await page.evaluate(async tenant=>{
      const {schedulePublicationsRepository:r}=await import('/src/repositories/schedulePublicationsRepository.ts');
      const {createDraftV3,mapEmployeesV3,mapAbsencesV3}=await import('/src/services/schedulerV3Service.ts');
      const {useSchedulerStore}=await import('/src/hooks/useSchedulerStore.js');const state=useSchedulerStore.getState(),config=state.schedulerConfigV3;
      const date=new Date(),offset=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-offset);
      const first=date.toISOString().slice(0,10);date.setUTCDate(date.getUTCDate()+6);const last=date.toISOString().slice(0,10);
      const draft=createDraftV3({config,employees:mapEmployeesV3(state.employees,config),absences:mapAbsencesV3(state.absences,first,last),
        periodType:'WEEK',periodStart:first,periodEnd:last,options:{balanceWeeklyTargets:true}},crypto.randomUUID());
      const v1=await r.saveDraft(draft),loaded=await r.loadDraft(tenant,draft.id),count=loaded.shifts.length;
      const v2=await r.saveDraft(loaded),shorter={...loaded,revision:v2,shifts:loaded.shifts.slice(0,-1)};
      const v3=await r.saveDraft(shorter),reloaded=await r.loadDraft(tenant,draft.id);
      return {v1,v2,v3,count,reloadedCount:reloaded.shifts.length,revision:reloaded.revision};
    },tenant);
    assert.deepEqual([roundtrip.v1,roundtrip.v2,roundtrip.v3,roundtrip.revision],[1,2,3,3]);
    assert.equal(roundtrip.reloadedCount,roundtrip.count-1);
    record(tenant,'repository draft save -> load -> resave -> shrink -> reload preserves revision and server-derived shifts');
  }finally{await page.unroute('**/us-central1/mutatePublicDemo',handler);await close();}
}
