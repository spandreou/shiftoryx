import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
const fixture=JSON.parse(readFileSync(new URL('./test-fixtures/audit-exception-current.json',import.meta.url),'utf8'));
const policy=JSON.parse(readFileSync(new URL('../security/npm-audit-exceptions.json',import.meta.url),'utf8'));
let core;
try {core=await import('./lib/auditExceptionPolicy.ts');}
catch(error) {if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const copy=x=>structuredClone(x);
const now=new Date('2026-10-04T12:00:00Z');
const input=()=>({audit:copy(fixture.audit),policy:copy(policy),lock:copy(fixture.lock),manifest:copy(fixture.manifest)});
const run=(x,clock=now)=>core.validateNpmAudit(x.audit,x.policy,x.lock,x.manifest,clock);
const counts=a=>{const c={info:0,low:0,moderate:0,high:0,critical:0,total:0};for(const v of Object.values(a.vulnerabilities)){c[v.severity]++;c.total++;}a.metadata.vulnerabilities=c;};
const add=(x,severity='high')=>{x.audit.vulnerabilities.evil={name:'evil',severity,isDirect:false,via:[{source:999999,name:'evil',dependency:'evil',title:'Unreviewed input',url:'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',severity,cwe:[],cvss:{score:9,vectorString:null},range:'*'}],effects:[],range:'*',nodes:['node_modules/evil'],fixAvailable:false};x.lock.packages['node_modules/evil']={version:'1.0.0'};counts(x.audit);};
test('accepts only the two reviewed clusters inside their review window',()=>{
  assert.ok(core,'Reviewed findings must be accepted by the new validator; implementation is missing');
  assert.deepEqual(run(input()).acceptedAdvisories.sort(),['GHSA-m9gg-hp2v-232j','GHSA-vfj7-8cjw-p6xm']);
  assert.equal(run(input()).highPackages,9);
});
const rejects=[
['missing dependency metadata fields',x=>{x.audit.metadata.dependencies={};}],
['partial dependency inventory',x=>{x.audit.metadata.dependencies.total=1;}],
['unrelated HIGH',x=>add(x)],
['unrelated CRITICAL',x=>add(x,'critical')],
['known GHSA CRITICAL',x=>{x.audit.vulnerabilities.braces.severity='critical';x.audit.vulnerabilities.braces.via[0].severity='critical';counts(x.audit);}],
['version drift',x=>{x.lock.packages['node_modules/@grpc/grpc-js'].version='1.9.17';}],
['same version changed tarball URL',x=>{x.lock.packages['node_modules/@grpc/grpc-js'].resolved='https://unreviewed.example/package.tgz';}],
['same version changed integrity',x=>{x.lock.packages['node_modules/braces'].integrity='sha512-unreviewed';}],
['same version changed dependency metadata',x=>{x.lock.packages['node_modules/@grpc/grpc-js'].dependencies['@grpc/proto-loader']='*';}],
['missing package version',x=>{delete x.lock.packages['node_modules/braces'].version;}],
['audit node path drift',x=>{x.audit.vulnerabilities.braces.nodes=['node_modules/other/node_modules/braces'];}],
['missing audit node path',x=>{delete x.audit.vulnerabilities.braces.nodes;}],
['new same-name nested vulnerable copy',x=>{x.lock.packages['node_modules/other/node_modules/braces']={version:'3.0.3'};}],
['changed incoming dependency range',x=>{x.lock.packages['node_modules/micromatch'].dependencies.braces='*';}],
['additional parent reaches accepted package',x=>{x.lock.packages['node_modules/other']={version:'1.0.0',dependencies:{braces:'3.0.3'}};}],
['changed manifest without matching lock metadata',x=>{x.manifest.dependencies.firebase='^12.0.0';}],
['accepted severity decreased',x=>{x.audit.vulnerabilities.braces.via[0].severity='moderate';}],
['accepted advisory content drift',x=>{x.audit.vulnerabilities.braces.via[0].title='Different impact';}],
['missing audit version',x=>{delete x.audit.auditReportVersion;}],
['unexpected audit version',x=>{x.audit.auditReportVersion=3;}],
['missing audit metadata',x=>{delete x.audit.metadata;}],
['lying metadata hides HIGH',x=>{x.audit.metadata.vulnerabilities.high=0;}],
['downgraded node still resolves HIGH advisory',x=>{x.audit.vulnerabilities.braces.severity='moderate';counts(x.audit);}],
['expired gRPC entry',x=>{x.policy.exceptions[0].reviewBy='2026-10-04';}],
['expired braces entry',x=>{x.policy.exceptions[1].reviewBy='2026-10-04';}],
['future review date',x=>{x.policy.exceptions[0].reviewedOn='2026-10-05';}],
['invalid calendar date',x=>{x.policy.exceptions[0].reviewBy='2026-02-30';}],
['extended unapproved review window',x=>{x.policy.exceptions[0].reviewBy='2030-11-03';}],
['duplicate exception',x=>{x.policy.exceptions.push(copy(x.policy.exceptions[0]));}],
['duplicate package entry',x=>{x.policy.exceptions[0].allowedPackages.push(copy(x.policy.exceptions[0].allowedPackages[0]));}],
['wildcard package version',x=>{x.policy.exceptions[0].allowedPackages[0].version='*';}],
['wildcard advisory',x=>{x.policy.exceptions[0].advisoryId='GHSA-*';}],
['new exception cannot extend reviewed advisory set',x=>{x.policy.exceptions[0].advisoryId='GHSA-aaaa-bbbb-cccc';}],
['unknown package node under accepted GHSA',x=>{x.audit.vulnerabilities.evil={...copy(x.audit.vulnerabilities.firebase),name:'evil',isDirect:false,nodes:['node_modules/evil'],via:['@grpc/grpc-js']};x.lock.packages['node_modules/evil']={version:'1.0.0'};counts(x.audit);}],
['additional metavulnerability node',x=>{x.audit.vulnerabilities['new-parent']={...copy(x.audit.vulnerabilities.tailwindcss),name:'new-parent',nodes:['node_modules/new-parent']};x.lock.packages['node_modules/new-parent']={version:'1.0.0'};counts(x.audit);}],
['dangling via reference',x=>{x.audit.vulnerabilities.firebase.via=['missing'];}],
['cycle in via graph',x=>{x.audit.vulnerabilities.firebase.via=['@firebase/firestore'];x.audit.vulnerabilities['@firebase/firestore'].via=['firebase'];}],
['stale exceptions after clean audit',x=>{x.audit.vulnerabilities={};counts(x.audit);}],
['stale one-cluster exception',x=>{for(const n of ['tailwindcss','chokidar','fast-glob','micromatch','braces'])delete x.audit.vulnerabilities[n];counts(x.audit);}],
['registry/network error payload',x=>{x.audit={error:{code:'E503',summary:'Registry failed'}};}],
['empty vulnerabilities with malformed counts',x=>{x.audit.vulnerabilities={};}],
['unexpected exception key',x=>{x.policy.exceptions[0].ignoreAllHigh=true;}],
['wrong exception schema',x=>{x.policy.schemaVersion=2;}]
];
for(const [name,mutate] of rejects)test('fails closed: '+name,()=>{assert.ok(core,'validator is missing');const x=input();mutate(x);assert.throws(()=>run(x),e=>typeof e.code==='string'&&e.code.startsWith('GATE_'));});
for(const [name,value] of [
['empty',''],['truncated','{"auditReportVersion":2'],['invalid','not json'],
['duplicate object key','{"severity":"critical","severity":"high"}'],
['escaped duplicate object key','{"severity":"critical","\\u0073everity":"high"}'],
['prototype key','{"__proto__":{"severity":"high"}}'],
['oversized',' '.repeat(4*1024*1024+1)]
])test('strict JSON rejects '+name,()=>{assert.ok(core);assert.throws(()=>core.parseStrictJson(value),e=>e.code.startsWith('GATE_'));});
test('strict JSON reads ordinary legitimate audit data',()=>{assert.ok(core);assert.equal(core.parseStrictJson(JSON.stringify(fixture.audit)).auditReportVersion,2);});
test('npm process exit1 is accepted only after complete policy validation',()=>{assert.ok(core);assert.equal(core.validateNpmProcess({status:1,stdout:JSON.stringify(fixture.audit)},policy,fixture.lock,fixture.manifest,now).highPackages,9);});
for(const result of [
{status:null,error:'ENOENT',stdout:JSON.stringify(fixture.audit)},
{status:null,signal:'SIGTERM',stdout:JSON.stringify(fixture.audit)},
{status:2,stdout:JSON.stringify(fixture.audit)},
{status:0,stdout:JSON.stringify(fixture.audit)},
{status:1,stdout:''},
{status:1,stdout:'{"error":{"code":"E503"}}'}
])test('npm transport failure cannot accept JSON: '+JSON.stringify({status:result.status,error:!!result.error,signal:result.signal}),()=>{assert.ok(core);assert.throws(()=>core.validateNpmProcess(result,policy,fixture.lock,fixture.manifest,now));});
test('expiry boundary is UTC and not controlled by audit JSON',()=>{assert.ok(core);assert.throws(()=>run(input(),new Date('2026-11-03T00:00:00Z')));assert.equal(run(input(),new Date('2026-11-02T23:59:59Z')).highPackages,9);});
test('explicit exception cleanup allows a genuinely clean audit',()=>{const x=input();x.policy.exceptions=[];x.audit.vulnerabilities={};counts(x.audit);assert.equal(run(x).highPackages,0);assert.equal(core.validateNpmProcess({status:0,stdout:JSON.stringify(x.audit)},x.policy,x.lock,x.manifest,now).highPackages,0);});
const cve=()=>JSON.parse(readFileSync(new URL('./test-fixtures/cve-exception-current.json',import.meta.url),'utf8'));
test('CVE raw report and projected native baseline contain exactly reviewed identities',()=>{assert.ok(core);assert.equal(core.validateCveReport(cve(),policy,fixture.lock,fixture.manifest,now).acceptedPackages,2);assert.deepEqual(core.cveBaseline(policy,now).findings,[{name:'@grpc/grpc-js',version:'1.9.16',advisoryIds:['GHSA-m9gg-hp2v-232j','GHSA-f596-whhp-79r4']},{name:'braces',version:'3.0.3',advisoryIds:['GHSA-vfj7-8cjw-p6xm']}]);});
const cveBad=[
['reduced scanner inventory',x=>{x.packageCount=8;}],
['unexpected error field',x=>{x.error='backend failure';}],
['advisory summary drift',x=>{x.findings[0].vulnerabilities[0].summary='Changed impact';}],
['advisory aliases drift',x=>{x.findings[0].vulnerabilities[0].aliases=['CVE-2099-99999'];}],
['advisory CVSS drift',x=>{x.findings[0].vulnerabilities[0].cvssScore='CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H';}],
['alternate override finding',x=>{x.overrideFindings=[{severity:'critical'}];}],
['alternate maintenance finding',x=>{x.maintenanceFindings=[{severity:'high'}];}],
['unsafe source flag',x=>{x.findings[0].maliciousGitSource=true;}],
['unverifiable source flag',x=>{x.findings[0].maliciousUnverifiable=true;}],
['pinned malicious source flag',x=>{x.findings[0].maliciousGitSourcePinned=true;}],
['unknown severity hidden alongside LOW',x=>{x.findings.push({package:'safe',version:'1.0.0',severity:'low',unresolvedAdvisoryIds:[],vulnerabilities:[{id:'GHSA-aaaa-bbbb-cccc',severity:'low'},{id:'GHSA-dddd-eeee-ffff',severity:'unknown'}]});x.findingCount=3;}],
['incomplete',x=>{x.complete=false;}],['error',x=>{x.status='error';}],
['detection diagnostic',x=>{x.diagnostics=[{impact:'detection'}];}],
['missing findings',x=>{delete x.findings;}],['count mismatch',x=>{x.findingCount=1;}],
['new HIGH id on same package',x=>{x.findings[0].vulnerabilities.push({id:'GHSA-aaaa-bbbb-cccc',severity:'high'});}],
['known id becomes CRITICAL',x=>{x.findings[0].vulnerabilities[0].severity='critical';}],
['ancillary LOW becomes HIGH',x=>{x.findings[0].vulnerabilities.find(a=>a.id==='GHSA-f596-whhp-79r4').severity='high';}],
['known id different version',x=>{x.findings[0].version='1.9.17';}],
['path differs',x=>{x.findings[0].dependencyPaths[0]=['project','other','@grpc/grpc-js'];}],
['missing path',x=>{delete x.findings[0].dependencyPaths;}],
['unknown package known advisory',x=>{x.findings[0].package='evil';}],
['stale cluster',x=>{x.findings.pop();x.findingCount=1;}],
['unresolved advisory',x=>{x.findings[0].unresolvedAdvisoryIds=['unknown'];}]
];
for(const [name,mutate] of cveBad)test('CVE fails closed: '+name,()=>{assert.ok(core);const x=cve();mutate(x);assert.throws(()=>core.validateCveReport(x,policy,fixture.lock,fixture.manifest,now),e=>e.code?.startsWith('GATE_'));});
test('native ratchet filtered report accepts an empty complete result',()=>{assert.ok(core);const x=cve();x.findings=[];x.findingCount=0;core.validateCveFilteredReport(x,fixture.lock);});
for(const [name,mutate] of [['new HIGH',x=>{}],['known CRITICAL',x=>{x.findings[0].severity='critical';x.findings[0].vulnerabilities[0].severity='critical';}],['incomplete',x=>{x.complete=false;}],['missing count',x=>{delete x.findingCount;}],['inventory drift',x=>{x.packageCount=8;}],['error field',x=>{x.error='failure';}],['alternate finding',x=>{x.overrideFindings=[{severity:'critical'}];}]])test('native ratchet result fails: '+name,()=>{assert.ok(core);const x=cve();mutate(x);assert.throws(()=>core.validateCveFilteredReport(x,fixture.lock),e=>e.code?.startsWith('GATE_'));});
