import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {initializeApp,deleteApp} from 'firebase/app';
import {getAuth,connectAuthEmulator,signInWithCustomToken} from 'firebase/auth';
import {getFirestore,connectFirestoreEmulator,setLogLevel} from 'firebase/firestore';
import {getStorage,connectStorageEmulator} from 'firebase/storage';
export const project='demo-shiftoryx-public',tenants=['demo-fuel','demo-cafe','demo-salon','demo-market'];
Object.assign(process.env,{GCLOUD_PROJECT:project,GOOGLE_CLOUD_PROJECT:project,FUNCTIONS_EMULATOR:'true',PUBLIC_DEMO_ENABLED:'true',PUBLIC_DEMO_PROJECT_ID:'shiftoryx-public-demo',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8197',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9308',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9408',STORAGE_EMULATOR_HOST:'http://127.0.0.1:9408'});
const require=createRequire(new URL('../../functions/package.json',import.meta.url));
const adminApp=require('firebase-admin/app').initializeApp({projectId:project,storageBucket:project+'.appspot.com'});
export const dbAdmin=require('firebase-admin/firestore').getFirestore(adminApp),authAdmin=require('firebase-admin/auth').getAuth(adminApp),bucket=require('firebase-admin/storage').getStorage(adminApp).bucket();
setLogLevel('silent');const clients=[];
export async function rpc(name,data,token,origin='https://demo.shiftoryx.gr'){assert.ok(['enterPublicDemo','resetPublicDemo','createAuthTicket','exchangeAuthTicket'].includes(name));const response=await fetch(`http://127.0.0.1:5111/${project}/us-central1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({data}),signal:AbortSignal.timeout(450000)});return {status:response.status,...await response.json()};}
export async function login(tenant){assert.ok(tenants.includes(tenant));const entered=await rpc('enterPublicDemo',{tenantId:tenant});assert.equal(entered.status,200);const app=initializeApp({projectId:project,apiKey:'emulator-only',storageBucket:project+'.appspot.com'},tenant+'-'+clients.length);const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);connectAuthEmulator(auth,'http://127.0.0.1:9308',{disableWarnings:true});connectFirestoreEmulator(db,'127.0.0.1',8197);connectStorageEmulator(storage,'127.0.0.1',9408);await signInWithCustomToken(auth,entered.result.customToken);const client={app,auth,db,storage,tenant,issuedToken:entered.result.customToken};clients.push(client);return client;}
export async function denied(fn){try{await fn();assert.fail('Unexpected authorization');}catch(error){assert.ok(['permission-denied','storage/unauthorized'].includes(error.code),'Expected authorization denial, got '+error.code);}}
export async function close(){await Promise.all(clients.map(c=>deleteApp(c.app)));await require('firebase-admin/app').deleteApp(adminApp);}
