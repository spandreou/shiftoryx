import {runNpm,EXPECTED_NPM_VERSION,fail} from './lib/auditGateRuntime.ts';
import {GateError} from './lib/auditExceptionPolicy.ts';
try{
 if(process.argv.length!==2)throw new GateError('ARGUMENTS');
 const result=runNpm(['--version']);
 if(result.error||result.signal||result.status!==0)throw new GateError('NPM_VERSION');
 console.log('NPM_TOOLCHAIN_ASSERTED expected='+EXPECTED_NPM_VERSION+' actual='+result.npmVersion+' node='+process.version);
}catch(error){fail(error);}
