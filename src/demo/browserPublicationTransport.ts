import {auth} from '../firebase/config';
import {assertPublicDemoEnvironment,isDemoTenant} from './config';
import {createDemoPublicationTransport,DemoTransportError} from './publicationTransport.ts';
import type {DraftV3} from '../services/schedulerV3Service.ts';
export function browserDemoPublicationTransport(tenant:string,saveDraft:(draft:DraftV3)=>Promise<number>){
  assertPublicDemoEnvironment();
  if(!isDemoTenant(tenant)||window.location.hostname!==`${tenant}.shiftoryx.gr`)throw new DemoTransportError('ACCESS_DENIED');
  return createDemoPublicationTransport({tenant,projectId:import.meta.env.VITE_FIREBASE_PROJECT_ID,demoEnabled:true,local:import.meta.env.DEV,storage:window.sessionStorage,saveDraft,fetch:window.fetch.bind(window),
    identity:async()=>{const user=auth.currentUser;if(!user)throw new DemoTransportError('UNAUTHENTICATED');const {claims}=await user.getIdTokenResult();
      if(claims.publicDemo!==true||claims.demoTenant!==tenant)throw new DemoTransportError('ACCESS_DENIED');
      return {tenant,uid:user.uid,generation:Number(claims.demoGeneration),getToken:(force:boolean)=>user.getIdToken(force)};}});
}
