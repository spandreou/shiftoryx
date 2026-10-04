// Typed OWNER settings save plus direct-SDK denial, restricted to local emulators.
import assert from 'node:assert/strict';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,doc,getDoc,getDocs,collection,updateDoc,setLogLevel} from 'firebase/firestore';
import {randomUUID} from 'node:crypto';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {mapEmployeesV3} from '../../src/services/schedulerV3Service.ts';
setLogLevel('silent');
const project='demo-shiftoryx-public',tenant='demo-fuel';
const app=initializeApp({projectId:project,apiKey:'emulator-only'}),auth=getAuth(app),db=getFirestore(app);
connectAuthEmulator(auth,'http://127.0.0.1:9308',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8197);
try{
  const entered=await fetch(`http://127.0.0.1:5111/${project}/us-central1/enterPublicDemo`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://demo.shiftoryx.gr'},body:JSON.stringify({data:{tenantId:tenant}})});assert.equal(entered.status,200);await signInWithCustomToken(auth,(await entered.json()).result.customToken);
  const config=publicDemoFixture(tenant,new Date()).config;
  const rows=(await getDocs(collection(db,'tenants',tenant,'employees'))).docs.map(d=>({id:d.id,...d.data()}));
  const canonical=mapEmployeesV3(rows,config);
  const token=await auth.currentUser.getIdToken();
  const typed=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{method:'POST',
    headers:{'Content-Type':'application/json',Origin:'https://demo-fuel.shiftoryx.gr',Authorization:`Bearer ${token}`},
    body:JSON.stringify({operation:'set.save',commandId:'set_'+randomUUID(),payload:{config,expectedRevision:0,
      profiles:canonical.map(employee=>({id:employee.id,profile:employee.schedulerV3}))}}),signal:AbortSignal.timeout(120000)});
  assert.equal(typed.status,200,JSON.stringify(await typed.json()));
  assert.equal((await getDoc(doc(db,'tenants',tenant,'settings','scheduler'))).data().demoRevision,1);
  for(const employee of canonical)assert.deepEqual((await getDoc(doc(db,'tenants',tenant,'employees',employee.id))).data().schedulerV3,employee.schedulerV3);
  await assert.rejects(()=>updateDoc(doc(db,'tenants',tenant,'employees',canonical[0].id),{schedulerV3:canonical[0].schedulerV3}),{code:'permission-denied'});
  console.log(`PUBLIC_DEMO_SETTINGS_TYPED_PASS employees=${canonical.length} settings=1 atomic=true directWrite=DENIED`);
  const employeeRef=doc(db,'tenants',tenant,'employees','demo-fuel-e1');let negatives=0;
  const denied=async patch=>{try{await updateDoc(employeeRef,patch);assert.fail('Malformed profile/field accepted');}catch(error){assert.equal(error.code,'permission-denied');assert.equal(error.message.includes('1000 expressions'),false,'denial must be validation, not evaluator exhaustion: '+JSON.stringify(patch));negatives++;}};
  for(const field of ['role','color','afm','phone','email','hireDate','scheduleRole','roleType','defaultShiftPreference','extraMode','activeFrom','activeTo'])for(const value of [null,42])await denied({[field]:value});
  for(const field of ['isActive','participatesInRotation','participatesInSundayRotation','weeklyFixedShiftSideRotation','canCoverLeaves','canWorkMorning','canWorkIntermediate','canWorkAfternoon','canWorkSunday'])for(const value of [null,'true'])await denied({[field]:value});
  for(const value of ['1',1.5,true])await denied({fixedDayOff:value});
  const profile=canonical.find(e=>e.id==='demo-fuel-e1').schedulerV3;
  for(const patch of [{extraField:true},{fixedDayOff:7},{targetWeeklyHours:169},{standardShift:{startTime:'06:01',endTime:'14:00'}},{rotationAlternateShift:{startTime:'10:00',endTime:'18:00'}},{rotationAlternateShift:{startTime:'14:00',endTime:'20:00'}},{rotationAnchorWeekStart:'2026-09-15'},{rotationAnchorWeekStart:'2026-02-30'}])await denied({schedulerV3:{...profile,...patch}});
  await denied({unexpectedEmployeeField:true});console.log('PUBLIC_DEMO_SETTINGS_INVALID_DENIALS='+negatives);
}catch(error){console.error('PUBLIC_DEMO_SETTINGS_TYPED_FAIL '+error.code+' '+(error.message.includes('1000 expressions')?'RULES_EXPRESSION_LIMIT':error.message));process.exitCode=1;}finally{await deleteApp(app);}
