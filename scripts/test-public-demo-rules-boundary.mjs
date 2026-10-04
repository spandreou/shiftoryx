import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,cpSync,symlinkSync,realpathSync,readdirSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
const accepted=readFileSync(join(root,'firestore.demo.rules'));
const normalBefore=readFileSync(join(root,'firestore.rules'));

const graph=await build({
  entryPoints:[join(root,'scripts/build-public-demo.mjs')],
  bundle:true,write:false,metafile:true,platform:'node',format:'esm',packages:'external',outdir:join(tmpdir(),'shiftoryx-demo-graph-output'),
});
const inputs=Object.keys(graph.metafile.inputs).map(path=>resolve(root,path));
for(const path of inputs){
  const code=readFileSync(path,'utf8');
  assert.equal(/['"`](?:[^'"`]*\/)?firestore\.rules['"`]/.test(code),false,'demo build graph must not name normal firestore.rules');
}
assert.ok(inputs.some(path=>path.endsWith('scripts'+sep+'demo-firestore-rules.mjs')),'build dependency graph includes the explicit demo generator');
console.log('DEMO_RULES_GENERATOR_READS_NORMAL_FIRESTORE_RULES=NO');

const packageGraph=await build({
  entryPoints:[join(root,'scripts/package-public-demo.mjs')],bundle:true,write:false,metafile:true,
  platform:'node',format:'esm',packages:'external',outdir:join(tmpdir(),'shiftoryx-demo-package-graph-output'),
});
assert.ok(Object.keys(packageGraph.metafile.inputs).some(path=>path.endsWith('scripts/demo-package-rules.mjs')),'package dependency graph includes the explicit demo copier');

const {renderDemoFirestoreRules}=await import('./demo-firestore-rules.mjs');
const {copyDemoRuleFiles}=await import('./demo-package-rules.mjs');
const fixture=mkdtempSync(join(tmpdir(),'shiftoryx-demo-rules-boundary-'));
const sources=join(fixture,'rules/demo');mkdirSync(sources,{recursive:true});
for(const name of ['firestore.template.rules','firestore.validators.rules'])copyFileSync(join(root,'rules/demo',name),join(sources,name));
copyFileSync(join(root,'storage.demo.rules'),join(fixture,'storage.demo.rules'));
const normalFixture=join(fixture,'firestore.rules');
writeFileSync(normalFixture,'// harmless synthetic normal Rules fixture A\n');
const first=renderDemoFirestoreRules(fixture);
assert.deepEqual(Buffer.from(first),accepted,'explicit demo source must preserve accepted Rules bytes');
writeFileSync(normalFixture,'// harmless synthetic normal Rules fixture B\n');
const second=renderDemoFirestoreRules(fixture);
assert.deepEqual(Buffer.from(second),accepted,'changing normal Rules fixture must not affect demo output');
writeFileSync(join(fixture,'firestore.demo.rules'),second);
const backend=join(fixture,'backend');mkdirSync(backend);
copyDemoRuleFiles(fixture,backend);
assert.deepEqual(readFileSync(join(backend,'firestore.rules')),accepted);
assert.deepEqual(readFileSync(join(backend,'storage.rules')),readFileSync(join(root,'storage.demo.rules')));
assert.deepEqual(readFileSync(join(root,'firestore.rules')),normalBefore);
console.log('DEMO_RULES_NORMAL_FILE_COUPLING=ABSENT');
console.log('DEMO_FIRESTORE_RULES_SEMANTIC_PARITY=PASS');
console.log('NORMAL_FIRESTORE_RULES_NOT_RUNTIME_DEPENDENCY=PASS');

// Exercise the real build and package entry points in a disposable source copy.
// Only synthetic normal Rules are changed; neither script can reach the real file.
cpSync(join(root,'src'),join(fixture,'src'),{recursive:true});
mkdirSync(join(fixture,'functions'),{recursive:true});
cpSync(join(root,'functions/src'),join(fixture,'functions/src'),{recursive:true});
mkdirSync(join(fixture,'scripts'));
for(const name of ['build-public-demo.mjs','package-public-demo.mjs','demo-firestore-rules.mjs','demo-package-rules.mjs'])copyFileSync(join(root,'scripts',name),join(fixture,'scripts',name));
for(const name of ['index.html','vite.config.js','postcss.config.js','tailwind.config.js','vercel.json','package.json','storage.rules'])copyFileSync(join(root,name),join(fixture,name));
for(const name of ['package.json','package-lock.json'])copyFileSync(join(root,'functions',name),join(fixture,'functions',name));
symlinkSync(realpathSync(join(root,'node_modules')),join(fixture,'node_modules'),process.platform==='win32'?'junction':'dir');
symlinkSync(realpathSync(join(root,'functions/node_modules')),join(fixture,'functions/node_modules'),process.platform==='win32'?'junction':'dir');
const configPath=join(fixture,'synthetic-web-config.json');
writeFileSync(configPath,JSON.stringify({projectId:'shiftoryx-public-demo',authDomain:'shiftoryx-public-demo.firebaseapp.com',storageBucket:'shiftoryx-public-demo.firebasestorage.app',apiKey:'synthetic-public-web-config',appId:'synthetic-demo-app',messagingSenderId:'000000000000'}));
const childEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA|JAVA_HOME)$/i.test(key)));
childEnv.PUBLIC_DEMO_PACKAGE_PARENT=fixture;
for(const variant of ['A','B','MISSING']){
  if(variant==='MISSING')unlinkSync(normalFixture);
  else writeFileSync(normalFixture,'// harmless synthetic normal Rules fixture '+variant+'\n');
  const built=spawnSync(process.execPath,['scripts/build-public-demo.mjs'],{cwd:fixture,env:childEnv,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(built.status,0,'isolated actual demo build must not depend on normal Rules fixture');
  assert.deepEqual(readFileSync(join(fixture,'firestore.demo.rules')),accepted);
  const packaged=spawnSync(process.execPath,['scripts/package-public-demo.mjs',configPath],{cwd:fixture,env:childEnv,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(packaged.status,0,'isolated actual demo package must not depend on normal Rules fixture');
  const match=/^DEMO_PACKAGE_DIRECTORY=(.+)$/m.exec(packaged.stdout);
  assert.ok(match&&resolve(match[1]).startsWith(resolve(fixture)+sep),'package must remain inside the disposable fixture');
  assert.deepEqual(readFileSync(join(match[1],'backend/firestore.rules')),accepted);
}
assert.equal(readdirSync(fixture).filter(name=>name.startsWith('shiftoryx-demo-package-')).length,3);
console.log('DEMO_RULES_ACTUAL_BUILD_PACKAGE_NORMAL_FIXTURE_INDEPENDENCE=PASS');

const missing=mkdtempSync(join(tmpdir(),'shiftoryx-demo-rules-missing-'));
assert.throws(()=>renderDemoFirestoreRules(missing),/DEMO_RULES_SOURCE_MISSING/);
writeFileSync(join(sources,'firestore.validators.rules'),'allow read: if true;\n');
assert.throws(()=>renderDemoFirestoreRules(fixture),/DEMO_RULES_SOURCE_INVALID/);
const deniedBuild=spawnSync(process.execPath,['scripts/build-public-demo.mjs'],{cwd:fixture,env:childEnv,encoding:'utf8',timeout:120000,windowsHide:true});
assert.notEqual(deniedBuild.status,0,'actual demo build must reject malformed explicit source');
const deniedPackage=spawnSync(process.execPath,['scripts/package-public-demo.mjs',configPath],{cwd:fixture,env:childEnv,encoding:'utf8',timeout:120000,windowsHide:true});
assert.notEqual(deniedPackage.status,0,'actual demo package must reject malformed explicit source');
console.log('DEMO_RULES_EXPLICIT_INPUTS_FAIL_CLOSED=PASS');
