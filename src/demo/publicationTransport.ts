import {hashPreviewV3} from '../services/publicationIntentV3.ts';
import type {DraftV3} from '../services/schedulerV3Service.ts';
const tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages:Record<string,string>={
  UNAUTHENTICATED:'Η σύνδεση έληξε. Μπες ξανά στο Demo.',ACCESS_DENIED:'Δεν επιτρέπεται αυτή η ενέργεια.',
  PREVIEW_CHANGED:'Το προσχέδιο άλλαξε. Φόρτωσέ το και έλεγξέ το πριν από νέα δημοσίευση.',INTENT_CONFLICT:'Η δημοσίευση δεν αντιστοιχεί στο προσχέδιο. Έλεγξε το ιστορικό πριν από νέα προσπάθεια.',
  PDF_BUSY:'Η δημοσίευση εκτελείται ήδη. Δοκίμασε ξανά σε λίγο.',DEMO_GENERATION_CHANGED:'Το Demo επαναφέρθηκε. Μπες ξανά για να συνεχίσεις.',
  PAYLOAD_TOO_LARGE:'Το αρχείο υπερβαίνει το επιτρεπόμενο μέγεθος.',RATE_LIMITED:'Πολλές αιτήσεις. Δοκίμασε ξανά αργότερα.',
  DEMO_RESETTING:'Το Demo επαναφέρεται. Δοκίμασε ξανά μετά την ολοκλήρωση.',PDF_RECOVERY_REQUIRED:'Το Demo χρειάζεται τεχνική αποκατάσταση. Μην επαναλάβεις τη δημοσίευση.',
  NETWORK:'Δεν επιβεβαιώθηκε η δημοσίευση. Μπορείς να επαναλάβεις την ίδια αίτηση.',INVALID_RESPONSE:'Δεν επιβεβαιώθηκε έγκυρη απάντηση από το Demo.',
  INTENT_STORAGE_UNAVAILABLE:'Δεν αποθηκεύτηκε η αίτηση σε αυτή την καρτέλα. Η δημοσίευση δεν στάλθηκε.'};
