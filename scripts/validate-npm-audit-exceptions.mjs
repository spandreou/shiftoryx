// CI always uses --run. --input is an offline validation mode, not an audit attestation.
import {validateNpmAudit,validateNpmProcess} from './lib/auditExceptionPolicy.ts';
import {loadInputs,readJson,runNpm,parseOptions,fail,ROOT,EXPECTED_NPM_VERSION} from './lib/auditGateRuntime.ts';
try {
 const options=parseOptions(process.argv.slice(2),['run','input','policy','lockfile','manifest']);
 if(!!options.run===!!options.input)throw new Error('Choose exactly one mode');
 const {policy,lock,manifest}=loadInputs(options);
 const processResult=options.run?runNpm(['audit','--audit-level=high','--json'],ROOT):null;
 const answer=options.run
 ?validateNpmProcess(processResult,policy,lock,manifest)
 :validateNpmAudit(readJson(options.input),policy,lock,manifest);
 if(processResult)console.log('NPM_TOOLCHAIN_ASSERTED expected='+EXPECTED_NPM_VERSION+' actual='+processResult.npmVersion+' node='+process.version);
 console.log('NPM_AUDIT_EXCEPTION_GATE_PASS mode='+(options.run?'live':'offline')+' highPackages='+answer.highPackages+' advisories='+answer.acceptedAdvisories.sort().join(','));
}catch(error){fail(error);}
