// CI always uses --run. --input is an offline validation mode, not an audit attestation.
import {validateNpmAudit,validateNpmProcess} from './lib/auditExceptionPolicy.ts';
import {loadInputs,readJson,runNpm,parseOptions,fail,ROOT} from './lib/auditGateRuntime.ts';
try {
 const options=parseOptions(process.argv.slice(2),['run','input','policy','lockfile','manifest']);
 if(!!options.run===!!options.input)throw new Error('Choose exactly one mode');
 const {policy,lock,manifest}=loadInputs(options);
 const answer=options.run
 ?validateNpmProcess(runNpm(['audit','--audit-level=high','--json'],ROOT),policy,lock,manifest)
 :validateNpmAudit(readJson(options.input),policy,lock,manifest);
 console.log('NPM_AUDIT_EXCEPTION_GATE_PASS mode='+(options.run?'live':'offline')+' highPackages='+answer.highPackages+' advisories='+answer.acceptedAdvisories.sort().join(','));
}catch(error){fail(error);}
