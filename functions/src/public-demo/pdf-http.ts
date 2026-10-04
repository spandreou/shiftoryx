import {getApps,initializeApp} from 'firebase-admin/app';
import {onRequest} from 'firebase-functions/v2/https';
import {randomUUID} from 'node:crypto';
import {assertDemoRuntime,DEMO_PROJECT_ID,DEMO_EMULATOR_PROJECT_ID,DEMO_TENANTS,demoOrigin} from './policy.ts';
import {createDemoPdfAuthenticator,authorizePdfTransaction,fail,PdfError,type PdfRequest,type PdfErrorCode} from './pdf-authorization.ts';
import {createDemoPdfAdapters} from './pdf-adapters.ts';
import {createPdfPublicationCore} from './pdf-coordinator.ts';
import {createPdfDownloadCore} from './pdf-download.ts';
const origins=DEMO_TENANTS.map(demoOrigin);
const statuses:Record<PdfErrorCode,number>={INVALID_REQUEST:400,PAYLOAD_TOO_LARGE:413,METHOD_NOT_ALLOWED:405,UNSUPPORTED_MEDIA_TYPE:415,UNAUTHENTICATED:401,ACCESS_DENIED:403,DEMO_GENERATION_CHANGED:409,DEMO_RESETTING:503,PREVIEW_CHANGED:409,INTENT_CONFLICT:409,PDF_BUSY:409,PDF_RECOVERY_REQUIRED:503,PDF_INTEGRITY_FAILURE:500,PDF_NOT_AVAILABLE:404,SERVICE_UNAVAILABLE:503,RATE_LIMITED:429,WARNINGS_NOT_ACKNOWLEDGED:409};
function services(){
  assertDemoRuntime(process.env);if(process.env.PUBLIC_DEMO_PDF_SERVER_ENABLED!=='true')fail('SERVICE_UNAVAILABLE');
  const emulator=process.env.FUNCTIONS_EMULATOR==='true',projectId=emulator?DEMO_EMULATOR_PROJECT_ID:DEMO_PROJECT_ID;
  const app=getApps().find(a=>a.name==='shiftoryx-pdf-server')??initializeApp({projectId,storageBucket:projectId+(emulator?'.appspot.com':'.firebasestorage.app')},'shiftoryx-pdf-server');
  const {database,storage}=createDemoPdfAdapters(app),authenticate=createDemoPdfAuthenticator(app);
  const publishAuthenticate=async(request:PdfRequest)=>{
    const identity=await authenticate(request),minute=Math.floor(Date.now()/60000);
    await database.transaction(async tx=>{
      await authorizePdfTransaction(tx,identity);const path=`demoPdfLimits/${identity.tenant}`,quota=await tx.get(path);
      if(quota&&('publishMinute' in quota||'publishRequestCount' in quota)&&(!Number.isSafeInteger(quota.publishMinute)||!Number.isSafeInteger(quota.publishRequestCount)||quota.publishRequestCount<0))fail('PDF_INTEGRITY_FAILURE');
      if(quota?.publishMinute>minute)fail('RATE_LIMITED');
      const count=quota?.publishMinute===minute?quota.publishRequestCount:0;if(count>=60)fail('RATE_LIMITED');tx.set(path,{...(quota||{}),publishMinute:minute,publishRequestCount:count+1});
    });return identity;
  };
  return {publish:createPdfPublicationCore({database,storage,authenticate:publishAuthenticate}),download:createPdfDownloadCore({database,storage,authenticate})};
}
function envelope(req:any):PdfRequest{
  const counts=new Map<string,number>();for(let n=0;n<(req.rawHeaders||[]).length;n+=2){const name=String(req.rawHeaders[n]).toLowerCase();counts.set(name,(counts.get(name)||0)+1);}
  for(const name of ['authorization','origin','content-type','content-length','content-encoding'])if((counts.get(name)||0)>1)fail('INVALID_REQUEST');
  return {method:req.method,headers:req.headers,query:req.query,body:req.rawBody??new Uint8Array()};
}
function cors(req:any,res:any){
  const origin=req.headers.origin;
  if(typeof origin!=='string'||!origins.includes(origin))fail('ACCESS_DENIED');
  res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin, Authorization');
  res.set('Access-Control-Expose-Headers','Content-Disposition');
  if(req.method==='OPTIONS'){
    const requested=String(req.headers['access-control-request-headers']||'').toLowerCase().split(',').map(s=>s.trim()).filter(Boolean);
    if(req.headers['access-control-request-method']!=='POST'||requested.some(h=>!['authorization','content-type'].includes(h))||Number(req.headers['content-length']||0)>0||Object.keys(req.query||{}).length)fail('INVALID_REQUEST');
    res.set('Access-Control-Allow-Methods','POST');res.set('Access-Control-Allow-Headers','Authorization, Content-Type');res.status(204).end();return true;
  }
  return false;
}
function errorResponse(error:unknown,res:any,requestId:string){
  if(res.headersSent||res.destroyed)return;
  const code=error instanceof PdfError?error.code:'SERVICE_UNAVAILABLE',status=statuses[code];
  res.set('Cache-Control','private, no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');
  if(['PDF_BUSY','RATE_LIMITED'].includes(code))res.set('Retry-After','5');
  res.status(status).json({error:{code,message:code},requestId});
}
const options={region:'us-central1',memory:'512MiB' as const,timeoutSeconds:60,maxInstances:2,concurrency:4,cors:false};
export const publishPublicDemoPdf=onRequest(options,async(req,res)=>{
  const requestId=randomUUID();try{if(cors(req,res))return;const input=envelope(req);const result=await services().publish.publish(input);res.set('Cache-Control','private, no-store, max-age=0');res.set('X-Content-Type-Options','nosniff');res.status(200).json(result);}catch(error){errorResponse(error,res,requestId);}
});
export const downloadPublicDemoPdf=onRequest(options,async(req,res)=>{
  const requestId=randomUUID();let prepared:Awaited<ReturnType<ReturnType<typeof createPdfDownloadCore>['prepare']>>|undefined;
  try{
    if(cors(req,res))return;prepared=await services().download.prepare(envelope(req));if(res.destroyed)return;
    await prepared.authorizeRelease();if(res.destroyed)return;
    res.set('Content-Type','application/pdf');res.set('Content-Disposition',`attachment; filename="${prepared.filename}"`);res.set('Content-Length',String(prepared.bytes.length));res.set('X-Content-Type-Options','nosniff');res.set('Cache-Control','private, no-store, max-age=0');
    await new Promise<void>(resolve=>{res.once('finish',resolve);res.once('close',resolve);res.status(200).end(prepared!.bytes);});
  }catch(error){errorResponse(error,res,requestId);}finally{if(prepared){try{await prepared.finish();}catch{errorResponse(new PdfError('SERVICE_UNAVAILABLE'),res,requestId);}}}
});
