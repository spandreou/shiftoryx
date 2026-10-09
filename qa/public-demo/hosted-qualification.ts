// Qualification policy only. No cloud discovery, Auth, reset or mutation at import time.
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {parseStrictJson} from '../../scripts/lib/auditExceptionPolicy.ts';
import {publicDemoFixture} from '../../functions/src/public-demo/fixtures.ts';
import {RESET_COOLDOWN_MS} from '../../functions/src/public-demo/reset-state.ts';

export const PROJECT='shiftoryx-public-demo';
export const BUCKET='shiftoryx-public-demo.firebasestorage.app';
export const TENANTS=['demo-fuel','demo-cafe','demo-salon','demo-market'] as const;
export const HOSTNAMES=['demo.shiftoryx.gr',...TENANTS.map(t=>t+'.shiftoryx.gr')];
export const FUNCTION_ORIGIN='https://us-central1-shiftoryx-public-demo.cloudfunctions.net';
export const POSITIVES=['emp.create','emp.update','emp.active','emp.delete','abs.create','abs.update','abs.delete',
  'ann.create','ann.delete','set.save','drf.save','aud.export','publishPublicDemoPdf','downloadPublicDemoPdf'];
export class HostedQaError extends Error {code:string;constructor(code:string){super('Hosted qualification refused');this.code='HOSTED_'+code;}}
const receipts=new WeakSet<object>();
export const ensure=(ok:unknown,code:string):asserts ok=>{if(!ok)throw new HostedQaError(code);};
type Dict=Record<string,any>;
function object(v:unknown):Dict{ensure(v!==null&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype,'SCHEMA');return v as Dict;}
function exact(v:Dict,fields:string[]){ensure(Object.keys(v).length===fields.length&&fields.every(f=>Object.hasOwn(v,f)),'SCHEMA');}
function freeze<T>(v:T):T {if(v&&typeof v==='object'){for(const item of Object.values(v))freeze(item);Object.freeze(v);}return v;}
const hex=(v:unknown,n:number)=>typeof v==='string'&&new RegExp('^[0-9a-f]{'+n+'}$').test(v);
export const sha256=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
function date(v:unknown){ensure(typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v),'DATE');
  const n=Date.parse(v);ensure(Number.isFinite(n)&&new Date(n).toISOString()===v,'DATE');return n;}
