import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {captureReviewedContext,ROOT} from './lib/auditGateRuntime.ts';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
let core;try{core=await import('./lib/trivyAuditPolicy.ts');}catch(e){if(e.code!=='ERR_MODULE_NOT_FOUND')throw e;}
const now=new Date('2026-10-04T12:00:02Z');
const input=()=>({report:JSON.parse(read('scripts/test-fixtures/trivy-0.70.0-current.json')),policy:JSON.parse(read('security/trivy-audit-exception.json')),evidence:{rootLockText:read('package-lock.json'),manifestText:read('package.json'),functionsLockText:read('functions/package-lock.json'),npmPolicyText:read('security/npm-audit-exceptions.json'),context:captureReviewedContext(ROOT)},receipt:{version:'0.70.0',artifactName:'fixture-tree',scanners:['vuln','misconfig','secret'],severities:['HIGH','CRITICAL'],exitCode:1,ignoreUnfixed:true,startedAt:'2026-10-04T12:00:00Z',finishedAt:'2026-10-04T12:00:02Z',outputWrittenAt:'2026-10-04T12:00:01Z'}});
const vuln=x=>x.report.Results.find(r=>r.Target==='package-lock.json').Vulnerabilities[0];
const root=x=>x.report.Results.find(r=>r.Target==='package-lock.json');
const run=x=>{assert.ok(core,'Trivy validator implementation is missing');return core.validateTrivyReport(JSON.stringify(x.report),x.policy,x.evidence,x.receipt,now);};
test('exact fresh raw finding before expiry is accepted and reports one exception',()=>{assert.equal(run(input()).acceptedFindings,1);});
const reject=[
 ['unknown HIGH',x=>{vuln(x).VulnerabilityID='CVE-2099-99999';}],
 ['unknown CRITICAL',x=>{vuln(x).VulnerabilityID='CVE-2099-99999';vuln(x).Severity='CRITICAL';}],
 ['same CVE wrong package',x=>{vuln(x).PkgName='another-package';}],
 ['same CVE wrong version',x=>{vuln(x).InstalledVersion='1.9.17';}],
 ['approved CVE promoted to CRITICAL',x=>{vuln(x).Severity='CRITICAL';}],
 ['expired exception',x=>{x.policy.expiresAt='2026-10-04T00:00:00Z';}],
 ['expiry cannot be extended',x=>{x.policy.expiresAt='2026-12-03T00:00:00Z';}],
 ['foreign target',x=>{root(x).Target='another/package-lock.json';}],
 ['Functions target substituted',x=>{root(x).Target='functions/package-lock.json';}],
 ['root lock changed',x=>{const l=JSON.parse(x.evidence.rootLockText);l.packages['node_modules/@grpc/grpc-js'].version='1.9.17';x.evidence.rootLockText=JSON.stringify(l);}],
 ['incoming dependency edge changed',x=>{const l=JSON.parse(x.evidence.rootLockText);l.packages['node_modules/@firebase/firestore'].dependencies['@grpc/grpc-js']='*';x.evidence.rootLockText=JSON.stringify(l);}],
 ['source context changed',x=>{x.evidence.context.src='A'.repeat(64);}],
 ['manifest changed',x=>{x.evidence.manifestText='{}';}],
 ['Functions lock changed',x=>{x.evidence.functionsLockText='{}';}],
 ['npm registry content changed',x=>{const p=JSON.parse(x.evidence.npmPolicyText);p.exceptions[0].reason='new reason';x.evidence.npmPolicyText=JSON.stringify(p);}],
 ['second physical grpc instance',x=>{const l=JSON.parse(x.evidence.rootLockText);l.packages['node_modules/other/node_modules/@grpc/grpc-js']={...l.packages['node_modules/@grpc/grpc-js']};x.evidence.rootLockText=JSON.stringify(l);}],
 ['duplicate raw grpc package instance',x=>{root(x).Packages.push({...root(x).Packages.find(p=>p.Name==='@grpc/grpc-js')});}],
 ['second unapproved HIGH',x=>{root(x).Vulnerabilities.push({...vuln(x),VulnerabilityID:'CVE-2099-99999'});}],
 ['second unapproved CRITICAL',x=>{root(x).Vulnerabilities.push({...vuln(x),VulnerabilityID:'CVE-2099-99999',Severity:'CRITICAL'});}],
 ['required fields missing',x=>{delete vuln(x).InstalledVersion;}],
 ['schema drift',x=>{x.report.SchemaVersion=3;}],
 ['scanner report version drift',x=>{x.report.Trivy.Version='0.71.0';}],
 ['actual executable version drift',x=>{x.receipt.version='0.71.0';}],
 ['configured secret scan absent',x=>{x.receipt.scanners=['vuln','misconfig'];}],
 ['configured vulnerability target absent',x=>{x.report.Results=x.report.Results.filter(r=>r.Target!=='functions/package-lock.json');}],
 ['configured misconfiguration target absent',x=>{x.report.Results=x.report.Results.filter(r=>r.Target!=='Dockerfile');}],
 ['unknown result category',x=>{x.report.Results.push({Target:'other',Class:'secret',Type:'secret',Secrets:[{Severity:'HIGH'}]});}],
 ['HIGH secret alongside approved vuln',x=>{root(x).Secrets=[{Severity:'HIGH',Match:'never-log-test-secret'}];}],
 ['CRITICAL misconfiguration',x=>{x.report.Results.find(r=>r.Target==='Dockerfile').Misconfigurations=[{Severity:'CRITICAL'}];}],
 ['misconfiguration failure hidden by missing details',x=>{x.report.Results.find(r=>r.Target==='Dockerfile').MisconfSummary.Failures=1;}],
 ['modified/suppressed findings',x=>{root(x).ModifiedFindings=[{Status:'ignored'}];}],
 ['changed fixed version',x=>{vuln(x).FixedVersion='1.15.0';}],
 ['changed advisory narrative',x=>{vuln(x).Description='changed vulnerability impact';}],
 ['changed advisory source',x=>{vuln(x).SeveritySource='unknown';}],
 ['changed GHSA mapping',x=>{vuln(x).VendorIDs=['GHSA-aaaa-bbbb-cccc'];}],
 ['missing PURL',x=>{delete vuln(x).PkgIdentifier.PURL;}],
 ['changed PURL',x=>{vuln(x).PkgIdentifier.PURL='pkg:npm/another@1.9.16';}],
 ['ambiguous ID',x=>{vuln(x).PkgID='ambiguous';}],
 ['reduced package inventory',x=>{root(x).Packages.pop();}],
 ['stale exception disappeared',x=>{root(x).Vulnerabilities=[];}],
 ['stale output predates execution',x=>{x.report.CreatedAt='2026-10-03T12:00:01Z';}],
 ['stale output file',x=>{x.receipt.outputWrittenAt='2026-10-03T12:00:01Z';}],
 ['unexpected artifact target',x=>{x.report.ArtifactName='another-tree';}],
 ['unexpected artifact type',x=>{x.report.ArtifactType='container_image';}],
 ['malformed exception entry',x=>{x.policy.exception.ignoreAllHigh=true;}],
 ['broad exception ID',x=>{x.policy.exception.cve='*';}],
 ['malformed policy expiry',x=>{x.policy.expiresAt='invalid';}],
 ['unapproved severity threshold',x=>{x.receipt.severities=['CRITICAL'];}],
 ['unapproved exit-code',x=>{x.receipt.exitCode=0;}],
 ['unexpected report error',x=>{x.report.error='backend failure';}],
];
for(const [name,mutate] of reject)test('Trivy rejects '+name,()=>{const x=input();mutate(x);assert.ok(core,'Trivy validator implementation is missing');assert.throws(()=>run(x),e=>e.code?.startsWith('GATE_'));});
for(const [name,text] of [['empty',''],['malformed','not-json'],['truncated','{"SchemaVersion":2'],['duplicate JSON keys','{"SchemaVersion":2,"SchemaVersion":2}']])test('Trivy rejects '+name+' raw JSON',()=>{const x=input();assert.ok(core);assert.throws(()=>core.validateTrivyReport(text,x.policy,x.evidence,x.receipt,now),e=>e.code?.startsWith('GATE_'));});
test('expiry boundary rejects even unchanged correct raw report',()=>{const x=input();assert.ok(core);assert.throws(()=>core.validateTrivyReport(JSON.stringify(x.report),x.policy,x.evidence,x.receipt,new Date('2026-11-03T00:00:00Z')),e=>e.code?.startsWith('GATE_'));});
for(const result of [{status:null,error:'ENOENT'},{status:null,signal:'SIGTERM'},{status:2},{status:0}])test('Trivy process failure '+JSON.stringify(result),()=>{const x=input();assert.ok(core);assert.throws(()=>core.validateTrivyProcess({...result,stdout:JSON.stringify(x.report)},x.policy,x.evidence,x.receipt,now),e=>e.code?.startsWith('GATE_'));});
test('Trivy raw exit1 is accepted only after complete validation',()=>{const x=input();assert.ok(core);assert.equal(core.validateTrivyProcess({status:1,stdout:JSON.stringify(x.report)},x.policy,x.evidence,x.receipt,now).acceptedFindings,1);});
test('scan seal rejects any file hash or path-set change',()=>{assert.ok(core);const before={'package-lock.json':'AAA','security/trivy-audit-exception.json':'BBB'};core.validateScanSeal(before,{...before});for(const after of [{'package-lock.json':'different','security/trivy-audit-exception.json':'BBB'},{'package-lock.json':'AAA'},{...before,'src/added.js':'CCC'}])assert.throws(()=>core.validateScanSeal(before,after),e=>e.code?.startsWith('GATE_'));});
const paired=()=>{
 const x=input(),full=structuredClone(x.report);full.ReportID='00000000-0000-7000-8000-000000000001';full.CreatedAt='2026-10-04T12:00:03Z';
 return {x,full,fullReceipt:{...x.receipt,ignoreUnfixed:false,startedAt:'2026-10-04T12:00:02Z',finishedAt:'2026-10-04T12:00:04Z',outputWrittenAt:'2026-10-04T12:00:03Z'}};
};
const pairRun=p=>{assert.equal(typeof core?.validateTrivyPair,'function','mandatory all-status proof is missing');return core.validateTrivyPair({status:1,stdout:JSON.stringify(p.x.report)},p.x.receipt,{status:1,stdout:JSON.stringify(p.full)},p.fullReceipt,p.x.policy,p.x.evidence,new Date('2026-10-04T12:00:04Z'));};
test('mandatory filtered and all-status raw scans both validate',()=>assert.equal(pairRun(paired()).acceptedFindings,1));
for(const [name,mutate] of [
 ['full scan still status-filtered',p=>{p.fullReceipt.ignoreUnfixed=true;}],
 ['unfixed unknown HIGH in full scan',p=>{p.full.Results.find(r=>r.Target==='package-lock.json').Vulnerabilities.push({...vuln(p.x),VulnerabilityID:'CVE-2099-99999',Status:'affected'});}],
 ['unfixed CRITICAL in full scan',p=>{p.full.Results.find(r=>r.Target==='package-lock.json').Vulnerabilities.push({...vuln(p.x),VulnerabilityID:'CVE-2099-99999',Status:'affected',Severity:'CRITICAL'});}],
 ['same report reused',p=>{p.full.ReportID=p.x.report.ReportID;}],
 ['different full scan target',p=>{p.fullReceipt.artifactName='another-tree';p.full.ArtifactName='another-tree';}],
 ['full scan started before first completed',p=>{p.fullReceipt.startedAt='2026-10-04T12:00:01Z';}],
 ['full missing secret coverage',p=>{p.fullReceipt.scanners=['vuln','misconfig'];}],
 ['partial full report',p=>{p.full.Results.pop();}]
])test('mandatory full proof rejects '+name,()=>{const p=paired();mutate(p);assert.equal(typeof core?.validateTrivyPair,'function','mandatory all-status proof is missing');assert.throws(()=>pairRun(p),e=>e.code?.startsWith('GATE_'));});
