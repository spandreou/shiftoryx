import {createHash} from 'node:crypto';
import {GateError,parseStrictJson,validatePolicy,validateLock} from './auditExceptionPolicy.ts';
type Dict=Record<string,unknown>;
export type TrivyEvidence={rootLockText:string;manifestText:string;functionsLockText:string;npmPolicyText:string;context:Record<string,string>};
export type ScanReceipt={version:string;artifactName:string;scanners:string[];severities:string[];exitCode:number;ignoreUnfixed:boolean;startedAt:string;finishedAt:string;outputWrittenAt:string};
const expectedException={cve:'CVE-2026-101916',ghsa:'GHSA-m9gg-hp2v-232j',package:'@grpc/grpc-js',version:'1.9.16',target:'package-lock.json',physicalPath:'node_modules/@grpc/grpc-js',severity:'HIGH',fixedVersion:'1.13.6, 1.14.5'};
const expectedScanner={version:'0.70.0',schemaVersion:2,scanners:['vuln','misconfig','secret'],severities:['HIGH','CRITICAL'],exitCode:1,ignoreUnfixed:true,requireAllStatuses:true};
function check(value:unknown,code:string):asserts value{if(!value)throw new GateError('TRIVY_'+code);}
function obj(value:unknown):Dict{check(value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype,'SCHEMA');return value as Dict;}
function keys(value:Dict,allowed:string[],required=allowed){check(Object.keys(value).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(value,k)),'SCHEMA');}
function list(value:unknown):unknown[]{check(Array.isArray(value)&&value.length<=2000,'SCHEMA');return value;}
function str(value:unknown):string{check(typeof value==='string'&&value.length>0&&value.length<10000,'SCHEMA');return value;}
export function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value!==null&&typeof value==='object')return '{'+Object.keys(value as Dict).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Dict)[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function semanticHash(value:unknown):string{return createHash('sha256').update(canonical(value)).digest('hex').toUpperCase();}
function same(a:unknown,b:unknown){return canonical(a)===canonical(b);}
function instant(value:unknown):number{
 const text=str(value);check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(text),'TIME');
 const parsed=Date.parse(text);check(Number.isFinite(parsed),'TIME');return parsed;
}
export function validateScanSeal(before:Record<string,string>,after:Record<string,string>):void{check(same(before,after),'CONTEXT_TOCTOU');}
function checkedPolicy(value:unknown,now:Date):Dict{
 check(now instanceof Date&&Number.isFinite(now.getTime()),'CLOCK');
 const p=obj(value);keys(p,['schemaVersion','owner','expiresAt','scanner','exception','reviewed','inventory','misconf','vulnerability']);
 check(p.schemaVersion===1&&str(p.owner).length>10,'POLICY');
 check(p.expiresAt==='2026-11-03T00:00:00Z','EXPIRY');check(now.getTime()<instant(p.expiresAt),'EXPIRED');
 check(same(p.exception,expectedException)&&same(p.scanner,expectedScanner),'POLICY_SCOPE');
 const reviewed=obj(p.reviewed);keys(reviewed,['rootLock','manifest','functionsLock','npmPolicy','sourceContext']);
 const inventory=obj(p.inventory);keys(inventory,['package-lock.json','functions/package-lock.json']);
 for(const h of [...Object.values(reviewed),...Object.values(inventory)])check(typeof h==='string'&&/^[A-F0-9]{64}$/.test(h),'POLICY_HASH');
 const m=obj(p.misconf);keys(m,['Successes','Failures']);check(Number.isSafeInteger(m.Successes)&&Number(m.Successes)>0&&m.Failures===0,'POLICY');
 const v=obj(p.vulnerability);
 check(v.VulnerabilityID===expectedException.cve&&v.PkgName===expectedException.package&&v.InstalledVersion===expectedException.version&&v.Severity==='HIGH'&&v.FixedVersion===expectedException.fixedVersion,'POLICY_SCOPE');
 check(same(v.VendorIDs,[expectedException.ghsa]),'POLICY_SCOPE');
 return p;
}
function checkedEvidence(e:TrivyEvidence,p:Dict,now:Date):void{
 const lock=parseStrictJson(e.rootLockText),manifest=parseStrictJson(e.manifestText),functionsLock=parseStrictJson(e.functionsLockText),npm=parseStrictJson(e.npmPolicyText);
 const reviewed=obj(p.reviewed),policy=validatePolicy(npm,now);
 validateLock(policy,lock,manifest);
 check(same(e.context,policy.reviewedContext),'CONTEXT_DRIFT');
 for(const [key,value] of Object.entries({rootLock:lock,manifest,functionsLock,npmPolicy:npm,sourceContext:e.context}))check(semanticHash(value)===reviewed[key],'LOCK_OR_CONTEXT_DRIFT');
 const packages=obj(obj(lock).packages),instances=Object.keys(packages).filter(k=>k.endsWith('node_modules/@grpc/grpc-js'));
 check(same(instances,['node_modules/@grpc/grpc-js']),'INSTANCE_AMBIGUOUS');
 check(obj(packages[instances[0]]).version==='1.9.16','INSTANCE_DRIFT');
}
export function validateTrivyReport(text:string,policyInput:unknown,e:TrivyEvidence,receipt:ScanReceipt,now=new Date()):{acceptedFindings:number}{
 const p=checkedPolicy(policyInput,now);checkedEvidence(e,p,now);
 const rc=obj(receipt);keys(rc,['version','artifactName','scanners','severities','exitCode','ignoreUnfixed','startedAt','finishedAt','outputWrittenAt']);
 check(rc.version==='0.70.0'&&same(rc.scanners,expectedScanner.scanners)&&same(rc.severities,expectedScanner.severities)&&rc.exitCode===1&&typeof rc.ignoreUnfixed==='boolean','SCANNER_COVERAGE');
 const start=instant(rc.startedAt),finish=instant(rc.finishedAt),written=instant(rc.outputWrittenAt);
 check(finish>=start&&finish-start<=360000&&written>=start&&written<=finish+1000&&finish<=now.getTime()+1000&&now.getTime()-finish<=30000,'STALE_OUTPUT');
 const r=obj(parseStrictJson(text));
 keys(r,['SchemaVersion','Trivy','ReportID','CreatedAt','ArtifactName','ArtifactType','Results']);
 check(r.SchemaVersion===2&&same(r.Trivy,{Version:'0.70.0'}),'SCANNER_SCHEMA');
 check(/^[a-f0-9-]{36}$/.test(str(r.ReportID)),'SCHEMA');
 const created=instant(r.CreatedAt);check(created>=start&&created<=finish+1000,'STALE_OUTPUT');
 check(r.ArtifactType==='filesystem'&&r.ArtifactName===rc.artifactName,'ARTIFACT');
 const results=list(r.Results);check(results.length===3,'MISSING_SURFACE');
 const expected=new Map([['package-lock.json',['lang-pkgs','npm']],['functions/package-lock.json',['lang-pkgs','npm']],['Dockerfile',['config','dockerfile']]]);
 const seen=new Set<string>();let accepted=0;
 for(const value of results){
  const result=obj(value);keys(result,['Target','Class','Type','Packages','Vulnerabilities','MisconfSummary','Misconfigurations','Secrets','ModifiedFindings','Licenses'],['Target','Class','Type']);
  const target=str(result.Target),surface=expected.get(target);check(surface&&!seen.has(target),'TARGET');seen.add(target);
  check(result.Class===surface[0]&&result.Type===surface[1],'CATEGORY');
  // Empty finding arrays are omitted by actual Trivy 0.70.0. Scan coverage is
  // independently bound by the trusted execution receipt and all three targets.
  for(const key of ['Secrets','Misconfigurations','ModifiedFindings','Licenses'])if(result[key]!==undefined)check(list(result[key]).length===0,'UNREVIEWED_SECURITY_FINDING');
  if(target==='Dockerfile'){
   check(same(result.MisconfSummary,p.misconf)&&result.Packages===undefined,'MISCONFIGURATION');
  }else{
   const packages=list(result.Packages);check(semanticHash(packages)===obj(p.inventory)[target],'INVENTORY');
   if(target==='package-lock.json'){
    const instances=packages.filter(x=>obj(x).Name==='@grpc/grpc-js');check(instances.length===1&&obj(instances[0]).Version==='1.9.16','INSTANCE_AMBIGUOUS');
   }
   check(result.MisconfSummary===undefined,'CATEGORY');
  }
  const vulnerabilities=result.Vulnerabilities===undefined?[]:list(result.Vulnerabilities);
  for(const raw of vulnerabilities){
   const v=obj(raw);check(v.Severity!=='CRITICAL','CRITICAL');
   check(target==='package-lock.json'&&accepted===0&&same(v,p.vulnerability),'UNREVIEWED_VULNERABILITY');
   const pkg=list(result.Packages).filter(x=>obj(x).ID===v.PkgID);
   check(pkg.length===1&&same(obj(pkg[0]).Identifier,v.PkgIdentifier),'INSTANCE_AMBIGUOUS');accepted++;
  }
 }
 check(seen.size===3&&accepted===1,'STALE_EXCEPTION');
 return {acceptedFindings:accepted};
}
export function validateTrivyProcess(process:{status:number|null;stdout:string;error?:unknown;signal?:unknown},policy:unknown,e:TrivyEvidence,receipt:ScanReceipt,now=new Date()){
 check(!process.error&&!process.signal&&process.status===1,'EXECUTION_FAILED');
 return validateTrivyReport(process.stdout,policy,e,receipt,now);
}
type Process={status:number|null;stdout:string;error?:unknown;signal?:unknown};
export function validateTrivyPair(first:Process,firstReceipt:ScanReceipt,full:Process,fullReceipt:ScanReceipt,policy:unknown,e:TrivyEvidence,now=new Date()){
 check(firstReceipt.ignoreUnfixed===true&&fullReceipt.ignoreUnfixed===false,'ALL_STATUS_PROOF');
 check(firstReceipt.artifactName===fullReceipt.artifactName&&instant(fullReceipt.startedAt)>=instant(firstReceipt.finishedAt),'ALL_STATUS_PROOF');
 const a=obj(parseStrictJson(first.stdout)),b=obj(parseStrictJson(full.stdout));
 check(a.ReportID!==b.ReportID,'REUSED_REPORT');
 validateTrivyProcess(first,policy,e,firstReceipt,now);
 return validateTrivyProcess(full,policy,e,fullReceipt,now);
}
