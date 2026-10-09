import {HttpsError} from 'firebase-functions/v2/https';
import {getApps} from 'firebase-admin/app';
import {resolveDemoResetStorageTarget} from './policy.ts';

type Env=Record<string,string|undefined>;
type Environment=()=>Env;
const unavailable=()=>new HttpsError('unavailable','Η υπηρεσία σύνδεσης δεν είναι προσωρινά διαθέσιμη.');
function assertEntryRuntime(env:Env){
  // Same strict identity/loopback boundary as reviewed demo service resolution.
  // This is data validation only: no Admin initialization, database or Auth call.
  try{
    const target=resolveDemoResetStorageTarget(env);
    if(env.FIREBASE_CONFIG!==undefined){
      if(typeof env.FIREBASE_CONFIG!=='string'||env.FIREBASE_CONFIG.length>16384)throw new Error('invalid');
      const config=JSON.parse(env.FIREBASE_CONFIG);
      if(!config||typeof config!=='object'||Array.isArray(config)||config.projectId!==target.projectId||
        config.storageBucket!==undefined&&config.storageBucket!==target.bucket)throw new Error('invalid');
    }
    const current=getApps().find(app=>app.name==='[DEFAULT]');
    if(current&&(current.options.projectId!==undefined&&current.options.projectId!==target.projectId||
      current.options.storageBucket!==undefined&&current.options.storageBucket!==target.bucket))throw new Error('invalid');
  }catch{throw unavailable();}
}
export function fenceDemoBroker<T,R>(forward:(request:T)=>Promise<R>,environment:Environment=()=>process.env){
  return async(request:T):Promise<R>=>{
    const env=environment();
    if(env.PUBLIC_DEMO_AUTH_BROKER_ENABLED!=='true')throw unavailable();
    assertEntryRuntime(env);
    return forward(request);
  };
}
export function fenceDemoEntry<T,R>(forward:(request:T)=>Promise<R>,environment:Environment=()=>process.env){
  return async(request:T):Promise<R>=>{
    assertEntryRuntime(environment());
    return forward(request);
  };
}
