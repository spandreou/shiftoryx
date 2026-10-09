import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),script=join(root,'scripts/validate-public-demo-cutover-preconditions.mjs');
const invoke=args=>spawnSync(process.execPath,[script,...args],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
for(const flag of ['--deploy','--apply','--reset','--update','--patch','--delete','--rollback']){
  test('CLI has no mutation mode '+flag,()=>{const r=invoke([flag,'true']);assert.equal(r.status,1);assert.match(r.stderr,/CUTOVER_ARGUMENTS/);});
}
test('CLI missing identity fails without target discovery',()=>{const r=invoke([]);assert.equal(r.status,1);assert.match(r.stderr,/CUTOVER_ARGUMENTS/);});
test('CAPTURED_UNVERIFIED CLI fails explicitly before attempting missing artifact inputs',()=>{
  const dir=mkdtempSync(join(tmpdir(),'shiftoryx-cutover-cli-'));
  try{
    const head=spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true,stdio:['ignore','pipe','pipe']});
    assert.equal(head.status,0,'qualification test requires a genuine Git HEAD');
    const qualificationSha=head.stdout.trim();assert.match(qualificationSha,/^[a-f0-9]{40}$/);
    const baseline=JSON.parse(readFileSync(join(root,'maintenance/public-demo/live-baseline.empty.json'),'utf8'));
    baseline.status='CAPTURED_UNVERIFIED';const bytes=Buffer.from(JSON.stringify(baseline));const file=join(dir,'partial.json');writeFileSync(file,bytes);
    const args=['--qualification-sha',qualificationSha,'--expected-project','shiftoryx-public-demo','--expected-project-number','848554493137',
      '--expected-bucket','shiftoryx-public-demo.firebasestorage.app','--expected-aliases','demo.shiftoryx.gr,demo-fuel.shiftoryx.gr,demo-cafe.shiftoryx.gr,demo-salon.shiftoryx.gr,demo-market.shiftoryx.gr',
      '--recovery',file,'--recovery-sha256',createHash('sha256').update(bytes).digest('hex')];
    const r=invoke(args);
    assert.equal(r.status,1);assert.match(r.stderr,/CUTOVER_RECOVERY_NOT_VERIFIED/);
    assert.doesNotMatch(r.stderr,/partial\.json|PUBLIC_DEMO_|CAPTURED_UNVERIFIED/,'no evidence payload/config/path leaked');
    const mismatch=[...args];mismatch[1]=qualificationSha==='0'.repeat(40)?'1'.repeat(40):'0'.repeat(40);
    const denied=invoke(mismatch);assert.equal(denied.status,1);assert.match(denied.stderr,/CUTOVER_GIT_HEAD_DRIFT/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
