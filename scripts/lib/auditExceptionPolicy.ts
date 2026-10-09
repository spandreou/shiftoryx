// Native Node 22+/24 TypeScript. No runtime dependency or executable policy input.
type Dict = Record<string, unknown>;
type PackageRule = {name:string;version:string;dependencyPath:string;dev:boolean;auditFingerprint:Dict;lockFingerprint:Dict};
type Edge = {from:string;kind:string;name:string;range:string;to:string};
type SelectorEvidence = {advisoryId:string;cve:string;package:string;version:string;severity:'moderate';conditions:Dict;allowedPackages:PackageRule[];incomingEdges:Edge[];cveFingerprint:Dict[];dependencyPaths:string[][]};
type Exception = {advisoryId:string;severity:'high';reason:string;reviewedOn:string;reviewBy:string;allowedPackages:PackageRule[];incomingEdges:Edge[];cveFingerprint:Dict[];ancillaryAdvisories:{advisoryId:string;severity:'low'|'moderate'}[];selectorEvidence?:SelectorEvidence;invalidationConditions:string[]};
type Policy = {schemaVersion:1;project:'root';owner:string;reviewedContext:Record<string,string>;exceptions:Exception[]};
type Result = {acceptedAdvisories:string[];highPackages:number};
const CLUSTERS: Record<string,string[]> = {
 'GHSA-m9gg-hp2v-232j':['firebase','@firebase/firestore','@firebase/firestore-compat','@grpc/grpc-js'],
 'GHSA-vfj7-8cjw-p6xm':['tailwindcss','chokidar','fast-glob','micromatch','braces']
};
const SEVERITIES=['info','low','moderate','high','critical'];
// CVE Lite 1.37.0 emits medium, not npm's moderate. Keep raw evidence intact.
const CVE_SEVERITIES=['info','low','medium','high','critical'];
function cveRank(value:unknown):number {const rank=CVE_SEVERITIES.indexOf(text(value));requireThat(rank>=0,'CVE_UNKNOWN');return rank;}
const MAX_REVIEW='2026-11-03';
const PACKAGE=/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION=/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const GHSA=/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/;
const SELECTOR_ID='GHSA-rj75-hqrm-r3gf';
const SELECTOR_PATHS=[['project','tailwindcss','postcss-selector-parser'],['project','tailwindcss','postcss-nested','postcss-selector-parser']];
const SELECTOR_EDGES=[{from:'node_modules/tailwindcss',kind:'dependencies',name:'postcss-selector-parser',range:'^6.1.2',to:'node_modules/postcss-selector-parser'},{from:'node_modules/postcss-nested',kind:'dependencies',name:'postcss-selector-parser',range:'^6.1.1',to:'node_modules/postcss-selector-parser'},{from:'node_modules/tailwindcss',kind:'dependencies',name:'postcss-nested',range:'^6.2.0',to:'node_modules/postcss-nested'}];
export const CONTEXT_PATHS=['src','functions/src','package.json','vercel.json','firebase.json','vite.config.js','tailwind.config.js','postcss.config.js','functions/package.json','functions/package-lock.json','scripts/package-public-demo.mjs','scripts/build-public-demo.mjs','scripts/demo-package-rules.mjs','scripts/demo-firestore-rules.mjs','rules','firestore.rules','storage.rules','firestore.demo.rules','storage.demo.rules','.github/workflows','Dockerfile','.dockerignore','.vercelignore','index.html','scripts/lib/auditExceptionPolicy.ts'];
export class GateError extends Error {
 code:string;
 constructor(code:string){super(code);this.name='GateError';this.code='GATE_'+code;}
}
function requireThat(ok:unknown,code:string):asserts ok {if(!ok)throw new GateError(code);}
function object(v:unknown):Dict {requireThat(v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,'SCHEMA');return v as Dict;}
function keys(v:Dict,allowed:string[],required=allowed){requireThat(Object.keys(v).every(k=>allowed.includes(k))&&required.every(k=>Object.hasOwn(v,k)),'SCHEMA');}
function text(v:unknown,max=4096):string {requireThat(typeof v==='string'&&v.length>0&&v.length<=max,'SCHEMA');return v;}
function array(v:unknown,max=2000):unknown[] {requireThat(Array.isArray(v)&&v.length<=max,'SCHEMA');return v;}
function strings(v:unknown,max=2000):string[] {const a=array(v,max).map(x=>text(x));requireThat(new Set(a).size===a.length,'DUPLICATE');return a;}
function integer(v:unknown):number {requireThat(Number.isSafeInteger(v)&&Number(v)>=0,'SCHEMA');return Number(v);}
function stable(v:unknown):string {
 if(Array.isArray(v))return '['+v.map(stable).join(',')+']';
 if(v!==null&&typeof v==='object')return '{'+Object.entries(v as Dict).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>JSON.stringify(k)+':'+stable(x)).join(',')+'}';
 return JSON.stringify(v);
}
function setEqual(a:unknown[],b:unknown[]):boolean {return stable(a.map(stable).sort())===stable(b.map(stable).sort());}
function fingerprint(v:Dict):string {
 const out={...v};
 for(const k of ['nodes','effects','via'])if(Array.isArray(out[k]))out[k]=(out[k] as unknown[]).map(x=>x).sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);
 return stable(out);
}
function day(v:unknown):string {const s=text(v,10);requireThat(/^\d{4}-\d{2}-\d{2}$/.test(s),'DATE');const d=new Date(s+'T00:00:00Z');requireThat(Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s,'DATE');return s;}
export function parseStrictJson(input:unknown):unknown {
 requireThat(typeof input==='string'&&Buffer.byteLength(input)<=4*1024*1024&&input.trim().length>0,'JSON');
 let value:unknown;try{value=JSON.parse(input);}catch{throw new GateError('JSON');}
 // Syntax is checked by the native parser. A second lexical pass rejects duplicate
 // decoded keys instead of accepting JSON.parse's last-key-wins interpretation.
 const tokens=input.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)||[];
 const stack:({kind:string;keys:Set<string>})[]=[];
 for(let i=0;i<tokens.length;i++){
  const t=tokens[i];
  if(t==='{'||t==='['){stack.push({kind:t,keys:new Set()});requireThat(stack.length<=64,'JSON_DEPTH');}
  else if(t==='}'||t===']')stack.pop();
  else if(t.startsWith('"')&&tokens[i+1]===':'){
   const key=JSON.parse(t);requireThat(!['__proto__','constructor','prototype'].includes(key),'JSON_KEY');
   const frame=stack.at(-1);requireThat(frame?.kind==='{'&&!frame.keys.has(key),'JSON_DUPLICATE');frame.keys.add(key);
  }
 }
 return value;
}
export function validatePolicy(input:unknown,now=new Date()):Policy {
 requireThat(now instanceof Date&&Number.isFinite(now.getTime()),'CLOCK');
 const today=now.toISOString().slice(0,10),p=object(input);
 keys(p,['schemaVersion','project','owner','reviewedContext','exceptions']);
 const context=object(p.reviewedContext);
 keys(context,CONTEXT_PATHS);
 requireThat(Object.values(context).every(h=>typeof h==='string'&&/^[A-F0-9]{64}$/.test(h)),'POLICY_CONTEXT');
 requireThat(p.schemaVersion===1&&p.project==='root','POLICY_SCHEMA');text(p.owner);
 const es=array(p.exceptions,2);
 const ids=new Set<string>(),allPaths=new Set<string>();
 for(const raw of es){
  const e=object(raw);const fields=['advisoryId','severity','reason','reviewedOn','reviewBy','allowedPackages','incomingEdges','cveFingerprint','ancillaryAdvisories','invalidationConditions'];keys(e,[...fields,'selectorEvidence'],fields);
  const id=text(e.advisoryId);requireThat(GHSA.test(id)&&Object.hasOwn(CLUSTERS,id)&&!ids.has(id)&&e.severity==='high','POLICY_SCOPE');ids.add(id);
  requireThat(text(e.reason).length>=40&&strings(e.invalidationConditions,20).length>=3,'POLICY_REASON');
  const reviewed=day(e.reviewedOn),expires=day(e.reviewBy);
  requireThat(reviewed==='2026-10-03'&&reviewed<=today&&expires>reviewed&&expires<=MAX_REVIEW,'POLICY_DATE');
  requireThat(today<expires,'EXPIRED');
  const ps=array(e.allowedPackages,9),names=new Set<string>();
  requireThat(ps.length===CLUSTERS[id].length,'POLICY_SCOPE');
  for(const rawPackage of ps){
   const rule=object(rawPackage);keys(rule,['name','version','dependencyPath','dev','auditFingerprint','lockFingerprint']);
   const name=text(rule.name,214),version=text(rule.version,100),path=text(rule.dependencyPath,300);
   requireThat(PACKAGE.test(name)&&VERSION.test(version)&&CLUSTERS[id].includes(name)&&!names.has(name),'POLICY_PACKAGE');names.add(name);
   requireThat(path==='node_modules/'+name&&!allPaths.has(path)&&typeof rule.dev==='boolean','POLICY_PATH');allPaths.add(path);
   const fp=object(rule.auditFingerprint);requireThat(fp.name===name&&fp.severity==='high'&&setEqual(array(fp.nodes),[path]),'POLICY_FINGERPRINT');
   const lf=object(rule.lockFingerprint);requireThat(lf.version===version&&!!lf.dev===rule.dev&&typeof lf.resolved==='string'&&typeof lf.integrity==='string','POLICY_LOCK_FINGERPRINT');
  }
  const edges=array(e.incomingEdges,30),edgeSet=new Set<string>();
  for(const rawEdge of edges){const x=object(rawEdge);keys(x,['from','kind','name','range','to']);const sig=stable(x);requireThat(!edgeSet.has(sig),'DUPLICATE');edgeSet.add(sig);
   requireThat(typeof x.from==='string'&&['dependencies','devDependencies','optionalDependencies','peerDependencies'].includes(text(x.kind))&&CLUSTERS[id].includes(text(x.name))&&text(x.to)==='node_modules/'+x.name,'POLICY_EDGE');text(x.range,200);
  }
  requireThat(edges.length>0,'POLICY_EDGE');
  const ancillary=array(e.ancillaryAdvisories,1);
  if(id==='GHSA-m9gg-hp2v-232j')requireThat(ancillary.length===1&&stable(ancillary[0])===stable({advisoryId:'GHSA-f596-whhp-79r4',severity:'low'}),'POLICY_ANCILLARY');
  else if(ancillary.length===0)requireThat(!Object.hasOwn(e,'selectorEvidence'),'POLICY_ANCILLARY');
  else {
   requireThat(stable(ancillary)===stable([{advisoryId:SELECTOR_ID,severity:'moderate'}]),'POLICY_ANCILLARY');
   checkedSelectorEvidence(e.selectorEvidence);
  }
  if(id!=='GHSA-vfj7-8cjw-p6xm')requireThat(!Object.hasOwn(e,'selectorEvidence'),'POLICY_ANCILLARY');
  const cve=array(e.cveFingerprint,2).map(checkedCveAdvisory);
  requireThat(setEqual(cve.map(a=>({advisoryId:a.id,severity:a.severity})),[{advisoryId:id,severity:'high'},...ancillary.filter(a=>object(a).severity==='low')]),'POLICY_CVE_FINGERPRINT');
 }
 return input as Policy;
}
function checkedSelectorEvidence(raw:unknown):void {
 const s=object(raw);keys(s,['advisoryId','cve','package','version','severity','conditions','allowedPackages','incomingEdges','cveFingerprint','dependencyPaths']);
 requireThat(s.advisoryId===SELECTOR_ID&&s.cve==='CVE-2026-104844'&&s.package==='postcss-selector-parser'&&s.version==='6.1.3'&&s.severity==='moderate','POLICY_SELECTOR_SCOPE');
 requireThat(stable(s.conditions)===stable({buildOnly:true,publicInputReachable:false,productionRuntimeReachable:false,functionsRuntimeReachable:false}),'POLICY_SELECTOR_RUNTIME');
 const ps=array(s.allowedPackages,2);requireThat(ps.length===2,'POLICY_SELECTOR_SCOPE');
 const expected=new Map([['postcss-selector-parser','6.1.3'],['postcss-nested','6.2.0']]);
 for(const rawP of ps){const p=object(rawP);keys(p,['name','version','dependencyPath','dev','auditFingerprint','lockFingerprint']);
  const name=text(p.name);requireThat(expected.get(name)===p.version&&p.dependencyPath==='node_modules/'+name&&p.dev===true,'POLICY_SELECTOR_SCOPE');expected.delete(name);
  const a=object(p.auditFingerprint),l=object(p.lockFingerprint);
  requireThat(a.name===name&&a.severity==='moderate'&&setEqual(array(a.nodes),[p.dependencyPath])&&l.version===p.version&&l.dev===true&&typeof l.integrity==='string'&&typeof l.resolved==='string','POLICY_SELECTOR_FINGERPRINT');
 }
 requireThat(setEqual(array(s.incomingEdges,3),SELECTOR_EDGES)&&setEqual(array(s.dependencyPaths,2),SELECTOR_PATHS),'POLICY_SELECTOR_PATH');
 const vs=array(s.cveFingerprint,1).map(checkedCveAdvisory);
 requireThat(vs.length===1&&vs[0].id===SELECTOR_ID&&vs[0].severity==='medium'&&setEqual(array(vs[0].aliases),['CVE-2026-104844']),'POLICY_SELECTOR_ADVISORY');
}
function selectorEvidence(policy:Policy):SelectorEvidence|undefined {return policy.exceptions.find(e=>e.advisoryId==='GHSA-vfj7-8cjw-p6xm')?.selectorEvidence;}
function resolvePackage(from:string,name:string,packages:Dict):string|null {
 let base=from;
 for(let i=0;i<64;i++){const candidate=(base?base+'/':'')+'node_modules/'+name;if(Object.hasOwn(packages,candidate))return candidate;
  if(base==='')return null;const n=base.lastIndexOf('/node_modules/');base=n<0?'':base.slice(0,n);
 }
 throw new GateError('LOCK_DEPTH');
}
export function validateLock(policy:Policy,lockInput:unknown,manifestInput:unknown):void {
 const lock=object(lockInput),manifest=object(manifestInput);requireThat(lock.lockfileVersion===3,'LOCK_SCHEMA');
 const packages=object(lock.packages),root=object(packages['']);
 requireThat(root.name===manifest.name&&root.version===manifest.version&&lock.name===manifest.name,'MANIFEST_DRIFT');
 for(const k of ['dependencies','devDependencies','optionalDependencies'])requireThat(stable(root[k]||{})===stable(manifest[k]||{}),'MANIFEST_DRIFT');
 const s=selectorEvidence(policy),rules=[...policy.exceptions.flatMap(e=>e.allowedPackages),...(s?.allowedPackages||[])],scopeNames=new Set(rules.map(r=>r.name));
 for(const rule of rules){const p=object(packages[rule.dependencyPath]);requireThat(p.version===rule.version&&!!p.dev===rule.dev,'LOCK_VERSION_DRIFT');requireThat(stable(p)===stable(rule.lockFingerprint),'LOCK_CONTENT_DRIFT');}
 for(const path of Object.keys(packages)){
  for(const rule of rules)if(path.endsWith('node_modules/'+rule.name))requireThat(path===rule.dependencyPath,'LOCK_PATH_DRIFT');
 }
 const actual:Edge[]=[];
 for(const [from,raw] of Object.entries(packages)){
  const p=object(raw);
  for(const kind of ['dependencies','devDependencies','optionalDependencies','peerDependencies']){
   if(p[kind]===undefined)continue;
   for(const [name,rawRange] of Object.entries(object(p[kind]))){
    if(!scopeNames.has(name))continue;
    const to=resolvePackage(from,name,packages);requireThat(to!==null,'LOCK_MISSING_PATH');
    actual.push({from,kind,name,range:text(rawRange,200),to});
   }
  }
 }
 requireThat(setEqual(actual,[...policy.exceptions.flatMap(e=>e.incomingEdges),...(s?.incomingEdges||[])]),'LOCK_EDGE_DRIFT');
}
function checkedAdvisory(input:unknown):Dict {
 const a=object(input);keys(a,['source','name','dependency','title','url','severity','cwe','cvss','range']);
 integer(a.source);requireThat(PACKAGE.test(text(a.name,214))&&a.dependency===a.name,'AUDIT_ADVISORY');
 const url=text(a.url,300);requireThat(/^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(url),'AUDIT_ADVISORY_ID');
 requireThat(SEVERITIES.includes(text(a.severity)),'AUDIT_SEVERITY');text(a.title);text(a.range);
 strings(a.cwe,20);const cvss=object(a.cvss);keys(cvss,['score','vectorString']);requireThat(typeof cvss.score==='number'&&Number.isFinite(cvss.score)&&cvss.score>=0&&cvss.score<=10&&(cvss.vectorString===null||typeof cvss.vectorString==='string'),'AUDIT_SCHEMA');
 return a;
}
export function validateNpmAudit(auditInput:unknown,policyInput:unknown,lock:unknown,manifest:unknown,now=new Date()):Result {
 const policy=validatePolicy(policyInput,now);validateLock(policy,lock,manifest);
 const audit=object(auditInput);keys(audit,['auditReportVersion','vulnerabilities','metadata']);requireThat(audit.auditReportVersion===2,'AUDIT_SCHEMA');
 const nodes=object(audit.vulnerabilities);requireThat(Object.keys(nodes).length<=2000,'AUDIT_SIZE');
 const meta=object(audit.metadata);keys(meta,['vulnerabilities','dependencies']);const stats=object(meta.vulnerabilities);keys(stats,[...SEVERITIES,'total']);
 for(const k of [...SEVERITIES,'total'])integer(stats[k]);
 const dependencyStats=object(meta.dependencies);
 keys(dependencyStats,['prod','dev','optional','peer','peerOptional','total']);
 for(const value of Object.values(dependencyStats))integer(value);
 requireThat(dependencyStats.total===Object.keys(object(object(lock).packages)).length-1,'AUDIT_INVENTORY');
 const counts:Record<string,number>={info:0,low:0,moderate:0,high:0,critical:0,total:0};
 for(const [name,raw] of Object.entries(nodes)){
  requireThat(PACKAGE.test(name),'AUDIT_PACKAGE');const n=object(raw);keys(n,['name','severity','isDirect','via','effects','range','nodes','fixAvailable']);
  requireThat(n.name===name&&SEVERITIES.includes(text(n.severity))&&typeof n.isDirect==='boolean','AUDIT_SCHEMA');
  const paths=strings(n.nodes,100);requireThat(paths.length>0,'AUDIT_PATH');strings(n.effects,200);text(n.range);array(n.via,200);
  for(const path of paths){requireThat(path.endsWith('node_modules/'+name),'AUDIT_PATH');const p=object(object(object(lock).packages)[path]);requireThat(VERSION.test(text(p.version,100)),'LOCK_VERSION');}
  requireThat(typeof n.fixAvailable==='boolean'||(n.fixAvailable!==null&&typeof n.fixAvailable==='object'&&!Array.isArray(n.fixAvailable)),'AUDIT_SCHEMA');
  counts[text(n.severity)]++;counts.total++;
 }
 requireThat(stable(counts)===stable(stats),'AUDIT_COUNTS');
 const cache=new Map<string,Dict[]>(),visiting=new Set<string>();
 function leaves(name:string):Dict[]{
  if(cache.has(name))return cache.get(name)!;
  requireThat(Object.hasOwn(nodes,name)&&!visiting.has(name)&&visiting.size<64,'AUDIT_VIA');
  visiting.add(name);const result:Dict[]=[];
  for(const via of array(object(nodes[name]).via,200)){
   if(typeof via==='string'){requireThat(PACKAGE.test(via),'AUDIT_VIA');result.push(...leaves(via));}
   else result.push(checkedAdvisory(via));
  }
  visiting.delete(name);requireThat(result.length>0&&result.length<=5000,'AUDIT_VIA');cache.set(name,result);return result;
 }
 const expectedNodes=new Map(policy.exceptions.flatMap(e=>e.allowedPackages.map(r=>[r.name,{exception:e,rule:r}] as const)));
 const used=new Set<string>();
 const selector=selectorEvidence(policy),selectorNodes=new Map(selector?.allowedPackages.map(p=>[p.name,p])||[]);let selectorSeen=0;
 for(const [name,raw] of Object.entries(nodes)){
  const n=object(raw),advisories=leaves(name);
  const highest=Math.max(...advisories.map(a=>SEVERITIES.indexOf(text(a.severity))));
  requireThat(SEVERITIES[highest]===n.severity,'AUDIT_SEVERITY_MISMATCH');
  requireThat(highest<4,'CRITICAL');
  if(selectorNodes.has(name)){
   requireThat(highest===2&&fingerprint(n)===fingerprint(selectorNodes.get(name)!.auditFingerprint),'SELECTOR_NODE_DRIFT');
   for(const a of advisories)requireThat(a.name==='postcss-selector-parser'&&text(a.url).split('/').at(-1)===SELECTOR_ID&&a.severity==='moderate'&&stable(a)===stable(object(selectorNodes.get('postcss-selector-parser')!.auditFingerprint).via instanceof Array?(object(selectorNodes.get('postcss-selector-parser')!.auditFingerprint).via as unknown[])[0]:null),'SELECTOR_ADVISORY_DRIFT');
   selectorSeen++;
  }
  if(highest<3)continue;
  const expected=expectedNodes.get(name);requireThat(expected,'UNREVIEWED_HIGH');
  requireThat(fingerprint(n)===fingerprint(expected.rule.auditFingerprint),'ADVISORY_OR_NODE_DRIFT');
  for(const advisory of advisories){
   const id=text(advisory.url).split('/').at(-1)!;
   if(advisory.severity==='high')requireThat(id===expected.exception.advisoryId,'UNREVIEWED_HIGH');
   else requireThat(expected.exception.ancillaryAdvisories.some(a=>a.advisoryId===id&&a.severity===advisory.severity),'ADVISORY_DRIFT');
  }
  used.add(expected.exception.advisoryId);
 }
 requireThat(used.size===policy.exceptions.length&&counts.high===expectedNodes.size&&selectorSeen===selectorNodes.size,'STALE_EXCEPTION');
 return {acceptedAdvisories:[...used],highPackages:counts.high};
}
type ProcessResult = {status:number|null;stdout:string;error?:unknown;signal?:unknown};
export function validateNpmProcess(result:ProcessResult,policy:unknown,lock:unknown,manifest:unknown,now=new Date()):Result {
 requireThat(!result.error&&!result.signal&&(result.status===0||result.status===1),'AUDIT_UNAVAILABLE');
 const parsed=parseStrictJson(result.stdout),answer=validateNpmAudit(parsed,policy,lock,manifest,now);
 requireThat(result.status===(answer.highPackages?1:0),'AUDIT_EXIT_MISMATCH');return answer;
}
export function cveBaseline(policyInput:unknown,now=new Date()):{version:number;createdAt:string;findings:{name:string;version:string;advisoryIds:string[]}[]} {
 const policy=validatePolicy(policyInput,now);
 const findings=policy.exceptions.map(e=>{
  const target=e.allowedPackages.find(p=>p.auditFingerprint.via instanceof Array&&(p.auditFingerprint.via as unknown[]).some(v=>typeof v==='object'&&v!==null))!;
  requireThat(target,'POLICY_FINGERPRINT');
  return {name:target.name,version:target.version,advisoryIds:[e.advisoryId,...e.ancillaryAdvisories.filter(a=>a.severity==='low').map(a=>a.advisoryId)]};
 });
 const s=selectorEvidence(policy);if(s)findings.push({name:s.package,version:s.version,advisoryIds:[s.advisoryId]});
 return {version:1,createdAt:now.toISOString(),findings};
}
function checkedCveAdvisory(raw:unknown):Dict {
 const a=object(raw);keys(a,['id','aliases','summary','severity','cvssScore']);
 requireThat(GHSA.test(text(a.id,40)),'CVE_UNKNOWN');cveRank(a.severity);
 strings(a.aliases,30);text(a.summary);requireThat(a.cvssScore===null||typeof a.cvssScore==='string','CVE_SCHEMA');return a;
}
function cveInventory(lock:unknown):Map<string,Dict> {
 // CVE Lite 1.37.0 loadFromPackageLock/upsertPackage: unique name@version,
 // not physical lock nodes. 289 physical nodes become 286 scan identities.
 const result=new Map<string,Dict>();
 for(const [path,raw] of Object.entries(object(object(lock).packages))){
  if(!path)continue;
  requireThat(path.includes('node_modules/'),'CVE_LOCK_SCHEMA');
  const p=object(raw),name=path.slice(path.lastIndexOf('node_modules/')+13);
  requireThat(PACKAGE.test(name)&&VERSION.test(text(p.version,100)),'CVE_LOCK_SCHEMA');
  const key=name+'@'+p.version,old=result.get(key);
  result.set(key,{name,version:p.version,dev:old?old.dev===true&&p.dev===true:!!p.dev});
 }
 return result;
}
function checkedCveEnvelope(input:unknown,lock:unknown):Dict {
 const r=object(input);
 keys(r,['projectPath','mode','source','packageCount','findingCount','status','complete','diagnostics','suggestedFixCommands','notes','warnings','skippedDependencies','findings','overrideFindings','maintenanceFindings']);
 requireThat(r.status==='ok'&&r.complete===true&&r.mode==='resolved-lockfile'&&r.source==='package-lock','CVE_INCOMPLETE');
 requireThat(integer(r.packageCount)===cveInventory(lock).size&&array(r.diagnostics).length===0&&array(r.warnings).length===0&&array(r.skippedDependencies).length===0,'CVE_INCOMPLETE');
 requireThat(array(r.overrideFindings).length===0&&array(r.maintenanceFindings).length===0,'CVE_ALTERNATE_FINDINGS');
 text(r.projectPath);array(r.notes).forEach(n=>text(n));object(r.suggestedFixCommands);
 requireThat(integer(r.findingCount)===array(r.findings).length,'CVE_SCHEMA');return r;
}
function checkedCveFinding(raw:unknown,inventory:Map<string,Dict>):Dict {
 const f=object(raw);
 const fields=['package','version','severity','relationship','dev','firstFixedVersion','validatedFirstFixedVersion','fixVersionValidationNote','fixVersionPublishedAt','cooldownWarning','validatedTargetScannedVersions','validatedTargetKnownVulnerableVersions','recommendedAction','runnableFixCommand','primaryParent','rootDependencies','recommendedParentUpgrade','recommendedNpmTransitiveRemediation','cves','epssScores','prioritySignal','dependencyPaths','usage','maliciousUnverifiable','maliciousGitSource','maliciousGitSourcePinned','unresolvedAdvisoryIds','vulnerabilities'];
 keys(f,fields,fields.filter(k=>k!=='recommendedParentUpgrade'));
 if(f.recommendedParentUpgrade!==undefined&&f.recommendedParentUpgrade!==null){
  const p=object(f.recommendedParentUpgrade);keys(p,['package','currentVersion','targetVersion','viaPath','vulnerablePackage','confidence','reason']);
  requireThat(PACKAGE.test(text(p.package))&&PACKAGE.test(text(p.vulnerablePackage))&&VERSION.test(text(p.currentVersion))&&VERSION.test(text(p.targetVersion))&&p.confidence==='verified','CVE_REMEDIATION');strings(p.viaPath,20);text(p.reason);
 }
 if(f.recommendedNpmTransitiveRemediation!==null){
  const p=object(f.recommendedNpmTransitiveRemediation);keys(p,['kind','package','currentVersion','targetChildVersion','viaPath','reason','workspaces']);
  requireThat(p.kind==='update-parent-within-range'&&PACKAGE.test(text(p.package))&&VERSION.test(text(p.currentVersion))&&VERSION.test(text(p.targetChildVersion)),'CVE_REMEDIATION');strings(p.viaPath,20);strings(p.workspaces,20);text(p.reason);
 }
 const name=text(f.package,214),version=text(f.version,100),p=inventory.get(name+'@'+version);
 requireThat(p&&p.dev===f.dev&&['direct','transitive'].includes(text(f.relationship)),'CVE_PACKAGE_DRIFT');
 strings(f.rootDependencies);strings(f.cves);array(f.epssScores);array(f.dependencyPaths,20).forEach(p=>strings(p,20));
 requireThat(f.maliciousUnverifiable===false&&f.maliciousGitSource===false&&f.maliciousGitSourcePinned===false,'CVE_UNSAFE_SOURCE');
 requireThat(array(f.unresolvedAdvisoryIds).length===0,'CVE_UNKNOWN');
 const vulnerabilities=array(f.vulnerabilities).map(checkedCveAdvisory);requireThat(vulnerabilities.length>0,'CVE_SCHEMA');
 const highest=Math.max(...vulnerabilities.map(a=>cveRank(a.severity)));
 requireThat(highest<4&&highest===cveRank(f.severity),'CVE_SEVERITY');return f;
}
export function validateCveReport(input:unknown,policyInput:unknown,lock:unknown,manifest:unknown,now=new Date()):{acceptedPackages:number} {
 const policy=validatePolicy(policyInput,now);validateLock(policy,lock,manifest);
 const r=checkedCveEnvelope(input,lock),inventory=cveInventory(lock);
 const findings=array(r.findings);requireThat(integer(r.findingCount)===findings.length,'CVE_SCHEMA');
 const used=new Set<string>(),seen=new Set<string>(),selector=selectorEvidence(policy);let selectorSeen=false;
 for(const raw of findings){
  const f=checkedCveFinding(raw,inventory),name=text(f.package,214),version=text(f.version,100),severity=text(f.severity),key=name+'@'+version;
  requireThat(f.maliciousUnverifiable===false&&f.maliciousGitSource===false&&f.maliciousGitSourcePinned===false,'CVE_UNSAFE_SOURCE');
  requireThat(PACKAGE.test(name)&&VERSION.test(version)&&!seen.has(key),'CVE_SCHEMA');seen.add(key);
  requireThat(cveRank(severity)<4&&array(f.unresolvedAdvisoryIds).length===0,'CVE_UNKNOWN');
  const vulnerabilities=array(f.vulnerabilities);requireThat(vulnerabilities.length>0,'CVE_SCHEMA');
  const ranks=vulnerabilities.map(v=>{const a=object(v);requireThat(GHSA.test(text(a.id,40)),'CVE_UNKNOWN');return cveRank(a.severity);});
  const max=Math.max(...ranks);
  requireThat(max>=0&&max===cveRank(severity)&&max<4,'CVE_SEVERITY');
  if(selector&&(name===selector.package||vulnerabilities.some(v=>object(v).id===SELECTOR_ID))){
   requireThat(name===selector.package&&version===selector.version&&f.dev===true&&f.relationship==='transitive'&&severity==='medium'&&setEqual(vulnerabilities,selector.cveFingerprint)&&setEqual(array(f.dependencyPaths),selector.dependencyPaths),'CVE_SELECTOR_DRIFT');selectorSeen=true;
  }
  if(max<3)continue;
  const e=policy.exceptions.find(e=>e.allowedPackages.some(p=>p.name===name));requireThat(e,'CVE_NEW_HIGH');
  const rule=e.allowedPackages.find(p=>p.name===name)!;
  requireThat(rule.version===version&&f.dev===rule.dev&&f.relationship==='transitive','CVE_PACKAGE_DRIFT');
  const ids=new Set<string>();
  for(const rawV of vulnerabilities){const v=object(rawV),id=text(v.id,40);requireThat(GHSA.test(id)&&!ids.has(id),'CVE_ADVISORY');ids.add(id);
   requireThat((id===e.advisoryId&&v.severity==='high')||e.ancillaryAdvisories.some(a=>a.advisoryId===id&&a.severity===v.severity),'CVE_NEW_HIGH');
  }
  requireThat(ids.has(e.advisoryId)&&ids.size===1+e.ancillaryAdvisories.filter(a=>a.severity==='low').length,'CVE_ADVISORY_DRIFT');
  requireThat(setEqual(vulnerabilities,e.cveFingerprint),'CVE_ADVISORY_CONTENT_DRIFT');
  const paths=array(f.dependencyPaths,20).map(p=>strings(p,20));
  // derive exact name paths from the reviewed incoming edges, not scanner claims
  const expectedPaths:string[][]=[];
  const trace=(target:string,trail:string[])=>{
   requireThat(trail.length<20&&!trail.includes(target),'CVE_PATH');
   for(const edge of e.incomingEdges.filter(x=>x.to===target)){
    const chain=[target.replace(/^node_modules\//,''),...trail];
    if(edge.from==='')expectedPaths.push(['project',...chain]);
    else trace(edge.from,chain);
   }
  };
  trace(rule.dependencyPath,[]);
  requireThat(setEqual(paths,expectedPaths),'CVE_PATH_DRIFT');used.add(e.advisoryId);
 }
 requireThat(used.size===policy.exceptions.length&&(!selector||selectorSeen),'CVE_STALE_EXCEPTION');return {acceptedPackages:used.size};
}
export function validateCveFilteredReport(input:unknown,lock:unknown):void {
 const r=checkedCveEnvelope(input,lock),inventory=cveInventory(lock);
 const findings=array(r.findings);requireThat(integer(r.findingCount)===findings.length,'CVE_SCHEMA');
 for(const raw of findings){const f=checkedCveFinding(raw,inventory);requireThat(PACKAGE.test(text(f.package,214))&&VERSION.test(text(f.version,100))&&array(f.unresolvedAdvisoryIds).length===0,'CVE_SCHEMA');
  requireThat(f.maliciousUnverifiable===false&&f.maliciousGitSource===false&&f.maliciousGitSourcePinned===false,'CVE_UNSAFE_SOURCE');
  const vs=array(f.vulnerabilities);requireThat(vs.length>0,'CVE_SCHEMA');
  const ranks=vs.map(v=>{const a=object(v);requireThat(GHSA.test(text(a.id,40)),'CVE_UNKNOWN');return cveRank(a.severity);});
  const highest=Math.max(...ranks);requireThat(highest<3&&highest===cveRank(f.severity),'CVE_NEW_HIGH');
 }
}
