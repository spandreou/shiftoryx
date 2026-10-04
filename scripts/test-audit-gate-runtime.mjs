import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,cpSync,writeFileSync,unlinkSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const policy=JSON.parse(readFileSync(join(root,'security/npm-audit-exceptions.json'),'utf8'));
const fixture=JSON.parse(readFileSync(join(root,'scripts/test-fixtures/audit-exception-current.json'),'utf8'));
let runtime;try{runtime=await import('./lib/auditGateRuntime.ts');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
test('reviewed source/build context passes without executing project code',()=>{assert.ok(runtime,'Reviewed context enforcement is not implemented');runtime.assertReviewedContext(root,policy);});
test('source, packaging and newly added server code invalidate the reviewed context',()=>{
 assert.ok(runtime);const dir=mkdtempSync(join(tmpdir(),'shiftoryx-gate-context-test-'));
 for(const path of runtime.CONTEXT_PATHS)cpSync(join(root,path),join(dir,path),{recursive:true});
 runtime.assertReviewedContext(dir,policy);
 for(const path of ['scripts/build-public-demo.mjs','scripts/demo-package-rules.mjs','.github/workflows/security-scan.yml','Dockerfile']){
  const target=join(dir,path),before=readFileSync(target);writeFileSync(target,'unreviewed build or trust configuration\n');
  assert.throws(()=>runtime.assertReviewedContext(dir,policy),e=>e.code==='GATE_REVIEWED_CONTEXT_DRIFT');writeFileSync(target,before);
 }
 const file=join(dir,'src','new-grpc-server.ts');writeFileSync(file,'export const server = true;\n');
 assert.throws(()=>runtime.assertReviewedContext(dir,policy));unlinkSync(file);
 const build=join(dir,'vite.config.js'),old=readFileSync(build);writeFileSync(build,'export default {ssr: {}}\n');
 assert.throws(()=>runtime.assertReviewedContext(dir,policy));writeFileSync(build,old);
 const rootPackage=join(dir,'package.json'),beforePackage=readFileSync(rootPackage);writeFileSync(rootPackage,'{"scripts":{"build":"unreviewed server"}}');
 assert.throws(()=>runtime.assertReviewedContext(dir,policy));writeFileSync(rootPackage,beforePackage);
 const pkg=join(dir,'functions/package.json'),oldPkg=readFileSync(pkg);writeFileSync(pkg,'{"main":"unreviewed.js"}');
 assert.throws(()=>runtime.assertReviewedContext(dir,policy));writeFileSync(pkg,oldPkg);
 writeFileSync(join(dir,'functions/package-lock.json'),'{}');
 assert.throws(()=>runtime.assertReviewedContext(dir,policy));
});
test('CLI rejects empty/malformed/unreviewed input and unsupported clock overrides',()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiftoryx-gate-cli-test-'));
 const invoke=args=>spawnSync(process.execPath,[join(root,'scripts/validate-npm-audit-exceptions.mjs'),...args],{encoding:'utf8',cwd:root});
 const empty=join(dir,'empty.json');writeFileSync(empty,'');
 const r=invoke(['--input',empty]);assert.notEqual(r.status,0);assert.match(r.stdout+r.stderr,/GATE_/);
 const audit=join(dir,'current.json'),lock=join(dir,'lock.json'),manifest=join(dir,'manifest.json');
 writeFileSync(audit,JSON.stringify(fixture.audit));writeFileSync(lock,JSON.stringify(fixture.lock));writeFileSync(manifest,JSON.stringify(fixture.manifest));
 const good=invoke(['--input',audit,'--lockfile',lock,'--manifest',manifest]);assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/NPM_AUDIT_EXCEPTION_GATE_PASS.*highPackages=9/);
 const date=invoke(['--input',audit,'--now','2026-10-04']);assert.notEqual(date.status,0);
 const secrets=invoke(['--input',empty,'--not-a-valid-option','SECRET_VALUE']);assert.notEqual(secrets.status,0);assert.equal((secrets.stdout+secrets.stderr).includes('SECRET_VALUE'),false);
 const bad=structuredClone(fixture.audit);bad.vulnerabilities.braces.via[0].severity='critical';writeFileSync(audit,JSON.stringify(bad));
 const negative=invoke(['--input',audit,'--lockfile',lock,'--manifest',manifest]);assert.notEqual(negative.status,0);
});
test('subprocess transport uses argv without shell interpretation',()=>{
 assert.ok(runtime);const result=runtime.runNpm(['--version'],root);
 assert.equal(result.status,0);assert.match(result.stdout,/^\d+\.\d+\.\d+/);
});
