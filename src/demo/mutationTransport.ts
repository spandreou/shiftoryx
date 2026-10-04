import {canonicalJson} from '../services/publicationIntentV3.ts';

const tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'] as const;
const prefix:Record<string,string>={
  'emp.create':'emp','emp.update':'emp','emp.active':'emp','emp.delete':'emp',
  'abs.create':'abs','abs.update':'abs','abs.delete':'abs',
  'ann.create':'ann','ann.delete':'ann','set.save':'set','drf.save':'drf','aud.export':'aud',
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const messages:Record<string,string>={
  ACCESS_DENIED:'Δεν επιτρέπεται αυτή η ενέργεια στο Demo.',UNAUTHENTICATED:'Η σύνδεση έληξε. Μπες ξανά στο Demo.',
  NETWORK:'Δεν επιβεβαιώθηκε η αποθήκευση. Επανάλαβε την ίδια ενέργεια.',
  INVALID_RESPONSE:'Δεν επιβεβαιώθηκε έγκυρη απάντηση από το Demo.',
  STORAGE_UNAVAILABLE:'Δεν διατηρήθηκε το αναγνωριστικό της ενέργειας. Δεν στάλθηκε αίτηση.',
  MUTATION_BUSY:'Μια ενέργεια αποθήκευσης εκτελείται ήδη.',
  PENDING_LIMIT:'Υπάρχουν πολλές μη επιβεβαιωμένες ενέργειες. Επανάλαβε τις εκκρεμείς ενέργειες πριν συνεχίσεις.',
  MUTATION_INVALID_REQUEST:'Τα στοιχεία της ενέργειας δεν είναι έγκυρα.',
  MUTATION_NOT_FOUND:'Η εγγραφή δεν βρέθηκε. Ανανέωσε τη σελίδα.',
  MUTATION_REVISION_CONFLICT:'Η εγγραφή άλλαξε αλλού. Ανανέωσε πριν αποθηκεύσεις.',
  MUTATION_REFERENCED:'Ο εργαζόμενος αναφέρεται σε απουσία. Διάγραψε πρώτα τη δοκιμαστική απουσία.',
  MUTATION_STALE_SNAPSHOT:'Τα δεδομένα προγράμματος άλλαξαν. Ανανέωσε το προσχέδιο.',
  MUTATION_TRANSACTION_LIMIT:'Το προσχέδιο υπερβαίνει το όριο ατομικής αποθήκευσης.',
  ADMISSION_LIMIT_REACHED:'Το κοινόχρηστο Demo έφτασε το όριο ενεργειών. Δοκίμασε μετά την επαναφορά.',
  DEMO_RESETTING:'Το Demo επαναφέρεται. Δοκίμασε ξανά μετά την ολοκλήρωση.',
  DEMO_GENERATION_CHANGED:'Το Demo επαναφέρθηκε. Μπες ξανά για να συνεχίσεις.',
  SERVICE_UNAVAILABLE:'Το Demo δεν είναι διαθέσιμο αυτή τη στιγμή.',
};
export class DemoMutationError extends Error{
  code:string;retryable:boolean;
  constructor(code:unknown){const safe=typeof code==='string'&&Object.hasOwn(messages,code)?code:'INVALID_RESPONSE';
    super(messages[safe]);this.name='DemoMutationError';this.code=safe;
    this.retryable=['NETWORK','INVALID_RESPONSE','DEMO_RESETTING','SERVICE_UNAVAILABLE'].includes(safe);}
}
type Identity={tenant:string;uid:string;generation:number;getToken:(force:boolean)=>Promise<string>};
type Pending={operation:string;commandId:string;digest:string;generation:number;revision:number|null};
type Dependencies={tenant:string;projectId:string;demoEnabled:boolean;local:boolean;
  storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>;identity:()=>Promise<Identity>;fetch:typeof fetch};
const keyFor=(tenant:string)=>`shiftoryx-demo-mutation:${tenant}`;
export function createDemoMutationTransport(deps:Dependencies){
  if(!deps.demoEnabled||!tenants.includes(deps.tenant as any)||
    !(deps.projectId==='shiftoryx-public-demo'||deps.local&&deps.projectId==='demo-shiftoryx-public'))
    throw new DemoMutationError('ACCESS_DENIED');
  const base=deps.projectId==='demo-shiftoryx-public'?
    'http://127.0.0.1:5111/demo-shiftoryx-public/us-central1/':
    'https://us-central1-shiftoryx-public-demo.cloudfunctions.net/';
  const key=keyFor(deps.tenant);let busy=false;
  const fail=(code:string):never=>{throw new DemoMutationError(code);};
  async function identity(){const current=await deps.identity();
    if(current.tenant!==deps.tenant||!Number.isSafeInteger(current.generation)||current.generation<1||
      current.uid!==`${deps.tenant}-owner-g${current.generation}`)fail('ACCESS_DENIED');
    return current;
  }
  function read():Pending[]{
    let raw:string|null;try{raw=deps.storage.getItem(key);}catch{fail('STORAGE_UNAVAILABLE');}
    if(!raw)return [];
    let value:unknown;try{value=JSON.parse(raw);}catch{fail('STORAGE_UNAVAILABLE');}
    if(!Array.isArray(value)||value.length>16)fail('STORAGE_UNAVAILABLE');
    const ids=new Set<string>();
    for(const pending of value){
    if(!pending||typeof pending!=='object'||Array.isArray(pending))fail('STORAGE_UNAVAILABLE');
    if(Object.keys(pending).sort().join(',')!=='commandId,digest,generation,operation,revision'||
      typeof pending.operation!=='string'||!Object.hasOwn(prefix,pending.operation)||
      typeof pending.commandId!=='string'||!pending.commandId.startsWith(prefix[pending.operation]+'_')||
      !uuid.test(pending.commandId.slice(prefix[pending.operation].length+1))||
      typeof pending.digest!=='string'||!/^[0-9a-f]{64}$/.test(pending.digest)||
      !Number.isSafeInteger(pending.generation)||Number(pending.generation)<1||
      pending.revision!==null&&(!Number.isSafeInteger(pending.revision)||Number(pending.revision)<0))fail('STORAGE_UNAVAILABLE');
    if(ids.has(pending.commandId))fail('STORAGE_UNAVAILABLE');ids.add(pending.commandId);
    }
    return value as Pending[];
  }
  function save(items:Pending[]){try{if(items.length)deps.storage.setItem(key,JSON.stringify(items));
    else deps.storage.removeItem(key);}catch{fail('STORAGE_UNAVAILABLE');}}
  function clear(id:string){save(read().filter(item=>item.commandId!==id));}
  async function digest(value:unknown){let canonical:string;try{canonical=canonicalJson(value);}catch{fail('MUTATION_INVALID_REQUEST');}
    const bytes=new TextEncoder().encode(canonical);if(bytes.length>512*1024)fail('MUTATION_INVALID_REQUEST');
    const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');}
  function revisionPayload(operation:string,payload:unknown){
    if(!payload||typeof payload!=='object'||Array.isArray(payload))fail('MUTATION_INVALID_REQUEST');
    const data=payload as Record<string,unknown>;
    if(operation==='drf.save'){
      if(!data.draft||typeof data.draft!=='object'||Array.isArray(data.draft))fail('MUTATION_INVALID_REQUEST');
      const draft=data.draft as Record<string,unknown>,revision=draft.revision??0;
      if(!Number.isSafeInteger(revision)||Number(revision)<0)fail('MUTATION_INVALID_REQUEST');
      return {revision:Number(revision),business:{...data,draft:{...draft,revision:undefined}},
        withRevision:(value:number)=>({...data,draft:{...draft,revision:value}})};
    }
    if(['emp.update','emp.active','emp.delete','abs.update','abs.delete','ann.delete','set.save'].includes(operation)){
      if(!Number.isSafeInteger(data.expectedRevision)||Number(data.expectedRevision)<0)fail('MUTATION_INVALID_REQUEST');
      return {revision:Number(data.expectedRevision),business:{...data,expectedRevision:undefined},
        withRevision:(value:number)=>({...data,expectedRevision:value})};
    }
    return {revision:null,business:data,withRevision:(_value:number)=>data};
  }
  async function run(operation:string,payload:unknown):Promise<Record<string,unknown>>{
    if(busy)fail('MUTATION_BUSY');busy=true;
    try{
      if(!Object.hasOwn(prefix,operation))fail('MUTATION_INVALID_REQUEST');
      const current=await identity(),prepared=revisionPayload(operation,payload),
        fingerprint=await digest({operation,payload:prepared.business});
      const stored=read(),active=stored.filter(item=>item.generation===current.generation);
      if(active.length!==stored.length)save(active);
      let pending=active.find(item=>item.operation===operation&&item.digest===fingerprint);
      if(!pending){
        if(active.length>=16)fail('PENDING_LIMIT');
        pending={operation,commandId:`${prefix[operation]}_${crypto.randomUUID()}`,digest:fingerprint,
          generation:current.generation,revision:prepared.revision};
        save([...active,pending]);
      }
      const command={operation,commandId:pending.commandId,
        payload:pending.revision===null?payload:prepared.withRevision(pending.revision)};
      let body:string;try{body=JSON.stringify(command);}catch{fail('MUTATION_INVALID_REQUEST');}
      if(new TextEncoder().encode(body).length>512*1024)fail('MUTATION_INVALID_REQUEST');
      for(let attempt=0;attempt<2;attempt++){
        let response:Response;
        try{const token=await current.getToken(attempt===1);
          response=await deps.fetch(base+'mutatePublicDemo',{method:'POST',headers:{Authorization:`Bearer ${token}`,
            'Content-Type':'application/json'},body,cache:'no-store',credentials:'omit',redirect:'error'});
        }catch{fail('NETWORK');}
        if(response.status===401&&attempt===0)continue;
        if(!response.ok){let code='INVALID_RESPONSE';try{code=(await response.json()).error?.code;}catch{/* bounded public code only */}
          const error=new DemoMutationError(code);
          if(!error.retryable)clear(pending.commandId);
          throw error;
        }
        let result:unknown;try{result=await response.json();}catch{fail('INVALID_RESPONSE');}
        if(!result||typeof result!=='object'||Array.isArray(result)||
          Object.keys(result).length>4||Object.keys(result).some(field=>!['id','status','revision','sequence'].includes(field)))
          fail('INVALID_RESPONSE');
        if((await identity()).generation!==current.generation){clear(pending.commandId);fail('DEMO_GENERATION_CHANGED');}
        clear(pending.commandId);return result as Record<string,unknown>;
      }
      return fail('UNAUTHENTICATED');
    }finally{busy=false;}
  }
  async function hasPending(operation:string,payload:unknown){
    if(!Object.hasOwn(prefix,operation))return false;
    const current=await identity(),prepared=revisionPayload(operation,payload),
      fingerprint=await digest({operation,payload:prepared.business});
    return read().some(item=>item.generation===current.generation&&item.operation===operation&&item.digest===fingerprint);
  }
  return {run,hasPending};
}
