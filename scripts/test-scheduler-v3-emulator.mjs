import assert from 'node:assert/strict';
import { connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFirestoreEmulator, doc, getDoc, updateDoc, deleteDoc, deleteField, setDoc } from 'firebase/firestore';
import { connectStorageEmulator, ref, deleteObject } from 'firebase/storage';
import { auth, db, storage } from '../src/firebase/config.js';
import { schedulePublicationsRepository as repository } from '../src/repositories/schedulePublicationsRepository.ts';
import { makeDefaultConfigV3, mapEmployeesV3, createDraftV3, createDraftFromPublicationV3, buildV3EmployeePayload } from '../src/services/schedulerV3Service.ts';
import { createEmployee } from '../src/firebase/employeeService.js';
import { buildPublicationV3 } from '../src/services/schedulePublicationService.ts';

async function main() {
  for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])if(!/^127\.0\.0\.1:\d+$/.test(process.env[key]||''))throw new Error('Local emulator variables required.');
  connectAuthEmulator(auth,'http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST,{disableWarnings:true});
  const [fh,fp]=process.env.FIRESTORE_EMULATOR_HOST.split(':');connectFirestoreEmulator(db,fh,Number(fp));
  const [sh,sp]=process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(':');connectStorageEmulator(storage,sh,Number(sp));
  const project='demo-shiftoryx-v3';
  const encode=value=>value===null?{nullValue:null}:Array.isArray(value)?{arrayValue:{values:value.map(encode)}}:typeof value==='boolean'?{booleanValue:value}:typeof value==='number'?(Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value}):typeof value==='object'?{mapValue:{fields:encodeFields(value)}}:{stringValue:String(value)};
  const encodeFields=values=>Object.fromEntries(Object.entries(values).filter(([,v])=>v!==undefined).map(([k,v])=>[k,encode(v)]));
  const seed=async(path,values)=>{
    const fields=encodeFields(values);
    const result=await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/${path}`,{method:'PATCH',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:JSON.stringify({fields})});
    assert.equal(result.ok,true,'emulator seed');
  };
  const {user}=await createUserWithEmailAndPassword(auth,`v3-${Date.now()}@example.test`,'emulator-only-12345');
  await seed(`tenantMemberships/${user.uid}_tenant-a`,{uid:user.uid,tenantId:'tenant-a',status:'ACTIVE',role:'OWNER'});
  await seed('tenants/tenant-a/employees/a',{fullName:'Μαρία'});
  const employees=mapEmployeesV3([{id:'a',fullName:'Μαρία',isActive:true}]);const config=makeDefaultConfigV3('tenant-a');
  console.log('CHECK settings');
  const settingsRef=doc(db,'tenants/tenant-a/settings/scheduler');
  await setDoc(settingsRef,{schedulerSchemaVersion:2});
  await repository.saveSettings(config,employees);
  assert.equal((await getDoc(settingsRef)).data().schedulerSchemaVersion,2,'save must not activate V3');
  await updateDoc(settingsRef,{schedulerSchemaVersion:3}); // Explicit test-fixture activation only.
  assert.equal((await getDoc(settingsRef)).data().schedulerSchemaVersion,3);
  await repository.saveSettings(config,employees);
  assert.equal((await getDoc(settingsRef)).data().schedulerSchemaVersion,3,'save must preserve active V3');
  const denied=async(operation,label)=>assert.rejects(operation,error=>error.code==='permission-denied',label);
  console.log('CHECK malformed profile fields denied');
  for(const field of ['standardShiftTemplateId','rotationAlternateShiftTemplateId'])for(const value of [{},[],12,'','../unsafe','x'.repeat(101)])await denied(()=>updateDoc(doc(db,'tenants/tenant-a/employees/a'),{['schedulerV3.'+field]:value}),field);
  for(const value of [{},[],12,'','not-a-date','2026-99-99','2026-02-31','2026-04-31','2026-02-29','1900-02-29','2100-02-29','2026-09-08','2024-02-29'])await denied(()=>updateDoc(doc(db,'tenants/tenant-a/employees/a'),{'schedulerV3.rotationAnchorWeekStart':value}),'anchor');
  for(const value of ['2024-02-26','2000-02-28','2400-02-28'])await updateDoc(doc(db,'tenants/tenant-a/employees/a'),{'schedulerV3.rotationAnchorWeekStart':value});
  await updateDoc(doc(db,'tenants/tenant-a/employees/a'),{'schedulerV3.rotationAnchorWeekStart':null});
  console.log('CHECK versioned direct profile strictness and legacy read-only compatibility');
  const employeeRef=doc(db,'tenants/tenant-a/employees/a');const canonical=employees[0].schedulerV3;
  const rotating={...canonical,standardShift:{startTime:'06:00',endTime:'14:00'},rotateStandardShiftWeekly:true,rotationAlternateShift:{startTime:'14:00',endTime:'22:00'},rotationAnchorWeekStart:'2026-09-07'};
  const malformed=[{profileVersion:1},{profileVersion:'2'},{workMode:'INVALID'},{fixedDayOff:1.5},{fixedDayOff:7},{targetWeeklyHours:-1},{targetWeeklyHours:169},{targetWeeklyHours:'40'},{rotateStandardShiftWeekly:'false'},{unexpected:'field'},
    ...['standardShift','rotationAlternateShift'].flatMap(field=>[{},[],1,'06:00',{startTime:'06:00'},{startTime:'06:00',endTime:'14:00',extra:true},{startTime:'24:00',endTime:'06:00'},{startTime:'06:10',endTime:'14:00'},{startTime:'06:00',endTime:'14:10'},{startTime:'06:00',endTime:'06:00'}].map(value=>({[field]:value}))),
    {standardShift:null},{rotationAlternateShift:null},{rotationAnchorWeekStart:null},{rotationAlternateShift:{startTime:'10:00',endTime:'18:00'}},{rotationAlternateShift:{startTime:'14:00',endTime:'18:00'}}];
  for(const [n,patch] of malformed.entries()){
    const schedulerV3={...rotating,...patch};
    await denied(()=>updateDoc(employeeRef,{schedulerV3}),'invalid direct profile update');
    await denied(()=>setDoc(doc(db,'tenants/tenant-a/employees/profile-invalid-'+n),{fullName:'Invalid',schedulerV3}),'invalid direct profile create');
  }
  for(const key of Object.keys(rotating)){
    const incomplete={...rotating};delete incomplete[key];
    await denied(()=>updateDoc(employeeRef,{schedulerV3:incomplete}),'missing profile field update');
    await denied(()=>setDoc(doc(db,'tenants/tenant-a/employees/profile-missing-'+key),{fullName:'Invalid',schedulerV3:incomplete}),'missing profile field create');
  }
  await denied(()=>updateDoc(employeeRef,{schedulerV3:deleteField()}),'profile removal');
  for(const workMode of ['NORMAL','SUBSTITUTE_ONLY'])for(const targetWeeklyHours of [null,20,24,32,37.5,40])await updateDoc(employeeRef,{schedulerV3:{...rotating,workMode,targetWeeklyHours}});
  await updateDoc(employeeRef,{schedulerV3:{...rotating,standardShift:{startTime:'22:00',endTime:'06:00'},rotationAlternateShift:{startTime:'06:00',endTime:'14:00'}}});
  await updateDoc(employeeRef,{schedulerV3:canonical});
  const legacyProfile={workMode:'NORMAL',fixedDayOff:null,targetWeeklyHours:32,standardShiftTemplateId:'day',rotateStandardShiftWeekly:false,rotationAlternateShiftTemplateId:null,rotationAnchorWeekStart:null};
  await seed('tenants/tenant-a/employees/legacy',{fullName:'Παλιός εργαζόμενος',isActive:true,schedulerV3:legacyProfile});
  const legacyRef=doc(db,'tenants/tenant-a/employees/legacy');const legacyBefore=(await getDoc(legacyRef)).data();
  assert.equal(mapEmployeesV3([{id:'legacy',...legacyBefore}],config)[0].schedulerV3.profileVersion,2);
  assert.deepEqual((await getDoc(legacyRef)).data(),legacyBefore,'reading compatibility never writes');
  await updateDoc(legacyRef,{fullName:'Ενημερωμένο όνομα'});
  assert.deepEqual((await getDoc(legacyRef)).data().schedulerV3,legacyProfile);
  await denied(()=>updateDoc(legacyRef,{'schedulerV3.targetWeeklyHours':40}),'new writes cannot retain old profile format');
  await denied(()=>setDoc(doc(db,'tenants/tenant-a/employees/new-legacy'),{fullName:'New',schedulerV3:legacyProfile}),'new legacy profile');
  await repository.saveSettings(config,[{id:'legacy',...legacyBefore}]);
  const migrated=(await getDoc(legacyRef)).data().schedulerV3;assert.equal(migrated.profileVersion,2);assert.deepEqual(migrated.standardShift,{startTime:'08:00',endTime:'16:00'});assert.equal(Object.hasOwn(migrated,'standardShiftTemplateId'),false);
  const created=await createEmployee({tenantId:'tenant-a',...buildV3EmployeePayload({fullName:'Νέος εργαζόμενος'})});
  const createdData=(await getDoc(doc(db,'tenants/tenant-a/employees',created.id))).data();assert.equal(createdData.schedulerV3.workMode,'NORMAL');assert.equal(createdData.schedulerV3.profileVersion,2);assert.equal(Object.hasOwn(createdData,'scheduleRole'),false);
  const batchProfiles=mapEmployeesV3(Array.from({length:100},(_,n)=>({id:'profile-batch-'+n,fullName:'Batch '+n,isActive:true})));
  for(const employee of batchProfiles)await seed('tenants/tenant-a/employees/'+employee.id,{fullName:employee.fullName,isActive:true});
  await repository.saveSettings(config,batchProfiles);
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/employees/profile-batch-99'))).data().schedulerV3.profileVersion,2);
  await assert.rejects(()=>repository.saveSettings(config,[...batchProfiles,{...batchProfiles[0],id:'profile-batch-100'}]));
  console.log(`V3 direct profile PASS: ${(malformed.length+Object.keys(rotating).length)*2+3} negative writes, 13 rotation/work-mode/target controls, legacy dual read + canonical single write, real creation, 100-profile batch and 101 rejection.`);
  const draft=createDraftV3({config,employees,absences:[],periodStart:'2026-09-07',periodEnd:'2026-09-13',periodType:'WEEK',options:{balanceWeeklyTargets:true}},'emulator-draft');
  console.log('CHECK draft roundtrip');
  await repository.saveDraft(draft);const loaded=await repository.loadDraft('tenant-a',draft.id);assert.equal(loaded.shifts.length,draft.shifts.length);
  loaded.shifts.pop();await repository.saveDraft(loaded);assert.equal((await repository.loadDraft('tenant-a',draft.id)).shifts.length,loaded.shifts.length);
  await assert.rejects(()=>repository.saveDraft(loaded),'stale draft revision rejected');
  const legacyDraftId='legacy-draft';const legacyShiftIds=draft.shifts.map((_,n)=>legacyDraftId+'_'+n);
  for(const [n,shift]of draft.shifts.entries())await seed('tenants/tenant-a/shifts/'+legacyShiftIds[n],{...shift,draftId:legacyDraftId,type:'work'});
  const legacyMetadata={id:legacyDraftId,tenantId:'tenant-a',schemaVersion:3,periodType:draft.periodType,periodStart:draft.periodStart,periodEnd:draft.periodEnd,config,employees:[{id:'a',fullName:'Μαρία',isActive:true,schedulerV3:legacyProfile}],absences:[],options:draft.options,updatedBy:user.uid,revision:1,shiftDocumentIds:legacyShiftIds};
  await seed('tenants/tenant-a/scheduleDrafts/'+legacyDraftId,legacyMetadata);
  const readLegacy=await repository.loadDraft('tenant-a',legacyDraftId);assert.equal(readLegacy.employees[0].schedulerV3.profileVersion,2);
  assert.deepEqual((await getDoc(doc(db,'tenants/tenant-a/scheduleDrafts',legacyDraftId))).data(),legacyMetadata);
  await repository.saveDraft(readLegacy);assert.equal((await getDoc(doc(db,'tenants/tenant-a/scheduleDrafts',legacyDraftId))).data().employees[0].schedulerV3.profileVersion,2);
  console.log('CHECK malformed draft fields denied');
  const draftRef=doc(db,'tenants/tenant-a/scheduleDrafts',draft.id);
  for(const patch of [{periodType:'YEAR'},{periodStart:'bad'},{periodStart:'2026-02-31',periodEnd:'2026-03-01'},{periodStart:'2100-02-29',periodEnd:'2100-03-01'},{periodEnd:'2026-09-31'},{periodEnd:[]},{periodEnd:'2026-09-01'},{revision:-1},{revision:1.5},{revision:'1'},{'config.tenantId':'tenant-b'},{id:'other'},{unexpected:'field'}])await denied(()=>updateDoc(draftRef,patch),'malformed draft');
  console.log('CHECK concurrent reservations');
  console.log('CHECK V3 draft shift data integrity');
  const validShift={id:'integrity-shift',date:'2026-09-07',employeeId:'a',employeeName:'Μαρία',shiftTemplateId:null,startTime:'08:00',endTime:'16:00',durationHours:8,crossMidnight:false,source:'AUTO',isManualOverride:false,schedulerSchemaVersion:3,draftId:draft.id,type:'work'};
  const shiftRef=doc(db,'tenants/tenant-a/shifts/integrity-probe');
  const invalidShifts=[];
  const invalidFields={
    date:['2026-02-31','2025-02-29','2026-13-01',{},[],1],
    startTime:['24:00','25:00','99:99','12:60','-1:00','abc',{},[],1],
    endTime:['12:60','24:00','99:99',{},[],1],
    id:['','../bad','x'.repeat(101),{},[],1],
    employeeId:['','../bad','x'.repeat(101),{},[],1],
    employeeName:['','x'.repeat(201),{},[],1],
    shiftTemplateId:['','../bad','x'.repeat(101),{},[],1],
    draftId:['','../bad','x'.repeat(101),{},[],1],
    crossMidnight:['false',{},[],1],isManualOverride:[1,'false',{},[]],
    durationHours:[0,-1,25,'8',{},[]],source:['INVALID',{},[],1],
    schedulerSchemaVersion:[2,'3',{},[]],type:['leave',{},[],1],unexpected:['field'],
  };
  for(const [field,values] of Object.entries(invalidFields))values.forEach((value,n)=>invalidShifts.push({label:`${field}/${n}`,data:{...validShift,[field]:value}}));
  for(const field of Object.keys(validShift)){const data={...validShift};delete data[field];invalidShifts.push({label:`missing/${field}`,data});}
  const failures=[];
  for(const [n,candidate] of invalidShifts.entries()){
    await setDoc(shiftRef,validShift);
    for(const [mode,target] of [['create',doc(db,`tenants/tenant-a/shifts/integrity-invalid-${n}`)],['update',shiftRef]]){
      try{await denied(()=>setDoc(target,candidate.data),`${mode}/${candidate.label}`);}catch(error){failures.push(`${mode}/${candidate.label}`);}
    }
  }
  for(const date of ['2024-02-29','2000-02-29','2400-02-29']){
    const control={...validShift,date,startTime:'00:00',endTime:'23:59',durationHours:23+59/60,employeeName:'Ω'.repeat(200),shiftTemplateId:'day',source:'MANUAL',isManualOverride:true};
    await setDoc(shiftRef,control);assert.deepEqual((await getDoc(shiftRef)).data(),control);
  }
  assert.deepEqual(failures,[],'V3 malformed shifts must return permission-denied');
  await deleteDoc(shiftRef);
  console.log(`V3 shift integrity PASS: ${invalidShifts.length*2} negative writes; 3 leap-day/time-boundary controls.`);
  const key='WEEK_2026-09-07_2026-09-13';const versions=await Promise.all([repository.reserve('tenant-a',key,'pub-a'),repository.reserve('tenant-a',key,'pub-b')]);
  assert.deepEqual([...versions].sort(),[1,2]);
  const snapshots=versions.map((version,n)=>buildPublicationV3(draft,{tenantId:'tenant-a',uid:user.uid,id:n?'pub-b':'pub-a',version,timestamp:'2026-09-08T00:00:00Z'}));
  console.log('CHECK PDF upload');
  for(const snapshot of snapshots)await repository.uploadPdf('tenant-a',snapshot.pdfStoragePath,new TextEncoder().encode('%PDF-1.4 emulator immutable test'));
  // Newer completion first; older completion must not roll the pointer back.
  console.log('CHECK finalize');
  for(const snapshot of [...snapshots].sort((a,b)=>b.version-a.version))await repository.finalize(snapshot);
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/schedulePublicationPeriods',key))).data().latestVersion,2);
  assert.equal((await repository.list('tenant-a')).length,2);
  console.log('CHECK draft from v1 publishes at current counter v4');
  const old= snapshots.find(s=>s.version===1);const oldBytes=new Uint8Array(await repository.download('tenant-a',old.id));
  const third={...old,id:'pub-third',version:await repository.reserve('tenant-a',key,'pub-third')};
  await repository.uploadPdf('tenant-a',`tenants/tenant-a/schedule-publications/pub-third/schedule.pdf`,oldBytes);
  third.pdfStoragePath='tenants/tenant-a/schedule-publications/pub-third/schedule.pdf';await repository.finalize(third);
  const restored=createDraftFromPublicationV3(old,{id:'from-v1',tenantId:'tenant-a',employees,absences:[]});
  await repository.saveDraft(restored);assert.equal((await repository.loadDraft('tenant-a','from-v1')).sourcePublicationId,old.id);
  const version4=await repository.reserve('tenant-a',key,'pub-fourth');assert.equal(version4,4);
  const fourth=buildPublicationV3(restored,{tenantId:'tenant-a',uid:user.uid,id:'pub-fourth',version:version4,timestamp:'2026-09-09T00:00:00Z'});
  await repository.uploadPdf('tenant-a',fourth.pdfStoragePath,oldBytes);await repository.finalize(fourth);
  assert.deepEqual(new Uint8Array(await repository.download('tenant-a',old.id)),oldBytes);
  assert.deepEqual((await getDoc(doc(db,'tenants/tenant-a/schedulePublications',old.id))).data(),JSON.parse(JSON.stringify(old)));
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/publicMonths/2026-09'))).data().shiftCount,draft.shifts.length);
  console.log('CHECK month clears stale weekly projections');
  const monthDraft={...draft,periodType:'MONTH',periodStart:'2026-09-01',periodEnd:'2026-09-30',shifts:[]};
  const monthKey='MONTH_2026-09-01_2026-09-30';
  const monthVersion=await repository.reserve('tenant-a',monthKey,'pub-month');
  const monthSnapshot=buildPublicationV3(monthDraft,{tenantId:'tenant-a',uid:user.uid,id:'pub-month',version:monthVersion,timestamp:'2026-09-08T01:00:00Z'});
  await repository.uploadPdf('tenant-a',monthSnapshot.pdfStoragePath,new TextEncoder().encode('%PDF-1.4 month test'));
  await repository.finalize(monthSnapshot);
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/publicSchedules/2026-09-07'))).data().shiftCount,0);
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/schedulePublications/pub-a'))).data().shifts.length,draft.shifts.length);
  await assert.rejects(()=>updateDoc(doc(db,'tenants/tenant-a/schedulePublications/pub-a'),{version:99}));
  await assert.rejects(()=>deleteDoc(doc(db,'tenants/tenant-a/schedulePublications/pub-a')));
  await assert.rejects(()=>repository.uploadPdf('tenant-a',snapshots[0].pdfStoragePath,new Uint8Array([1])));
  await assert.rejects(()=>deleteObject(ref(storage,snapshots[0].pdfStoragePath)));
  assert.ok((await repository.download('tenant-a','pub-a')).byteLength>0);
  await assert.rejects(()=>repository.list('tenant-b'));
  await seed(`platformAdmins/${user.uid}`,{status:'ACTIVE'});
  await assert.rejects(()=>repository.list('tenant-a'));
  await assert.rejects(()=>repository.download('tenant-a','pub-a'));
  await signOut(auth);await assert.rejects(()=>getDoc(doc(db,'tenants/tenant-a/schedulePublications/pub-a')));
  assert.equal((await getDoc(doc(db,'tenants/tenant-a/publicSchedules/2026-09-07'))).exists(),true);
  console.log('V3 emulator PASS: settings, draft roundtrip/replacement, concurrent versions, latest pointer, immutable snapshot/PDF, OWNER access, cross-tenant/platform-admin/anonymous denial, public projection.');
}
main().then(()=>process.exit(0)).catch(error=>{console.error('V3 emulator FAIL:',error.code||error.message);process.exit(1);});
