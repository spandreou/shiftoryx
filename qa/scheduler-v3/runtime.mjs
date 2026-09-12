import {spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,existsSync,mkdirSync,cpSync,copyFileSync,symlinkSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {QA_PROJECT} from './fixtures.ts';
import {qaEnvironment} from './environment.mjs';
import {seedQa} from './seed.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const cli=process.env.QA_FIREBASE_CLI;
if(!cli||!existsSync(cli))throw new Error('Set QA_FIREBASE_CLI to an already installed firebase-tools lib/bin/firebase.js. No installation is performed.');
const output=mkdtempSync(join(tmpdir(),'shiftoryx-realistic-qa-'));
mkdirSync(join(output,'functions'));
cpSync(resolve(root,'functions/src'),join(output,'functions/src'),{recursive:true});
copyFileSync(resolve(root,'functions/package.json'),join(output,'functions/package.json'));
symlinkSync(realpathSync(resolve(root,'functions/node_modules')),join(output,'functions/node_modules'),process.platform==='win32'?'junction':'dir');
const config={firestore:{rules:resolve(root,'firestore.rules')},storage:{rules:resolve(root,'storage.rules')},functions:{source:'functions'},emulators:{auth:{host:'127.0.0.1',port:9298},firestore:{host:'127.0.0.1',port:8187,websocketPort:9251},functions:{host:'127.0.0.1',port:5101},storage:{host:'127.0.0.1',port:9398},hub:{host:'127.0.0.1',port:4452},logging:{host:'127.0.0.1',port:4552},ui:{enabled:false},singleProjectMode:true}};
writeFileSync(join(output,'firebase.json'),JSON.stringify(config,null,2));
const safeEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|JAVA_HOME)$/i.test(key)));
const env={...safeEnv,...qaEnvironment(),CI:'true',FIREBASE_CLI_DISABLE_USAGE_REPORTING:'true'};
Object.assign(process.env,qaEnvironment());
// Use the installed Functions SDK's supported file-based discovery; avoids its
// transient HTTP discovery server on Windows. This is the real source manifest.
const discovery=spawnSync(process.execPath,[resolve(root,'functions/node_modules/firebase-functions/lib/bin/firebase-functions.js')],{cwd:join(output,'functions'),env:{...env,FUNCTIONS_MANIFEST_OUTPUT_PATH:join(output,'functions/functions.yaml')},encoding:'utf8',windowsHide:true,timeout:60000});
if(discovery.status!==0)throw new Error('Local Functions manifest generation failed; no emulators or seed started.');
// Keep emulator diagnostics outside the checkout and redact opaque credential-shaped strings.
const sanitize=line=>line.replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g,'[REDACTED]').replace(/\b[a-f0-9]{64}\b/gi,'[REDACTED]');
const emulator=spawn(process.execPath,[resolve(cli),'emulators:start','--project',QA_PROJECT,'--config',join(output,'firebase.json'),'--only','auth,firestore,storage,functions'],{cwd:output,env,stdio:['ignore','pipe','pipe'],windowsHide:true});
let exited=false;emulator.once('exit',()=>{exited=true;});
for(const stream of [emulator.stdout,emulator.stderr])stream.on('data',chunk=>{const text=String(chunk);if(/Error|error|ready|Loaded|http function|running/i.test(text))process.stdout.write(sanitize(text));});
async function waitReady(){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    if(exited)throw new Error('QA emulator exited before readiness.');
    try{const r=await fetch('http://127.0.0.1:4452/emulators');const list=await r.json();if(['auth','firestore','storage','functions'].every(k=>list[k])){const probe=await fetch(`http://127.0.0.1:5101/${QA_PROJECT}/us-central1/createAuthTicket`,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://shiftoryx.gr'},body:JSON.stringify({data:{}})});if(probe.status===403||probe.status===401)return;}}catch{}
    await new Promise(r=>setTimeout(r,700));
  }
  throw new Error('QA emulator readiness timed out.');
}
let vite;
function stop(){vite?.kill();emulator.kill();}
process.on('SIGINT',()=>{stop();process.exit(0);});process.on('SIGTERM',()=>{stop();process.exit(0);});
try{
  await waitReady();await seedQa(output);
  vite=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--config',resolve(root,'qa/scheduler-v3/vite.config.mjs')],{cwd:root,env:safeEnv,stdio:['ignore','pipe','pipe'],windowsHide:true});
  vite.stderr.on('data',chunk=>process.stdout.write(sanitize(String(chunk))));
  writeFileSync(join(output,'session.json'),JSON.stringify({output,project:QA_PROJECT,emulatorPid:emulator.pid,vitePid:vite.pid,qaServer:'http://127.0.0.1:5191',startedAt:new Date().toISOString()},null,2));
  console.log('QA_RUNTIME_DIRECTORY='+output);
  console.log('QA_READY: run acceptance.mjs and browser.mjs with this output directory. Keep this process open for manual QA.');
}catch(error){stop();console.error(error.message);process.exitCode=1;}
