import {runTrivyGate} from './lib/trivyGateRuntime.ts';
import {parseOptions,fail} from './lib/auditGateRuntime.ts';
import {GateError} from './lib/auditExceptionPolicy.ts';
try{
 const options=parseOptions(process.argv.slice(2),['run']);
 if(options.run!=='true')throw new GateError('ARGUMENTS');
 const result=runTrivyGate();
 console.log('TRIVY_EXCEPTION_GATE_PASS version=0.70.0 acceptedFindings='+result.acceptedFindings+' evidence='+result.directory);
}catch(error){fail(error);}
