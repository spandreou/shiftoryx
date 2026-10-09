import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {mkdtempSync,cpSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {captureReviewedContext,assertReviewedContext,CONTEXT_PATHS,ROOT} from './lib/auditGateRuntime.ts';
import {validateNpmAudit,validatePolicy,validateCveReport} from './lib/auditExceptionPolicy.ts';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const evidence=read('./test-fixtures/selector-advisory-evidence.json');
const legacy=read('./test-fixtures/audit-exception-current.json');
const registry=read('../security/npm-audit-exceptions.json');
const now=new Date('2026-10-08T00:00:00Z');
const input=()=>{
 const x=structuredClone({...legacy,policy:registry});const e=x.policy.exceptions[1];
 e.ancillaryAdvisories=[{advisoryId:'GHSA-rj75-hqrm-r3gf',severity:'moderate'}];e.selectorEvidence=structuredClone(evidence);
 for(const p of evidence.allowedPackages){x.lock.packages[p.dependencyPath]=structuredClone(p.lockFingerprint);x.audit.vulnerabilities[p.name]=structuredClone(p.auditFingerprint);}
 Object.assign(x.lock.packages['node_modules/tailwindcss'].dependencies,{'postcss-selector-parser':'^6.1.2','postcss-nested':'^6.2.0'});
 e.allowedPackages.find(p=>p.name==='tailwindcss').lockFingerprint=structuredClone(x.lock.packages['node_modules/tailwindcss']);
 const tw=x.audit.vulnerabilities.tailwindcss;tw.via=['chokidar','fast-glob','micromatch','postcss-nested','postcss-selector-parser'];tw.range='<=0.0.0-oxide-insiders.ff2c25f || 0.5.0 - 3.4.19';
 e.allowedPackages.find(p=>p.name==='tailwindcss').auditFingerprint=structuredClone(tw);
 x.audit.metadata.dependencies.total=11;x.audit.metadata.vulnerabilities.moderate=2;x.audit.metadata.vulnerabilities.total=11;
 return x;
};
const run=x=>validateNpmAudit(x.audit,x.policy,x.lock,x.manifest,now);
test('exact reviewed build-only ancillary does not create a third HIGH exception',()=>{
 const r=run(input());assert.equal(r.highPackages,9);assert.deepEqual(r.acceptedAdvisories.sort(),['GHSA-m9gg-hp2v-232j','GHSA-vfj7-8cjw-p6xm']);
});
for(const [label,mutate]of [
 ['advisory differs',x=>x.policy.exceptions[1].ancillaryAdvisories[0].advisoryId='GHSA-aaaa-bbbb-cccc'],
 ['second ancillary',x=>x.policy.exceptions[1].ancillaryAdvisories.push({advisoryId:'GHSA-aaaa-bbbb-cccc',severity:'moderate'})],
 ['severity HIGH',x=>x.policy.exceptions[1].selectorEvidence.severity='high'],
 ['package differs',x=>x.policy.exceptions[1].selectorEvidence.package='evil'],
 ['version differs',x=>x.policy.exceptions[1].selectorEvidence.version='6.1.4'],
 ['public input',x=>x.policy.exceptions[1].selectorEvidence.conditions.publicInputReachable=true],
 ['runtime input',x=>x.policy.exceptions[1].selectorEvidence.conditions.productionRuntimeReachable=true],
 ['Functions input',x=>x.policy.exceptions[1].selectorEvidence.conditions.functionsRuntimeReachable=true],
 ['not build only',x=>x.policy.exceptions[1].selectorEvidence.conditions.buildOnly=false],
 ['missing reviewed evidence',x=>delete x.policy.exceptions[1].selectorEvidence],
 ['unknown policy field',x=>x.policy.exceptions[1].selectorEvidence.acceptAnyModerate=true],
 ['non-dev physical instance',x=>x.lock.packages['node_modules/postcss-selector-parser'].dev=false],
 ['extra physical instance',x=>x.lock.packages['node_modules/other/node_modules/postcss-selector-parser']=structuredClone(x.lock.packages['node_modules/postcss-selector-parser'])],
 ['incoming edge drift',x=>x.lock.packages['node_modules/postcss-nested'].dependencies['postcss-selector-parser']='*'],
 ['advisory metadata drift',x=>x.audit.vulnerabilities['postcss-selector-parser'].via[0].title='changed'],
 ['leaf severity HIGH',x=>{x.audit.vulnerabilities['postcss-selector-parser'].severity='high';x.audit.vulnerabilities['postcss-selector-parser'].via[0].severity='high';}],
 ['tailwind exception identity',x=>x.policy.exceptions[1].advisoryId='GHSA-aaaa-bbbb-cccc'],
 ['expiry extended',x=>x.policy.exceptions[1].reviewBy='2026-11-04']
])test('ancillary fails closed: '+label,()=>{const x=input();mutate(x);assert.throws(()=>run(x),e=>e.code?.startsWith('GATE_'));});
test('ancillary expires exactly with existing Tailwind boundary',()=>{
 const x=input();assert.throws(()=>validateNpmAudit(x.audit,x.policy,x.lock,x.manifest,new Date('2026-11-03T00:00:00Z')));
});
test('exact evidence must match raw CVE medium finding on its own package',()=>{
 const x=input(),r=read('./test-fixtures/cve-exception-current.json');
 const real=read('./test-fixtures/cve-schema-real-1.37.0.json').findings[3];
 r.findings=r.findings.filter(f=>f.package!=='postcss-selector-parser');r.findings.push(real);r.findingCount=3;r.packageCount=11;
 assert.equal(validateCveReport(r,x.policy,x.lock,x.manifest,now).acceptedPackages,2);
 const bad=structuredClone(r);bad.findings[2].vulnerabilities[0].aliases=['CVE-2099-99999'];
 assert.throws(()=>validateCveReport(bad,x.policy,x.lock,x.manifest,now));
});
test('unreviewed validator source invalidates the reviewed context before acceptance',()=>{
 const dir=mkdtempSync(join(tmpdir(),'shiftoryx-selector-context-test-'));
 for(const p of CONTEXT_PATHS)cpSync(join(ROOT,p),join(dir,p),{recursive:true});
 const helper=join(dir,'scripts/lib/auditExceptionPolicy.ts');
 cpSync(join(ROOT,'scripts/lib'),dirname(helper),{recursive:true});
 assertReviewedContext(dir,registry);
 writeFileSync(helper,'unreviewed permissive policy implementation\n');
 assert.throws(()=>assertReviewedContext(dir,registry),e=>e.code==='GATE_REVIEWED_CONTEXT_DRIFT');
});
