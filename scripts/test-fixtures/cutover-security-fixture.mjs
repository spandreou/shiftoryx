// SYNTHETIC OFFLINE SECURITY INPUTS ONLY. Not live evidence or deployment files.
import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const at='2026-10-06T10:00:00.000Z',project='shiftoryx-public-demo',bucket=project+'.firebasestorage.app';
const names=['createAuthTicket','exchangeAuthTicket','cleanupAuthTickets','enterPublicDemo','resetPublicDemo','resetPublicDemosDaily','publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'];
const tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
const hosts=['demo.shiftoryx.gr',...tenants.map(t=>t+'.shiftoryx.gr')],auth=[...hosts,project+'.firebaseapp.com'];
const sa='public-demo-runtime@'+project+'.iam.gserviceaccount.com';
const qualificationSha='e795677e3896f99ca99346bdd848367dfcd9495e',contextSha256=hash('synthetic source context');
export function completeCutoverFixture(){
  const targetArtifacts=new Map([['web/index.html',Buffer.from('SYNTHETIC FRONTEND')],['backend/generated.js',Buffer.from('SYNTHETIC BACKEND')],
    ['firestore.demo.rules',Buffer.from('SYNTHETIC FIRESTORE')],['storage.demo.rules',Buffer.from('SYNTHETIC STORAGE')]]);
  const file=path=>({path,sha256:hash(targetArtifacts.get(path))});
  const target={schemaVersion:1,kind:'DEMO_TARGET_PACKAGE',qualificationSha,contextSha256,projectId:project,projectNumber:'848554493137',
    database:'(default)',region:'us-central1',bucket,aliases:[...hosts],frontend:file('web/index.html'),firestoreRules:file('firestore.demo.rules'),storageRules:file('storage.demo.rules'),
    functions:names.map(name=>({name,...file('backend/generated.js'),runtime:'nodejs22',region:'us-central1',serviceIdentity:sa}))};
  const observation={schemaVersion:1,kind:'OBSERVATION_DOSSIER',qualificationSha,projectId:project,projectNumber:'848554493137',database:'(default)',region:'us-central1',bucket,
    captureStartedAt:'2026-10-06T09:59:00.000Z',captureCompletedAt:at,observations:[]};
  const add=(resourceType,resource,value)=>observation.observations.push({resourceType,resource,state:'OBSERVED_PRESENT',observedAt:at,
    source:{id:'synthetic-read-'+observation.observations.length,method:'GET',httpStatus:200},value});
  add('PROJECT','projects/'+project,{projectId:project,projectNumber:'848554493137',database:'(default)',region:'us-central1',bucket,runtimeServiceAccount:sa});
  add('AUTH','projects/'+project+'/auth-config',{domains:[...auth]});
  for(const [type,suffix]of [['FIRESTORE_RULES','cloud.firestore'],['STORAGE_RULES','firebase.storage/'+bucket]]){
    const path='projects/'+project+'/releases/'+suffix;
    add(type,path,{release:path,rulesetId:'projects/'+project+'/rulesets/synthetic-'+type.toLowerCase(),sha256:hash('synthetic live '+type),updateTime:at});
  }
  for(const name of names)add('FUNCTION',`projects/${project}/locations/us-central1/functions/${name}`,{name,revision:name.toLowerCase()+'-synthetic',runtime:'nodejs22',region:'us-central1',state:'ACTIVE',serviceIdentity:sa,
    trigger:['cleanupAuthTickets','resetPublicDemosDaily'].includes(name)?'SCHEDULE':['publishPublicDemoPdf','downloadPublicDemoPdf','mutatePublicDemo'].includes(name)?'HTTP':'CALLABLE',
    source:{bucket:'gcf-v2-sources-848554493137-us-central1',object:name+'/function-source.zip',generation:'1'},timeoutSeconds:60,memory:'256Mi',
    flags:{PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_AUTH_BROKER_ENABLED:'true',PUBLIC_DEMO_PDF_SERVER_ENABLED:'true',PUBLIC_DEMO_MUTATION_SERVER_ENABLED:'true'}});
  for(const name of ['cleanupAuthTickets','resetPublicDemosDaily']){
    const path=`projects/${project}/locations/us-central1/jobs/firebase-schedule-${name}-us-central1`;
    add('SCHEDULE',path,{functionName:name,id:path,target:`https://us-central1-${project}.cloudfunctions.net/${name}`,state:'ENABLED',
      cadence:name==='cleanupAuthTickets'?'every 15 minutes':'every day 04:00',timeZone:name==='cleanupAuthTickets'?'UTC':'Europe/Athens'});
  }
  for(const hostname of hosts)add('HOST_ASSIGNMENT',`vercel/projects/prj_E2ORHb1pVLrUtEppzyusna56ZPiH/domains/${hostname}`,{hostname,projectId:'prj_E2ORHb1pVLrUtEppzyusna56ZPiH',deploymentId:'dpl_synthetic'});
  for(const tenantId of tenants){
    add('CONTROL','controls/'+tenantId,{tenantId,representation:'OBSERVED_TARGET_OPEN',stateObservedAt:at,controlObservedAt:at,
      raw:{generation:12,resetting:false,weekStart:'2026-10-05',lastResetAt:0,lease:null,leaseUntil:0,previousOwner:null,phase:'OPEN',controlPhase:'OPEN'}});
    for(const collection of ['demoAdmission','demoAuditReceipts','demoPdfLimits'])add('RETENTION',collection+'/'+tenantId,{tenantId,generation:12,metadataSha256:hash(collection+'/'+tenantId)});
  }
  add('STORAGE_INVENTORY','buckets/'+bucket,{paginationComplete:true,objects:[]});
  const rows=observation.observations,rule=type=>rows.find(x=>x.resourceType===type).value;
  const recovery={schemaVersion:1,status:'VERIFIED',projectId:project,projectNumber:'848554493137',databaseId:'(default)',region:'us-central1',bucket,runtimeServiceAccount:sa,
    captureWindowStartedAt:observation.captureStartedAt,captureWindowEndedAt:at,capturedAt:at,approvedWindowId:'synthetic-only',functionInventoryShape:'TARGET_NINE',authDomains:[...auth],authDomainsObservedAt:at,
    hostAssignments:hosts.map(hostname=>({hostname,projectId:project,deploymentId:'dpl_synthetic',observedAt:at,proofSha256:hash('synthetic')})),
    frontendArtifacts:[{deploymentId:'dpl_synthetic',sha256:target.frontend.sha256,sourceRef:'synthetic-only',observedAt:at}],
    firestoreRules:{rulesetId:rule('FIRESTORE_RULES').rulesetId,sha256:rule('FIRESTORE_RULES').sha256,sourceRef:'synthetic-rules',observedAt:at},
    storageRules:{rulesetId:rule('STORAGE_RULES').rulesetId,sha256:rule('STORAGE_RULES').sha256,sourceRef:'synthetic-rules',observedAt:at},
    functions:rows.filter(x=>x.resourceType==='FUNCTION').map(({value:v})=>({name:v.name,revisionId:v.revision,artifactSha256:hash('synthetic preserved live backend'),runtimeServiceAccount:sa,runtime:v.runtime,region:v.region,trigger:v.trigger,state:v.state,nonsecretConfigSha256:hash('synthetic config'),observedAt:at})),
    schedules:rows.filter(x=>x.resourceType==='SCHEDULE').map(({value:v})=>({functionName:v.functionName,scheduleId:v.id,state:v.state,observedAt:at})),
    demoState:tenants.map(tenantId=>({tenantId,documentPath:'demoState/'+tenantId,generation:12,resetting:false,phase:'OPEN',weekStart:'2026-10-05',lastResetAt:0,stateDigest:hash('synthetic state'),controlDocumentPath:'demoControl/'+tenantId,controlPhase:'OPEN',leaseIdDigest:null,leaseUntil:0,baseGeneration:null,controlDigest:hash('synthetic control'),observedAt:at})),
    admissionAndRetention:tenants.map(tenantId=>({tenantId,admissionDocumentPath:'demoAdmission/'+tenantId,admissionDigest:hash('demoAdmission/'+tenantId),
      auditReceiptsDocumentPath:'demoAuditReceipts/'+tenantId,auditReceiptsDigest:hash('demoAuditReceipts/'+tenantId),pdfLimitsDocumentPath:'demoPdfLimits/'+tenantId,
      pdfLimitsDigest:hash('demoPdfLimits/'+tenantId),retainedIntentCount:0,pdfIntentCount:0,observedAt:at})),storageObjects:[],
    backup:{offlineLocation:'synthetic-only',sha256:hash('synthetic backup'),restoreDrillId:'synthetic-only-not-live',observedAt:at},
    verification:{independentReviewer:'synthetic-only-reviewer',verifiedAt:at,evidenceDigest:hash('synthetic review')}};
  const capabilities={schemaVersion:1,kind:'LOCAL_CONTAINMENT_ATTESTATION',qualificationSha,contextSha256,broker:'AVAILABLE_AND_TESTED_LOCAL',
    globalEntry:'AVAILABLE_AND_TESTED_LOCAL',testEvidenceSha256:hash('synthetic tests'),reviewEvidenceSha256:hash('synthetic review'),observedAt:at};
  const currentObservation=structuredClone(observation);
  currentObservation.captureStartedAt='2026-10-06T10:00:01.000Z';currentObservation.captureCompletedAt='2026-10-06T10:01:00.000Z';
  for(const row of currentObservation.observations){row.observedAt=currentObservation.captureCompletedAt;row.source.id+='-current';
    if(row.resourceType==='CONTROL'){row.value.stateObservedAt=row.observedAt;row.value.controlObservedAt=row.observedAt;}}
  return {observation,currentObservation,recovery,target,capabilities,targetArtifacts,contextSha256,qualificationSha,
    reviewedRuleDigests:{firestore:target.firestoreRules.sha256,storage:target.storageRules.sha256},
    expected:{projectId:project,projectNumber:'848554493137',database:'(default)',region:'us-central1',bucket,aliases:[...hosts]},now:Date.parse('2026-10-06T10:05:00Z')};
}
export function seal(value){const bytes=Buffer.from(JSON.stringify(value));return {bytes,sha256:hash(bytes)};}
