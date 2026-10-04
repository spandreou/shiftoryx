import {getAuth} from 'firebase-admin/auth';
import type {App} from 'firebase-admin/app';
import {assertDemoRuntime, DEMO_PROJECT_ID, DEMO_EMULATOR_PROJECT_ID, isDemoTenant, demoOwnerUid, demoOrigin, type DemoTenant} from './policy.ts';

export type PdfErrorCode = 'INVALID_REQUEST'|'PAYLOAD_TOO_LARGE'|'METHOD_NOT_ALLOWED'|'UNSUPPORTED_MEDIA_TYPE'|
  'UNAUTHENTICATED'|'ACCESS_DENIED'|'DEMO_GENERATION_CHANGED'|'DEMO_RESETTING'|'PREVIEW_CHANGED'|'INTENT_CONFLICT'|
  'PDF_BUSY'|'PDF_RECOVERY_REQUIRED'|'PDF_INTEGRITY_FAILURE'|'PDF_NOT_AVAILABLE'|'SERVICE_UNAVAILABLE'|'RATE_LIMITED'|'WARNINGS_NOT_ACKNOWLEDGED';
export class PdfError extends Error {
  readonly code: PdfErrorCode;
  constructor(code: PdfErrorCode) { super(code); this.name='PdfError'; this.code=code; }
}
export function fail(code: PdfErrorCode): never { throw new PdfError(code); }
export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type PublishRequest = {intentId:string;draftId:string;draftRevision:number;previewHash:string;acceptWarnings:boolean};
export type PdfRequest = {method:string;query?:Record<string,unknown>;body:Uint8Array;headers:Record<string,string|string[]|undefined>};
export type DocumentReader = {get(path:string):Promise<Record<string,any>|undefined>};
export type PdfIdentity = Readonly<{tenant:DemoTenant;uid:string;generation:number;reverify:()=>Promise<void>}>;
export type TokenVerifier = {projectId:string;verifyIdToken(token:string,checkRevoked:boolean):Promise<Record<string,unknown>>};
export function header(request:PdfRequest,name:string):string|undefined {
  const values=Object.entries(request.headers).filter(([key])=>key.toLowerCase()===name);
  if(values.length>1||Array.isArray(values[0]?.[1]))fail('INVALID_REQUEST');
  return values[0]?.[1] as string|undefined;
}
export function validatePublishTuple(value:unknown):PublishRequest {
  if(!value||typeof value!=='object'||Array.isArray(value))fail('INVALID_REQUEST');
  const d=value as Record<string,unknown>,keys=['intentId','draftId','draftRevision','previewHash','acceptWarnings'];
  if(Object.keys(d).length!==keys.length||Object.keys(d).some(k=>!keys.includes(k))||
      typeof d.intentId!=='string'||!UUID_V4.test(d.intentId)||typeof d.draftId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(d.draftId)||
      !Number.isSafeInteger(d.draftRevision)||Number(d.draftRevision)<1||typeof d.previewHash!=='string'||!/^[0-9a-f]{64}$/.test(d.previewHash)||typeof d.acceptWarnings!=='boolean')fail('INVALID_REQUEST');
  return {...d} as PublishRequest;
}
/** Flat JSON scanner: refuses duplicate/escaped keys and nested values before JSON.parse can lose information. */
export function parsePublishRequest(request:PdfRequest):PublishRequest {
  return validatePublishTuple(parseFlatRequest(request,['intentId','draftId','draftRevision','previewHash','acceptWarnings'],4096));
}
export function parseFlatRequest(request:PdfRequest,allowedKeys:readonly string[],maxBytes:number):Record<string,unknown> {
  if(request.method!=='POST')fail('METHOD_NOT_ALLOWED');
  if(request.query&&Object.keys(request.query).length)fail('INVALID_REQUEST');
  const type=header(request,'content-type');
  if(typeof type!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||header(request,'content-encoding')!==undefined)fail('UNSUPPORTED_MEDIA_TYPE');
  if(!(request.body instanceof Uint8Array))fail('INVALID_REQUEST');
  if(request.body.length>maxBytes)fail('PAYLOAD_TOO_LARGE');
  const length=header(request,'content-length');
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==request.body.length))fail('INVALID_REQUEST');
  let raw:string;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(request.body);}catch{fail('INVALID_REQUEST');}
  let at=0;const keys=new Set<string>();const result:Record<string,unknown>={};
  const ws=()=>{while(/[\x20\t\r\n]/.test(raw[at]||'!'))at++;};
  const take=(char:string)=>{ws();if(raw[at++]!==char)fail('INVALID_REQUEST');};
  const string=()=>{take('"');const start=at;while(at<raw.length&&raw[at]!=='"'){if(raw[at]==='\\'||raw.charCodeAt(at)<32)fail('INVALID_REQUEST');at++;}if(at>=raw.length)fail('INVALID_REQUEST');return raw.slice(start,at++);};
  take('{');ws();if(raw[at]==='}')fail('INVALID_REQUEST');
  while(at<raw.length){
    const key=string();if(keys.has(key)||!allowedKeys.includes(key))fail('INVALID_REQUEST');keys.add(key);take(':');ws();
    let value:unknown;
    if(raw[at]==='"')value=string();
    else{const token=/^(?:true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(raw.slice(at))?.[0];if(!token)fail('INVALID_REQUEST');at+=token.length;value=JSON.parse(token);}
    result[key]=value;ws();if(raw[at]==='}'){at++;break;}take(',');
  }
  ws();if(at!==raw.length||raw[at-1]!=='}'&&raw.trimEnd().at(-1)!=='}')fail('INVALID_REQUEST');
  return result;
}
function projectFor(env:Record<string,string|undefined>):string {
  try{assertDemoRuntime(env);}catch{fail('ACCESS_DENIED');}
  return env.FUNCTIONS_EMULATOR==='true'&&env.GCLOUD_PROJECT===DEMO_EMULATOR_PROJECT_ID?DEMO_EMULATOR_PROJECT_ID:DEMO_PROJECT_ID;
}
export async function authenticatePdfRequest(request:PdfRequest,verifier:TokenVerifier,env:Record<string,string|undefined>):Promise<PdfIdentity> {
  const project=projectFor(env);if(verifier.projectId!==project)fail('ACCESS_DENIED');
  const authHeader=header(request,'authorization');
  if(typeof authHeader!=='string'||authHeader.length>8192||!/^Bearer [^\s,]+$/.test(authHeader))fail('UNAUTHENTICATED');
  const token=authHeader.slice(7),origin=header(request,'origin');
  async function verified(){
    let c:Record<string,unknown>;try{c=await verifier.verifyIdToken(token,true);}catch{fail('UNAUTHENTICATED');}
    if(!c||typeof c!=='object'||Array.isArray(c)||c.aud!==project||c.iss!==`https://securetoken.google.com/${project}`||c.uid!==c.sub)fail('UNAUTHENTICATED');
    if(c.publicDemo!==true||!isDemoTenant(c.demoTenant)||!Number.isSafeInteger(c.demoGeneration)||Number(c.demoGeneration)<1||
        c.uid!==demoOwnerUid(c.demoTenant,Number(c.demoGeneration))||origin!==demoOrigin(c.demoTenant))fail('ACCESS_DENIED');
    return {tenant:c.demoTenant,uid:String(c.uid),generation:Number(c.demoGeneration)};
  }
  const identity=await verified();
  return Object.freeze({...identity,reverify:async()=>{const current=await verified();if(current.uid!==identity.uid||current.tenant!==identity.tenant||current.generation!==identity.generation)fail('ACCESS_DENIED');}});
}
/** The production boundary never accepts an injected decoded token or a fallback Firebase app. */
export function createDemoPdfAuthenticator(app:App,env:Record<string,string|undefined>=process.env){
  const project=projectFor(env);if(app.options.projectId!==project)fail('ACCESS_DENIED');
  const verifier:TokenVerifier={projectId:project,verifyIdToken:(token,revoked)=>getAuth(app).verifyIdToken(token,revoked)};
  return (request:PdfRequest)=>authenticatePdfRequest(request,verifier,env);
}
export async function authorizePdfTransaction(reader:DocumentReader,identity:PdfIdentity):Promise<void> {
  const {tenant,uid,generation}=identity;
  if(!isDemoTenant(tenant)||!Number.isSafeInteger(generation)||generation<1||uid!==demoOwnerUid(tenant,generation))fail('ACCESS_DENIED');
  const [state,admin,member,record]=await Promise.all([reader.get(`demoState/${tenant}`),reader.get(`platformAdmins/${uid}`),reader.get(`tenantMemberships/${uid}_${tenant}`),reader.get(`tenants/${tenant}`)]);
  if(!state||typeof state.resetting!=='boolean'||!Number.isSafeInteger(state.generation)||state.generation<1)fail('ACCESS_DENIED');
  if(state.resetting)fail('DEMO_RESETTING');
  if(state.generation!==generation)fail('DEMO_GENERATION_CHANGED');
  if(admin!==undefined&&(!admin||!['INACTIVE','REVOKED','DISABLED'].includes(admin.status)))fail('ACCESS_DENIED');
  if(!member||member.uid!==uid||member.tenantId!==tenant||member.status!=='ACTIVE'||member.role!=='OWNER')fail('ACCESS_DENIED');
  if(!record||record.id!==tenant||record.slug!==tenant||record.status!=='ACTIVE'||record.isDemo!==true)fail('ACCESS_DENIED');
}
