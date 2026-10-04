import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runNpm} from './lib/auditGateRuntime.ts';
const fixture=(version='10.9.4',output='10.9.4',status=0)=>{
 const dir=mkdtempSync(join(tmpdir(),'shiftoryx-npm-pin-test-'));
 mkdirSync(join(dir,'bin'));
 writeFileSync(join(dir,'package.json'),JSON.stringify({name:'npm',version}));
 const marker=join(dir,'audit-was-executed'),cli=join(dir,'bin','npm-cli.js');
 writeFileSync(cli,`const fs=require('fs');if(process.argv[2]==='--version'){console.log(${JSON.stringify(output)});process.exit(${status});}fs.writeFileSync(${JSON.stringify(marker)},'executed');console.log('AUDIT');`);
 return {dir,cli,marker};
};
const withCli=(cli,fn)=>{const before=process.env.SHIFTORYX_AUDIT_NPM_CLI;process.env.SHIFTORYX_AUDIT_NPM_CLI=cli;try{return fn();}finally{if(before===undefined)delete process.env.SHIFTORYX_AUDIT_NPM_CLI;else process.env.SHIFTORYX_AUDIT_NPM_CLI=before;}};
const denied=cli=>withCli(cli,()=>assert.throws(()=>runNpm(['audit','--json']),e=>e.code?.startsWith('GATE_NPM_')));
test('explicit missing npm CLI rejects instead of falling back to installed npm',()=>denied(join(tmpdir(),'does-not-exist-npm','bin','npm-cli.js')));
test('relative npm executable resolution rejects',()=>denied('bin/npm-cli.js'));
test('unexpected npm entrypoint rejects before execution',()=>{const f=fixture();denied(join(f.dir,'package.json'));assert.equal(existsSync(f.marker),false);});
test('npm 11 metadata rejects even if its version command claims npm 10',()=>{const f=fixture('11.19.0');denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('actual npm 11 probe blocks audit before side effects',()=>{const f=fixture('10.9.4','11.19.0');denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('npm probe execution failure blocks audit',()=>{const f=fixture('10.9.4','10.9.4',2);denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('npm probe banner cannot masquerade as exact version',()=>{const f=fixture('10.9.4','npm 10.9.4 additional data');denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('malformed npm package metadata rejects',()=>{const f=fixture();writeFileSync(join(f.dir,'package.json'),'not-json');denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('non-npm package metadata rejects',()=>{const f=fixture();writeFileSync(join(f.dir,'package.json'),JSON.stringify({name:'another-package',version:'10.9.4'}));denied(f.cli);assert.equal(existsSync(f.marker),false);});
test('version proof and audit use the same explicit executable',()=>{
 const f=fixture();const result=withCli(f.cli,()=>runNpm(['audit','--json'],f.dir));
 assert.equal(result.status,0);assert.equal(result.stdout.trim(),'AUDIT');assert.equal(existsSync(f.marker),true);
});
test('npm CLI changed during version probe cannot execute an audit',()=>{
 const f=fixture();writeFileSync(f.cli,`const fs=require('fs');if(process.argv[2]==='--version'){fs.appendFileSync(__filename,${JSON.stringify('\n// changed')});console.log('10.9.4');}else{fs.writeFileSync(${JSON.stringify(f.marker)},'executed');}`);
 withCli(f.cli,()=>assert.throws(()=>runNpm(['audit','--json'],f.dir),e=>e.code==='GATE_NPM_EXECUTABLE_DRIFT'));assert.equal(existsSync(f.marker),false);
});
test('npm manifest changed during audit cannot produce accepted output',()=>{
 const f=fixture();writeFileSync(f.cli,`const fs=require('fs');if(process.argv[2]==='--version'){console.log('10.9.4');}else{fs.writeFileSync(${JSON.stringify(join(f.dir,'package.json'))},JSON.stringify({name:'npm',version:'11.19.0'}));console.log('AUDIT');}`);
 withCli(f.cli,()=>assert.throws(()=>runNpm(['audit','--json'],f.dir),e=>e.code==='GATE_NPM_EXECUTABLE_DRIFT'));
});
