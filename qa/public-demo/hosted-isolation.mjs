// Future human-approved HTTPS qualification only. No automatic session provisioning.
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadHostedQualification,foreignPairMatrix,requireSdkDenied,ensure} from './hosted-qualification.ts';
import {createSdkAdapter,verifyCanonicalBaseline,runTypedPositiveWorkflow,runOwnerSdkDenials,
  runOwnerStorageDenials,runForeignDenials,runSessionDenial,resetQualificationTenant,preflightHostedClients,
  verifyCanonicalAfterReset,runPreparedSessionCases,requirePostResetPrivateEvidence} from './hosted-runner.ts';

// The controller is a reviewed in-process harness dependency, never an HTTP test
// endpoint or dynamically imported executable path. Tokens/evidence are supplied
// in memory; this harness creates no adversarial accounts, claims or credentials.
export async function runHostedIsolationQualification(qualification,{preparedSessionProvider,privateCleanupEvidenceProvider}={}){
  ensure(typeof preparedSessionProvider==='function','PREPARED_SESSION_CONTROLLER_REQUIRED');
  ensure(typeof privateCleanupEvidenceProvider==='function','PRIVATE_CLEANUP_EVIDENCE_REQUIRED');
  const adapter=createSdkAdapter(qualification),clients=[],result={suite:'HOSTED_TYPED_ISOLATION',status:'RUNNING',
    qualificationSha:qualification.baseline.qualificationSha,baselineHash:qualification.baselineHash,
    orderedPairs:0,tenants:[],cleanup:[],preparedAuth:[]};
  const output=await mkdtemp(join(tmpdir(),'shiftoryx-hosted-typed-'));
  try{
    await preflightHostedClients(adapter,qualification,clients);
    for(const c of clients){
      await verifyCanonicalBaseline(adapter,c,qualification);
      await runSessionDenial(adapter,c,{name:'anonymous'});
      await runOwnerSdkDenials(adapter,c);await runOwnerStorageDenials(adapter,c);
      await requireSdkDenied(()=>adapter.sdkWrite(c,'set','platformAdmins/'+c.uid,{status:'ACTIVE'}),'firestore');
      await runTypedPositiveWorkflow(adapter,c,qualification);await runOwnerStorageDenials(adapter,c);
      result.tenants.push({tenant:c.tenant,typedPositives:'PASS',sdkDenials:'PASS'});
    }
    for(const pair of foreignPairMatrix()){
      await runForeignDenials(adapter,clients.find(c=>c.tenant===pair.from),clients.find(c=>c.tenant===pair.to));
      result.orderedPairs++;console.log('HOSTED_PAIR_PASS '+pair.from+'>'+pair.to);
    }
    result.preparedAuth=await runPreparedSessionCases(adapter,clients,preparedSessionProvider);
    ensure(result.orderedPairs===12&&result.preparedAuth.length===12,'COVERAGE');result.status='PASS';
  }catch(error){result.status='FAIL';result.failure=error.code??'HOSTED_OPERATION_FAILED';}
  finally{
    for(const c of clients){
      if(c.changed){try{
        const reset=await resetQualificationTenant(adapter,c);
        const fresh=await verifyCanonicalAfterReset(adapter,c,qualification,reset);await adapter.close(fresh);
        const proof=await requirePostResetPrivateEvidence(c,reset,privateCleanupEvidenceProvider);
        result.cleanup.push({tenant:c.tenant,status:'PASS',generation:reset.generation,privateEvidence:proof});
      }catch(error){result.status='FAIL';result.cleanup.push({tenant:c.tenant,status:'FAIL',code:error.code??'HOSTED_RESET_FAILED'});}}
      await adapter.close(c);
    }
    await writeFile(join(output,'result.json'),JSON.stringify(result,null,2));
    console.log('HOSTED_TYPED_ISOLATION_RESULT '+JSON.stringify({status:result.status,orderedPairs:result.orderedPairs,output}));
  }
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const qualification=loadHostedQualification(process.argv.slice(2));
    // Full execution requires separately approved preexisting session/control
    // evidence; a standalone CLI cannot silently skip or manufacture those cases.
    await runHostedIsolationQualification(qualification);
  }catch(error){console.error('HOSTED_PREFLIGHT_REFUSED '+(error.code??'HOSTED_INPUT'));process.exitCode=1;}
}
