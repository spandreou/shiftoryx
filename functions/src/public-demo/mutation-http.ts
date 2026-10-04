import {randomUUID} from 'node:crypto';
import {getApps,initializeApp} from 'firebase-admin/app';
import {onRequest} from 'firebase-functions/v2/https';
import {assertDemoRuntime,DEMO_EMULATOR_PROJECT_ID,DEMO_PROJECT_ID,DEMO_TENANTS,demoOrigin} from './policy.ts';
import {createDemoPdfAuthenticator,fail,header,PdfError,type PdfRequest} from './pdf-authorization.ts';
import {AdmissionError} from './admission.ts';
import {createDemoMutationDatabase} from './mutation-adapters.ts';
import {createTypedMutationCore,MutationError,type TypedMutationRequest} from './mutations-core.ts';

const operations=new Set(['emp.create','emp.update','emp.active','emp.delete','abs.create','abs.update','abs.delete',
  'ann.create','ann.delete','set.save','drf.save','aud.export']);
const origins=DEMO_TENANTS.map(demoOrigin);
const plain=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
export function parseMutationRequest(request:PdfRequest):TypedMutationRequest{
  if(request.method!=='POST')fail('METHOD_NOT_ALLOWED');
  if(request.query&&Object.keys(request.query).length)fail('INVALID_REQUEST');
  const type=header(request,'content-type');
  if(typeof type!=='string'||!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)||
    header(request,'content-encoding')!==undefined)fail('UNSUPPORTED_MEDIA_TYPE');
  if(!(request.body instanceof Uint8Array))fail('INVALID_REQUEST');
  if(request.body.length>512*1024)fail('PAYLOAD_TOO_LARGE');
  const length=header(request,'content-length');
  if(length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==request.body.length))fail('INVALID_REQUEST');
  let data:unknown;try{data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(request.body));}catch{fail('INVALID_REQUEST');}
  if(!plain(data)||Object.keys(data).length!==3||Object.keys(data).some(key=>!['operation','commandId','payload'].includes(key))||
    typeof data.operation!=='string'||!operations.has(data.operation)||typeof data.commandId!=='string'||!plain(data.payload))fail('INVALID_REQUEST');
  const cap=data.operation==='drf.save'?512*1024:data.operation==='set.save'?96*1024:8*1024;
  if(request.body.length>cap)fail('PAYLOAD_TOO_LARGE');
  return data as TypedMutationRequest;
}
function requestEnvelope(req:any):PdfRequest{
  const counts=new Map<string,number>();for(let n=0;n<(req.rawHeaders||[]).length;n+=2){
    const name=String(req.rawHeaders[n]).toLowerCase();counts.set(name,(counts.get(name)||0)+1);
  }
  for(const name of ['authorization','origin','content-type','content-length','content-encoding'])
    if((counts.get(name)||0)>1)fail('INVALID_REQUEST');
  return {method:req.method,headers:req.headers,query:req.query,body:req.rawBody??new Uint8Array()};
}
function cors(req:any,res:any){
  const origin=req.headers.origin;
  if(typeof origin!=='string'||!origins.includes(origin))fail('ACCESS_DENIED');
  res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin, Authorization');
  if(req.method==='OPTIONS'){
    const requested=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(req.headers['access-control-request-method']!=='POST'||requested.some(h=>!['authorization','content-type'].includes(h))||
      Number(req.headers['content-length']||0)>0||Object.keys(req.query||{}).length)fail('INVALID_REQUEST');
    res.set('Access-Control-Allow-Methods','POST');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');
    res.status(204).end();return true;
  }
  return false;
}
function services(){
  assertDemoRuntime(process.env);
  if(process.env.PUBLIC_DEMO_MUTATION_SERVER_ENABLED!=='true')fail('SERVICE_UNAVAILABLE');
  const emulator=process.env.FUNCTIONS_EMULATOR==='true',projectId=emulator?DEMO_EMULATOR_PROJECT_ID:DEMO_PROJECT_ID;
  const bucket=projectId+(emulator?'.appspot.com':'.firebasestorage.app');
  const app=getApps().find(item=>item.name==='shiftoryx-demo-mutations')??
    initializeApp({projectId,storageBucket:bucket},'shiftoryx-demo-mutations');
  if(app.options.projectId!==projectId||app.options.storageBucket!==bucket)fail('ACCESS_DENIED');
  return {authenticate:createDemoPdfAuthenticator(app),core:createTypedMutationCore({database:createDemoMutationDatabase(app)})};
}
function errorResponse(error:unknown,res:any,requestId:string){
  if(res.headersSent||res.destroyed)return;
  const code=error instanceof MutationError||error instanceof AdmissionError||error instanceof PdfError?
    error.code:'SERVICE_UNAVAILABLE';
  const status:Record<string,number>={
    INVALID_REQUEST:400,METHOD_NOT_ALLOWED:405,UNSUPPORTED_MEDIA_TYPE:415,PAYLOAD_TOO_LARGE:413,
    UNAUTHENTICATED:401,ACCESS_DENIED:403,DEMO_GENERATION_CHANGED:409,DEMO_RESETTING:503,
    ADMISSION_INVALID_COMMAND:400,ADMISSION_COMMAND_CONFLICT:409,ADMISSION_INPUT_TOO_LARGE:413,
    ADMISSION_LIMIT_REACHED:429,ADMISSION_INVALID_RESULT:503,ADMISSION_STATE_INVALID:503,
    MUTATION_INVALID_REQUEST:400,MUTATION_NOT_FOUND:404,MUTATION_FOREIGN_REFERENCE:403,
    MUTATION_REVISION_CONFLICT:409,MUTATION_STALE_SNAPSHOT:409,MUTATION_TRANSACTION_LIMIT:413,
    MUTATION_REFERENCED:409,
    MUTATION_INTEGRITY:503,SERVICE_UNAVAILABLE:503,
  };
  const safe=Object.hasOwn(status,code)?code:'SERVICE_UNAVAILABLE';
  res.set('Cache-Control','private, no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');
  if(status[safe]===429)res.set('Retry-After','5');
  res.status(status[safe]).json({error:{code:safe,message:safe},requestId});
}
export const mutatePublicDemo=onRequest({region:'us-central1',memory:'512MiB',timeoutSeconds:120,
  maxInstances:2,concurrency:4,cors:false},async(req,res)=>{
  const requestId=randomUUID();
  try{
    if(cors(req,res))return;
    const envelope=requestEnvelope(req),command=parseMutationRequest(envelope);
    const {authenticate,core}=services(),identity=await authenticate(envelope);
    const result=await core.execute(identity,command);
    res.set('Cache-Control','private, no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');
    res.status(200).json(result);
  }catch(error){errorResponse(error,res,requestId);}
});
