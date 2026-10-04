import {useEffect,useState} from 'react';
import {onAuthStateChanged,signInWithCustomToken,signOut} from 'firebase/auth';
import {doc,onSnapshot} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {auth,db,functions} from '../firebase/config';
import {createTenantAuthTicketRedirect} from '../firebase/authBrokerService';
import {DEMO_LANDING_ORIGIN,isDemoTenant,assertPublicDemoEnvironment} from './config';
import DemoLanding from '../components/demo/DemoLanding';
import DemoBanner from '../components/demo/DemoBanner';
import MainDashboard from '../components/scheduler/MainDashboard';
import AuthTicketCallback from '../components/auth/AuthTicketCallback';
import TenantGate from '../components/auth/TenantGate';
import TenantApp from '../components/tenant/TenantApp';
import {getCurrentTenantHostContext} from '../utils/tenantHostContext';
import {clearDemoPublicationIntent} from './publicationTransport.ts';

export default function PublicDemoApp(){
  const [busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[changed,setChanged]=useState(false);
  const host=window.location.hostname,tenant=host.endsWith('.shiftoryx.gr')?host.slice(0,-'.shiftoryx.gr'.length):'';
  const landing=window.location.origin===DEMO_LANDING_ORIGIN;
  let valid=true;try{assertPublicDemoEnvironment();}catch{valid=false;}
  useEffect(()=>{
    if(!valid||!isDemoTenant(tenant))return;
    let generation:number|null=null,state:any=null,disposed=false,authRevision=0;
    const check=()=>{if(state&&generation!==null){const invalid=Boolean(state.resetting||state.generation!==generation);if(invalid)clearDemoPublicationIntent(window.sessionStorage,tenant);setChanged(invalid);}};
    const stopAuth=onAuthStateChanged(auth,async user=>{
      const revision=++authRevision;
      try{
        const claims=user?(await user.getIdTokenResult()).claims:null;
        if(disposed||revision!==authRevision)return;
        generation=claims?.publicDemo===true&&claims.demoTenant===tenant?Number(claims.demoGeneration):null;check();
      }catch{if(!disposed&&revision===authRevision)setChanged(true);}
    });
    const stopState=onSnapshot(doc(db,'demoState',tenant),snapshot=>{state=snapshot.data();if(!state)setChanged(true);else check();},()=>setChanged(true));
    return()=>{disposed=true;authRevision++;stopAuth();stopState();};
  },[valid,tenant]);
  const enter=async(id:string)=>{
    if(busy||!isDemoTenant(id))return;setBusy(id);setError('');
    try{const response:any=await httpsCallable(functions,'enterPublicDemo')({tenantId:id});await signInWithCustomToken(auth,response.data.customToken);const redirect=await createTenantAuthTicketRedirect({tenantId:id,returnTo:response.data.returnTo});window.location.assign(redirect);}
    catch{setError('Η είσοδος δεν ολοκληρώθηκε. Δοκίμασε ξανά σε λίγο.');setBusy(null);}
  };
  const back=async()=>{await signOut(auth);window.location.assign(DEMO_LANDING_ORIGIN);};
  const reset=async()=>{
    if(busy||!isDemoTenant(tenant))return;
    if(!window.confirm('Να επανέλθει το κοινόχρηστο demo στα αρχικά δεδομένα; Τα δοκιμαστικά προσχέδια και το ιστορικό θα διαγραφούν για όλους τους επισκέπτες αυτού του demo.'))return;
    setBusy(tenant);setError('');
    clearDemoPublicationIntent(window.sessionStorage,tenant);
    try{await httpsCallable(functions,'resetPublicDemo',{timeout:420000})({tenantId:tenant});await signOut(auth);window.location.assign(DEMO_LANDING_ORIGIN);}
    catch(e:any){setError(e.code==='functions/resource-exhausted'?'Έγινε πρόσφατα επαναφορά. Δοκίμασε ξανά σε λίγα λεπτά.':'Η επαναφορά δεν ολοκληρώθηκε. Επέστρεψε στα demo και δοκίμασε ξανά αργότερα.');setBusy(null);}
  };
  if(!valid)return <main role="alert">Το demo δεν είναι διαθέσιμο σε αυτό το περιβάλλον.</main>;
  if(landing)return <DemoLanding onEnter={enter} busyTenant={busy} error={error}/>;
  if(!isDemoTenant(tenant))return <main><h1>Αυτό το κατάστημα δεν είναι μέρος του demo.</h1><a href={DEMO_LANDING_ORIGIN}>Επιστροφή στα Demo</a></main>;
  const context=getCurrentTenantHostContext();
  return <><DemoBanner onBack={back} onReset={reset} busy={!!busy} error={error}/><AuthTicketCallback/>
    {changed?<main className="p-8 text-center"><h1>Το κοινόχρηστο demo επαναφέρθηκε.</h1><p>Μπες ξανά για να χρησιμοποιήσεις τα αρχικά δεδομένα.</p><button onClick={back}>Επιστροφή στα Demo</button></main>:
    <TenantApp hostContext={context} routePath="/app"><TenantGate hostContext={context} routePath="/app"><MainDashboard/></TenantGate></TenantApp>}
  </>;
}