export function validateHostedQualification(input:{config:unknown;env:Record<string,string|undefined>;baselineText:string;
  baselineHash:string;sha:string;contextHash:string;fixtureSourceHash:string;now?:Date}){
  const c=object(input.config),e=input.env;
  ensure(e.EXPECTED_PROJECT_ID===PROJECT&&e.EXPECTED_BUCKET===BUCKET&&e.EXPECTED_QUALIFICATION_MODE==='true'&&
    e.EXPECTED_RESET_QUALIFICATION_MODE==='true','EXPLICIT_IDENTITY');
  ensure(!Object.keys(e).some(k=>/EMULATOR/i.test(k)&&e[k]),'EMULATOR_FORBIDDEN');
  exact(c,['projectId','authDomain','storageBucket','apiKey','appId','messagingSenderId']);
  ensure(c.projectId===PROJECT&&c.authDomain===PROJECT+'.firebaseapp.com'&&c.storageBucket===BUCKET,'RESOURCE_IDENTITY');
  for(const field of ['apiKey','appId','messagingSenderId'])ensure(typeof c[field]==='string'&&c[field].length>0&&c[field].length<512,'CONFIG');
  ensure(typeof input.baselineText==='string'&&Buffer.byteLength(input.baselineText)>0&&Buffer.byteLength(input.baselineText)<=32768,'BASELINE_REQUIRED');
  ensure(hex(input.baselineHash,64)&&sha256(input.baselineText)===input.baselineHash,'BASELINE_HASH');
  let b:Dict;try{b=object(parseStrictJson(input.baselineText));}catch{throw new HostedQaError('BASELINE_SCHEMA');}
  exact(b,['schemaVersion','projectId','bucket','qualificationSha','contextHash','fixtureSourceHash','fixtureVersion','capturedAt','hostnames','tenants','privateEvidence']);
  ensure(b.schemaVersion===1&&b.projectId===PROJECT&&b.bucket===BUCKET&&b.fixtureVersion==='shiftoryx-public-demo-v1','BASELINE_IDENTITY');
  ensure(hex(input.sha,40)&&b.qualificationSha===input.sha&&hex(input.contextHash,64)&&b.contextHash===input.contextHash&&
    hex(input.fixtureSourceHash,64)&&b.fixtureSourceHash===input.fixtureSourceHash,'CONTEXT_DRIFT');
  const now=input.now??new Date();ensure(Number.isFinite(now.getTime()),'CLOCK');const captured=date(b.capturedAt);
  ensure(captured<=now.getTime()&&now.getTime()-captured<=60*60*1000,'BASELINE_STALE');
  ensure(Array.isArray(b.hostnames)&&b.hostnames.length===5&&new Set(b.hostnames).size===5&&HOSTNAMES.every(h=>b.hostnames.includes(h)),'HOSTNAMES');
  const tenants=object(b.tenants);exact(tenants,[...TENANTS]);const proofs=object(b.privateEvidence);exact(proofs,[...TENANTS]);
  for(const tenant of TENANTS){const t=object(tenants[tenant]);exact(t,['generation','lastResetAt','fixtureAt','weekStart','counts']);
    ensure(Number.isSafeInteger(t.generation)&&t.generation>=1,'GENERATION');ensure(date(t.fixtureAt)<=captured,'FIXTURE_TIME');
    ensure(Number.isSafeInteger(t.lastResetAt)&&t.lastResetAt>=0&&t.lastResetAt<=captured&&now.getTime()-t.lastResetAt>=RESET_COOLDOWN_MS,'RESET_COOLDOWN');
    const f=publicDemoFixture(tenant,new Date(t.fixtureAt));ensure(t.weekStart===f.weekStart,'FIXTURE_WEEK');
    const counts=object(t.counts);exact(counts,['employees','absences','drafts','publications']);
    ensure(counts.employees===f.employees.length&&counts.absences===f.absences.length&&counts.drafts===0&&counts.publications===0,'CANONICAL_COUNTS');
    const proof=object(proofs[tenant]);exact(proof,['generation','evidenceSha256','privateCollectionCounts','monthlyExportCount','storageObjectCount','resetControlPhase']);
    exact(object(proof.privateCollectionCounts),['demoPublicationArtifacts','exportAuditLogs','monthlyScheduleArchives']);
    ensure(proof.generation===t.generation&&hex(proof.evidenceSha256,64)&&Object.values(proof.privateCollectionCounts).every(n=>n===0)&&
      proof.monthlyExportCount===0&&proof.storageObjectCount===0&&proof.resetControlPhase==='OPEN','PRIVATE_BASELINE_PROOF');
  }
  const receipt=freeze({projectId:PROJECT,bucket:BUCKET,config:{...c},baseline:b,baselineHash:input.baselineHash});receipts.add(receipt);return receipt;
}
export type Qualification=ReturnType<typeof validateHostedQualification>;
export function assertQualifiedReceipt(p:unknown):asserts p is Qualification {ensure(p!==null&&typeof p==='object'&&receipts.has(p),'QUALIFICATION_RECEIPT_REQUIRED');}
export function assertHostedGeneration(p:Qualification,tenant:string,state:Dict){
  ensure(TENANTS.includes(tenant as any)&&state&&state.resetting===false&&state.generation===p.baseline.tenants[tenant].generation&&
    state.lastResetAt===p.baseline.tenants[tenant].lastResetAt&&state.weekStart===p.baseline.tenants[tenant].weekStart&&state.phase==='OPEN','GENERATION_DRIFT');
}
export function assertResetAdvance(p:Qualification,tenant:string,result:Dict){
  ensure(TENANTS.includes(tenant as any)&&result?.tenantId===tenant&&result.generation===p.baseline.tenants[tenant].generation+1&&
    typeof result.weekStart==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(result.weekStart)&&
    publicDemoFixture(tenant,new Date(result.weekStart+'T00:00:00Z')).weekStart===result.weekStart,'RESET_GENERATION');
}
export function isQualificationBrowserRequest(p:Qualification,input:string){
  let u:URL;try{u=new URL(input);}catch{return false;}
  if(['blob:','data:'].includes(u.protocol))return true;
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  if(HOSTNAMES.includes(u.hostname)||u.origin===FUNCTION_ORIGIN||u.hostname===PROJECT+'.firebaseapp.com')return true;
  if(['identitytoolkit.googleapis.com','securetoken.googleapis.com'].includes(u.hostname))return u.searchParams.get('key')===p.config.apiKey;
  if(u.hostname==='firestore.googleapis.com'){
    const databases=u.searchParams.getAll('database');
    if(databases.length>1||databases.length===1&&databases[0]!==`projects/${PROJECT}/databases/(default)`)return false;
    if(u.pathname.startsWith(`/v1/projects/${PROJECT}/databases/(default)/`))return true;
    return /^\/google\.firestore\.v1\.Firestore\/(?:Listen|Write)\/channel$/.test(u.pathname)&&databases.length===1;
  }
  return false;
}
export async function requireSdkDenied(call:()=>Promise<unknown>,kind:'firestore'|'storage'){
  try{await call();}catch(error:any){ensure(error?.code===(kind==='storage'?'storage/unauthorized':'permission-denied'),'WRONG_DENIAL');return;}
  throw new HostedQaError('UNEXPECTED_ACCESS');
}
export function foreignPairMatrix(){return TENANTS.flatMap(from=>TENANTS.filter(to=>to!==from).map(to=>({from,to,
  surfaces:['privateReads','sdkWrites','profiles','settings','absences','drafts','history','pdf','storage','membership','tenantId','origin']})));}
