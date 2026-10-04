// Fresh fixture lifecycle per suite, with no shell command construction.
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const suites={
  races:['browser.mjs','--races-only'],owners:['browser.mjs','--owners-only'],browser:['browser.mjs'],
  isolation:['isolation.mjs'],reset:['reset-coverage.mjs'],settings:['settings-regression.mjs'],
  identity:['entry-recovery.mjs'],lease:['lease-recovery.mjs'],upload:['storage-reset-race.mjs'],visual:['visual.mjs'],
  pdf:['pdf-transport.mjs'],'pdf-races':['pdf-races.mjs'],
  'pdf-browser':['pdf-browser.mjs'],
  'pdf-entry':['pdf-browser.mjs','--entry-only'],
  'typed-max':['typed-max-payload.mjs'],
  typed:['typed-mutations.mjs'],
  'typed-isolation':['typed-cross-tenant.mjs'],
  'typed-negative':['typed-negative.mjs'],
  'sdk-bypass':['direct-sdk-bypass.mjs'],
  'mutation-retries':['browser.mjs','--mutation-retries-only'],
  'admission-concurrency':['admission-concurrency.mjs'],
  'admission-rules':['admission-rules.mjs'],
  retention:['intent-retention.mjs'],
  'b3-precheck':['reset-precheck.mjs'],
  'b3-concurrency':['reset-concurrency.mjs'],
  'b3-adapter':['reset-adapter.mjs'],
  'b3-retention':['reset-retention.mjs'],
  'b3-recovery':['reset-recovery.mjs'],
};
const requested=process.argv.slice(2);
if(!requested.length||requested.some(name=>!Object.hasOwn(suites,name)))throw new Error('Choose explicit local suites: '+Object.keys(suites).join(', '));
for(const name of requested){
  const runtime=spawn(process.execPath,['qa/public-demo/runtime.mjs'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']});
  let test;let buffer='';
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Local runtime readiness timed out')),600000);
      const cleanup=()=>{clearTimeout(timeout);runtime.off('exit',earlyExit);};
      const earlyExit=()=>{cleanup();reject(new Error('Local runtime exited before readiness'));};runtime.once('exit',earlyExit);
      runtime.stdout.on('data',chunk=>{buffer+=String(chunk);process.stdout.write(chunk);if(buffer.includes('PUBLIC_DEMO_EMULATOR_READY=')){cleanup();resolve();}});
      runtime.stderr.on('data',chunk=>process.stderr.write(chunk));runtime.once('error',error=>{cleanup();reject(error);});
    });
    test=spawn(process.execPath,['qa/public-demo/'+suites[name][0],...suites[name].slice(1)],{cwd:root,windowsHide:true,stdio:'inherit'});
    const code=await new Promise((resolve,reject)=>{test.once('exit',resolve);test.once('error',reject);});
    console.log('FRESH_SUITE '+name+' EXIT='+code);
    if(code!==0){process.exitCode=code||1;break;}
  }finally{
    if(test&&test.exitCode===null)test.kill();
    if(runtime.exitCode===null&&runtime.connected){const ended=new Promise(resolve=>runtime.once('exit',resolve));runtime.send('shutdown');await ended;}
  }
}
