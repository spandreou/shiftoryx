import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getFirestore,connectFirestoreEmulator,doc,collection,getDoc,getDocs,setDoc,deleteDoc} from 'firebase/firestore';
import {dbAdmin,login,denied,close} from './test-support.mjs';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';

const tenant='demo-fuel',client=await login(tenant),stateRef=dbAdmin.doc(`demoState/${tenant}`),prior=(await stateRef.get()).data();
const anonApp=initializeApp({projectId:'demo-shiftoryx-public',apiKey:'emulator-only'},'admission-rules-anonymous');
const anonymous=getFirestore(anonApp);connectFirestoreEmulator(anonymous,'127.0.0.1',8197);
const publicDocs=[['publicEmployees','visitor-probe',{tenantId:tenant,fullName:'Φανταστικός'}],
  ['publicAnnouncements','visitor-probe',{tenantId:tenant,title:'Demo',body:'Δοκιμαστικό'}],
  ['publicSchedules','2026-09-28',{tenantId:tenant,weekStart:'2026-09-28',shifts:[]}],
  ['publicMonths','2026-09',{tenantId:tenant,yearMonth:'2026-09',shifts:[]}]];
try{
  for(const [name,id,payload]of publicDocs)await dbAdmin.doc(`tenants/${tenant}/${name}/${id}`).set(payload);
  for(const [name,id]of publicDocs){
    assert.equal((await getDoc(doc(anonymous,'tenants',tenant,name,id))).exists(),true,`${name} public get while open`);
    assert.ok((await getDocs(collection(anonymous,'tenants',tenant,name))).size>0,`${name} public list while open`);
  }
  await stateRef.update({resetting:true});
  for(const [name,id]of publicDocs){
    await denied(()=>getDoc(doc(anonymous,'tenants',tenant,name,id)));
    await denied(()=>getDocs(collection(anonymous,'tenants',tenant,name)));
  }
  await stateRef.set(prior);
  for(const [name,id]of publicDocs)assert.equal((await getDoc(doc(anonymous,'tenants',tenant,name,id))).exists(),true,`${name} public read restored`);

  for(const name of ['demoAdmission','demoAuditReceipts','demoAdmissionDaily','demoAdmissionRate','demoPdfLimits','demoControl','demoPdfControls']){
    await denied(()=>setDoc(doc(client.db,name,tenant),{tenantId:tenant,forged:true}));
    await denied(()=>getDoc(doc(client.db,name,tenant)));
  }
  await denied(()=>setDoc(doc(client.db,'demoAdmission',tenant,'receipts','forged'),{count:999}));
  await denied(()=>setDoc(doc(client.db,'demoAuditReceipts',tenant,'receipts','forged'),{count:999}));
  const legacy=[['shiftTemplates',{name:'Φανταστικό'}],['attendanceHistory',{employeeId:'demo-fuel-e1',date:'2026-09-30'}],
    ['weekLocks',{weekStart:'2026-09-28',weekDays:[]}],['weekHistory',{weekId:'probe',weekStart:'2026-09-28',weekEnd:'2026-10-04',shifts:[]}],
    ['weekTemplates',{name:'Φανταστικό'}],['subscription',{}],['tokenRequests',{email:'fictional@example.invalid',status:'PENDING'}]];
  for(const [name,payload]of legacy)await denied(()=>setDoc(doc(client.db,'tenants',tenant,name,'admission-probe'),payload));
  await denied(()=>setDoc(doc(client.db,'monthly_schedule_exports',`${tenant}_2026-09`),{
    tenantId:tenant,yearMonth:'2026-09',fileName:'program_month_2026-09.pdf',
    storagePath:`tenants/${tenant}/monthly_schedule_pdfs/2026-09/program_month_2026-09.pdf`,
    createdBy:'fictional',shiftCount:1,status:'READY',createdAt:'test',updatedAt:'test'}));

  // B-2 strengthens the former active-write probe: all nine paths are now
  // server-only, including create/update on existing public projections.
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'employees','admission-active-employee'),{fullName:'Φανταστικός εργαζόμενος'}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'announcements','admission-active-announcement'),{title:'Demo',body:'Φανταστικό'}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'settings','scheduler'),{schedulerSchemaVersion:3},{merge:true}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'publicEmployees','visitor-probe'),{tenantId:tenant,fullName:'Φανταστικός δημόσιος'}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'publicAnnouncements','visitor-probe'),{tenantId:tenant,title:'Demo',body:'Ενημερωμένο δοκιμαστικό'}));
  const fixture=publicDemoFixture(tenant,new Date());
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'absences','admission-active-absence'),{
    employeeId:fixture.employees[0].id,type:'OTHER',startDate:fixture.weekStart,endDate:fixture.weekStart,
    scope:'FULL_DAY',replacementMode:'AUTO',status:'ACTIVE'}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'scheduleDrafts','admission-active-draft'),{
    id:'admission-active-draft',tenantId:tenant,schemaVersion:3,periodType:'WEEK',periodStart:fixture.weekStart,
    periodEnd:fixture.weekEnd,config:fixture.config,employees:[],absences:[],options:{},
    updatedBy:client.auth.currentUser.uid,revision:0,shiftDocumentIds:[]}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'shifts','admission-active-shift'),{
    id:'admission-active-shift',date:fixture.weekStart,employeeId:fixture.employees[0].id,
    employeeName:fixture.employees[0].fullName,shiftTemplateId:null,startTime:'08:00',endTime:'16:00',
    durationHours:8,crossMidnight:false,source:'AUTO',isManualOverride:false,schedulerSchemaVersion:3,
    draftId:'admission-active-draft',type:'work'}));
  await denied(()=>setDoc(doc(client.db,'tenants',tenant,'auditLogs','admission-active-audit'),{
    action:'demo.probe',actor:{uid:client.auth.currentUser.uid},target:{collection:'employees'},createdAt:new Date()}));
  await denied(()=>setDoc(doc(client.db,'tenants','demo-cafe','employees','foreign-probe'),{fullName:'Ξένο'}));
  console.log('PUBLIC_DEMO_ADMISSION_RULES_PASS publicFence=4 legacyCreateDenials=8 activeBrowserWriteDenials=9');
}finally{
  await stateRef.set(prior);
  for(const [name,id]of publicDocs)await dbAdmin.doc(`tenants/${tenant}/${name}/${id}`).delete();
  for(const name of ['employees','announcements',...['shiftTemplates','attendanceHistory','weekLocks','weekHistory','weekTemplates','subscription','tokenRequests']]){
    const id=['employees','announcements'].includes(name)?`admission-active-${name==='employees'?'employee':'announcement'}`:'admission-probe';
    await dbAdmin.doc(`tenants/${tenant}/${name}/${id}`).delete();
  }
  await dbAdmin.doc(`monthly_schedule_exports/${tenant}_2026-09`).delete();
  for(const [name,id]of [['absences','admission-active-absence'],['scheduleDrafts','admission-active-draft'],
    ['shifts','admission-active-shift'],['auditLogs','admission-active-audit']])await dbAdmin.doc(`tenants/${tenant}/${name}/${id}`).delete();
  await deleteApp(anonApp);await close();
}