export function assertPositiveCoverage(done:string[]){ensure(new Set(done).size===done.length&&done.length===POSITIVES.length&&POSITIVES.every(op=>done.includes(op)),'INCOMPLETE_POSITIVES');}
export function assertCleanupMechanism(op:string){ensure(['emp.delete','abs.delete','ann.delete','resetPublicDemo'].includes(op),'UNSAFE_CLEANUP');}
export async function requireHttpDenied(response:Response,statuses:number[],codes:string[]){
  ensure(statuses.includes(response.status),'HTTP_UNEXPECTED_ACCESS');let data:Dict;
  try{data=await response.json();}catch{throw new HostedQaError('HTTP_DENIAL_SCHEMA');}
  ensure(codes.includes(data.error?.code??data.error?.status),'HTTP_WRONG_DENIAL');return data.error.code??data.error.status;
}
const root=fileURLToPath(new URL('../../',import.meta.url));
export function qualificationContext(){
  const entries:Record<string,string>={};
  function read(path:string){const full=resolve(root,path),stat=lstatSync(full);ensure(!stat.isSymbolicLink(),'CONTEXT_SYMLINK');
    if(stat.isDirectory()){for(const name of readdirSync(full).sort())read(path+'/'+name);}
    else{ensure(stat.isFile(),'CONTEXT_FILE');entries[path]=sha256(readFileSync(full));}}
  for(const p of ['src','functions/src','firestore.demo.rules','storage.demo.rules','package-lock.json','functions/package-lock.json',
    'qa/public-demo/hosted-qualification.ts','qa/public-demo/hosted-runner.ts','qa/public-demo/hosted-isolation.mjs','qa/public-demo/hosted-browser.mjs'])read(p);
  const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true}).trim();ensure(hex(sha,40),'SHA');
  return {sha,contextHash:sha256(JSON.stringify(entries)),fixtureSourceHash:sha256(readFileSync(join(root,'functions/src/public-demo/fixtures.json')))};
}
export function loadHostedQualification(args:string[],env:Record<string,string|undefined>=process.env){
  ensure(args.length===4,'ARGUMENTS_REQUIRED');const [configPath,baselinePath,baselineHash,sha]=args;
  function read(path:string,max:number){const stat=lstatSync(path);ensure(stat.isFile()&&!stat.isSymbolicLink()&&stat.size<=max,'INPUT_FILE');return readFileSync(path,'utf8');}
  const context=qualificationContext();ensure(context.sha===sha,'SHA');
  let config:unknown;try{config=parseStrictJson(read(configPath,8192));}catch{throw new HostedQaError('CONFIG');}
  return validateHostedQualification({config,env,baselineText:read(baselinePath,32768),baselineHash,...context});
}
