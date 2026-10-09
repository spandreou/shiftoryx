import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,cpSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../../',import.meta.url)),project='demo-shiftoryx-public',cli=process.env.QA_FIREBASE_CLI;
if(!cli||!existsSync(cli))throw new Error('Set QA_FIREBASE_CLI to the existing Firebase CLI.');
const output=mkdtempSync(join(tmpdir(),'shiftoryx-public-demo-'));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|JAVA_HOME)$/i.test(key)));
Object.assign(env,{GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FUNCTIONS_EMULATOR:'true',PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408',AUTH_BROKER_BASE_DOMAIN:'shiftoryx.gr',AUTH_BROKER_CENTRAL_DOMAIN:'demo.shiftoryx.gr',AUTH_BROKER_CENTRAL_ORIGINS:'https://demo.shiftoryx.gr',CI:'true',FIREBASE_CLI_DISABLE_USAGE_REPORTING:'true'});
env.PUBLIC_DEMO_PDF_SERVER_ENABLED='true';
env.PUBLIC_DEMO_AUTH_BROKER_ENABLED='true';
env.PUBLIC_DEMO_MUTATION_SERVER_ENABLED='true';
// The installed CLI uses this documented override for cold worker socket
// readiness too. It changes local startup only, never deployed handler limits.
env.FUNCTIONS_DISCOVERY_TIMEOUT='120';
Object.assign(process.env,env);
mkdirSync(join(output,'functions'));cpSync(resolve(root,'functions/src'),join(output,'functions/src'),{recursive:true});
const pkg=JSON.parse(readFileSync(resolve(root,'functions/package.json'),'utf8'));pkg.main='src/public-demo/entry.js';writeFileSync(join(output,'functions/package.json'),JSON.stringify(pkg));
symlinkSync(realpathSync(resolve(root,'functions/node_modules')),join(output,'functions/node_modules'),process.platform==='win32'?'junction':'dir');
const discovery=spawnSync(process.execPath,[resolve(root,'functions/node_modules/firebase-functions/lib/bin/firebase-functions.js')],{cwd:join(output,'functions'),env:{...env,FUNCTIONS_MANIFEST_OUTPUT_PATH:join(output,'functions/functions.yaml')},windowsHide:true,encoding:'utf8',timeout:60000});
if(discovery.status!==0)throw new Error('Demo manifest generation failed.');
const config={functions:{source:'functions'},firestore:{rules:resolve(root,'firestore.demo.rules')},storage:{rules:resolve(root,'storage.demo.rules')},emulators:{auth:{host:'127.0.0.1',port:9308},firestore:{host:'127.0.0.1',port:8197,websocketPort:9261},storage:{host:'127.0.0.1',port:9408},functions:{host:'127.0.0.1',port:5111},hub:{host:'127.0.0.1',port:4462},logging:{host:'127.0.0.1',port:4562},ui:{enabled:false},singleProjectMode:true}};
writeFileSync(join(output,'firebase.json'),JSON.stringify(config));
const emulator=spawn(process.execPath,[cli,'emulators:start','--project',project,'--config',join(output,'firebase.json'),'--only','auth,firestore,storage,functions'],{cwd:output,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
for(const stream of [emulator.stdout,emulator.stderr])stream.on('data',chunk=>{const message=String(chunk);if(/Failed|Error|error|Loaded functions/.test(message))console.log(message.replace(/\beyJ[A-Za-z0-9_.-]+/g,'[REDACTED]'));});
let vite;const stop=()=>{
  vite?.kill();
  if(emulator.exitCode===null&&!emulator.killed){
    // Only this directly spawned emulator tree, never processes found by a broad
    // command-line search (which could include the current shell or other tasks).
    if(process.platform==='win32')spawnSync('taskkill',['/PID',String(emulator.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    else emulator.kill();
  }
};process.on('SIGTERM',()=>{stop();process.exit(0);});process.on('SIGINT',()=>{stop();process.exit(0);});
process.on('message',message=>{if(message==='shutdown'){stop();process.exit(0);}});
try{
  const deadline=Date.now()+120000;let ready=false;
  while(Date.now()<deadline){try{const r=await fetch(`http://127.0.0.1:5111/${project}/us-central1/enterPublicDemo`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://demo.shiftoryx.gr'},body:'{"data":{"tenantId":"demo-fuel"}}',signal:AbortSignal.timeout(150000)});if(r.status===503){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,750));}
  if(!ready)throw new Error('Demo emulator readiness timed out.');
  for(const [name,status,origin] of [['createAuthTicket',403,'https://demo.shiftoryx.gr'],['exchangeAuthTicket',400,'https://demo-fuel.shiftoryx.gr'],['resetPublicDemo',401,'https://demo.shiftoryx.gr']]){
    const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:'{"data":{}}',signal:AbortSignal.timeout(150000)});
    if(response.status!==status)throw new Error(`Demo worker ${name} readiness failed (${response.status}).`);
    console.log('DEMO_WORKER_READY='+name);
  }
  const mutationProbe=await fetch(`http://127.0.0.1:5111/${project}/us-central1/mutatePublicDemo`,{
    method:'POST',headers:{'Content-Type':'application/json',Origin:'https://demo-fuel.shiftoryx.gr'},
    body:JSON.stringify({operation:'emp.create',commandId:'emp_12345678-1234-4123-8123-123456789abc',
      payload:{fullName:'Unauthenticated readiness probe'}}),signal:AbortSignal.timeout(150000)});
  if(mutationProbe.status!==401)throw new Error(`Demo mutation worker readiness failed (${mutationProbe.status}).`);
  console.log('DEMO_WORKER_READY=mutatePublicDemo');
  const require=createRequire(new URL('../../functions/package.json',import.meta.url));const {initializeApp}=require('firebase-admin/app');initializeApp({projectId:project,storageBucket:project+'.appspot.com'});
  const {resetTenant}=await import('../../functions/src/public-demo/generated.js');
  for(const tenant of ['demo-fuel','demo-cafe','demo-salon','demo-market'])await resetTenant(tenant,{initial:true});
  vite=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--config',resolve(root,'qa/public-demo/vite.config.mjs')],{cwd:root,env,windowsHide:true,stdio:'ignore'});
  const webDeadline=Date.now()+60000;let webReady=false;
  while(Date.now()<webDeadline){
    if(vite.exitCode!==null)throw new Error('Local demo frontend exited before readiness.');
    try{const response=await fetch('http://127.0.0.1:5201/',{signal:AbortSignal.timeout(5000)});if(response.ok){webReady=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!webReady)throw new Error('Local demo frontend readiness timed out.');
  writeFileSync(join(output,'session.json'),JSON.stringify({output,emulatorPid:emulator.pid,vitePid:vite.pid,project},null,2));
  console.log('PUBLIC_DEMO_EMULATOR_READY='+output);
}catch(error){stop();console.error(error.message);process.exitCode=1;}
