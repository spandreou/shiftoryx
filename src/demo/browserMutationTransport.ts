import {auth} from '../firebase/config';
import {assertPublicDemoEnvironment,isDemoTenant} from './config';
import {createDemoMutationTransport,DemoMutationError} from './mutationTransport.ts';

const transports=new Map<string,ReturnType<typeof createDemoMutationTransport>>();
export function browserDemoMutationTransport(tenant:string){
  assertPublicDemoEnvironment();
  if(!isDemoTenant(tenant)||window.location.hostname!==`${tenant}.shiftoryx.gr`)
    throw new DemoMutationError('ACCESS_DENIED');
  const existing=transports.get(tenant);if(existing)return existing;
  const client=createDemoMutationTransport({tenant,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,
    demoEnabled:true,local:import.meta.env.DEV,storage:window.sessionStorage,fetch:window.fetch.bind(window),
    identity:async()=>{const user=auth.currentUser;if(!user)throw new DemoMutationError('UNAUTHENTICATED');
      const {claims}=await user.getIdTokenResult();if(claims.publicDemo!==true||claims.demoTenant!==tenant)
        throw new DemoMutationError('ACCESS_DENIED');
      return {tenant,uid:user.uid,generation:Number(claims.demoGeneration),getToken:(force:boolean)=>user.getIdToken(force)};},
  });
  transports.set(tenant,client);return client;
}