export class DemoTransportError extends Error {
  code:string;retryable:boolean;
  constructor(code:unknown){const safe=typeof code==='string'&&Object.hasOwn(messages,code)?code:'INVALID_RESPONSE';super(messages[safe]);this.name='DemoTransportError';this.code=safe;this.retryable=['NETWORK','PDF_BUSY','RATE_LIMITED','DEMO_RESETTING'].includes(this.code);}
}
type Pending={intentId:string;draftId:string;draftRevision:number;previewHash:string;acceptWarnings:boolean;tenant:string;generation:number};
type Identity={tenant:string;uid:string;generation:number;getToken:(force:boolean)=>Promise<string>};
type Dependencies={tenant:string;projectId:string;demoEnabled:boolean;local:boolean;storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;identity:()=>Promise<Identity>;saveDraft:(draft:DraftV3)=>Promise<number>;fetch:typeof fetch};
export const demoIntentStorageKey=(tenant:string)=>`shiftoryx-demo-publication-intent:${tenant}`;
export function clearDemoPublicationIntent(storage:Pick<Storage,'removeItem'>,tenant:string){if(tenants.includes(tenant))try{storage.removeItem(demoIntentStorageKey(tenant));}catch{/* no server state is changed */}}
export function createDemoPublicationTransport(deps:Dependencies){
  if(!deps.demoEnabled||!tenants.includes(deps.tenant)||!(deps.projectId==='shiftoryx-public-demo'||(deps.local&&deps.projectId==='demo-shiftoryx-public')))throw new DemoTransportError('ACCESS_DENIED');
  const base=deps.projectId==='demo-shiftoryx-public'?'http://127.0.0.1:5111/demo-shiftoryx-public/us-central1/':'https://us-central1-shiftoryx-public-demo.cloudfunctions.net/';
  const key=demoIntentStorageKey(deps.tenant);let busy=false;
  const fail=(code:string):never=>{throw new DemoTransportError(code);};
  async function identity(){const i=await deps.identity();if(i.tenant!==deps.tenant||!Number.isSafeInteger(i.generation)||i.generation<1||i.uid!==`${deps.tenant}-owner-g${i.generation}`)fail('ACCESS_DENIED');return i;}
  function read():Pending|null{try{const raw=deps.storage.getItem(key);if(!raw)return null;const p=JSON.parse(raw);if(Object.keys(p).sort().join(',')!=='acceptWarnings,draftId,draftRevision,generation,intentId,previewHash,tenant'||!uuid.test(p.intentId)||!/^[A-Za-z0-9_-]{1,100}$/.test(p.draftId)||!Number.isSafeInteger(p.draftRevision)||p.draftRevision<1||!/^[0-9a-f]{64}$/.test(p.previewHash)||typeof p.acceptWarnings!=='boolean'||p.tenant!==deps.tenant||!Number.isSafeInteger(p.generation)||p.generation<1)throw Error();return p;}catch{clearDemoPublicationIntent(deps.storage,deps.tenant);return null;}}
  const clear=(p:Pending)=>{if(read()?.intentId===p.intentId)clearDemoPublicationIntent(deps.storage,deps.tenant);};
  async function pending(){const p=read();if(!p)return null;const i=await identity();if(p.generation!==i.generation){clear(p);return null;}return p;}
  async function request(name:string,body:object,i:Identity){
    for(let attempt=0;attempt<2;attempt++){
      let response:Response;
      try{const token=await i.getToken(attempt===1);response=await deps.fetch(base+name,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',credentials:'omit',redirect:'error'});}catch{fail('NETWORK');}
      if(response!.status===401&&attempt===0)continue;
      if(!response!.ok){let code='INVALID_RESPONSE';try{code=(await response!.json()).error?.code;}catch{/* never expose provider body */}fail(code);}
      return response!;
    }return fail('UNAUTHENTICATED');
  }
  async function submit(p:Pending){const i=await identity();if(i.generation!==p.generation){clear(p);fail('DEMO_GENERATION_CHANGED');}
    const {intentId,draftId,draftRevision,previewHash,acceptWarnings}=p;
    try{const r=await request('publishPublicDemoPdf',{intentId,draftId,draftRevision,previewHash,acceptWarnings},i);let v:any;try{v=await r.json();}catch{fail('INVALID_RESPONSE');}
      if(!v||Object.keys(v).sort().join(',')!=='periodKey,publicationId,publishedAt,replayed,version'||!uuid.test(v.publicationId)||!Number.isSafeInteger(v.version)||v.version<1||!/^(WEEK|MONTH)_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(v.periodKey)||typeof v.publishedAt!=='string'||!Number.isFinite(Date.parse(v.publishedAt))||typeof v.replayed!=='boolean')fail('INVALID_RESPONSE');
      if((await identity()).generation!==p.generation){clear(p);fail('DEMO_GENERATION_CHANGED');}clear(p);return v;
    }catch(e){if(e instanceof DemoTransportError&&e.code==='DEMO_GENERATION_CHANGED')clear(p);throw e;}}
  async function exclusive<T>(fn:()=>Promise<T>){if(busy)fail('PDF_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
  return {pending,discardPending:()=>clearDemoPublicationIntent(deps.storage,deps.tenant),
    publish:(draft:DraftV3,acceptWarnings:boolean)=>exclusive(async()=>{const i=await identity();if(draft.config.tenantId!==deps.tenant||typeof acceptWarnings!=='boolean')fail('ACCESS_DENIED');const previewHash=await hashPreviewV3(draft);let p=read();
      if(p&&p.generation===i.generation&&p.draftId===draft.id&&p.previewHash===previewHash&&p.acceptWarnings===acceptWarnings){if(draft.revision!==undefined&&draft.revision!==p.draftRevision)fail('PREVIEW_CHANGED');return submit(p);}
      const draftRevision=await deps.saveDraft(draft);if(!Number.isSafeInteger(draftRevision)||draftRevision<1)fail('INVALID_RESPONSE');p={intentId:crypto.randomUUID(),draftId:draft.id,draftRevision,previewHash,acceptWarnings,tenant:deps.tenant,generation:i.generation};
      try{deps.storage.setItem(key,JSON.stringify(p));}catch{fail('INTENT_STORAGE_UNAVAILABLE');}return submit(p);}),
    retryPending:(draft?:DraftV3,acceptWarnings?:boolean)=>exclusive(async()=>{const p=read();if(!p)fail('PREVIEW_CHANGED');if(acceptWarnings!==undefined&&acceptWarnings!==p!.acceptWarnings)fail('PREVIEW_CHANGED');if(draft&&(draft.id!==p!.draftId||draft.revision!==p!.draftRevision||await hashPreviewV3(draft)!==p!.previewHash))fail('PREVIEW_CHANGED');return submit(p!);}),
    download:(publicationId:string)=>exclusive(async()=>{if(!uuid.test(publicationId))fail('ACCESS_DENIED');const i=await identity();const r=await request('downloadPublicDemoPdf',{publicationId},i);
      const disposition=r.headers.get('content-disposition')||'',match=/^attachment; filename="(schedule-(?:WEEK|MONTH)_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}-v[1-9]\d*\.pdf)"$/.exec(disposition);
      if(r.headers.get('content-type')?.split(';')[0].trim()!=='application/pdf'||!match)fail('INVALID_RESPONSE');const limit=2*1024*1024,length=r.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>limit))fail('INVALID_RESPONSE');
      const reader=r.body?.getReader();if(!reader)fail('INVALID_RESPONSE');const chunks:Uint8Array[]=[];let size=0;try{for(;;){const {value,done}=await reader!.read();if(done)break;size+=value.length;if(size>limit){await reader!.cancel();fail('INVALID_RESPONSE');}chunks.push(value);}}catch(e){if(e instanceof DemoTransportError)throw e;fail('NETWORK');}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}const decode=new TextDecoder();if(size<10||decode.decode(bytes.slice(0,5))!=='%PDF-'||!decode.decode(bytes.slice(-1024)).trimEnd().endsWith('%%EOF')||(length&&size!==Number(length)))fail('INVALID_RESPONSE');if((await identity()).generation!==i.generation)fail('DEMO_GENERATION_CHANGED');return {bytes,filename:match![1]};})};
}
