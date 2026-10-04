// Run the existing V3 repository/Rules suite against NORMAL Rules on separate
// local ports. This does not deploy, seed, or read a hosted Firebase project.
import {mkdtempSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url)),cli=process.env.QA_FIREBASE_CLI;
if(!cli||!existsSync(cli))throw new Error('Set QA_FIREBASE_CLI to the existing installed CLI.');
const output=mkdtempSync(join(tmpdir(),'shiftoryx-demo-normal-rules-'));
writeFileSync(join(output,'firebase.json'),JSON.stringify({firestore:{rules:resolve(root,'firestore.rules')},storage:{rules:resolve(root,'storage.rules')},emulators:{auth:{host:'127.0.0.1',port:9318},firestore:{host:'127.0.0.1',port:8207,websocketPort:9271},storage:{host:'127.0.0.1',port:9418},hub:{host:'127.0.0.1',port:4472},logging:{host:'127.0.0.1',port:4572},ui:{enabled:false},singleProjectMode:true}}));
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|JAVA_HOME)$/i.test(key)));
Object.assign(env,{CI:'true',FIREBASE_CLI_DISABLE_USAGE_REPORTING:'true'});
const command=`"${process.execPath}" "${resolve(root,'scripts/run-scheduler-v3-emulator.mjs')}"`;
const child=spawn(process.execPath,[cli,'emulators:exec','--project','demo-shiftoryx-v3','--config',join(output,'firebase.json'),'--only','auth,firestore,storage',command],{cwd:output,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{const text=String(chunk).replace(/\beyJ[A-Za-z0-9_.-]+/g,'[REDACTED]');appendFileSync(join(output,'verification.log'),text);for(const line of text.split(/\r?\n/))if(/^(CHECK|V3 .*PASS|.*FAIL|Error:|AssertionError:)/.test(line))console.log(line);});
child.on('exit',code=>{console.log('NORMAL_RULES_REGRESSION_EXIT='+code);process.exitCode=code??1;});
