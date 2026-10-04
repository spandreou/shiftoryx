import type {App} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {assertPdfApp} from './pdf-adapters.ts';
import {DEMO_TENANTS,demoOwnerUid,requireDemoTenant,type DemoTenant} from './policy.ts';
import {deleteExactGeneration,disableImmutableGcsRetries,ImmutableGcsError} from './gcs-immutable-primitives.ts';
import {RESET_COLLECTIONS,RESET_LIMITS} from './reset-inventory.ts';
import {resetFail,type ResetDatabase,type ResetFilter} from './reset-state.ts';

export type ResetObject={name:string;generation:string};
export interface ResetAuth{
  revoke(uid:string):Promise<void>;
  remove(uid:string):Promise<void>;
  ensure(tenant:DemoTenant,generation:number):Promise<string>;
  verify(tenant:DemoTenant,generation:number):Promise<void>;
}
export interface ResetStorage{
  list(tenant:DemoTenant,limit:number):Promise<ResetObject[]>;
  remove(tenant:DemoTenant,object:ResetObject):Promise<void>;
}
function tenantFor(value:unknown):DemoTenant{try{return requireDemoTenant(value);}catch{return resetFail('RESET_ACCESS_DENIED');}}
function ownerIdentity(uid:string){
  const match=new RegExp(`^(${DEMO_TENANTS.join('|')})-owner-g([1-9][0-9]*)$`).exec(uid);
  if(!match||!Number.isSafeInteger(Number(match[2]))||demoOwnerUid(tenantFor(match[1]),Number(match[2]))!==uid)
    resetFail('RESET_ACCESS_DENIED');
}
function boundedQuery(db:ReturnType<typeof getFirestore>,path:string,limit:number,filter?:ResetFilter){
  if(!Number.isInteger(limit)||limit<1||limit>RESET_LIMITS.tenantCollectionCeiling)resetFail('RESET_CAPACITY_EXCEEDED');
  if(path==='monthly_schedule_exports'){
    if(!filter||Object.keys(filter).length!==1)resetFail('RESET_ACCESS_DENIED');
    return db.collection(path).where('tenantId','==',tenantFor(filter.tenantId)).limit(limit);
  }
  if(filter!==undefined)resetFail('RESET_ACCESS_DENIED');
  const tenantCollection=/^tenants\/([^/]+)\/([^/]+)$/.exec(path),intentCollection=/^demoPdfRequests\/([^/]+)\/intents$/.exec(path);
  if(tenantCollection){tenantFor(tenantCollection[1]);if(!RESET_COLLECTIONS.includes(tenantCollection[2]))resetFail('RESET_ACCESS_DENIED');}
  else if(intentCollection){tenantFor(intentCollection[1]);if(limit>801)resetFail('RESET_INTENT_CAPACITY');}
  else resetFail('RESET_ACCESS_DENIED');
  return db.collection(path).limit(limit);
}
/** Fixed demo app only. All selectors originate in the reset core, not HTTP. */
export function createDemoResetAdapters(app:App,env:Record<string,string|undefined>=process.env):{
  database:ResetDatabase;auth:ResetAuth;storage:ResetStorage
}{
  const target=assertPdfApp(app,env),db=getFirestore(app),adminAuth=getAuth(app),bucket=getStorage(app).bucket(target.bucket);
  disableImmutableGcsRetries(bucket as any);
  const database:ResetDatabase={transaction:run=>db.runTransaction(async transaction=>{
    let wrote=false;const read=()=>{if(wrote)resetFail('RESET_STATE_CORRUPT');};
    return run({get:async path=>{read();return (await transaction.get(db.doc(path))).data();},
      list:async(path,limit,filter)=>{read();return (await transaction.get(boundedQuery(db,path,limit,filter))).docs
        .map(row=>({id:row.id,data:row.data()}));},
      count:async(path,limit,filter)=>{read();return (await transaction.get(boundedQuery(db,path,limit,filter).count())).data().count;},
      set:(path,value)=>{wrote=true;transaction.set(db.doc(path),value);},
      delete:path=>{wrote=true;transaction.delete(db.doc(path));}});
  })};
  const auth:ResetAuth={
    async revoke(uid){ownerIdentity(uid);try{await adminAuth.revokeRefreshTokens(uid);}catch(error:any){if(error.code!=='auth/user-not-found')throw error;}},
    async remove(uid){ownerIdentity(uid);try{await adminAuth.deleteUser(uid);}catch(error:any){if(error.code!=='auth/user-not-found')throw error;}},
    async ensure(tenant,generation){
      const uid=demoOwnerUid(tenantFor(tenant),generation);let claims:Record<string,unknown>|undefined;
      try{claims=(await adminAuth.getUser(uid)).customClaims;}catch(error:any){
        if(error.code!=='auth/user-not-found')throw error;
        try{await adminAuth.createUser({uid,displayName:'ShiftOryx Demo OWNER'});}catch(created:any){if(created.code!=='auth/uid-already-exists')throw created;}
      }
      const expected={publicDemo:true,demoTenant:tenant,demoGeneration:generation};
      if(!claims||Object.keys(claims).length!==3||Object.entries(expected).some(([key,value])=>claims?.[key]!==value))
        await adminAuth.setCustomUserClaims(uid,expected);
      return uid;
    },
    async verify(tenant,generation){
      const uid=demoOwnerUid(tenantFor(tenant),generation),user=await adminAuth.getUser(uid),claims=user.customClaims;
      if(user.disabled||!claims||Object.keys(claims).length!==3||claims.publicDemo!==true||claims.demoTenant!==tenant||claims.demoGeneration!==generation)
        resetFail('RESET_FINALIZE_INVALID');
    },
  };
  const storage:ResetStorage={
    async list(tenantValue,limit){
      const tenant=tenantFor(tenantValue),prefix=`tenants/${tenant}/`;
      if(!Number.isInteger(limit)||limit<1||limit>RESET_LIMITS.storageObjects+1)resetFail('RESET_CAPACITY_EXCEEDED');
      const objects:ResetObject[]=[];let query:any={prefix,maxResults:limit,autoPaginate:false};
      for(let page=0;page<=limit;page++){
        const [files,next]=await bucket.getFiles(query);
        for(const file of files){
          const generation=String(file.metadata.generation??'');
          if(!file.name.startsWith(prefix)||Buffer.byteLength(file.name,'utf8')>1024||!/^\d+$/.test(generation))resetFail('RESET_RECOVERY_REQUIRED');
          objects.push({name:file.name,generation});
        }
        if(objects.length>limit)resetFail('RESET_CAPACITY_EXCEEDED');
        if(!next)return objects;
        if(!files.length||objects.length>=limit)resetFail('RESET_CAPACITY_EXCEEDED');
        query={...next,prefix,maxResults:limit-objects.length,autoPaginate:false};
      }
      return resetFail('RESET_CAPACITY_EXCEEDED');
    },
    async remove(tenantValue,object){
      const tenant=tenantFor(tenantValue);
      if(!object||typeof object.name!=='string'||!object.name.startsWith(`tenants/${tenant}/`)||
        typeof object.generation!=='string'||!/^\d+$/.test(object.generation))resetFail('RESET_ACCESS_DENIED');
      try{await deleteExactGeneration(bucket as any,object.name,object.generation);}
      catch(error){if(error instanceof ImmutableGcsError&&error.code==='NOT_FOUND')return;
        if(error instanceof ImmutableGcsError)resetFail('RESET_RECOVERY_REQUIRED');throw error;}
    },
  };
  return {database,auth,storage};
}
