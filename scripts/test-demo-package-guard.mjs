import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=mkdtempSync(join(tmpdir(),'shiftoryx-demo-package-negative-'));
const input=join(directory,'invalid-config.json');
writeFileSync(input,JSON.stringify({projectId:'unapproved-project',apiKey:'not-a-real-key'}));
const result=spawnSync(process.execPath,['scripts/package-public-demo.mjs',input],{encoding:'utf8',env:{...process.env,PUBLIC_DEMO_PACKAGE_PARENT:directory}});
assert.notEqual(result.status,0);
assert.match(result.stderr,/DEMO_CONFIG_PROJECT_REJECTED/);
assert.deepEqual(readdirSync(directory),['invalid-config.json'],'rejected config must not create a deployable package');
console.log('DEMO_PACKAGE_WRONG_PROJECT_REJECTED');

const root=fileURLToPath(new URL('../',import.meta.url));
const normalPackage=readFileSync(join(root,'functions/package.json'));
const normalEntry=readFileSync(join(root,'functions/src/index.js'));
const validInput=join(directory,'synthetic-demo-web-config.json');
writeFileSync(validInput,JSON.stringify({
  projectId:'shiftoryx-public-demo',authDomain:'shiftoryx-public-demo.firebaseapp.com',
  storageBucket:'shiftoryx-public-demo.firebasestorage.app',
  apiKey:'synthetic-public-web-config',appId:'synthetic-demo-app',messagingSenderId:'000000000000',
}));
const packaged=spawnSync(process.execPath,['scripts/package-public-demo.mjs',validInput],{
  encoding:'utf8',timeout:120000,env:{...process.env,PUBLIC_DEMO_PACKAGE_PARENT:directory,PUBLIC_DEMO_PDF_SERVER_ENABLED:'false'},
});
assert.equal(packaged.status,0,'isolated demo package must build from synthetic public config');
const packageNames=readdirSync(directory).filter(name=>name.startsWith('shiftoryx-demo-package-'));
assert.equal(packageNames.length,1,'exactly one isolated package must be produced');
const backend=join(directory,packageNames[0],'backend');
const envText=readFileSync(join(backend,'functions/.env.shiftoryx-public-demo'),'utf8');
assert.equal(envText.split('\n').filter(line=>line.startsWith('PUBLIC_DEMO_PDF_SERVER_ENABLED=')).length,1);
assert.match(envText,/(?:^|\n)PUBLIC_DEMO_PDF_SERVER_ENABLED=true(?:\n|$)/);
console.log('DEMO_PACKAGE_PDF_SERVER_FLAG=PASS');
assert.equal(envText.split('\n').filter(line=>line.startsWith('PUBLIC_DEMO_MUTATION_SERVER_ENABLED=')).length,1);
assert.match(envText,/(?:^|\n)PUBLIC_DEMO_MUTATION_SERVER_ENABLED=true(?:\n|$)/);
console.log('DEMO_PACKAGE_MUTATION_SERVER_FLAG=PASS');

assert.deepEqual(readFileSync(join(backend,'firestore.rules')),readFileSync(join(root,'firestore.demo.rules')));
assert.notDeepEqual(readFileSync(join(backend,'firestore.rules')),readFileSync(join(root,'firestore.rules')));
console.log('DEMO_PACKAGE_FIRESTORE_RULES_SOURCE=PASS NORMAL_FIRESTORE_RULES_NOT_PACKAGED=PASS');
assert.deepEqual(readFileSync(join(backend,'storage.rules')),readFileSync(join(root,'storage.demo.rules')));
assert.notDeepEqual(readFileSync(join(backend,'storage.rules')),readFileSync(join(root,'storage.rules')));
console.log('DEMO_PACKAGE_STORAGE_RULES_SOURCE=PASS NORMAL_STORAGE_RULES_NOT_PACKAGED=PASS');
assert.deepEqual(readFileSync(join(root,'functions/package.json')),normalPackage);
assert.deepEqual(readFileSync(join(root,'functions/src/index.js')),normalEntry);
assert.equal(JSON.parse(normalPackage).main,'src/index.js');
console.log('NORMAL_PACKAGE_PDF_SERVER_FLAG_UNCHANGED=PASS');
